// Reporting order only. The Kanban stages and lifecycle actions are unchanged.
const GROUPS = {
  marketing: ['Lead Inicial', 'Contactado', 'Información enviada', 'MQL', 'Cita'],
  sales: ['Cita Asistida', 'Calificado', 'Separación', 'Inicial', 'Venta'],
};
const STAGES = [...GROUPS.marketing, ...GROUPS.sales];
const EVENT_STAGES = {
  received: 'Lead Inicial', contacted: 'Contactado', mql: 'MQL', sql: 'MQL',
  scheduled: 'Cita', rescheduled: 'Cita', no_show: 'Cita', cancelled: 'Cita',
  attended: 'Cita Asistida', financial: 'Calificado', finance_review: 'Evaluación GNB', separation: 'Separación', minute: 'Minuta',
  separation_cancelled: 'Separación', initial: 'Inicial', sale: 'Venta',
};

function reachedStages(lead) {
  const reached = new Set(['Lead Inicial']);
  const add = stage => { if (STAGES.includes(stage)) reached.add(stage); };
  add(lead.status);
  for (const change of lead.stage_history || []) { add(change.from); add(change.to); }
  for (const event of lead.events || []) add(EVENT_STAGES[event.type]);
  for (const [type, at] of Object.entries(lead.milestones || {})) if (at) add(EVENT_STAGES[type]);
  for (const appointment of lead.appointments || []) {
    add('Cita');
    if (appointment.status === 'attended') add('Cita Asistida');
  }
  if (lead.appointment?.date) add('Cita');
  if ((lead.separations || []).length) add('Separación');
  if (lead.sold_unit_id) add('Venta');
  return reached;
}

const rankOf = stages => Math.max(...[...stages].map(stage => STAGES.indexOf(stage)));

function rowsFor(evidence, stages, base) {
  let previous = base;
  return stages.map(stage => {
    const rank = STAGES.indexOf(stage);
    const count = evidence.filter(item => item.rank >= rank).length;
    const observedCount = evidence.filter(item => item.stages.has(stage)).length;
    const row = {
      stage, count, observedCount, inferredCount: count - observedCount,
      ofTotalPct: base ? count / base * 100 : null,
      fromPreviousPct: previous ? count / previous * 100 : null,
    };
    previous = count;
    return row;
  });
}

// Marketing starts with every received lead. Sales starts independently with
// leads that reached Cita Asistida, either from a scheduled appointment or a
// manually recorded attended appointment/status. Later stages remain subsets.
function cumulativeFunnel(cohort) {
  const evidence = cohort.map(lead => {
    const stages = reachedStages(lead);
    return { stages, rank: rankOf(stages) };
  });
  const marketingBase = evidence.length;
  const salesStart = STAGES.indexOf('Cita Asistida');
  const salesEvidence = evidence.filter(item => item.rank >= salesStart);
  const marketing = rowsFor(evidence, GROUPS.marketing, marketingBase);
  const sales = rowsFor(salesEvidence, GROUPS.sales, salesEvidence.length);
  const inferred = new Set();
  for (const [group, rows] of Object.entries({marketing, sales})) {
    const source = group === 'sales' ? salesEvidence : evidence;
    for (const row of rows) {
      const rank = STAGES.indexOf(row.stage);
      source.forEach((item, index) => {
        if (item.rank >= rank && !item.stages.has(row.stage)) inferred.add(group + ':' + index);
      });
    }
  }
  return {
    funnels: {marketing, sales},
    total: marketingBase,
    bases: {marketing: marketingBase, sales: salesEvidence.length},
    inferredLeads: inferred.size,
  };
}

module.exports = { cumulativeFunnel, STAGES, GROUPS, reachedStages };
