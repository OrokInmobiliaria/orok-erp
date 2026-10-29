// Synthetic leads in the existing v46 schema; no customer data.
const expected = [100, 70, 50, 32, 18, 12, 6, 3, 2, 1];
const states = ['Lead Inicial', 'Contactado', 'Información enviada', 'MQL', 'Cita',
  'Cita Asistida', 'Calificado', 'Separación', 'Inicial', 'Venta'];
function fixture() {
  let id = 0;
  const leads = states.flatMap((status, index) =>
    Array.from({length: expected[index] - (expected[index + 1] || 0)}, () => ({
      id: 'fixture-' + (++id), name: 'Prueba ' + id, status,
      received_at: '2026-09-01T12:00:00Z', project: 'Infinity 224', source: 'Facebook',
      campaign_name: 'Campaña A', sales_owner: 'Asesor A', history_complete: false,
    })));
  return {settings: {projectName: 'Infinity 224'}, leads, archived_leads: [], units: [], marketing_expenses: []};
}
module.exports = {fixture, expected, filters: {from: '2026-09-01', to: '2026-09-12'}};
