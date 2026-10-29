#!/usr/bin/env node
// R36 · Migraciones aditivas del ERP ÖRÖK (migrations/00N-*.sql).
// Por defecto solo revisa y lista. Con --aplicar las ejecuta en orden. Cada archivo trae su propio BEGIN/COMMIT y es repetible.
// Rechaza cualquier archivo que borre o vacíe datos (DROP, DELETE, TRUNCATE, ALTER … DROP).
'use strict';
const fs = require('node:fs'), path = require('node:path');
const DIR = path.join(__dirname, '..', 'migrations');
const PELIGRO = [
  [/\bDROP\s+(TABLE|SCHEMA|INDEX|FUNCTION|VIEW|COLUMN|TYPE|TRIGGER|DATABASE)\b/i, 'DROP'],
  [/\bDELETE\s+FROM\b/i, 'DELETE FROM'],
  [/\bTRUNCATE\s+(TABLE\s+)?[A-Za-z_"]/i, 'TRUNCATE'],
  [/\bALTER\s+TABLE\s+[^;]*\bDROP\b/i, 'ALTER TABLE … DROP'],
  [/\bALTER\s+TABLE\s+[^;]*\bRENAME\b/i, 'ALTER TABLE … RENAME'],
];
function sinComentarios(sql) { return sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, ''); }
function revisarSql(sql) {
  const limpio = sinComentarios(sql), problemas = [];
  for (const [re, nombre] of PELIGRO) if (re.test(limpio)) problemas.push('Contiene ' + nombre + ': las migraciones del ERP solo agregan.');
  if (!/\bBEGIN\b/i.test(limpio) || !/\bCOMMIT\b/i.test(limpio)) problemas.push('Debe ir dentro de BEGIN … COMMIT.');
  if (/\bCREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS)/i.test(limpio)) problemas.push('CREATE TABLE sin IF NOT EXISTS: no sería repetible.');
  if (/\bCREATE\s+(UNIQUE\s+)?INDEX\s+(?!IF\s+NOT\s+EXISTS|CONCURRENTLY\s+IF\s+NOT\s+EXISTS)/i.test(limpio)) problemas.push('CREATE INDEX sin IF NOT EXISTS: no sería repetible.');
  return problemas;
}
function listar(dir = DIR) {
  return fs.readdirSync(dir).filter(f => /^\d{3}-[a-z0-9-]+\.sql$/.test(f)).sort().map(f => { const sql = fs.readFileSync(path.join(dir, f), 'utf8'); return { archivo: f, problemas: revisarSql(sql), sql }; });
}
async function main() {
  const aplicar = process.argv.includes('--aplicar'), solo = process.argv.find(a => /^--solo=/.test(a))?.slice(7).split(',');
  const ms = listar().filter(m => !solo || solo.includes(m.archivo.slice(0, 3)));
  for (const m of ms) console.log((m.problemas.length ? 'RECHAZADA ' : 'ok        ') + m.archivo + (m.problemas.length ? ' · ' + m.problemas.join(' ') : ''));
  if (ms.some(m => m.problemas.length)) { process.exitCode = 2; return; }
  if (!aplicar) { console.log('\nRevisión sin cambios. Para ejecutar: node deploy/aplicar-migraciones.cjs --aplicar (después del respaldo verificado).'); return; }
  const { config } = require('../config.cjs'), { createPool } = require('../postgres-project.cjs');
  const pool = createPool(config());
  try { for (const m of ms) { await pool.query(m.sql); console.log('aplicada  ' + m.archivo); } } finally { await pool.end(); }
}
if (require.main === module) main().catch(e => { console.error(e.message); process.exitCode = 1; });
module.exports = { revisarSql, listar };
