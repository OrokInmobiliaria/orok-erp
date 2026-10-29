// R31 · Modelo de datos del panel tipo Power BI. Funciones puras: sin red ni escritura.
import { reachedStage } from './leadScore.mjs';

export const FUNNEL = ['Lead Inicial', 'Contactado', 'MQL', 'Cita', 'Cita Asistida', 'Separación', 'Venta'];
const ORDER = ['Lead Inicial', 'Contactado', 'Información enviada', 'MQL', 'Cita', 'Cita Asistida', 'Calificado', 'Evaluación GNB', 'Separación', 'Inicial', 'Minuta', 'Venta'];
const DAY = 86400000;
const limaDay = ms => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
const parse = v => { const t = Date.parse(v || ''); return Number.isFinite(t) ? t : null; };
const ratio = (a, b) => b > 0 ? a / b : null;

export const dims = {
  source: l => String(l.source || '').trim() || 'Sin fuente',
  owner: l => String(l.sales_owner || '').trim() || 'Sin asignar',
  project: l => String(l.project || '').trim() || 'Sin proyecto',
  campaign: l => String(l.campaign_name || '').trim() || 'Sin campaña',
};

export function stageOf(lead) {
  if (lead.status === 'Venta' || lead.sold_unit_id) return 'Venta';
  const s = reachedStage(lead);
  return s;
}
export const reached = (lead, stage) => ORDER.indexOf(stageOf(lead)) >= ORDER.indexOf(stage);
export const receivedAt = l => parse(l.received_at) ?? parse(l.created_at);

// Semana que empieza el lunes (fecha Lima).
export function weekStart(ms) {
  const d = new Date(limaDay(ms) + 'T00:00:00Z'), wd = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - wd * DAY).toISOString().slice(0, 10);
}

export function options(leads) {
  const out = {};
  for (const [k, f] of Object.entries(dims)) out[k] = [...new Set((leads || []).map(f))].sort((a, b) => a.localeCompare(b, 'es'));
  return out;
}

function inPeriod(t, from, to) { if (!from && !to) return true; if (t === null) return false; const d = limaDay(t); return (!from || d >= from) && (!to || d <= to); }
function matches(l, f) { return (!f.source || dims.source(l) === f.source) && (!f.owner || dims.owner(l) === f.owner) && (!f.project || dims.project(l) === f.project) && (!f.campaign || dims.campaign(l) === f.campaign) && (!f.stage || reached(l, f.stage)); }
function expenseMatches(e, f) { return (!f.source || !e.source || e.source === f.source) && (!f.project || !e.project || e.project === f.project) && (!f.campaign || !e.campaign_name || e.campaign_name === f.campaign); }

function previousRange(from, to) {
  if (!from || !to) return null;
  const a = Date.parse(from + 'T00:00:00Z'), b = Date.parse(to + 'T00:00:00Z'), len = b - a + DAY;
  return { from: new Date(a - len).toISOString().slice(0, 10), to: new Date(a - DAY).toISOString().slice(0, 10) };
}

function counts(list) {
  const c = Object.fromEntries(FUNNEL.map(s => [s, 0]));
  for (const l of list) for (const s of FUNNEL) if (reached(l, s)) c[s]++;
  return c;
}

function groupBy(list, key, spendBy) {
  const m = new Map();
  for (const l of list) { const k = key(l); if (!m.has(k)) m.set(k, []); m.get(k).push(l); }
  return [...m.entries()].map(([name, ls]) => {
    const c = counts(ls), spend = spendBy ? spendBy(name) : null;
    return { name, leads: ls.length, contacted: c.Contactado, appointments: c.Cita, attended: c['Cita Asistida'], separations: c['Separación'], sales: c.Venta, conversion: ratio(c.Venta, ls.length), appointment_rate: ratio(c.Cita, ls.length), spend, cpl: spend !== null ? ratio(spend, ls.length) : null };
  }).sort((a, b) => b.leads - a.leads || a.name.localeCompare(b.name, 'es'));
}

export function buildModel({ leads = [], units = [], expenses = [] } = {}, filters = {}) {
  const f = filters || {}, all = leads.filter(l => l && typeof l === 'object');
  const undated = all.filter(l => receivedAt(l) === null).length;
  const scoped = all.filter(l => matches(l, f));
  const current = scoped.filter(l => inPeriod(receivedAt(l), f.from, f.to));
  const prevR = previousRange(f.from, f.to);
  const previous = prevR ? scoped.filter(l => inPeriod(receivedAt(l), prevR.from, prevR.to)) : null;
  const spendList = (expenses || []).filter(e => inPeriod(parse(e.date + 'T12:00:00Z'), f.from, f.to) && expenseMatches(e, f));
  const spend = spendList.reduce((n, e) => n + (Number(e.amount) || 0), 0);
  const prevSpend = prevR ? (expenses || []).filter(e => inPeriod(parse(e.date + 'T12:00:00Z'), prevR.from, prevR.to) && expenseMatches(e, f)).reduce((n, e) => n + (Number(e.amount) || 0), 0) : null;

  const c = counts(current), p = previous ? counts(previous) : null;
  const delta = (now, before) => before === null || before === undefined ? null : before === 0 ? (now === 0 ? 0 : null) : (now - before) / before;
  const kpis = {
    leads: { value: current.length, delta: p ? delta(current.length, previous.length) : null },
    contacted_rate: { value: ratio(c.Contactado, current.length) },
    appointments: { value: c.Cita, delta: p ? delta(c.Cita, p.Cita) : null },
    attended: { value: c['Cita Asistida'], delta: p ? delta(c['Cita Asistida'], p['Cita Asistida']) : null },
    separations: { value: c['Separación'] },
    sales: { value: c.Venta, delta: p ? delta(c.Venta, p.Venta) : null },
    conversion: { value: ratio(c.Venta, current.length) },
    spend: { value: spend, delta: prevSpend !== null ? delta(spend, prevSpend) : null },
    cpl: { value: ratio(spend, current.length) },
    cost_per_appointment: { value: ratio(spend, c.Cita) },
    cost_per_sale: { value: ratio(spend, c.Venta) },
  };

  const funnel = FUNNEL.map((stage, i) => ({ stage, count: c[stage], of_total: ratio(c[stage], current.length), step: i ? ratio(c[stage], c[FUNNEL[i - 1]]) : null }));

  const weeks = new Map();
  for (const l of current) { const t = receivedAt(l); if (t === null) continue; const w = weekStart(t); if (!weeks.has(w)) weeks.set(w, { week: w, leads: 0, appointments: 0, sales: 0 }); const r = weeks.get(w); r.leads++; if (reached(l, 'Cita')) r.appointments++; if (reached(l, 'Venta')) r.sales++; }
  const trend = [...weeks.values()].sort((a, b) => a.week.localeCompare(b.week));

  const spendFor = key => name => spendList.filter(e => (key === 'source' ? e.source : key === 'project' ? e.project : e.campaign_name) === name).reduce((n, e) => n + (Number(e.amount) || 0), 0);
  const bySource = groupBy(current, dims.source, spendFor('source'));
  const byOwner = groupBy(current, dims.owner, null);
  const byCampaign = groupBy(current, dims.campaign, spendFor('campaign'));
  const matrix = bySource.map(s => ({ name: s.name, cells: FUNNEL.map(stage => current.filter(l => dims.source(l) === s.name && reached(l, stage)).length) }));

  const sold = u => u.sold_lead_id || ['SOLD', 'VENDIDO', 'VENDIDA', 'VENTA'].includes(String(u.status || '').toUpperCase());
  const inv = { available: 0, available_value: 0, sold: 0, sold_value: 0, total: (units || []).length };
  for (const u of units || []) { const v = Number(u.price) || 0; if (sold(u)) { inv.sold++; inv.sold_value += v; } else { inv.available++; inv.available_value += v; } }
  inv.sold_rate = ratio(inv.sold, inv.total);

  return { filters: f, previous_range: prevR, total_leads: all.length, undated_excluded: f.from || f.to ? undated : 0, kpis, funnel, trend, bySource, byOwner, byCampaign, matrix, inventory: inv, expenses_count: spendList.length };
}

// Atajos de período (fechas Lima).
export function preset(name, now = Date.now()) {
  const today = limaDay(now), d = new Date(today + 'T00:00:00Z');
  const iso = x => x.toISOString().slice(0, 10);
  if (name === '7d') return { from: iso(new Date(d - 6 * DAY)), to: today };
  if (name === '30d') return { from: iso(new Date(d - 29 * DAY)), to: today };
  if (name === '90d') return { from: iso(new Date(d - 89 * DAY)), to: today };
  if (name === 'month') return { from: today.slice(0, 8) + '01', to: today };
  if (name === 'year') return { from: today.slice(0, 5) + '01-01', to: today };
  return { from: '', to: '' };
}
