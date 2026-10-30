#!/usr/bin/env node
// R64 · Genera el trabajador de L.O.L.A (atención de clientes en WhatsApp, Instagram y Messenger) para PRODUCCIÓN,
// a partir del ensayo verificado (n8n/LOLA-R42b-FUENTES-ENSAYO-INACTIVO.json):
//  - todos los pasos del ERP van a erp.orok.com.pe con la llave «Header Auth account 2»;
//  - no lee PostgreSQL: el ERP entrega la memoria y el historial de la conversación con cada trabajo;
//  - reglas de R64: el servidor responde el rango de precios autorizado y pide el DNI cuando corresponde (la IA no lo hace);
//  - queda INACTIVO hasta que Gerencia lo publique. Las ramas que venían apagadas en el ensayo siguen apagadas.
'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const SRC = path.join(__dirname, '..', 'n8n', 'LOLA-R42b-FUENTES-ENSAYO-INACTIVO.json'), OUT = path.join(__dirname, '..', 'n8n', 'LOLA-R64-PRODUCCION.json');
const ERP = 'https://erp.orok.com.pe/api/integrations/lola', CRM_CRED = { id: '5PAGEfNsGTSyVlRq', name: 'Header Auth account 2' };
const w = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const PG = 'Recuperar memoria e historial · PostgreSQL', MEM = 'Memoria entregada por el ERP';
const must = (cond, msg) => { if (!cond) throw Error(msg); };
for (const n of w.nodes) {
  if (n.type === 'n8n-nodes-base.httpRequest' && /lola-pruebas/.test(String(n.parameters.url || ''))) { n.parameters.url = ERP; n.credentials = { httpHeaderAuth: CRM_CRED }; }
  if (n.credentials?.httpHeaderAuth && /ENSAYO/.test(n.credentials.httpHeaderAuth.name)) n.credentials.httpHeaderAuth = CRM_CRED;
  if (n.name === PG) {
    n.name = MEM; n.type = 'n8n-nodes-base.code'; n.typeVersion = 2; delete n.credentials;
    n.parameters = { jsCode: "// R64 · El ERP entrega la memoria, el historial y el estado de la conversación junto al trabajo autorizado.\nconst j = $('Conservar trabajo').first().json;\nif (!j.memory || !Array.isArray(j.history)) throw Error('El ERP no entregó la memoria de la conversación');\nreturn [{ json: { value: { ok: true, job_id: j.id, memory: { ...j.memory, storage: 'erp' }, history: j.history, conversation_state: j.conversation_state || {} } } }];\n" };
  }
  if (n.name === 'Aplicar memoria a la conversación') {
    const a = "r.memory?.storage!=='postgresql'"; must(n.parameters.jsCode.includes(a), 'Cambió «Aplicar memoria a la conversación».');
    n.parameters.jsCode = n.parameters.jsCode.replace(a, '!r.memory').replace('No se recuperó la memoria PostgreSQL del trabajo autorizado', 'No se recuperó la memoria del trabajo autorizado');
  }
  const sm = n.parameters?.options?.systemMessage;
  if (typeof sm === 'string' && sm.includes('Eres Lola')) {
    must(sm.includes('No pidas DNI.'), 'Cambió el mensaje de sistema de Lola (DNI).');
    let t = sm.replace('No pidas DNI.', 'No pidas DNI por tu cuenta: el servidor lo solicita solo cuando el cliente insiste con el precio o un lead de formulario pide asesor.');
    t = t.replace('LÍMITES COMERCIALES\n', 'LÍMITES COMERCIALES\nEl servidor responde la primera consulta de precio con el rango y las promociones que autorizó Gerencia; tú nunca escribas cifras, rangos ni montos.\n');
    must(t.includes('El servidor responde la primera consulta de precio'), 'No se pudo ajustar los límites comerciales.');
    n.parameters.options.systemMessage = t;
  }
}
must(w.nodes.some(n => n.name === MEM), 'No se encontró el paso de PostgreSQL.');
const ren = x => x === PG ? MEM : x;
w.connections = Object.fromEntries(Object.entries(w.connections).map(([k, v]) => [ren(k), Object.fromEntries(Object.entries(v).map(([t, outs]) => [t, (outs || []).map(o => (o || []).map(d => ({ ...d, node: ren(d.node) })))]))]));
w.name = 'ERP PRODUCCIÓN · L.O.L.A · atención de clientes (WhatsApp, Instagram, Messenger)'; w.active = false; w.versionId = crypto.randomUUID(); delete w.id;
must(!w.nodes.some(n => /postgres/i.test(n.type) || /lola-pruebas/.test(String(n.parameters.url || '')) || Object.values(n.credentials || {}).some(c => /ENSAYO/.test(c.name))), 'Quedó un paso de ensayo o de base de datos.');
fs.writeFileSync(OUT, JSON.stringify(w, null, 2));
console.log(JSON.stringify({ nodos: w.nodes.length, erp: w.nodes.filter(n => n.parameters.url === ERP).length, activos: w.nodes.filter(n => /scheduleTrigger|webhook/.test(n.type) && !n.disabled).map(n => n.name), credenciales: [...new Set(w.nodes.flatMap(n => Object.values(n.credentials || {}).map(c => c.name + '#' + c.id)))] }, null, 1));
