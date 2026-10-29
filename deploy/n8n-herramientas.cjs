#!/usr/bin/env node
// R36 · Herramientas n8n del ERP ÖRÖK: auditar flujos y prepararlos para la conexión final (producción).
// Uso:
//   node deploy/n8n-herramientas.cjs auditar n8n/*.json
//   node deploy/n8n-herramientas.cjs preparar --mapa n8n/produccion-mapa.json --salida n8n/produccion n8n/A.json n8n/B.json
// Nunca activa flujos, nunca escribe secretos y nunca modifica los archivos de origen.
'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');

const SECRET = /(sk-ant-[A-Za-z0-9_-]{8,}|sk-[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{20,}|xox[bp]-[A-Za-z0-9-]{10,}|ghp_[A-Za-z0-9]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|"password"\s*:\s*"[^"]{4,}"|Bearer\s+[A-Za-z0-9._-]{20,})/;
const hostOf = u => { try { return new URL(String(u).replace(/^=+/, '').replace(/\{\{.*?\}\}/g, 'x')).host; } catch { return null; } };

function auditar(flow, file = '') {
  const B = [], W = [], I = [];
  const nodes = Array.isArray(flow.nodes) ? flow.nodes : [];
  if (!nodes.length) B.push('El archivo no tiene nodos (¿es un flujo n8n?).');
  if (flow.active !== false) B.push('El flujo viene ACTIVO: debe importarse inactivo.');
  if (flow.id) W.push('Trae id (' + flow.id + '): al importarlo reemplazaría un flujo existente. Quitarlo para importar como copia nueva.');
  if (flow.pinData && Object.keys(flow.pinData).length) B.push('Trae datos fijados (pinData): pueden contener datos de clientes.');
  if (flow.settings?.timezone !== 'America/Lima') B.push('Zona horaria distinta de America/Lima: ' + (flow.settings?.timezone || 'sin definir'));
  const names = nodes.map(n => n.name), dup = names.filter((n, i) => names.indexOf(n) !== i);
  if (dup.length) B.push('Nombres de nodo repetidos: ' + [...new Set(dup)].join(', '));
  const byName = new Set(names);
  for (const [from, c] of Object.entries(flow.connections || {})) {
    if (!byName.has(from)) B.push('Conexión desde un nodo que no existe: ' + from);
    for (const out of c.main || []) for (const t of out || []) if (!byName.has(t.node)) B.push('Conexión hacia un nodo que no existe: ' + from + ' → ' + t.node);
  }
  const connected = new Set(Object.keys(flow.connections || {})); for (const c of Object.values(flow.connections || {})) for (const out of c.main || []) for (const t of out || []) connected.add(t.node);
  const creds = {}, hosts = {}, webhooks = [], triggers = [];
  for (const n of nodes) {
    if (n.type === 'n8n-nodes-base.stickyNote') continue;
    if (!connected.has(n.name)) W.push('Nodo suelto, sin conexiones: ' + n.name);
    if (n.disabled) I.push('Nodo desactivado: ' + n.name);
    if (n.type === 'n8n-nodes-base.code') { try { new vm.Script('(async function(){' + (n.parameters?.jsCode || '') + '})'); } catch (e) { B.push('Código con error de sintaxis en «' + n.name + '»: ' + e.message); } }
    if (n.type === 'n8n-nodes-base.httpRequest') {
      const t = n.parameters?.options?.timeout; if (!(t >= 10000 && t <= 120000)) W.push('Tiempo de espera fuera de rango en «' + n.name + '» (' + (t ?? 'sin definir') + ' ms).');
      const h = hostOf(n.parameters?.url); if (h) (hosts[h] = hosts[h] || []).push(n.name);
      if (/x-api-key|authorization/i.test(JSON.stringify(n.parameters?.headerParameters || {}))) B.push('«' + n.name + '» envía una clave en los encabezados del JSON: debe ir en una credencial.');
    }
    for (const [type, c] of Object.entries(n.credentials || {})) {
      const k = type + ' · ' + (c?.name || '?'); creds[k] = creds[k] || { tipo: type, nombre: c?.name, id: c?.id, nodos: [] }; creds[k].nodos.push(n.name);
      if (/^CONFIGURAR/.test(String(c?.id || ''))) W.push('Credencial por crear o vincular en n8n: «' + c?.name + '»');
    }
    if (n.type === 'n8n-nodes-base.webhook') { webhooks.push({ nodo: n.name, ruta: n.parameters?.path, autenticacion: n.parameters?.authentication || 'none' }); if (!n.parameters?.authentication || n.parameters.authentication === 'none') B.push('Webhook sin autenticación: ' + n.name); }
    if (/Trigger$/.test(n.type) || n.type === 'n8n-nodes-base.webhook') triggers.push(n.name + ' (' + n.type.replace('n8n-nodes-base.', '') + ')');
    const raw = JSON.stringify(n.parameters || {}); if (SECRET.test(raw)) B.push('Posible secreto escrito dentro de «' + n.name + '».');
    if (/CONFIGURAR_ID_|\.invalid\b/.test(raw)) W.push('Valor por configurar en «' + n.name + '».');
  }
  const ensayo = Object.keys(hosts).filter(h => /pruebas|ensayo|staging|test/i.test(h));
  if (ensayo.length) W.push('Apunta a hosts de ENSAYO: ' + ensayo.join(', ') + '. Para producción usa «preparar» con el mapa.');
  return { archivo: path.basename(file), nombre: flow.name, nodos: nodes.length, activo: flow.active, bloqueos: B, advertencias: [...new Set(W)], info: I, credenciales: Object.values(creds), hosts, webhooks, disparadores: triggers, listo: B.length === 0 };
}

function validarMapa(m) {
  if (!m || typeof m !== 'object') throw Error('Mapa no válido.');
  for (const [a, b] of Object.entries(m.hosts || {})) if (!/^[a-z0-9.-]+(:\d+)?$/i.test(a) || !/^[a-z0-9.-]+(:\d+)?$/i.test(b)) throw Error('Host no válido en el mapa: ' + a + ' → ' + b);
  for (const [k, v] of Object.entries(m.credenciales || {})) { if (!v || !v.nombre) throw Error('Credencial sin nombre de destino: ' + k); if (/^(sk-|AIza|Bearer )/.test(String(v.id || '') + String(v.nombre))) throw Error('El mapa no debe contener claves, solo nombres e ID de credenciales.'); }
  if (SECRET.test(JSON.stringify(m))) throw Error('El mapa parece contener un secreto. Solo van hosts, nombres e ID de credenciales.');
  return m;
}
function preparar(flow, mapa, etiqueta = 'PRODUCCIÓN') {
  validarMapa(mapa);
  const f = JSON.parse(JSON.stringify(flow)), cambios = [];
  delete f.id; f.active = false; f.pinData = {}; f.settings = { ...(f.settings || {}), timezone: 'America/Lima' };
  f.name = String(f.name || 'Flujo').replace(/\b(ENSAYO|PRUEBAS?)\b/gi, etiqueta).replace(/\s*·?\s*INACTIVO\s*$/i, '') + ' · INACTIVO';
  const hostPairs = Object.entries(mapa.hosts || {});
  const swap = s => { let out = s; for (const [a, b] of hostPairs) out = out.split('//' + a).join('//' + b); return out; };
  for (const n of f.nodes || []) {
    const before = JSON.stringify(n.parameters || {}), after = swap(before);
    if (before !== after) { n.parameters = JSON.parse(after); cambios.push('Host cambiado en «' + n.name + '»'); }
    for (const [type, c] of Object.entries(n.credentials || {})) {
      const m = mapa.credenciales?.[c?.name] || mapa.credenciales?.[c?.id];
      if (m) { n.credentials[type] = { id: m.id || c.id, name: m.nombre }; cambios.push('Credencial «' + c?.name + '» → «' + m.nombre + '» en «' + n.name + '»'); }
    }
    if (n.type === 'n8n-nodes-base.webhook' && n.webhookId && mapa.nuevos_webhook_ids) { n.webhookId = require('node:crypto').randomUUID(); cambios.push('Nuevo webhookId en «' + n.name + '»'); }
    if (n.type === 'n8n-nodes-base.stickyNote' && /ENSAYO/.test(n.parameters?.content || '')) { n.parameters.content = n.parameters.content.replace(/\bENSAYO\b/g, etiqueta); }
  }
  return { flujo: f, cambios, auditoria: auditar(f, f.name) };
}

// Compara dos versiones de un flujo: sirve para confirmar que una modificación conserva nodos y conexiones.
function comparar(antes, despues) {
  const A = new Map((antes.nodes || []).map(n => [n.name, n])), Bm = new Map((despues.nodes || []).map(n => [n.name, n]));
  const quitados = [...A.keys()].filter(k => !Bm.has(k)), agregados = [...Bm.keys()].filter(k => !A.has(k));
  const cambiados = [...A.keys()].filter(k => Bm.has(k) && JSON.stringify(A.get(k).parameters) !== JSON.stringify(Bm.get(k).parameters)).sort();
  const edges = f => new Set(Object.entries(f.connections || {}).flatMap(([from, c]) => (c.main || []).flatMap((out, i) => (out || []).map(t => from + ' [' + i + '] → ' + t.node))));
  const ea = edges(antes), eb = edges(despues);
  return { quitados, agregados, cambiados, conexiones_quitadas: [...ea].filter(e => !eb.has(e)), conexiones_agregadas: [...eb].filter(e => !ea.has(e)), conserva_todo: quitados.length === 0 && [...ea].every(e => eb.has(e)) };
}

function reporte(rs) {
  const L = ['# Auditoría n8n · ERP ÖRÖK', '', 'Fecha (Lima): ' + new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' }), ''];
  for (const r of rs) {
    L.push('## ' + r.archivo + ' — ' + (r.listo ? 'LISTO para importar (inactivo)' : 'BLOQUEADO'), '', `- Flujo: ${r.nombre} · ${r.nodos} nodos · activo: ${r.activo}`);
    if (r.bloqueos.length) L.push('- **Bloqueos:**', ...r.bloqueos.map(x => '  - ' + x));
    if (r.advertencias.length) L.push('- Advertencias:', ...r.advertencias.map(x => '  - ' + x));
    L.push('- Disparadores: ' + (r.disparadores.join('; ') || '—'), '- Hosts: ' + (Object.keys(r.hosts).join(', ') || '—'), '- Credenciales a vincular en n8n:', ...r.credenciales.map(c => `  - ${c.tipo} · «${c.nombre}» (${c.nodos.length} nodos)`), '');
  }
  return L.join('\n');
}

if (require.main === module) {
  const [cmd, ...rest] = process.argv.slice(2);
  const opt = (k) => { const i = rest.indexOf(k); if (i < 0) return null; const v = rest[i + 1]; rest.splice(i, 2); return v; };
  try {
    if (cmd === 'auditar') {
      const rs = rest.map(f => auditar(JSON.parse(fs.readFileSync(f, 'utf8')), f));
      process.stdout.write(reporte(rs) + '\n'); if (rs.some(r => !r.listo)) process.exitCode = 2;
    } else if (cmd === 'preparar') {
      const mapaFile = opt('--mapa'), salida = opt('--salida') || 'n8n/produccion', etiqueta = opt('--etiqueta') || 'PRODUCCIÓN';
      if (!mapaFile) throw Error('Falta --mapa (ver n8n/produccion-mapa.ejemplo.json).');
      const mapa = JSON.parse(fs.readFileSync(mapaFile, 'utf8')); fs.mkdirSync(salida, { recursive: true });
      const rs = [];
      for (const f of rest) {
        const out = preparar(JSON.parse(fs.readFileSync(f, 'utf8')), mapa, etiqueta);
        const dest = path.join(salida, path.basename(f).replace(/ENSAYO/gi, etiqueta.normalize('NFKD').replace(/[̀-ͯ]/g, '')));
        fs.writeFileSync(dest, JSON.stringify(out.flujo, null, 1)); out.auditoria.archivo = path.basename(dest); rs.push(out.auditoria);
        process.stdout.write(`${path.basename(f)} → ${dest} · ${out.cambios.length} cambios\n`);
      }
      fs.writeFileSync(path.join(salida, 'AUDITORIA-N8N.md'), reporte(rs)); process.stdout.write(reporte(rs) + '\n'); if (rs.some(r => !r.listo)) process.exitCode = 2;
    } else if (cmd === 'comparar') {
      const [a, b] = rest; const r = comparar(JSON.parse(fs.readFileSync(a, 'utf8')), JSON.parse(fs.readFileSync(b, 'utf8')));
      process.stdout.write(JSON.stringify(r, null, 2) + '\n'); if (!r.conserva_todo) process.exitCode = 2;
    } else { console.error('Uso: auditar <flujos…> | comparar <antes.json> <despues.json> | preparar --mapa <mapa.json> [--salida dir] <flujos…>'); process.exitCode = 1; }
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
module.exports = { auditar, preparar, validarMapa, reporte, comparar };
