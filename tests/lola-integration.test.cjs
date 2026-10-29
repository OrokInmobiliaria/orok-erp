'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { applyLolaEvent } = require('../business/lolaIntegration');
const { MemoryFirestore } = require('./memory-firestore.cjs');
const { CloudAuth } = require('../cloud-auth.cjs');
const { FirestoreProject } = require('../firestore-project.cjs');
const { createServer } = require('../server.cjs');

const base = () => ({
  settings: { projectName: 'Infinity 224', defaultSalesOwner: 'Antonio Garces' },
  leads: [],
});

const payload = overrides => ({
  event_id: 'whatsapp:wamid-100',
  action: 'lead_upsert',
  channel: 'whatsapp',
  chat_id: '51934567014',
  received_at: new Date(Date.now() - 1000).toISOString(),
  source: 'Facebook',
  project: 'Infinity 224',
  profile: {
    name: 'Martín Montezuma',
    phone: '51934567014',
    email: 'mmartinmch@gmail.com',
    interest: 'dos dormitorios',
  },
  ...overrides,
});

test('Lola crea un lead en Lead Inicial y bloquea el mismo evento repetido', () => {
  const data = base();
  const first = applyLolaEvent(data, payload({ note: 'Primer contacto' }));
  const again = applyLolaEvent(data, payload({ note: 'Primer contacto' }));
  assert.equal(first.created, true);
  assert.equal(first.status, 'Lead Inicial');
  assert.equal(again.duplicate, true);
  assert.equal(data.leads.length, 1);
  assert.equal(data.leads[0].sales_owner, 'Antonio Garces');
  assert.equal(data.leads[0].comment_history.length, 1);
});

test('Lola deduplica por teléfono internacional y no usa el nombre como identidad', () => {
  const data = base();
  applyLolaEvent(data, payload({}));
  applyLolaEvent(data, payload({
    event_id: 'whatsapp:wamid-101',
    chat_id: 'otro-chat',
    profile: { name: 'Nombre actualizado', phone: '934 567 014', email: 'nuevo@example.com' },
  }));
  applyLolaEvent(data, payload({
    event_id: 'whatsapp:wamid-102',
    chat_id: 'contacto-distinto',
    profile: { name: 'Nombre actualizado', phone: '999999998' },
  }));
  assert.equal(data.leads.length, 2);
  assert.equal(data.leads[0].email, 'nuevo@example.com');
});

test('una actualización conserva la etapa y el orden de todos los leads', () => {
  const data = base();
  data.leads = [
    { id: 'a', lead_number: 'LD-0001', name: 'Primero', phone: '911111111', status: 'Cita', events: [], external_ids: {} },
    { id: 'b', lead_number: 'LD-0002', name: 'Segundo', phone: '922222222', status: 'Calificado', events: [], external_ids: {} },
  ];
  applyLolaEvent(data, payload({
    event_id: 'whatsapp:wamid-103',
    chat_id: '51922222222',
    profile: { name: 'Segundo actualizado', phone: '51922222222' },
  }));
  assert.deepEqual(data.leads.map(lead => lead.id), ['a', 'b']);
  assert.equal(data.leads[1].status, 'Calificado');
  assert.equal(data.leads[1].name, 'Segundo actualizado');
});

test('la falta de respuesta a 24 horas pasa a Seguimiento y nunca a Perdido', () => {
  const data = base();
  applyLolaEvent(data, payload({ action: 'follow_up', substatus: 'Sin respuesta 24 horas' }));
  assert.equal(data.leads[0].status, 'Seguimiento');
  assert.equal(data.leads[0].substatus, 'Sin respuesta 24 horas');
  assert.notEqual(data.leads[0].status, 'Perdido');
});

test('la baja pausa a Lola sin mover la etapa comercial', () => {
  const data = base();
  applyLolaEvent(data, payload({}));
  const before = data.leads[0].status;
  applyLolaEvent(data, payload({ event_id: 'whatsapp:wamid-104', action: 'opt_out' }));
  assert.equal(data.leads[0].status, before);
  assert.equal(data.leads[0].opt_out, true);
  assert.equal(data.leads[0].lola_paused, true);
});

test('pedir vendedor crea la tarea y pausa a Lola', () => {
  const data = base();
  applyLolaEvent(data, payload({ action: 'seller_requested' }));
  assert.equal(data.leads[0].status, 'Contactado');
  assert.equal(data.leads[0].lola_paused, true);
  assert.match(data.leads[0].next_action, /asesor/i);
});

test('interés en cita no inventa una cita ni un evento de Calendar', () => {
  const data = base();
  applyLolaEvent(data, payload({ action: 'appointment_interest' }));
  assert.equal(data.leads[0].appointments.length, 0);
  assert.equal(data.leads[0].status, 'Lead Inicial');
  assert.equal(data.leads[0].handoff_status, 'appointment_interest');
});

async function webhookSetup() {
  const db = new MemoryFirestore();
  const store = new FirestoreProject(db);
  await store.initialize(base());
  const privateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orok-lola-webhook-'));
  const secret = 'orok-lola-test-secret-'.padEnd(40, 'x');
  fs.writeFileSync(path.join(privateDir, 'integracion-ia-webhooks.json'), JSON.stringify({ webhookSecret: secret }));
  const config = { testing: true, origin: 'http://127.0.0.1', project: 'infinity224', privateDir, sessionSecret: 's'.repeat(64), bootstrapCode: 'b'.repeat(32), cookieName: 'orok_dev_session' };
  const auth = new CloudAuth(db, { ...config, sendApproval: async () => {} });
  const cache = store.watch();
  const authCache = auth.watch();
  const server = createServer({ config, store, auth, cache, authCache });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = 'http://127.0.0.1:' + server.address().port;
  return {
    baseUrl, secret, store,
    close: async () => {
      cache.close();
      authCache.close();
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    },
  };
}

test('el receptor CRM exige secreto y mantiene idempotencia', async () => {
  const testServer = await webhookSetup();
  try {
    const denied = await fetch(testServer.baseUrl + '/api/integrations/lola', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload({})),
    });
    assert.equal(denied.status, 401);
    const send = () => fetch(testServer.baseUrl + '/api/integrations/lola', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Orok-Webhook-Secret': testServer.secret },
      body: JSON.stringify(payload({})),
    });
    const first = await send();
    const again = await send();
    assert.equal(first.status, 200);
    assert.equal((await first.json()).value.created, true);
    assert.equal((await again.json()).value.duplicate, true);
    assert.equal((await testServer.store.read()).leads.length, 1);
  } finally {
    await testServer.close();
  }
});

test('connection_check valida el secreto y no abre ni modifica leads', async () => {
  const testServer = await webhookSetup();
  try {
    const denied = await fetch(testServer.baseUrl + '/api/integrations/lola', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'connection_check' }),
    });
    assert.equal(denied.status, 401);

    const accepted = await fetch(testServer.baseUrl + '/api/integrations/lola', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Orok-Webhook-Secret': testServer.secret },
      body: JSON.stringify({ action: 'connection_check' }),
    });
    assert.equal(accepted.status, 200);
    assert.deepEqual((await accepted.json()).value, {
      ok: true,
      connection: true,
      version: require('../package.json').version,
      writes: 0,
    });
    assert.equal((await testServer.store.read()).leads.length, 0);
  } finally {
    await testServer.close();
  }
});
