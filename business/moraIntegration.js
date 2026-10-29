'use strict';
// M.O.R.A · integración del Evaluador Inmobiliario con el CRM (aditiva).
// - Colecciones nuevas: mora_jobs, mora_evaluations, mora_messages, mora_proposals,
//   mora_editors, mora_weekly. No modifica colecciones ni roles existentes.
// - Archivo privado mora.json con los interruptores (todo apagado por defecto).
// - n8n usa /api/integrations/lola con las acciones mora_*; la pantalla usa llamadas db.*.
// - El rol de quien pregunta sale SIEMPRE de la sesión, nunca del navegador.
// - La IA propone y Gerencia aprueba: ninguna respuesta cambia una evaluación por sí sola.
const fs = require('node:fs'), path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');

const LEASE_MS = 3 * 60 * 1000, MAX_ATTEMPTS = 3;
const now = () => new Date().toISOString();
const text = (v, max = 500) => String(v ?? '').trim().slice(0, max);
const safeId = v => /^[a-zA-Z0-9_-]{1,100}$/.test(String(v || ''));
const ROLES = ['Gerente', 'Vendedor', 'Broker'];
const ETAPAS = ['Separación', 'Inicial', 'Minuta', 'Venta', 'Desembolso'];
const ROUTE = /^(p\.(precioM2|costoM2|velocidad|descProm|mesLanz|inicioObra|durObra|inicial|financiaPct|preventaMin|tea|contingencia|tasaDesc)|estr\.(velocidad|reajuste|desc|corte)|estr\.escalera\.\d\.[01])$/;
const FINANCIAL = /\b(TIR|VAN|ROE|margen|utilidad|rentabilidad|costo|costos|aporte|flujo de caja|egresos|ingresos|precio|precios)\b|S\/\s?\d|\d[\d.,]*\s?(soles|mil soles)/i;
const DENIED = 'Esa parte es del análisis financiero completo y requiere permiso de Gerencia o de un editor asignado a esta evaluación. Puedo ayudarte con el avance de ventas, las unidades disponibles y los hitos del proyecto.';
const DEFAULTS = { enabled: false, weekly_enabled: false, max_questions_per_hour: 30, thresholds: { utilidad_pct: 5, unidades: 1, meses: 2 } };
// R33c · Estudio de mercado: fuentes web permitidas para que n8n lea avisos (solo https, sin credenciales en la URL).
const MARKET_HOSTS = ['urbania.pe', 'adondevivir.com', 'nexoinmobiliario.pe', 'babilonia.pe', 'properati.com.pe', 'docs.google.com'];
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const haversine = (a, b) => {
  const rad = n => n * Math.PI / 180, dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};
function marketUrl(v) {
  const raw = text(v, 600); if (!raw) return '';
  let u; try { u = new URL(raw); } catch { throw Error('El enlace no es válido.'); }
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  if (u.protocol !== 'https:' || u.username || u.password || u.port || !MARKET_HOSTS.some(h => host === h || host.endsWith('.' + h))) throw Error('Solo se leen enlaces https de ' + MARKET_HOSTS.join(', ') + '. Para otras páginas pega su contenido.');
  return u.toString();
}
const num = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };
function cleanAviso(a) {
  if (!a || typeof a !== 'object') return null;
  const precio = num(a.precio, 1000, 100000000), area = num(a.area_min ?? a.area, 10, 2000);
  if (!precio || !area) return null;
  return { nombre: text(a.nombre, 120) || 'Sin nombre', desarrollador: text(a.desarrollador, 80), direccion: text(a.direccion, 140), distrito: text(a.distrito, 60),
    tipo: a.tipo === 'proyecto' ? 'proyecto' : 'aviso', estado: ['lanzamiento', 'venta', 'vendido', 'usado'].includes(a.estado) ? a.estado : null, etapa: text(a.etapa, 60),
    precio, moneda: a.moneda === 'USD' ? 'USD' : 'PEN', desde: a.desde === true, area_min: area, area_max: num(a.area_max, 10, 2000),
    dorm_min: num(a.dorm_min, 0, 10), dorm_max: num(a.dorm_max, 0, 10), banos: num(a.banos, 0, 10), pisos: num(a.pisos, 1, 80), piso: num(a.piso, -5, 80),
    estacionamientos: num(a.estacionamientos, 0, 10), amenidades: (Array.isArray(a.amenidades) ? a.amenidades : []).map(x => text(x, 40)).filter(Boolean).slice(0, 20),
    entrega: text(a.entrega, 40), url: /^https:\/\//.test(String(a.url || '')) ? text(a.url, 300) : '' };
}
const uidOf = u => String(u?.id ?? u?.uid ?? u?.name ?? '');
const soldUnit = u => !!u?.sold_lead_id || ['SOLD', 'VENDIDO', 'VENDIDA', 'VENTA'].includes(String(u?.status || '').toUpperCase());

function isoWeek(d = new Date()) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return t.getUTCFullYear() + '-W' + String(Math.ceil(((t - y) / 86400000 + 1) / 7)).padStart(2, '0');
}

class MoraIntegration {
  constructor(store, config) {
    this.store = store; this.dir = config.privateDir;
    this.geocoder = typeof config.moraGeocoder === 'function' ? config.moraGeocoder : null;
    const c = n => store.ref.collection(n);
    this.jobs = c('mora_jobs'); this.evaluations = c('mora_evaluations'); this.messages = c('mora_messages');
    this.proposals = c('mora_proposals'); this.editors = c('mora_editors'); this.weekly = c('mora_weekly');
    this.market = c('mora_market_jobs');
  }

  async geocodeOne(query, cache) {
    const key = query.toLocaleLowerCase('es-PE').replace(/\s+/g, ' ').trim();
    if (cache[key]) return cache[key];
    let value = null;
    if (this.geocoder) value = await this.geocoder(query);
    else {
      const u = new URL(NOMINATIM); u.searchParams.set('format', 'jsonv2'); u.searchParams.set('limit', '1'); u.searchParams.set('countrycodes', 'pe'); u.searchParams.set('q', query);
      const r = await fetch(u, { headers: { 'User-Agent': 'OROK-CRM-Market/1.0 (soportetecnologico@orok.com.pe)', 'Accept-Language': 'es-PE,es' }, signal: AbortSignal.timeout(12000) });
      if (!r.ok) throw Error('El servicio cartográfico no respondió. Intenta nuevamente.');
      const hit = (await r.json())[0];
      if (hit) value = { lat: Number(hit.lat), lon: Number(hit.lon), label: text(hit.display_name, 240) };
    }
    if (value && Number.isFinite(Number(value.lat)) && Number.isFinite(Number(value.lon))) cache[key] = { lat: Number(value.lat), lon: Number(value.lon), label: text(value.label || query, 240) };
    else cache[key] = null;
    return cache[key];
  }

  async geocodeMarket(input, user) {
    this.manager(user);
    const originText = text(input?.origin, 200), raw = Array.isArray(input?.items) ? input.items.slice(0, 60) : [];
    if (originText.length < 8) throw Error('La evaluación necesita una dirección de proyecto válida.');
    const items = raw.map((x, i) => ({ index: Number.isInteger(x?.index) ? x.index : i, address: text(x?.address, 200) })).filter(x => x.address.length >= 5);
    if (!items.length) throw Error('No hay direcciones de comparables para calcular.');
    const file = path.join(this.dir, 'mora-geocode-cache.json'); let cache = {};
    try { cache = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
    const queries = [originText, ...items.map(x => x.address)], points = [];
    for (let i = 0; i < queries.length; i++) {
      points.push(await this.geocodeOne(queries[i], cache));
      if (!this.geocoder && i < queries.length - 1 && !cache[queries[i + 1].toLocaleLowerCase('es-PE').replace(/\s+/g, ' ').trim()]) await sleep(1050);
    }
    const origin = points[0]; if (!origin) throw Error('No se pudo ubicar la dirección del proyecto. Revísala en Datos generales.');
    fs.mkdirSync(this.dir, { recursive: true }); const tmp = file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(cache), { mode: 0o600 });
    try { fs.renameSync(tmp, file); } catch { fs.copyFileSync(tmp, file); fs.unlinkSync(tmp); }
    return { origin, items: items.map((x, i) => points[i + 1] ? { index: x.index, ...points[i + 1], distance_m: Math.round(haversine(origin, points[i + 1])) } : { index: x.index, error: 'no_ubicada' }) };
  }

  // ---------- Configuración ----------
  config(input, actor) {
    const file = path.join(this.dir, 'mora.json');
    let cur = { ...DEFAULTS };
    try { cur = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch {}
    if (!input) return cur;
    const th = input.thresholds || {};
    const next = {
      enabled: input.enabled === true, weekly_enabled: input.weekly_enabled === true,
      max_questions_per_hour: Math.max(1, Math.min(200, Number(input.max_questions_per_hour) || DEFAULTS.max_questions_per_hour)),
      thresholds: {
        utilidad_pct: Math.max(1, Math.min(50, Number(th.utilidad_pct) || DEFAULTS.thresholds.utilidad_pct)),
        unidades: Math.max(0.5, Math.min(50, Number(th.unidades) || DEFAULTS.thresholds.unidades)),
        meses: Math.max(1, Math.min(24, Number(th.meses) || DEFAULTS.thresholds.meses))
      },
      updated_by: text(actor, 120), updated_at: now()
    };
    fs.mkdirSync(this.dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(next, null, 2), { mode: 0o600 });
    return next;
  }

  // ---------- Permisos (mismo criterio que mora.context_for_job) ----------
  async scopeFor(user, evaluationId) {
    if (user.role === 'Gerente') return 'completo';
    const ed = (await this.editors.doc(uidOf(user)).get()).data();
    return ed?.active === true && Array.isArray(ed.evaluations) && ed.evaluations.includes(evaluationId) ? 'completo' : 'resumen';
  }
  manager(user) { if (user.role !== 'Gerente') throw Error('Requiere Gerencia.'); }

  // ---------- Evaluaciones ----------
  summaryFrom(d, ev) {
    const units = (d.units || []).filter(u => !ev.unit_numbers?.length || ev.unit_numbers.includes(String(u.unit_number)));
    const sold = units.filter(soldUnit).length;
    const active = new Set((d.separations || []).filter(s => ['CONFIRMED', 'RESERVED'].includes(s.status)).map(s => s.unit_id));
    const separated = units.filter(u => !soldUnit(u) && active.has(u.id)).length;
    const total = units.length || ev.summary?.unidades_total || 0;
    return { ...(ev.summary || {}), unidades_total: total, vendidas: sold, separadas: separated, disponibles: Math.max(0, total - sold - separated),
      avance_ventas_pct: total ? Math.round((sold + separated) / total * 1000) / 10 : 0, actualizado: now() };
  }
  async saveEvaluation(input, user, d) {
    this.manager(user);
    const id = text(input?.id, 100);
    if (!safeId(id)) throw Error('Identificador de evaluación no válido (letras, números, guion).');
    const inputs = input.inputs;
    if (!inputs?.p || !Array.isArray(inputs.units) || !inputs.units.length) throw Error('La evaluación debe traer los datos del proyecto del Evaluador (inputs.p e inputs.units).');
    const raw = JSON.stringify(input);
    if (raw.length > 1800000) throw Error('La evaluación es demasiado grande.');
    const unit_numbers = inputs.units.map(u => String(u.id));
    return this.store.db.runTransaction(async tx => {
      const ref = this.evaluations.doc(id), old = (await tx.get(ref)).data();
      const ev = {
        id, active: input.active !== false, engine_version: text(input.engine_version || 'mora-1', 20),
        project: { id: text(input.project?.id || id, 100), nombre: text(input.project?.nombre || inputs.p.nombre, 160), direccion: text(input.project?.direccion || inputs.p.direccion, 200), uso: text(input.project?.uso || inputs.p.uso, 200), empresa:text(input.project?.empresa||inputs.p.empresa||'BMG',20),datos_generales:Object.fromEntries(['codigoProyecto','distrito','provincia','departamento','responsableProyecto'].map(k=>[k,text(inputs.p[k],160)])) },
        unit_numbers, analysis: input.analysis || {}, inputs,
        workspace: input.workspace && typeof input.workspace === 'object' ? input.workspace : (old?.workspace || null),
        summary: { hitos: Array.isArray(input.summary?.hitos) ? input.summary.hitos.slice(0, 12) : [] },
        revision: (old?.revision || 0) + 1, history: [...(old?.history || []), ...(old ? [{ revision: old.revision, at: old.updated_at, by: old.updated_by }] : [])].slice(-20),
        created_at: old?.created_at || now(), updated_at: now(), updated_by: user.name
      };
      ev.summary = this.summaryFrom(d, ev);
      tx.set(ref, ev);
      return { ok: true, id, revision: ev.revision };
    });
  }
  async listEvaluations(user, d) {
    const rows = (await this.evaluations.limit(51).get()).docs.map(x => x.data()).filter(e => e.active !== false);
    const out = [];
    for (const e of rows.slice(0, 50)) {
      const scope = await this.scopeFor(user, e.id);
      out.push({ id: e.id, project: e.project, summary: this.summaryFrom(d, e), scope, revision: e.revision, updated_at: e.updated_at, ...(scope === 'completo' ? { kpis: e.analysis?.baseline?.kpis || null, baseline: e.analysis?.baseline?.nombre || null } : {}) });
    }
    return out;
  }

  // ---------- Consultas desde la pantalla ----------
  async ask(input, user, d) {
    const cfg = this.config();
    if (!cfg.enabled) throw Error('M.O.R.A está desactivada. Actívala en Evaluador Inmobiliario > Administración M.O.R.A.');
    if (!ROLES.includes(user.role)) throw Error('Rol no autorizado para M.O.R.A.');
    const evaluation_id = text(input?.evaluation_id, 100), question = text(input?.question, 2000);
    if (!safeId(evaluation_id)) throw Error('Selecciona una evaluación.');
    if (question.length < 3) throw Error('Escribe la consulta.');
    const thread_id = safeId(input.thread_id) ? input.thread_id : createHash('sha256').update(uidOf(user) + '\0' + evaluation_id).digest('hex').slice(0, 40);
    const request_id = /^[a-f0-9-]{36}$/.test(String(input.request_id || '')) ? input.request_id : randomUUID();
    const since = new Date(Date.now() - 3600000).toISOString();
    const recent = (await this.jobs.where('actor_uid', '==', uidOf(user)).limit(500).get()).docs.map(x => x.data()).filter(j => j.created_at >= since).length;
    if (recent >= cfg.max_questions_per_hour) throw Error('Alcanzaste el límite de consultas por hora. Intenta más tarde.');
    const evRef = this.evaluations.doc(evaluation_id);
    const id = createHash('sha256').update(uidOf(user) + '\0' + request_id).digest('hex').slice(0, 40);
    return this.store.db.runTransaction(async tx => {
      const ev = (await tx.get(evRef)).data();
      if (!ev || ev.active === false) throw Error('La evaluación no está disponible.');
      const jref = this.jobs.doc(id);
      if ((await tx.get(jref)).data()) return { ok: true, job_id: id, thread_id, duplicate: true };
      tx.set(evRef, { ...ev, summary: this.summaryFrom(d, ev) });
      const at = now();
      tx.set(jref, { id, engine: 'mora', state: 'queued', attempts: 0, evaluation_id, thread_id, actor_uid: uidOf(user), actor_role: user.role, actor_name: text(user.name, 120),
        question, tier: ['quick', 'default', 'complex'].includes(input.tier) ? input.tier : 'default', view: text(input.view || 'indicadores', 40), created_at: at, updated_at: at });
      const mid = id + '-q';
      tx.set(this.messages.doc(mid), { id: mid, thread_id, actor_uid: uidOf(user), evaluation_id, role: 'user', text: question, at, sort_key: at + ':0', job_id: id });
      return { ok: true, job_id: id, thread_id };
    });
  }
  async thread(input, user) {
    const thread_id = text(input?.thread_id, 100);
    if (!safeId(thread_id)) throw Error('Conversación no válida.');
    const msgs = (await this.messages.where('thread_id', '==', thread_id).limit(201).get()).docs.map(x => x.data())
      .filter(m => m.actor_uid === uidOf(user)).sort((a, b) => String(a.sort_key).localeCompare(String(b.sort_key))).slice(-60);
    const pending = (await this.jobs.where('thread_id', '==', thread_id).limit(50).get()).docs.map(x => x.data())
      .filter(j => j.actor_uid === uidOf(user) && ['queued', 'processing', 'failed'].includes(j.state)).map(j => ({ id: j.id, state: j.state, created_at: j.created_at }));
    return { thread_id, messages: msgs.map(({ text: t, role, at, proposals, follow_ups, scenarios, job_id }) => ({ text: t, role, at, job_id, proposals: proposals || [], follow_ups: follow_ups || [], scenarios: scenarios || [] })), pending };
  }

  // ---------- Propuestas (solo Gerencia decide) ----------
  async listProposals(user) {
    this.manager(user);
    return (await this.proposals.where('estado', '==', 'pendiente_gerencia').limit(101).get()).docs.map(x => x.data()).sort((a, b) => String(b.propuesto_at).localeCompare(String(a.propuesto_at))).slice(0, 100);
  }
  async decideProposal(id, input, user) {
    this.manager(user);
    const decision = input?.decision;
    if (!['aprobar', 'rechazar'].includes(decision)) throw Error('Decisión no válida.');
    return this.store.db.runTransaction(async tx => {
      const pref = this.proposals.doc(String(id)), p = (await tx.get(pref)).data();
      if (!p || p.estado !== 'pendiente_gerencia') throw Error('La propuesta ya no está pendiente.');
      const at = now();
      if (decision === 'aprobar') {
        if (!ROUTE.test(p.ruta)) throw Error('Ruta de propuesta no permitida.');
        const eref = this.evaluations.doc(p.evaluation_id), ev = (await tx.get(eref)).data();
        if (!ev) throw Error('La evaluación ya no existe.');
        const next = JSON.parse(JSON.stringify(ev));
        const parts = p.ruta.split('.');
        const root = parts[0] === 'p' ? (next.inputs.p) : (next.analysis.estrategia = next.analysis.estrategia || {});
        let o = root; for (let i = 1; i < parts.length - 1; i++) { if (o[parts[i]] === undefined) throw Error('La ruta no existe en la evaluación.'); o = o[parts[i]]; }
        const key = parts[parts.length - 1], before = o[key];
        o[key] = p.ruta === 'estr.corte' ? String(p.valor) : Number(p.valor);
        if (parts[0] === 'estr') next.analysis.estrategia.estado = 'propuesta';
        if (next.workspace) { // la copia de trabajo del Evaluador recibe el mismo cambio
          const wroot = parts[0] === 'p' ? next.workspace.p : next.workspace.estr; let w = wroot;
          for (let i = 1; w && i < parts.length - 1; i++) w = w[parts[i]];
          if (w && typeof w === 'object') { w[key] = o[key]; if (parts[0] === 'estr' && next.workspace.estr) next.workspace.estr.estado = 'propuesta'; }
        }
        next.revision = (ev.revision || 0) + 1;
        next.history = [...(ev.history || []), { revision: ev.revision, at: ev.updated_at, by: ev.updated_by, change: { ruta: p.ruta, antes: before ?? null, despues: o[key], proposal_id: p.id } }].slice(-20);
        next.updated_at = at; next.updated_by = user.name;
        tx.set(eref, next);
      }
      tx.set(pref, { ...p, estado: decision === 'aprobar' ? 'aprobada' : 'rechazada', decidido_por: user.name, decidido_at: at, nota: text(input.note, 300) });
      return { ok: true };
    });
  }
  async setEditor(uid, input, user) {
    this.manager(user);
    if (!uid || String(uid).length > 120) throw Error('Usuario no válido.');
    const evaluations = (Array.isArray(input?.evaluations) ? input.evaluations : []).filter(safeId).slice(0, 50);
    await this.store.db.runTransaction(async tx => { tx.set(this.editors.doc(String(uid)), { uid: String(uid), active: input?.active === true, evaluations, updated_by: user.name, updated_at: now() }); });
    return { ok: true };
  }

  // ---------- Ventas reales para el Evaluador (contrato crm.ventas@1) ----------
  async salesFeed(evaluationId, user, d) {
    const ev = (await this.evaluations.doc(String(evaluationId)).get()).data();
    if (!ev) throw Error('La evaluación no existe.');
    if ((await this.scopeFor(user, ev.id)) !== 'completo') throw Error('Requiere Gerencia o editor asignado.');
    const units = new Map((d.units || []).map(u => [u.id, u])), leads = new Map((d.leads || []).map(l => [l.id, l]));
    const inScope = u => u && (!ev.unit_numbers?.length || ev.unit_numbers.includes(String(u.unit_number)));
    const ventas = [];
    for (const s of d.separations || []) {
      if (!['CONFIRMED', 'RESERVED', 'SOLD'].includes(s.status)) continue;
      const u = units.get(s.unit_id); if (!inScope(u)) continue;
      const lead = leads.get(s.lead_id) || {};
      const etapa = s.status === 'SOLD' ? 'Venta' : (ETAPAS.includes(lead.status) ? lead.status : 'Separación');
      const fecha = String(s.sold_at || s.confirmed_at || s.created_at || '').slice(0, 7);
      ventas.push({ unidad: String(u.unit_number), fecha, precio: Number(s.final_price || u.sold_amount || 0), etapa, campana: text(lead.campaign_name || lead.utm_campaign || lead.source || '', 120) });
    }
    // R48 · Estrategia de precios de Ventas: real vs línea base y ajuste sugerido para comparar en el Evaluador.
    let precios = null; try { precios = this.precios ? await this.precios.paraMora(d) : null; } catch { precios = null; }
    return { schema: 'crm.ventas@1', evaluation_id: ev.id, generado: now(), ventas, estrategia: ev.analysis?.estrategia || null, precios };
  }

  // ---------- Acciones de n8n ----------
  async action(p, readData) {
    if (p.action === 'mora_job_claim') return this.claim();
    if (p.action === 'mora_job_complete') return this.complete(p);
    if (p.action === 'mora_weekly_get') return this.weeklyGet(await readData());
    if (p.action === 'mora_weekly_complete') return this.weeklyComplete(p);
    if (p.action === 'mora_market_claim') return this.marketClaim();
    if (p.action === 'mora_market_complete') return this.marketComplete(p);
    throw Error('Operación M.O.R.A no reconocida.');
  }
  async sweep() {
    const rows = (await this.jobs.where('state', '==', 'processing').limit(50).get()).docs.map(x => x.data()).filter(j => Date.parse(j.lease_until) < Date.now());
    for (const j of rows) await this.store.db.runTransaction(async tx => {
      const ref = this.jobs.doc(j.id), cur = (await tx.get(ref)).data();
      if (!cur || cur.state !== 'processing' || Date.parse(cur.lease_until) >= Date.now()) return;
      tx.set(ref, { ...cur, state: (cur.attempts || 0) >= MAX_ATTEMPTS ? 'failed' : 'queued', lease_token: null, lease_until: null, updated_at: now() });
    });
  }
  async claim() {
    if (!this.config().enabled) return { ok: true, job: null };
    await this.sweep();
    for (let attempt = 0; attempt < 3; attempt++) {
      const rows = (await this.jobs.where('state', '==', 'queued').limit(50).get()).docs.map(x => x.data()).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
      if (!rows.length) return { ok: true, job: null };
      const token = randomUUID() + '-' + randomUUID();
      const got = await this.store.db.runTransaction(async tx => {
        const ref = this.jobs.doc(rows[0].id), j = (await tx.get(ref)).data();
        if (!j || j.state !== 'queued') return null;
        const next = { ...j, state: 'processing', attempts: (j.attempts || 0) + 1, lease_token: token, lease_until: new Date(Date.now() + LEASE_MS).toISOString(), updated_at: now() };
        tx.set(ref, next); return next;
      });
      if (got) {let drive_context=null;if(this.projectDrive&&got.actor_role==='Gerente'){const ev=(await this.evaluations.doc(got.evaluation_id).get()).data();drive_context=await this.projectDrive.context('mora',ev?.project?.nombre||got.evaluation_id,{role:got.actor_role});}return { ok: true, job: { id: got.id, engine: 'mora', lease_token: got.lease_token, evaluation_id: got.evaluation_id, thread_id: got.thread_id, actor_uid: got.actor_uid, actor_role: got.actor_role, question: got.question, tier: got.tier, view: got.view,drive_context } };}
    }
    return { ok: true, job: null };
  }
  async complete(p) {
    return this.store.db.runTransaction(async tx => {
      const ref = this.jobs.doc(String(p.job_id || '')), j = (await tx.get(ref)).data();
      if (!j || j.state !== 'processing' || !p.lease_token || j.lease_token !== p.lease_token) throw Error('Consulta no autorizada o vencida.');
      if (Date.parse(j.lease_until) < Date.now()) throw Error('El permiso de la consulta venció.');
      const at = now();
      if (p.error || !p.result) {
        tx.set(ref, { ...j, state: (j.attempts || 0) >= MAX_ATTEMPTS ? 'failed' : 'queued', last_error: text(p.error || 'sin_resultado', 60), lease_token: null, lease_until: null, updated_at: at });
        return { ok: true, requeued: (j.attempts || 0) < MAX_ATTEMPTS };
      }
      // El control de salida se repite aquí con el rol guardado en el trabajo.
      const edDoc = j.actor_role === 'Gerente' ? null : (await tx.get(this.editors.doc(j.actor_uid))).data();
      const scope = j.actor_role === 'Gerente' || (edDoc?.active === true && (edDoc.evaluations || []).includes(j.evaluation_id)) ? 'completo' : 'resumen';
      let reply = text(p.result.reply, 4000);
      if (!reply) throw Error('Respuesta vacía.');
      let proposals = [];
      if (scope === 'resumen') { if (FINANCIAL.test(reply)) reply = DENIED; }
      else proposals = (Array.isArray(p.result.proposals) ? p.result.proposals : []).slice(0, 5)
        .filter(x => ROUTE.test(String(x?.ruta || '')) && (x.ruta === 'estr.corte' ? /^\d{4}-\d{2}$/.test(String(x.valor)) : Number.isFinite(Number(x.valor))))
        .map((x, i) => ({ id: j.id + '-p' + i, job_id: j.id, evaluation_id: j.evaluation_id, ruta: x.ruta, valor: x.ruta === 'estr.corte' ? String(x.valor) : Number(x.valor), motivo: text(x.motivo, 300), estado: 'pendiente_gerencia', propuesto_por: 'M.O.R.A', solicitado_por: j.actor_name || '', propuesto_at: at }));
      const follow = (Array.isArray(p.result.follow_ups) ? p.result.follow_ups : []).map(x => text(x, 140)).filter(Boolean).slice(0, 3);
      const scenarios = scope === 'completo' && Array.isArray(p.result.scenarios) ? JSON.parse(JSON.stringify(p.result.scenarios.slice(0, 4))) : [];
      const mid = j.id + '-a';
      tx.set(this.messages.doc(mid), { id: mid, thread_id: j.thread_id, actor_uid: j.actor_uid, evaluation_id: j.evaluation_id, role: 'assistant', text: reply, at, sort_key: at + ':1', job_id: j.id,
        proposals: proposals.map(({ ruta, valor, motivo, id }) => ({ id, ruta, valor, motivo })), follow_ups: follow, scenarios, scope, model: text(p.result.model, 60), usage: p.result.usage || null });
      for (const pr of proposals) tx.set(this.proposals.doc(pr.id), pr);
      tx.set(ref, { ...j, state: 'done', lease_token: null, lease_until: null, completed_at: at, updated_at: at });
      return { ok: true, proposals: proposals.length, scope };
    });
  }

  // ---------- Lectura semanal ----------
  async weeklyGet(d) {
    const cfg = this.config();
    if (!cfg.weekly_enabled) return { ok: true, job: null };
    const week = isoWeek(), ref = this.weekly.doc(week);
    const evs = (await this.evaluations.limit(51).get()).docs.map(x => x.data()).filter(e => e.active !== false).slice(0, 20);
    if (!evs.length) return { ok: true, job: null };
    const token = randomUUID() + '-' + randomUUID();
    const got = await this.store.db.runTransaction(async tx => {
      const w = (await tx.get(ref)).data();
      if (w && (w.state === 'done' || (w.state === 'processing' && Date.parse(w.lease_until) > Date.now()))) return null;
      const next = { id: week, week, state: 'processing', lease_token: token, lease_until: new Date(Date.now() + LEASE_MS).toISOString(), created_at: w?.created_at || now(), updated_at: now() };
      tx.set(ref, next); return next;
    });
    if (!got) return { ok: true, job: null };
    const projects = evs.map(e => {
      const s = this.summaryFrom(d, e), metas = Array.isArray(e.analysis?.plan_comercial?.metas_mensuales) ? e.analysis.plan_comercial.metas_mensuales : [];
      const cut = new Date().toISOString().slice(0, 7);
      const planned = metas.filter(m => String(m.fecha || '') <= cut).reduce((a, m) => a + (Number(m.unidades) || 0), 0);
      return { project_id: e.id, name: e.project?.nombre || e.id, baseline: { kpis: e.analysis?.baseline?.kpis || {} }, projection: { kpis: e.analysis?.projection?.kpis || e.analysis?.current?.kpis || {} },
        sales: { planned_to_date: planned, sold_to_date: s.vendidas + s.separadas }, strategy: { estado: e.analysis?.estrategia?.estado || null } };
    });
    return { ok: true, job: { id: week, lease_token: token, week, thresholds: cfg.thresholds, projects } };
  }
  async weeklyComplete(p) {
    return this.store.db.runTransaction(async tx => {
      const ref = this.weekly.doc(String(p.job_id || '')), w = (await tx.get(ref)).data();
      if (!w || w.state !== 'processing' || !p.lease_token || w.lease_token !== p.lease_token || Date.parse(w.lease_until) < Date.now()) throw Error('Lectura semanal no autorizada o vencida.');
      const r = p.result || {};
      tx.set(ref, { ...w, state: 'done', lease_token: null, lease_until: null, summary: r.summary ? text(r.summary, 3000) : null,
        actions: (Array.isArray(r.actions) ? r.actions : []).slice(0, 20).map(a => ({ project_id: text(a.project_id, 100), accion: text(a.accion, 300), estado: 'pendiente_gerencia' })),
        alerts: (Array.isArray(r.alerts) ? r.alerts : []).slice(0, 60).map(a => ({ project_id: text(a.project_id, 100), level: ['alta', 'media'].includes(a.level) ? a.level : 'media', kind: text(a.kind, 30), text: text(a.text, 200) })),
        generated: !!r.summary, completed_at: now(), updated_at: now() });
      return { ok: true };
    });
  }
  async weeklyList(user) {
    this.manager(user);
    return (await this.weekly.limit(30).get()).docs.map(x => x.data()).filter(w => w.state === 'done').sort((a, b) => String(b.week).localeCompare(String(a.week))).slice(0, 12)
      .map(({ lease_token, ...w }) => w);
  }

  // ---------- R33c · Estudio de mercado: lectura de avisos por n8n ----------
  async marketRequest(input, user) {
    if (!this.config().enabled) throw Error('M.O.R.A está desactivada. Actívala en Evaluador Inmobiliario > Administración M.O.R.A.');
    const url = marketUrl(input?.url), body = String(input?.text ?? '').slice(0, 120000);
    if (!url && body.trim().length < 80) throw Error('Pega el contenido de la página o un enlace permitido.');
    const since = new Date(Date.now() - 3600000).toISOString();
    const recent = (await this.market.where('actor_uid', '==', uidOf(user)).limit(200).get()).docs.map(x => x.data()).filter(j => j.created_at >= since).length;
    if (recent >= 20) throw Error('Alcanzaste el límite de 20 lecturas de mercado por hora.');
    const id = randomUUID(), at = now();
    await this.store.db.runTransaction(async tx => { tx.set(this.market.doc(id), { id, state: 'queued', attempts: 0, url, text: body.trim() ? body : '', distrito: text(input?.distrito, 60), actor_uid: uidOf(user), actor_name: text(user.name, 120), created_at: at, updated_at: at }); });
    return { ok: true, job_id: id };
  }
  async marketGet(id, user) {
    const j = (await this.market.doc(String(id || '')).get()).data();
    if (!j || j.actor_uid !== uidOf(user)) throw Error('Lectura no encontrada.');
    return { id: j.id, state: j.state, result: j.state === 'done' ? j.result : null, error: j.state === 'failed' ? (j.error || 'No se pudo leer la fuente. Pega el contenido de la página.') : null };
  }
  async marketClaim() {
    if (!this.config().enabled) return { ok: true, job: null };
    const stale = (await this.market.where('state', '==', 'processing').limit(50).get()).docs.map(x => x.data()).filter(j => Date.parse(j.lease_until) < Date.now());
    for (const j of stale) await this.store.db.runTransaction(async tx => {
      const ref = this.market.doc(j.id), cur = (await tx.get(ref)).data();
      if (!cur || cur.state !== 'processing' || Date.parse(cur.lease_until) >= Date.now()) return;
      const failed = (cur.attempts || 0) >= MAX_ATTEMPTS;
      tx.set(ref, { ...cur, state: failed ? 'failed' : 'queued', ...(failed ? { text: '', error: 'La lectura no terminó a tiempo.' } : {}), lease_token: null, lease_until: null, updated_at: now() });
    });
    const rows = (await this.market.where('state', '==', 'queued').limit(50).get()).docs.map(x => x.data()).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    if (!rows.length) return { ok: true, job: null };
    const token = randomUUID() + '-' + randomUUID();
    const got = await this.store.db.runTransaction(async tx => {
      const ref = this.market.doc(rows[0].id), j = (await tx.get(ref)).data();
      if (!j || j.state !== 'queued') return null;
      const next = { ...j, state: 'processing', attempts: (j.attempts || 0) + 1, lease_token: token, lease_until: new Date(Date.now() + LEASE_MS).toISOString(), updated_at: now() };
      tx.set(ref, next); return next;
    });
    return got ? { ok: true, job: { id: got.id, engine: 'mora_market', lease_token: got.lease_token, url: got.url, text: got.text, distrito: got.distrito } } : { ok: true, job: null };
  }
  async marketComplete(p) {
    return this.store.db.runTransaction(async tx => {
      const ref = this.market.doc(String(p.job_id || '')), j = (await tx.get(ref)).data();
      if (!j || j.state !== 'processing' || !p.lease_token || j.lease_token !== p.lease_token || Date.parse(j.lease_until) < Date.now()) throw Error('Lectura de mercado no autorizada o vencida.');
      const at = now(), r = p.result || {};
      if (p.error || (!Array.isArray(r.avisos) && typeof r.csv !== 'string')) {
        const fatal = /blocked|forbidden|not_found|unsupported/.test(String(p.error || '')) || (j.attempts || 0) >= MAX_ATTEMPTS;
        tx.set(ref, { ...j, state: fatal ? 'failed' : 'queued', ...(fatal ? { text: '', error: p.error === 'blocked' || p.error === 'forbidden' ? 'El portal no permitió leer el enlace. Copia la página (Ctrl+A, Ctrl+C) y pégala.' : 'No se pudo leer la fuente. Pega el contenido de la página.' } : {}),
          last_error: text(p.error || 'sin_resultado', 60), lease_token: null, lease_until: null, updated_at: at });
        return { ok: true, requeued: !fatal };
      }
      const result = typeof r.csv === 'string' ? { csv: r.csv.slice(0, 200000) } : { avisos: r.avisos.slice(0, 300).map(cleanAviso).filter(Boolean) };
      tx.set(ref, { ...j, state: 'done', text: '', result, lease_token: null, lease_until: null, completed_at: at, updated_at: at });
      return { ok: true, avisos: result.avisos ? result.avisos.length : null };
    });
  }

  // ---------- Llamadas de pantalla ----------
  async getEvaluation(id, d) {
    const ev = (await this.evaluations.doc(String(id || '')).get()).data();
    if (!ev) throw Error('La evaluación no existe.');
    return { ...ev, summary: this.summaryFrom(d, ev) };
  }
  async rpc(name, args, user, readData) {
    // R33b · El Evaluador Inmobiliario y M.O.R.A son solo para Gerencia.
    this.manager(user);
    if (name === 'getMoraEvaluation') return this.getEvaluation(args[0], await readData());
    if (name === 'requestMoraMarket') return this.marketRequest(args[0] || {}, user);
    if (name === 'getMoraMarket') return this.marketGet(args[0], user);
    if (name === 'getMoraExchangeRate') { this.manager(user); return require('./exchangeRate').fetchSunatRate(); }
    if (name === 'geocodeMoraMarket') return this.geocodeMarket(args[0] || {}, user);
    if (name === 'getMoraConfig') { this.manager(user); return this.config(); }
    if (name === 'saveMoraConfig') { this.manager(user); return this.config(args[0] || {}, user.name); }
    if (name === 'saveMoraEvaluation') return this.saveEvaluation(args[0] || {}, user, await readData());
    if (name === 'getMoraEvaluations') return this.listEvaluations(user, await readData());
    if (name === 'askMora') return this.ask(args[0] || {}, user, await readData());
    if (name === 'getMoraThread') return this.thread(args[0] || {}, user);
    if (name === 'getMoraProposals') return this.listProposals(user);
    if (name === 'decideMoraProposal') return this.decideProposal(args[0], args[1] || {}, user);
    if (name === 'setMoraEditor') return this.setEditor(args[0], args[1] || {}, user);
    if (name === 'getMoraSalesFeed') return this.salesFeed(args[0], user, await readData());
    if (name === 'getMoraWeekly') return this.weeklyList(user);
    throw Error('Operación M.O.R.A no reconocida.');
  }
}
const MORA_METHODS = ['getMoraExchangeRate', 'requestMoraMarket', 'getMoraMarket', 'geocodeMoraMarket', 'getMoraEvaluation', 'getMoraConfig', 'saveMoraConfig', 'saveMoraEvaluation', 'getMoraEvaluations', 'askMora', 'getMoraThread', 'getMoraProposals', 'decideMoraProposal', 'setMoraEditor', 'getMoraSalesFeed', 'getMoraWeekly'];
module.exports = { MoraIntegration, MORA_METHODS, isoWeek };
