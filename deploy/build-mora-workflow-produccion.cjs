#!/usr/bin/env node
// R63 · Genera el trabajador de M.O.R.A para PRODUCCIÓN a partir del de ensayo (n8n/MORA-R42b-FUENTES-ENSAYO-INACTIVO.json):
//  - los 6 pasos del ERP van a erp.orok.com.pe con la llave «Header Auth account 2»;
//  - ya no lee PostgreSQL: el ERP entrega el contexto de cada consulta (evaluación, alcance e historial) junto al trabajo,
//    así sirve a todos los proyectos (Infinity 224, Ventura…) sin credenciales de base de datos;
//  - Claude sigue con la llave «M.O.R.A. · Anthropic API». Queda INACTIVO hasta que Gerencia lo publique.
'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const SRC = path.join(__dirname, '..', 'n8n', 'MORA-R42b-FUENTES-ENSAYO-INACTIVO.json'), OUT = path.join(__dirname, '..', 'n8n', 'MORA-R63-PRODUCCION.json');
const ERP = 'https://erp.orok.com.pe/api/integrations/lola', CRM_CRED = { id: '5PAGEfNsGTSyVlRq', name: 'Header Auth account 2' };
const w = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const PG = 'Recuperar evaluación, permisos e historial · PostgreSQL', CTX = 'Contexto entregado por el ERP';
for (const n of w.nodes) {
  if (n.type === 'n8n-nodes-base.httpRequest' && /lola-pruebas/.test(String(n.parameters.url || ''))) { n.parameters.url = ERP; n.credentials = { httpHeaderAuth: CRM_CRED }; }
  if (n.name === 'Conservar consulta M.O.R.A') {
    n.parameters.jsCode = n.parameters.jsCode.replace("    view: String(job.view || 'indicadores').slice(0, 40)\n", "    view: String(job.view || 'indicadores').slice(0, 40),\n    drive_context: job.drive_context || null,\n    context: job.context || null\n");
    if (!n.parameters.jsCode.includes('context: job.context')) throw Error('No se pudo ajustar «Conservar consulta M.O.R.A».');
  }
  if (n.name === 'Aplicar alcance de permisos') { n.parameters.jsCode = n.parameters.jsCode.replace('    ...j,\n', '    ...j,\n    context: undefined,\n'); if (!n.parameters.jsCode.includes('context: undefined')) throw Error('No se pudo ajustar «Aplicar alcance de permisos».'); }
  if (n.name === PG) {
    n.name = CTX; n.type = 'n8n-nodes-base.code'; n.typeVersion = 2; delete n.credentials;
    n.parameters = { jsCode: "// R63 · El ERP entrega el contexto autorizado de la consulta (mismo criterio que mora.context_for_job).\nconst c = $('Conservar consulta M.O.R.A').first().json.context;\nif (!c || c.ok !== true) throw Error('El ERP no entregó el contexto de la consulta');\nreturn [{ json: { value: c } }];\n" };
  }
}
if (!w.nodes.some(n => n.name === CTX)) throw Error('No se encontró el paso de PostgreSQL.');
const ren = x => x === PG ? CTX : x;
w.connections = Object.fromEntries(Object.entries(w.connections).map(([k, v]) => [ren(k), { ...v, main: (v.main || []).map(o => (o || []).map(d => ({ ...d, node: ren(d.node) }))) }]));
w.name = 'ERP PRODUCCIÓN · M.O.R.A · consultas y estudio de mercado'; w.active = false; w.versionId = crypto.randomUUID(); delete w.id;
const txt = JSON.stringify(w, null, 2);
if (w.nodes.some(n => /postgres/i.test(n.type) || /lola-pruebas/.test(String(n.parameters.url || '')) || Object.values(n.credentials || {}).some(c => /ENSAYO/.test(c.name)))) throw Error('Quedó un paso de ensayo o de base de datos.');
fs.writeFileSync(OUT, txt); console.log(JSON.stringify({ nodos: w.nodes.length, erp: w.nodes.filter(n => n.parameters.url === ERP).length, activo: w.active }));
