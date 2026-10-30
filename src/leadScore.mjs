// Puntaje de interés del lead (R29 · M3).
//
// Reglas puras, sin IA y sin escritura. Solo lee señales ya registradas en la
// ficha del lead. Orienta al asesor sobre a quién atender primero; nunca
// descarta, mueve ni bloquea a nadie, y no se guarda en la base de datos.
//
// Nunca se usan datos personales ni sensibles (nombre, DNI, estado civil,
// distrito, edad, género, ingresos). Hay una prueba automática que lo verifica.

import { senales as senalesFormulario } from './formAnswers.mjs';

export const STAGE_POINTS = [
  ['Lead Inicial', 5], ['Contactado', 10], ['Información enviada', 15], ['MQL', 25],
  ['Cita', 38], ['Cita Asistida', 52], ['Calificado', 60], ['Evaluación GNB', 66],
  ['Separación', 80], ['Inicial', 86], ['Minuta', 92],
];
const EVENT_STAGE = {
  contacted: 'Contactado', mql: 'MQL', scheduled: 'Cita', rescheduled: 'Cita', attended: 'Cita Asistida',
  financial: 'Calificado', finance_review: 'Evaluación GNB', separation: 'Separación', initial: 'Inicial', minute: 'Minuta',
};
export const BANDS = { high: 70, medium: 40 };
const DAY = 86400000;

const rank = stage => STAGE_POINTS.findIndex(([name]) => name === stage);
const time = value => { const t = Date.parse(value || ''); return Number.isFinite(t) ? t : null; };

export function reachedStage(lead) {
  let best = rank(lead.status);
  const consider = stage => { const r = rank(stage); if (r > best) best = r; };
  for (const type of Object.keys(lead.milestones || {})) if (lead.milestones[type]) consider(EVENT_STAGE[type]);
  for (const event of lead.events || []) consider(EVENT_STAGE[event.type]);
  for (const appointment of lead.appointments || []) {
    consider('Cita');
    if (appointment.status === 'attended') consider('Cita Asistida');
  }
  return best < 0 ? 'Lead Inicial' : STAGE_POINTS[best][0];
}

export function bandOf(score) {
  if (score === null || score === undefined) return 'Sin puntaje';
  return score >= BANDS.high ? 'Alto' : score >= BANDS.medium ? 'Medio' : 'Bajo';
}

// Devuelve { score, band, stage, reasons[] }. `score` es null cuando el puntaje no aplica.
export function interestScore(lead, now = Date.now()) {
  if (!lead || typeof lead !== 'object') return { score: null, band: 'Sin puntaje', stage: null, reasons: [] };
  if (lead.status === 'Venta' || lead.sold_unit_id) return { score: null, band: 'Cerrado', stage: 'Venta', reasons: ['Venta confirmada.'] };
  if (lead.status === 'Desestimado') return { score: null, band: 'Desestimado', stage: null, reasons: ['Lead desestimado.'] };
  if (lead.opt_out === true) return { score: null, band: 'No contactar', stage: null, reasons: ['El cliente pidió no ser contactado.'] };

  const stage = reachedStage(lead), reasons = [];
  let score = STAGE_POINTS[rank(stage)][1];
  reasons.push('Etapa alcanzada: ' + stage + ' (' + score + ' pts).');
  const add = (points, text) => { score += points; reasons.push(text + ' (' + (points > 0 ? '+' : '') + points + ').'); };

  // Perfil comercial confirmado.
  if (Number(lead.budget) > 0) add(5, 'Presupuesto registrado');
  if (String(lead.purchase_horizon || '').trim()) add(4, 'Horizonte de compra definido');
  if (String(lead.unit_interest || '').trim()) add(3, 'Tipo de departamento de interés');

  // R65 · Lo que el cliente declaró en el formulario (inicial, presupuesto, tipología, financiamiento).
  for (const [points, text] of senalesFormulario(lead)) add(points, text);

  // Citas.
  const appointments = lead.appointments || [];
  if (appointments.some(a => a.status === 'scheduled' && (time(a.scheduled_at) ?? 0) >= now)) add(8, 'Tiene una visita agendada');
  if (appointments.some(a => a.status === 'no_show')) add(-6, 'No asistió a una visita');

  // Financiamiento.
  const finance = String(lead.finance_status || '');
  if (['Aprobado', 'Crédito directo viable'].includes(finance)) add(8, 'Evaluación financiera favorable');
  else if (['Precalificado', 'Condicionado'].includes(finance)) add(4, 'Evaluación financiera en curso');
  else if (finance === 'Rechazado') add(-10, 'Evaluación financiera rechazada');
  if (['Ficha completa', 'Lista para enviar', 'Enviada a GNB', 'Aprobada'].includes(String(lead.bank_evaluation?.status || ''))) add(4, 'Ficha bancaria avanzada');

  // Cotización entregada.
  if (lead.last_quote) add(6, 'Recibió una cotización');

  // Actividad reciente.
  const last = time(lead.last_activity_at) ?? time(lead.received_at);
  if (last !== null) {
    const days = Math.max(0, (now - last) / DAY);
    if (days <= 2) add(8, 'Actividad en los últimos 2 días');
    else if (days <= 7) add(4, 'Actividad en la última semana');
    else if (days > 30) add(-12, 'Sin actividad hace más de 30 días');
    else if (days > 14) add(-6, 'Sin actividad hace más de 14 días');
  }
  if ((Number(lead.contact_attempts) || 0) >= 3 && !lead.milestones?.contacted) add(-8, 'Tres o más intentos sin contacto efectivo');

  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, band: bandOf(score), stage, reasons };
}

export const SCORE_NOTICE = 'El puntaje orienta la atención del asesor según señales registradas. No descarta ni mueve leads.';
