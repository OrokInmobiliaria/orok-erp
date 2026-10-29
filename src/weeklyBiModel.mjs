// R33 · Modelo del tablero semanal tipo Power BI. Funciones puras: sin red ni escritura.
// Semanas de lunes a domingo, fechas de Lima. Reutiliza las reglas de etapa del panel R31.
import { dims, reached, receivedAt, weekStart, FUNNEL } from './biModel.mjs';

const DAY = 86400000;
const ratio = (a, b) => b > 0 ? a / b : null;
const parse = v => { const t = Date.parse(v || ''); return Number.isFinite(t) ? t : null; };
const limaDay = ms => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
const addDays = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);
const delta = (now, before) => before === null || before === undefined ? null : before === 0 ? (now === 0 ? 0 : null) : (now - before) / before;
export const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const soldUnit = u => !!u?.sold_lead_id || ['SOLD', 'VENDIDO', 'VENDIDA', 'VENTA'].includes(String(u?.status || '').toUpperCase());

function matches(l, f) {
  return (!f.source || dims.source(l) === f.source) && (!f.owner || dims.owner(l) === f.owner) && (!f.project || dims.project(l) === f.project) && (!f.campaign || dims.campaign(l) === f.campaign);
}
function expenseMatches(e, f) { return (!f.source || !e.source || e.source === f.source) && (!f.project || !e.project || e.project === f.project) && (!f.campaign || !e.campaign_name || e.campaign_name === f.campaign); }

// Etiqueta corta de una semana: "20–26 oct".
export function weekLabel(start) {
  const end = addDays(start, 6), m = d => new Intl.DateTimeFormat('es-PE', { month: 'short', timeZone: 'UTC' }).format(new Date(d + 'T00:00:00Z')).replace('.', '').toLowerCase();
  const a = +start.slice(8), b = +end.slice(8);
  return start.slice(5, 7) === end.slice(5, 7) ? `${a}–${b} ${m(end)}` : `${a} ${m(start)}–${b} ${m(end)}`;
}

export function weeklyModel({ leads = [], units = [], expenses = [], separations = [] } = {}, opts = {}) {
  const n = Math.max(4, Math.min(52, Number(opts.weeks) || 12));
  const nowMs = opts.now ?? Date.now(), lastStart = weekStart(nowMs), today = limaDay(nowMs);
  const starts = Array.from({ length: n }, (_, i) => addDays(lastStart, -7 * (n - 1 - i)));
  const first = starts[0], f = opts.filters || {};
  const scoped = leads.filter(l => l && typeof l === 'object' && matches(l, f));
  const leadById = new Map(leads.map(l => [l.id, l]));
  const unitById = new Map(units.map(u => [u.id, u]));
  const idx = new Map(starts.map((s, i) => [s, i]));
  const rows = starts.map(s => ({ week: s, label: weekLabel(s), current: s === lastStart, partial: s === lastStart && addDays(s, 6) > today,
    leads: 0, contacted: 0, appointments: 0, attended: 0, cohort_separations: 0, cohort_sales: 0, separations: 0, sales: 0, sales_value: 0, spend: 0, units_sold: 0 }));
  const byDay = Array(7).fill(0);
  const sourceWeek = new Map(), ownerRows = new Map();
  for (const l of scoped) {
    const t = receivedAt(l); if (t === null) continue;
    const w = weekStart(t); if (!idx.has(w)) continue;
    const r = rows[idx.get(w)];
    r.leads++; if (reached(l, 'Contactado')) r.contacted++; if (reached(l, 'Cita')) r.appointments++; if (reached(l, 'Cita Asistida')) r.attended++;
    if (reached(l, 'Separación')) r.cohort_separations++; if (reached(l, 'Venta')) r.cohort_sales++;
    byDay[(new Date(limaDay(t) + 'T00:00:00Z').getUTCDay() + 6) % 7]++;
    const src = dims.source(l); if (!sourceWeek.has(src)) sourceWeek.set(src, Array(n).fill(0)); sourceWeek.get(src)[idx.get(w)]++;
  }
  // Flujos de la semana: separaciones confirmadas y ventas cerradas en esa semana (no por cohorte).
  for (const s of separations || []) {
    const lead = leadById.get(s.lead_id); if (lead && !matches(lead, f)) continue; if (!lead && (f.source || f.owner || f.campaign)) continue;
    const conf = parse(s.confirmed_at), sold = parse(s.sold_at);
    if (conf !== null && ['CONFIRMED', 'RESERVED', 'SOLD'].includes(s.status)) { const w = weekStart(conf); if (idx.has(w)) rows[idx.get(w)].separations++; }
    if (sold !== null && s.status === 'SOLD') { const w = weekStart(sold); if (idx.has(w)) { const r = rows[idx.get(w)]; r.sales++; r.sales_value += Number(s.final_price || unitById.get(s.unit_id)?.sold_amount || 0); } }
  }
  for (const e of expenses || []) { if (!expenseMatches(e, f)) continue; const t = parse(String(e.date || '') + 'T12:00:00Z'); if (t === null) continue; const w = weekStart(t); if (idx.has(w)) rows[idx.get(w)].spend += Number(e.amount) || 0; }
  // Absorción del inventario: unidades vendidas acumuladas por semana.
  const projUnits = (units || []).filter(u => !f.project || !u.project || u.project === f.project);
  let soldBefore = 0;
  for (const u of projUnits) { if (!soldUnit(u)) continue; const t = parse(u.sold_at); if (t === null || weekStart(t) < first) soldBefore++; else if (idx.has(weekStart(t))) rows[idx.get(weekStart(t))].units_sold++; }
  let acc = soldBefore; for (const r of rows) { acc += r.units_sold; r.units_sold_acc = acc; r.cpl = ratio(r.spend, r.leads); r.appt_rate = ratio(r.appointments, r.leads); }
  // Asesores en la semana elegida.
  const sel = Math.max(0, Math.min(n - 1, opts.selected ?? (rows[n - 1].partial && rows[n - 1].leads === 0 ? n - 2 : n - 1)));
  for (const l of scoped) {
    const t = receivedAt(l); if (t === null || weekStart(t) !== starts[sel]) continue;
    const o = dims.owner(l); if (!ownerRows.has(o)) ownerRows.set(o, { name: o, leads: 0, contacted: 0, appointments: 0, attended: 0, separations: 0, sales: 0 });
    const r = ownerRows.get(o); r.leads++; if (reached(l, 'Contactado')) r.contacted++; if (reached(l, 'Cita')) r.appointments++; if (reached(l, 'Cita Asistida')) r.attended++; if (reached(l, 'Separación')) r.separations++; if (reached(l, 'Venta')) r.sales++;
  }
  const cur = rows[sel], prev = sel > 0 ? rows[sel - 1] : null, last4 = rows.slice(Math.max(0, sel - 4), sel);
  const avg = k => last4.length ? last4.reduce((a, r) => a + r[k], 0) / last4.length : null;
  const kpi = k => ({ value: cur[k], delta: prev ? delta(cur[k], prev[k]) : null, avg4: avg(k) });
  const kpis = { leads: kpi('leads'), appointments: kpi('appointments'), attended: kpi('attended'), separations: kpi('separations'), sales: kpi('sales'), sales_value: kpi('sales_value'), spend: kpi('spend'),
    cpl: { value: cur.cpl, delta: prev && prev.cpl !== null && cur.cpl !== null ? delta(cur.cpl, prev.cpl) : null, avg4: null },
    appt_rate: { value: cur.appt_rate, delta: prev && prev.appt_rate !== null && cur.appt_rate !== null ? cur.appt_rate - prev.appt_rate : null, avg4: null } };
  const funnel = FUNNEL.map(stage => ({ stage, count: scoped.filter(l => { const t = receivedAt(l); return t !== null && weekStart(t) === starts[sel] && reached(l, stage); }).length }));
  const heat = [...sourceWeek.entries()].map(([name, cells]) => ({ name, cells, total: cells.reduce((a, b) => a + b, 0) })).sort((a, b) => b.total - a.total).slice(0, 10);
  const totalUnits = projUnits.length;
  const insights = [];
  if (prev) { const d = kpis.leads.delta; if (d !== null && Math.abs(d) >= 0.2) insights.push({ tone: d > 0 ? 'up' : 'down', text: `Los leads ${d > 0 ? 'subieron' : 'bajaron'} ${Math.round(Math.abs(d) * 100)}% frente a la semana anterior (${prev.leads} → ${cur.leads}).` }); }
  const bestSrc = heat.map(h => ({ name: h.name, v: h.cells[sel] })).sort((a, b) => b.v - a.v)[0];
  if (bestSrc && bestSrc.v > 0) insights.push({ tone: 'info', text: `${bestSrc.name} fue la fuente con más leads de la semana (${bestSrc.v}).` });
  const peak = byDay.indexOf(Math.max(...byDay)); if (byDay[peak] > 0) insights.push({ tone: 'info', text: `En el período, los ${WEEKDAYS[peak].toLowerCase()} concentran más entradas de leads: conviene reforzar la atención ese día.` });
  if (cur.leads > 0 && cur.appointments === 0) insights.push({ tone: 'down', text: 'Ningún lead de la semana llegó a cita todavía: revisa el seguimiento.' });
  const noFollow = scoped.filter(l => { const t = receivedAt(l); return t !== null && weekStart(t) === starts[sel] && !reached(l, 'Contactado'); }).length;
  if (noFollow > 0) insights.push({ tone: 'down', text: `${noFollow} lead${noFollow === 1 ? '' : 's'} de la semana sigue${noFollow === 1 ? '' : 'n'} sin contacto.` });
  if (totalUnits) insights.push({ tone: 'info', text: `Inventario vendido: ${rows[n - 1].units_sold_acc} de ${totalUnits} unidades (${Math.round(rows[n - 1].units_sold_acc / totalUnits * 100)}%).` });
  return { weeks: rows, selected: sel, kpis, funnel, heat, byDay, owners: [...ownerRows.values()].sort((a, b) => b.leads - a.leads), totalUnits, insights, range: { from: first, to: addDays(lastStart, 6) } };
}
