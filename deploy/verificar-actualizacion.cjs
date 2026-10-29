#!/usr/bin/env node
// R36 · Verifica que una actualización del ERP conservó los datos del CRM: leads (activos y archivados),
// etapa y subetapa de cada lead, comentarios, orden del Kanban, unidades, cotizaciones, separaciones y gastos.
// Compara el respaldo previo (deploy/create-preupdate-snapshot.cjs) con la base actual. Solo lee.
// Uso: node deploy/verificar-actualizacion.cjs --respaldo <carpeta del respaldo | ultimo>
'use strict';
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib'), { createHash } = require('node:crypto');
const h = v => createHash('sha256').update(JSON.stringify(v ?? null)).digest('hex').slice(0, 16);
const comentarios = l => Array.isArray(l?.comments) ? l.comments : [];

function compararDatos(antes, ahora) {
  const B = [], I = [], idx = rows => new Map((rows || []).map((r, i) => [String(r.id), { r, i }]));
  const leadsA = idx(antes.leads), leadsN = idx(ahora.leads), archA = idx(antes.archived_leads), archN = idx(ahora.archived_leads);
  let perdidos = 0, etapas = 0, coment = 0;
  for (const [id, { r }] of leadsA) {
    const n = leadsN.get(id)?.r || archN.get(id)?.r;
    if (!n) { perdidos++; if (perdidos <= 20) B.push(`Lead perdido: ${id} · ${r.name || ''}`); continue; }
    if (leadsN.has(id) && (String(n.status || '') !== String(r.status || '') || String(n.substatus || '') !== String(r.substatus || ''))) { etapas++; if (etapas <= 20) B.push(`Cambió la etapa de ${id} · ${r.name || ''}: «${r.status}/${r.substatus || '—'}» → «${n.status}/${n.substatus || '—'}»`); }
    const ca = comentarios(r), cn = new Set(comentarios(n).map(h));
    const faltan = ca.filter(c => !cn.has(h(c)));
    if (faltan.length) { coment += faltan.length; if (coment <= 20) B.push(`Faltan ${faltan.length} comentario(s) del lead ${id} · ${r.name || ''}`); }
  }
  for (const [id] of archA) if (!archN.has(id) && !leadsN.has(id)) B.push('Lead archivado perdido: ' + id);
  // Orden del Kanban: el orden relativo de los leads que ya existían, dentro de cada etapa, debe ser el mismo.
  const orden = (rows, ids) => { const m = {}; (rows || []).forEach(l => { if (ids.has(String(l.id))) (m[String(l.status || '')] = m[String(l.status || '')] || []).push(String(l.id)); }); return m; };
  const comunes = new Set([...leadsA.keys()].filter(id => leadsN.has(id) && String(leadsN.get(id).r.status || '') === String(leadsA.get(id).r.status || '')));
  const oa = orden(antes.leads, comunes), on = orden(ahora.leads, comunes);
  for (const etapa of Object.keys(oa)) if (JSON.stringify(oa[etapa]) !== JSON.stringify(on[etapa] || [])) B.push(`Cambió el orden del Kanban en la etapa «${etapa}».`);
  for (const k of ['units', 'quotes', 'separations', 'marketing_expenses']) {
    const a = idx(antes[k]), n = idx(ahora[k]); const falt = [...a.keys()].filter(id => !n.has(id));
    if (falt.length) B.push(`Faltan ${falt.length} registro(s) de ${k}: ${falt.slice(0, 5).join(', ')}`);
  }
  const nuevos = [...leadsN.keys()].filter(id => !leadsA.has(id) && !archA.has(id)).length;
  if (nuevos) I.push(`${nuevos} lead(s) nuevo(s) desde el respaldo (permitido: entraron después).`);
  if (perdidos > 20) B.push(`… y ${perdidos - 20} leads perdidos más.`);
  const resumen = { leads_antes: (antes.leads || []).length, leads_ahora: (ahora.leads || []).length, archivados_antes: (antes.archived_leads || []).length, archivados_ahora: (ahora.archived_leads || []).length,
    comentarios_antes: (antes.leads || []).reduce((a, l) => a + comentarios(l).length, 0), comentarios_ahora: (ahora.leads || []).reduce((a, l) => a + comentarios(l).length, 0) };
  return { ok: B.length === 0, bloqueos: B, info: I, resumen };
}
function respaldo(dir) {
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  const check = JSON.parse(fs.readFileSync(path.join(dir, 'restore-check.json'), 'utf8'));
  if (check.verified !== true) throw Error('El respaldo no está verificado (restore-check.json). No continuar.');
  const gz = fs.readFileSync(path.join(dir, 'crm-data.json.gz'));
  if (createHash('sha256').update(gz).digest('hex') !== manifest.files['crm-data.json.gz'].sha256) throw Error('El archivo del respaldo no coincide con su huella. No continuar.');
  return { manifest, data: JSON.parse(zlib.gunzipSync(gz).toString('utf8')).data };
}
function ultimo(privateDir) {
  const base = path.join(privateDir, 'pre-update-backups'); const ds = fs.existsSync(base) ? fs.readdirSync(base).filter(d => fs.existsSync(path.join(base, d, 'manifest.json'))).sort() : [];
  if (!ds.length) throw Error('No hay respaldos en ' + base); return path.join(base, ds.at(-1));
}
async function main() {
  const i = process.argv.indexOf('--respaldo'); let dir = i > 0 ? process.argv[i + 1] : 'ultimo';
  const { config: readConfig } = require('../config.cjs'), cfg = readConfig();
  if (dir === 'ultimo') dir = ultimo(cfg.privateDir);
  const { data: antes } = respaldo(dir);
  const { createPool, assertReady } = require('../postgres-project.cjs'), { PostgresDocuments } = require('../postgres-documents.cjs'), { FirestoreProject } = require('../firestore-project.cjs');
  const pool = createPool(cfg); let ahora;
  try { const db = new PostgresDocuments(pool, { project: cfg.project }); await assertReady(db); ahora = await new FirestoreProject(db, { project: cfg.project }).read(); } finally { await pool.end(); }
  const r = { respaldo: dir, verificado: new Date().toISOString(), ...compararDatos(antes, ahora) };
  const out = path.join(cfg.privateDir, 'deploy'); fs.mkdirSync(out, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(out, 'verificacion-' + r.verificado.replace(/[:.]/g, '-') + '.json'), JSON.stringify(r, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(r, null, 2)); if (!r.ok) process.exitCode = 2;
}
if (require.main === module) main().catch(e => { console.error(e.message); process.exitCode = 1; });
module.exports = { compararDatos, respaldo, ultimo };
