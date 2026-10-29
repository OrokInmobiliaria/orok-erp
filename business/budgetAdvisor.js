'use strict';
// R29 · M4 y M5. Reglas puras (sin IA, sin red, sin escritura) para:
//  - comparar variantes A/B de una misma pieza medidas por anuncio,
//  - recomendar a Gerencia subir, mantener o reducir inversión por anuncio.
// Nada de esto cambia presupuestos en Meta ni TikTok: solo produce recomendaciones.

const MIN_LEADS_PER_VARIANT = 10;   // por debajo, no se declara ganador
const MIN_SPEND = 100;              // inversión mínima (moneda del anuncio) para opinar
const MIN_LEADS_FOR_BUDGET = 8;     // leads del CRM mínimos para subir o reducir por costo
const WIN_MARGIN = 0.25;            // diferencia relativa mínima de costo por lead
const MAX_CHANGE_PCT = 20;          // cambio máximo sugerido
const BUDGET_NOTICE = 'Recomendación para decisión de Gerencia. No cambia presupuestos en Meta ni TikTok.';

const num = v => Number.isFinite(Number(v)) ? Number(v) : 0;
const median = list => { const s = list.filter(n => n > 0).sort((a, b) => a - b); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const cost = (spend, count) => count > 0 ? spend / count : null;

// variants: [{label, ad_id, spend, crm_leads, stages:{Cita}, currency}]
function compareVariants(variants) {
  const rows = (variants || []).map(v => ({
    label: v.label, ad_id: v.ad_id, currency: v.currency || null,
    spend: num(v.spend), crm_leads: num(v.crm_leads), appointments: num(v.stages?.Cita),
    cpl: cost(num(v.spend), num(v.crm_leads)), cost_per_appointment: cost(num(v.spend), num(v.stages?.Cita)),
  }));
  const warnings = [];
  if (rows.length < 2) return { rows, winner: null, verdict: 'Se necesitan al menos dos variantes con anuncio vinculado.', warnings };
  if (new Set(rows.map(r => r.currency)).size > 1) return { rows, winner: null, verdict: 'Las variantes usan monedas distintas y no se comparan.', warnings };
  for (const r of rows) if (r.crm_leads < MIN_LEADS_PER_VARIANT) warnings.push(`Variante ${r.label}: ${r.crm_leads} lead(s) vinculados. Con menos de ${MIN_LEADS_PER_VARIANT} la diferencia puede ser azar.`);
  if (warnings.length) return { rows, winner: null, verdict: 'Muestra pequeña: todavía no se declara una variante ganadora.', warnings };
  const ranked = [...rows].sort((a, b) => a.cpl - b.cpl);
  const [best, second] = ranked;
  const gap = (second.cpl - best.cpl) / second.cpl;
  if (gap < WIN_MARGIN) return { rows, winner: null, verdict: `Sin ganador claro: la diferencia de costo por lead es menor a ${WIN_MARGIN * 100}%.`, warnings };
  return { rows, winner: best.label, verdict: `La variante ${best.label} cuesta ${Math.round(gap * 100)}% menos por lead del CRM. Confírmalo con citas antes de escalar.`, warnings };
}

// rows: filas por anuncio de AdsAnalytics.dashboard({group:'ad'}).
function recommendBudget(rows, options = {}) {
  const minSpend = options.minSpend ?? MIN_SPEND;
  const items = [];
  const currencies = [...new Set((rows || []).map(r => r.currency))];
  for (const currency of currencies) {
    const group = rows.filter(r => r.currency === currency && num(r.spend) > 0);
    const med = median(group.filter(r => num(r.crm_leads) >= MIN_LEADS_FOR_BUDGET).map(r => cost(num(r.spend), num(r.crm_leads))));
    for (const r of group) {
      const spend = num(r.spend), leads = num(r.crm_leads), appts = num(r.stages?.Cita), cpl = cost(spend, leads);
      const base = { ad_id: r.ad_id || null, name: r.name || r.ad_id || '', provider: r.provider, currency, spend, crm_leads: leads, appointments: appts, cpl };
      if (spend < minSpend) { items.push({ ...base, action: 'sin_datos', change_pct: 0, reason: `Inversión de ${spend.toFixed(2)} ${currency}, menor al mínimo de ${minSpend} para opinar.` }); continue; }
      if (leads === 0) { items.push({ ...base, action: spend >= minSpend * 2 ? 'reducir' : 'mantener', change_pct: spend >= minSpend * 2 ? -MAX_CHANGE_PCT : 0, reason: spend >= minSpend * 2 ? 'Inversión relevante sin ningún lead del CRM vinculado. Revisa primero que la atribución esté bien.' : 'Aún sin leads vinculados; espera más datos.' }); continue; }
      if (leads < MIN_LEADS_FOR_BUDGET || med === null) { items.push({ ...base, action: 'mantener', change_pct: 0, reason: `Solo ${leads} lead(s) vinculados; muestra insuficiente para cambiar inversión.` }); continue; }
      const ratio = cpl / med;
      if (ratio <= 0.75 && appts > 0) items.push({ ...base, action: 'aumentar', change_pct: MAX_CHANGE_PCT, reason: `Costo por lead ${Math.round((1 - ratio) * 100)}% menor a la mediana de sus anuncios y con ${appts} cita(s).` });
      else if (ratio >= 1.5) items.push({ ...base, action: 'reducir', change_pct: -MAX_CHANGE_PCT, reason: `Costo por lead ${Math.round((ratio - 1) * 100)}% mayor a la mediana de sus anuncios.` });
      else items.push({ ...base, action: 'mantener', change_pct: 0, reason: 'Costo dentro del rango normal de sus anuncios.' });
    }
  }
  return { items, notice: BUDGET_NOTICE, max_change_pct: MAX_CHANGE_PCT };
}

module.exports = { compareVariants, recommendBudget, MIN_LEADS_PER_VARIANT, MIN_SPEND, MIN_LEADS_FOR_BUDGET, WIN_MARGIN, MAX_CHANGE_PCT, BUDGET_NOTICE };
