'use strict';
// R29 · M2, M4 y M5. Estado persistente del asistente de marketing:
//  - vínculo pieza -> anuncio (variantes A/B),
//  - recomendaciones de presupuesto y la decisión de Gerencia,
//  - resumen diario (configuración y registro de envío).
// Aditivo: usa colecciones nuevas y no modifica las existentes.
const fs = require('node:fs'), path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { compareVariants, recommendBudget, BUDGET_NOTICE } = require('./budgetAdvisor');
const { buildDailyBrief } = require('./dailyBrief');
const { range } = require('./adsAnalytics');

const hash = v => createHash('sha256').update(v).digest('hex');
const now = () => new Date().toISOString();
const text = (v, max = 500) => String(v ?? '').trim().slice(0, max);
const uuid = v => /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(String(v));
const day = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
const EMAIL = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;
const LABELS = ['A', 'B', 'C', 'D'];

class MarketingAssistant {
  constructor(store, config, ads, creative) {
    this.store = store; this.dir = config.privateDir; this.ads = ads; this.creative = creative;
    this.variants = store.ref.collection('creative_variants');
    this.recs = store.ref.collection('budget_recommendations');
    this.briefs = store.ref.collection('daily_briefs');
  }

  // ---------- M4: variantes ----------
  async linkVariant(input, actor) {
    const campaign = (await this.creative.ref(String(input.campaign_id || '')).get()).data();
    if (!campaign) throw Error('Campaña no encontrada.');
    const piece = (campaign.proposal?.creatives || []).find(c => c.id === input.piece_id);
    if (!piece) throw Error('La pieza no existe en la propuesta actual de la campaña.');
    const provider = String(input.provider), ad_id = String(input.ad_id || '').trim(), label = String(input.label || '');
    if (!['meta', 'tiktok'].includes(provider)) throw Error('Plataforma no válida.');
    if (!/^\d{3,50}$/.test(ad_id)) throw Error('El ID de anuncio debe ser numérico.');
    if (!LABELS.includes(label)) throw Error('La etiqueta debe ser A, B, C o D.');
    const id = hash(provider + '\0' + ad_id);
    return this.store.db.runTransaction(async tx => {
      const old = (await tx.get(this.variants.doc(id))).data();
      if (old && (old.campaign_id !== campaign.id || old.piece_id !== piece.id)) throw Error('Ese anuncio ya está vinculado a otra pieza.');
      tx.set(this.variants.doc(id), { id, campaign_id: campaign.id, piece_id: piece.id, piece_format: piece.format, label, provider, ad_id, linked_by: actor, linked_at: old?.linked_at || now(), updated_at: now() });
      return { ok: true, id };
    });
  }

  async unlinkVariant(id) {
    if (!/^[a-f0-9]{64}$/.test(String(id))) throw Error('Vínculo no válido.');
    await this.store.db.runTransaction(async tx => { tx.delete(this.variants.doc(id)); });
    return { ok: true };
  }

  async variantReport(filters, data) {
    const { from, to } = range(filters);
    const links = (await this.variants.limit(501).get()).docs.map(d => d.data());
    if (!links.length) return { from, to, campaigns: [], notice: 'Aún no hay anuncios vinculados a piezas.' };
    const dash = await this.ads.dashboard({ from, to, group: 'ad' }, data);
    const byAd = new Map(dash.rows.map(r => [r.provider + '|' + r.ad_id, r]));
    const groups = new Map();
    for (const l of links) { const k = l.campaign_id + '|' + l.piece_id; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(l); }
    const campaigns = [];
    for (const [key, list] of groups) {
      const c = (await this.creative.ref(list[0].campaign_id).get()).data();
      const variants = list.sort((a, b) => a.label.localeCompare(b.label)).map(l => { const r = byAd.get(l.provider + '|' + l.ad_id); return { link_id: l.id, label: l.label, ad_id: l.ad_id, provider: l.provider, found: !!r, spend: r?.spend || 0, crm_leads: r?.crm_leads || 0, stages: r?.stages || {}, currency: r?.currency || null }; });
      campaigns.push({ key, campaign_id: list[0].campaign_id, title: c?.brief?.title || 'Campaña', piece_id: list[0].piece_id, piece_format: list[0].piece_format, ...compareVariants(variants), variants });
    }
    return { from, to, campaigns, notice: 'La atribución se hace por ID de anuncio. Un ganador por costo por lead no prueba mayor venta: confírmalo con citas y ventas.' };
  }

  // ---------- M5: presupuesto ----------
  async createRecommendation(filters, data, actor) {
    const { from, to } = range(filters);
    const dash = await this.ads.dashboard({ from, to, group: 'ad' }, data);
    const result = recommendBudget(dash.rows);
    const id = randomUUID();
    const doc = { id, from: dash.from, to: dash.to, created_at: now(), created_by: actor, status: 'pending', items: result.items.slice(0, 200), notice: BUDGET_NOTICE, coverage: dash.coverage ? { report_rows: dash.coverage.report_rows, matched_leads: dash.coverage.matched_leads } : null };
    await this.store.db.runTransaction(async tx => { tx.set(this.recs.doc(id), doc); });
    return doc;
  }

  async listRecommendations() {
    const rows = (await this.recs.orderBy('created_at', 'desc').limit(21).get()).docs.map(d => d.data());
    return { recommendations: rows.slice(0, 20), has_more: rows.length > 20 };
  }

  async decideRecommendation(id, input, actor) {
    if (!uuid(id)) throw Error('Recomendación no válida.');
    const decision = String(input.decision || '');
    if (!['approved', 'rejected'].includes(decision)) throw Error('La decisión debe ser aprobar o rechazar.');
    const note = text(input.note, 400);
    return this.store.db.runTransaction(async tx => {
      const ref = this.recs.doc(id), r = (await tx.get(ref)).data();
      if (!r) throw Error('Recomendación no encontrada.');
      if (r.status !== 'pending') throw Error('Esta recomendación ya fue decidida.');
      tx.set(ref, { ...r, status: decision, decided_by: actor, decided_at: now(), decision_note: note, applied: false });
      return { ok: true, status: decision };
    });
  }

  async pendingCount() {
    return (await this.recs.where('status', '==', 'pending').limit(51).get()).docs.length;
  }

  // ---------- M2: resumen diario ----------
  briefConfig(input, actor) {
    const f = path.join(this.dir, 'daily-brief.json');
    const read = () => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return {}; } };
    if (!input) { const c = read(); return { enabled: c.enabled === true, recipients: c.recipients || [] }; }
    const recipients = [...new Set((input.recipients || []).map(x => text(x, 200).toLowerCase()).filter(Boolean))];
    if (recipients.length > 5 || recipients.some(x => !EMAIL.test(x))) throw Error('Indica hasta 5 correos válidos.');
    if (input.enabled === true && !recipients.length) throw Error('Para activar el resumen indica al menos un correo.');
    fs.mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    const t = f + '.tmp';
    fs.writeFileSync(t, JSON.stringify({ enabled: input.enabled === true, recipients, updated_by: actor, updated_at: now() }, null, 1), { mode: 0o600 });
    fs.renameSync(t, f);
    return { enabled: input.enabled === true, recipients };
  }

  async briefForDelivery(data, at = Date.now()) {
    const cfg = this.briefConfig();
    const brief = await buildDailyBrief(data.leads || [], { now: at, pendingBudget: await this.pendingCount(), campaignsInReview: (await this.creative.list()).campaigns.filter(c => c.status === 'review').length });
    const sent = (await this.briefs.doc(brief.date).get()).data();
    const send = cfg.enabled && cfg.recipients.length > 0 && !sent;
    return { send, enabled: cfg.enabled, already_sent: !!sent, date: brief.date, recipients: cfg.recipients.join(','), subject: brief.subject, html: brief.html, text: brief.text, counts: brief.counts };
  }

  async confirmBrief(input) {
    if (!day(input.date)) throw Error('Fecha no válida.');
    await this.store.db.runTransaction(async tx => {
      const ref = this.briefs.doc(input.date);
      if ((await tx.get(ref)).data()) return;
      tx.set(ref, { date: input.date, sent_at: now(), recipients: this.briefConfig().recipients.length });
    });
    return { ok: true };
  }

  async previewBrief(data) {
    const b = await buildDailyBrief(data.leads || [], { pendingBudget: await this.pendingCount(), campaignsInReview: (await this.creative.list()).campaigns.filter(c => c.status === 'review').length });
    return { date: b.date, subject: b.subject, text: b.text, counts: b.counts };
  }
}

module.exports = { MarketingAssistant };
