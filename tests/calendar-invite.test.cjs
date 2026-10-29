const { test } = require('node:test');
const assert = require('node:assert/strict');

test('Google Calendar keeps the scheduled appointment in Lima and adds the INFINITY224 invitation', async () => {
  const { googleCalendarUrlForLead } = await import('../src/calendarInvite.mjs');
  const url = new URL(googleCalendarUrlForLead({
    name: 'Marco Prado',
    appointments: [{ status: 'scheduled', scheduled_at: '2026-09-19T20:00:00.000Z' }]
  }));

  assert.equal(url.origin, 'https://calendar.google.com');
  assert.equal(url.searchParams.get('action'), 'TEMPLATE');
  assert.equal(url.searchParams.get('dates'), '20260919T150000/20260919T154500');
  assert.equal(url.searchParams.get('ctz'), 'America/Lima');
  assert.match(url.searchParams.get('text'), /Marco Prado/);
  const details = url.searchParams.get('details');
  assert.match(details, /Fecha y hora:/);
  assert.match(details, /ventas@orok\.com\.pe/);
  assert.match(details, /https:\/\/maps\.app\.goo\.gl\/Jz6cQv6VaRFBxaYN6/);
  assert.match(details, /https:\/\/meet\.google\.com\/vrs-ntia-pfi/);
  assert.match(details, /13WikSvq7gqWY7LOnwegkQCEHpXL-Uiwl/);
});

test('Google Calendar link is available for an attended appointment and excludes cancelled appointments', async () => {
  const { googleCalendarUrlForLead } = await import('../src/calendarInvite.mjs');
  const attended = googleCalendarUrlForLead({ name: 'Marco Prado', appointments: [{ status: 'attended', scheduled_at: '2026-09-19T20:00:00.000Z' }] });
  assert.ok(attended);
  assert.match(new URL(attended).searchParams.get('text'), /Marco Prado/);
  assert.equal(googleCalendarUrlForLead({ name: 'Sin cita', appointments: [] }), null);
  assert.equal(googleCalendarUrlForLead({ name: 'Cancelada', appointments: [{ status: 'cancelled', scheduled_at: '2026-09-19T20:00:00.000Z' }] }), null);
});

test('a shared Calendar appointment opens its existing event instead of creating a second invitation',async()=>{const {googleCalendarUrlForLead}=await import('../src/calendarInvite.mjs');const u=new URL(googleCalendarUrlForLead({appointments:[{status:'scheduled',scheduled_at:'2026-10-22T15:00:00Z',calendar_event_id:'event1',calendar_id:'ventas@orok.com.pe'}]}));assert.equal(u.searchParams.get('action'),null);assert.equal(atob(u.searchParams.get('eid')),'event1 ventas@orok.com.pe');});
