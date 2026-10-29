'use strict';
// R29 · M2. Resumen diario de gestión para Gerencia. Función pura: lee leads y
// devuelve texto. No incluye teléfonos, DNI ni correos de clientes.
const path = require('node:path'), { pathToFileURL } = require('node:url');
const TZ = 'America/Lima', HOUR = 3600000;
let scoreModule;
const loadScore = () => scoreModule ||= import(pathToFileURL(path.join(__dirname, '..', 'src', 'leadScore.mjs')).href);

const day = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
const hhmm = (ms) => new Intl.DateTimeFormat('es-PE', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms));
const time = v => { const t = Date.parse(v || ''); return Number.isFinite(t) ? t : null; };
const clean = v => String(v || 'Sin nombre').replace(/[\r\n<>]/g, ' ').slice(0, 60);
const closed = l => l.status === 'Venta' || l.status === 'Desestimado' || !!l.sold_unit_id || l.opt_out === true;
const LIMIT = 8;

async function buildDailyBrief(leads, { now = Date.now(), pendingBudget = 0, campaignsInReview = 0 } = {}) {
  const { interestScore } = await loadScore();
  const open = (leads || []).filter(l => l && typeof l === 'object' && !closed(l));
  const today = day(now);

  const visits = [], unresolved = [];
  for (const l of open) for (const a of l.appointments || []) {
    const t = time(a.scheduled_at);
    if (t === null || a.status !== 'scheduled') continue;
    if (day(t) === today && t >= now - 2 * HOUR) visits.push({ lead: clean(l.name), at: t, owner: l.sales_owner || a.owner || 'Sin asignar' });
    else if (t < now - 2 * HOUR) unresolved.push({ lead: clean(l.name), at: t, owner: l.sales_owner || a.owner || 'Sin asignar' });
  }
  visits.sort((a, b) => a.at - b.at);
  unresolved.sort((a, b) => a.at - b.at);

  const noReply = open.filter(l => l.status === 'Lead Inicial' && time(l.received_at) !== null && now - time(l.received_at) > 24 * HOUR)
    .map(l => ({ lead: clean(l.name), hours: Math.floor((now - time(l.received_at)) / HOUR), owner: l.sales_owner || 'Sin asignar' }))
    .sort((a, b) => b.hours - a.hours);

  const overdue = open.filter(l => time(l.next_action_at) !== null && time(l.next_action_at) < now)
    .map(l => ({ lead: clean(l.name), days: Math.max(1, Math.floor((now - time(l.next_action_at)) / (24 * HOUR))), action: String(l.next_action || '').slice(0, 80), owner: l.sales_owner || 'Sin asignar' }))
    .sort((a, b) => b.days - a.days);

  const top = open.map(l => ({ l, r: interestScore(l, now) })).filter(x => x.r.score !== null && x.r.band === 'Alto')
    .sort((a, b) => b.r.score - a.r.score).slice(0, 5)
    .map(x => ({ lead: clean(x.l.name), score: x.r.score, stage: x.r.stage, owner: x.l.sales_owner || 'Sin asignar' }));

  const counts = { visits: visits.length, unresolved: unresolved.length, no_reply: noReply.length, overdue: overdue.length, top: top.length, pending_budget: pendingBudget, campaigns_in_review: campaignsInReview };
  const sections = [
    { id: 'visits', title: 'Visitas de hoy', total: visits.length, lines: visits.slice(0, LIMIT).map(v => `${hhmm(v.at)} · ${v.lead} · ${v.owner}`) },
    { id: 'no_reply', title: 'Leads nuevos sin gestión por más de 24 horas', total: noReply.length, lines: noReply.slice(0, LIMIT).map(v => `${v.lead} · ${v.hours} h · ${v.owner}`) },
    { id: 'unresolved', title: 'Citas pasadas sin resultado registrado', total: unresolved.length, lines: unresolved.slice(0, LIMIT).map(v => `${v.lead} · ${day(v.at)} ${hhmm(v.at)} · ${v.owner}`) },
    { id: 'overdue', title: 'Seguimientos vencidos', total: overdue.length, lines: overdue.slice(0, LIMIT).map(v => `${v.lead} · ${v.days} día(s)${v.action ? ' · ' + v.action : ''} · ${v.owner}`) },
    { id: 'top', title: 'Leads con interés alto para atender primero', total: top.length, lines: top.map(v => `${v.lead} · ${v.score}/100 · ${v.stage} · ${v.owner}`) },
  ];
  const marketing = [];
  if (pendingBudget) marketing.push(`${pendingBudget} recomendación(es) de presupuesto esperan decisión de Gerencia.`);
  if (campaignsInReview) marketing.push(`${campaignsInReview} campaña(s) esperan revisión y aprobación.`);

  const attention = visits.length + noReply.length + unresolved.length + overdue.length;
  const subject = `Resumen de gestión ${today}: ${visits.length} visita(s) hoy, ${attention - visits.length} punto(s) por atender`;
  const body = [`Resumen de gestión comercial · ${today}`, ''];
  for (const s of sections) {
    body.push(`${s.title}: ${s.total}`);
    if (s.lines.length) body.push(...s.lines.map(x => '  - ' + x));
    if (s.total > s.lines.length) body.push(`  … y ${s.total - s.lines.length} más en el CRM.`);
    body.push('');
  }
  if (marketing.length) body.push('Marketing', ...marketing.map(x => '  - ' + x), '');
  body.push('El puntaje de interés orienta la atención; no descarta ni mueve leads. Este resumen no incluye teléfonos ni documentos.');
  const text = body.join('\n');
  const esc = v => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const html = '<div style="font-family:Arial,sans-serif;font-size:14px;color:#292524">' + `<h2 style="margin:0 0 12px">Resumen de gestión comercial · ${today}</h2>` +
    sections.map(s => `<h3 style="margin:16px 0 4px">${esc(s.title)}: ${s.total}</h3>` + (s.lines.length ? '<ul>' + s.lines.map(x => `<li>${esc(x)}</li>`).join('') + '</ul>' : '') + (s.total > s.lines.length ? `<p style="margin:0">… y ${s.total - s.lines.length} más en el CRM.</p>` : '')).join('') +
    (marketing.length ? '<h3 style="margin:16px 0 4px">Marketing</h3><ul>' + marketing.map(x => `<li>${esc(x)}</li>`).join('') + '</ul>' : '') +
    '<p style="color:#57534e;font-size:12px">El puntaje de interés orienta la atención; no descarta ni mueve leads. Este resumen no incluye teléfonos ni documentos.</p></div>';
  return { date: today, subject, text, html, counts, sections };
}

module.exports = { buildDailyBrief, TZ };
