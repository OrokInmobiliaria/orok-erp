'use strict';
// R30 · Voz, publicación y ciclo creativo. Colas "listas para conectar".
// Principios:
//  - Todo nace APAGADO (archivo de configuración con enabled:false).
//  - El CRM nunca guarda claves de Meta, TikTok ni del proveedor de voz: las tiene n8n.
//  - Nada se publica sin campaña aprobada, pieza exportada y orden de Gerencia.
//  - El ciclo automático solo crea BORRADORES para revisión humana.
const fs = require('node:fs'), path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');

const hash = v => createHash('sha256').update(v).digest('hex');
const now = () => new Date().toISOString();
const text = (v, max = 500) => String(v ?? '').trim().slice(0, max);
const uuid = v => /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(String(v));
const uuidFrom = seed => { const h = hash(seed); return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`; };
const LEASE_MS = 10 * 60 * 1000;
const CHANNELS = ['facebook', 'instagram', 'tiktok'];

function readJson(dir, file) { try { return JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')); } catch { return {}; } }
function writeJson(dir, file, value) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const f = path.join(dir, file), t = f + '.tmp';
  fs.writeFileSync(t, JSON.stringify(value, null, 1), { mode: 0o600 }); fs.renameSync(t, f);
}

class Pipelines {
  constructor(store, config, creative) {
    this.store = store; this.dir = config.privateDir; this.creative = creative;
    this.voiceJobs = store.ref.collection('voice_jobs');
    this.pubJobs = store.ref.collection('publication_jobs');
    this.cycles = store.ref.collection('creative_cycles');
  }

  // ---------- Configuración (todo apagado por defecto) ----------
  voiceConfig(input, actor) {
    const read = () => { const c = readJson(this.dir, 'voice-provider.json'); return { enabled: c.enabled === true, provider: text(c.provider, 40), voice_label: text(c.voice_label, 80), max_chars: Number(c.max_chars) || 1500, max_jobs_per_day: Number(c.max_jobs_per_day) || 10 }; };
    if (!input) return read();
    const c = { enabled: input.enabled === true, provider: text(input.provider, 40), voice_label: text(input.voice_label, 80), max_chars: Math.min(3000, Math.max(100, Number(input.max_chars) || 1500)), max_jobs_per_day: Math.min(50, Math.max(1, Number(input.max_jobs_per_day) || 10)), updated_by: actor, updated_at: now() };
    if (c.enabled && !c.provider) throw Error('Indica el proveedor de voz antes de activar.');
    writeJson(this.dir, 'voice-provider.json', c); return read();
  }
  publishConfig(input, actor) {
    const read = () => { const c = readJson(this.dir, 'publishing.json'); return { enabled: c.enabled === true, dry_run: c.dry_run !== false, channels: Object.fromEntries(CHANNELS.map(k => [k, c.channels?.[k] === true])), max_per_day: Number(c.max_per_day) || 5 }; };
    if (!input) return read();
    const c = { enabled: input.enabled === true, dry_run: input.dry_run !== false, channels: Object.fromEntries(CHANNELS.map(k => [k, input.channels?.[k] === true])), max_per_day: Math.min(30, Math.max(1, Number(input.max_per_day) || 5)), updated_by: actor, updated_at: now() };
    writeJson(this.dir, 'publishing.json', c); return read();
  }
  cycleConfig(input, actor) {
    const read = () => { const c = readJson(this.dir, 'creative-cycle.json'); return { enabled: c.enabled === true, campaign_ids: (c.campaign_ids || []).filter(uuid).slice(0, 5), every_days: Math.min(30, Math.max(3, Number(c.every_days) || 7)), window_days: Math.min(60, Math.max(7, Number(c.window_days) || 14)) }; };
    if (!input) return read();
    const ids = [...new Set((input.campaign_ids || []).map(String))];
    if (ids.length > 5 || ids.some(i => !uuid(i))) throw Error('Elige hasta 5 campañas válidas.');
    if (input.enabled === true && !ids.length) throw Error('Elige al menos una campaña base para activar el ciclo.');
    const c = { enabled: input.enabled === true, campaign_ids: ids, every_days: Math.min(30, Math.max(3, Number(input.every_days) || 7)), window_days: Math.min(60, Math.max(7, Number(input.window_days) || 14)), updated_by: actor, updated_at: now() };
    writeJson(this.dir, 'creative-cycle.json', c); return read();
  }

  async campaignAndPiece(campaignId, pieceId) {
    const c = (await this.creative.ref(String(campaignId)).get()).data();
    if (!c) throw Error('Campaña no encontrada.');
    const piece = (c.proposal?.creatives || []).find(p => p.id === pieceId);
    if (!piece) throw Error('La pieza no existe en la propuesta de la campaña.');
    return { c, piece };
  }
  async countToday(collection, filter) {
    const since = new Date(Date.now() - 24 * 3600000).toISOString();
    return (await collection.where('created_at', '>=', since).limit(201).get()).docs.map(d => d.data()).filter(filter).length;
  }
  async listJobs(collection) {
    const rows = (await collection.orderBy('created_at', 'desc').limit(31).get()).docs.map(d => d.data());
    return rows.slice(0, 30).map(({ script, caption, ...r }) => ({ ...r, has_text: !!(script || caption) }));
  }
  async lease(collection, filter, ordering) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const rows = (await collection.where('state', '==', 'queued').limit(50).get()).docs.map(d => d.data()).filter(filter).sort(ordering);
      if (!rows.length) return null;
      const pick = rows[0], token = randomUUID();
      const got = await this.store.db.runTransaction(async tx => {
        const ref = collection.doc(pick.id), j = (await tx.get(ref)).data();
        if (!j || j.state !== 'queued') return null;
        const next = { ...j, state: 'leased', lease_token: token, lease_until: new Date(Date.now() + LEASE_MS).toISOString(), updated_at: now() };
        tx.set(ref, next); return next;
      });
      if (got) return got;
    }
    return null;
  }
  async release(collection, input, finalPatch) {
    return this.store.db.runTransaction(async tx => {
      const ref = collection.doc(String(input.job_id || '')), j = (await tx.get(ref)).data();
      if (!j || j.lease_token !== input.lease_token || j.state !== 'leased') throw Error('Trabajo no autorizado o vencido.');
      if (Date.parse(j.lease_until) < Date.now()) throw Error('El permiso del trabajo venció.');
      tx.set(ref, { ...j, ...finalPatch, lease_token: null, lease_until: null, updated_at: now() }); return j;
    });
  }
  async cancel(collection, id, actor) {
    return this.store.db.runTransaction(async tx => {
      const ref = collection.doc(String(id)), j = (await tx.get(ref)).data();
      if (!j) throw Error('Trabajo no encontrado.');
      if (!['queued'].includes(j.state)) throw Error('Solo se cancelan trabajos que aún no empezaron.');
      tx.set(ref, { ...j, state: 'cancelled', cancelled_by: actor, updated_at: now() }); return { ok: true };
    });
  }

  // ---------- Voz ----------
  async requestVoice(input, actor) {
    const cfg = this.voiceConfig();
    if (!cfg.enabled) throw Error('La voz sintética está desactivada.');
    if (!uuid(input.request_id)) throw Error('Falta el identificador de solicitud.');
    const { c, piece } = await this.campaignAndPiece(input.campaign_id, input.piece_id);
    if (c.status !== 'approved') throw Error('La campaña debe estar aprobada antes de generar su voz.');
    if (!['reel', 'story'].includes(piece.format)) throw Error('La voz aplica a reels e historias.');
    const script = piece.scenes.map(s => s.voiceover).filter(Boolean).join('\n').trim();
    if (!script) throw Error('La pieza no tiene guion de narración.');
    if (script.length > cfg.max_chars) throw Error(`El guion supera ${cfg.max_chars} caracteres.`);
    const id = hash(c.id + '\0' + piece.id + '\0voice\0' + input.request_id);
    if ((await this.countToday(this.voiceJobs, () => true)) >= cfg.max_jobs_per_day) throw Error('Se alcanzó el límite diario de voces.');
    return this.store.db.runTransaction(async tx => {
      const ref = this.voiceJobs.doc(id), old = (await tx.get(ref)).data();
      if (old) return { ok: true, id, duplicate: true };
      tx.set(ref, { id, campaign_id: c.id, piece_id: piece.id, revision: c.revision, script, voice_label: cfg.voice_label, provider: cfg.provider, state: 'queued', created_at: now(), created_by: actor, updated_at: now() });
      return { ok: true, id };
    });
  }
  async claimVoice() {
    if (!this.voiceConfig().enabled) return { ok: true, job: null };
    const j = await this.lease(this.voiceJobs, () => true, (a, b) => a.created_at.localeCompare(b.created_at));
    return { ok: true, job: j && { id: j.id, lease_token: j.lease_token, script: j.script, voice_label: j.voice_label, provider: j.provider } };
  }
  async completeVoice(input) {
    const bytes = Buffer.from(String(input.data_base64 || ''), 'base64');
    if (!bytes.length) throw Error('El audio llegó vacío.');
    const j = (await this.voiceJobs.doc(String(input.job_id || '')).get()).data();
    if (!j || j.lease_token !== input.lease_token || j.state !== 'leased') throw Error('Trabajo no autorizado o vencido.');
    const label = 'Voz IA · ' + (j.voice_label || j.provider || 'sintética');
    const saved = await this.creative.addMedia(j.campaign_id, { request_id: uuidFrom('voice' + j.id), approved: true, mime: 'audio/mpeg', label, filename: 'voz-ia-' + j.piece_id + '.mp3' }, bytes, 'n8n · voz sintética');
    await this.release(this.voiceJobs, input, { state: 'done', media_id: saved.media?.id || null });
    return { ok: true, media_id: saved.media?.id || null };
  }
  async failVoice(input) { await this.release(this.voiceJobs, input, { state: 'failed', reason: text(input.reason, 300) }); return { ok: true }; }

  // ---------- Publicación ----------
  async requestPublication(input, actor) {
    const cfg = this.publishConfig();
    if (!cfg.enabled) throw Error('La publicación está desactivada.');
    const channel = String(input.channel);
    if (!CHANNELS.includes(channel) || !cfg.channels[channel]) throw Error('Ese canal no está habilitado para publicar.');
    if (!uuid(input.request_id)) throw Error('Falta el identificador de solicitud.');
    const at = Date.parse(input.scheduled_at);
    if (!Number.isFinite(at) || at < Date.now() - 60000 || at > Date.now() + 60 * 86400000) throw Error('Programa una fecha futura de hasta 60 días.');
    const { c, piece } = await this.campaignAndPiece(input.campaign_id, input.piece_id);
    if (c.status !== 'approved' || !c.approval) throw Error('La campaña debe estar aprobada por Gerencia.');
    if (c.brief.channels && !c.brief.channels.includes(channel)) throw Error('La campaña no incluye ese canal.');
    const exports = (await this.creative.ref(c.id).collection('exports').get()).docs.map(d => d.data()).filter(e => e.revision === c.revision && !e.is_draft && String(e.filename || '').includes('-' + piece.id + '-'));
    if (!exports.length) throw Error('Exporta primero la pieza aprobada (versión sin marca de borrador).');
    const label = ['A', 'B', 'C', 'D'].includes(input.variant_label) ? input.variant_label : null;
    // R42 · G.R.E.T.A: «borrador» deja la pieza para terminarla en el editor de la red (TikTok: borradores; Facebook: no publicada).
    const modo = input.modo === 'borrador' ? 'borrador' : 'publicar';
    if (modo === 'borrador' && channel === 'instagram') throw Error('Instagram no recibe borradores: descarga el paquete y ábrelo en Instagram o Edits.');
    const tags = (c.brand?.hashtags || []).join(' ');
    const caption = (piece.caption + (tags && !piece.caption.includes(tags) ? '\n\n' + tags : '')).slice(0, 2200);
    const id = hash(c.id + '\0' + piece.id + '\0' + channel + '\0' + input.request_id);
    if ((await this.countToday(this.pubJobs, () => true)) >= cfg.max_per_day) throw Error('Se alcanzó el límite diario de publicaciones.');
    return this.store.db.runTransaction(async tx => {
      const ref = this.pubJobs.doc(id), old = (await tx.get(ref)).data();
      if (old) return { ok: true, id, duplicate: true };
      tx.set(ref, { id, campaign_id: c.id, piece_id: piece.id, piece_format: piece.format, channel, modo, scheduled_at: new Date(at).toISOString(), caption, media: exports.map(e => ({ token: e.token, mime: e.mime })).slice(0, 10), variant_label: label, approval_at: c.approval.at || null, state: 'queued', created_at: now(), created_by: actor, updated_at: now() });
      return { ok: true, id };
    });
  }
  async claimPublication(p = {}) {
    const cfg = this.publishConfig();
    if (!cfg.enabled) return { ok: true, job: null };
    // Un flujo n8n que no declara soporte de borradores nunca recibe uno (así no se publica por error lo que era para editar).
    const due = j => Date.parse(j.scheduled_at) <= Date.now() && cfg.channels[j.channel] && ((j.modo || 'publicar') === 'publicar' || p.soporta_borrador === true);
    const j = await this.lease(this.pubJobs, due, (a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
    return { ok: true, job: j && { id: j.id, lease_token: j.lease_token, channel: j.channel, caption: j.caption, piece_format: j.piece_format, modo: j.modo || 'publicar', media_count: j.media.length, dry_run: cfg.dry_run, variant_label: j.variant_label } };
  }
  async publicationMedia(input) {
    const j = (await this.pubJobs.doc(String(input.job_id || '')).get()).data();
    if (!j || j.lease_token !== input.lease_token || j.state !== 'leased') throw Error('Trabajo no autorizado o vencido.');
    const m = j.media[Number(input.index)];
    if (!m) throw Error('Archivo no encontrado.');
    const file = await this.creative.mediaFile(m.token);
    return { ok: true, mime: m.mime, data_base64: Buffer.from(file.bytes || fs.readFileSync(file.path)).toString('base64') };
  }
  async completePublication(input) {
    const cfg = this.publishConfig();
    await this.release(this.pubJobs, input, { state: cfg.dry_run ? 'dry_run_done' : 'published', external_id: text(input.external_id, 100), permalink: /^https:\/\//.test(String(input.permalink || '')) ? text(input.permalink, 400) : '', published_at: now() });
    return { ok: true };
  }
  async failPublication(input) { await this.release(this.pubJobs, input, { state: 'failed', reason: text(input.reason, 300) }); return { ok: true }; }

  // ---------- Ciclo creativo automático: solo borradores ----------
  async cycleTick(at = Date.now()) {
    const cfg = this.cycleConfig();
    if (!cfg.enabled) return { ok: true, created: [], skipped: 'desactivado' };
    const created = [], notes = [];
    const to = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date(at));
    const from = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date(at - (cfg.window_days - 1) * 86400000));
    for (const sourceId of cfg.campaign_ids) {
      const src = (await this.creative.ref(sourceId).get()).data();
      if (!src || src.status === 'archived') { notes.push(sourceId + ': no disponible'); continue; }
      const bucket = Math.floor(at / (cfg.every_days * 86400000));
      const rid = uuidFrom('cycle' + sourceId + bucket);
      if ((await this.cycles.doc(rid).get()).data()) continue;
      try {
        const b = src.brief;
        const made = await this.creative.create({ ...b, title: ('Ciclo ' + to + ' · ' + b.title).slice(0, 120), from, to, request_id: rid, project_id: src.brand?.id }, 'Ciclo automático');
        const enq = await this.creative.enqueue(rid, { request_id: uuidFrom('cycle-proposal' + rid), revision: 1 }, 'Ciclo automático');
        await this.store.db.runTransaction(async tx => { tx.set(this.cycles.doc(rid), { id: rid, source_id: sourceId, child_id: made.id, created_at: now(), state: 'proposal_requested' }); });
        created.push({ source_id: sourceId, campaign_id: made.id, queued: !!enq });
      } catch (e) {
        await this.store.db.runTransaction(async tx => { tx.set(this.cycles.doc(rid), { id: rid, source_id: sourceId, created_at: now(), state: 'failed', reason: text(e.message, 300) }); });
        notes.push(sourceId + ': ' + e.message);
      }
    }
    return { ok: true, created, notes };
  }
}

module.exports = { Pipelines, uuidFrom };
