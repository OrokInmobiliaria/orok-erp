#!/usr/bin/env node
// R36 · Actualización del ERP ÖRÖK en el host, conservando la base (leads, comentarios, etapas y orden del Kanban).
//   node deploy/produccion.cjs antes [--migrar] [--desplegar]
//     1. Revisa el entorno (producción real, no ensayo) y la conexión a PostgreSQL.
//     2. Revisa las migraciones (solo aditivas).
//     3. Hace el respaldo verificado (create-preupdate-snapshot) y deja la ruta en <privado>/deploy/ultimo-respaldo.json.
//     4. --migrar: aplica las migraciones aditivas. 5. --desplegar: llama al «deploy hook» del host (Easypanel), si está configurado.
//   node deploy/produccion.cjs despues [--respaldo <carpeta>]
//     Espera a que /api/health responda con la versión nueva y compara la base con el respaldo. Si algo no coincide: NO usar, restaurar.
// Sin argumentos de acción solo muestra el plan. Nunca borra datos ni toca la base fuera de las migraciones aditivas.
'use strict';
const fs = require('node:fs'), path = require('node:path'), { spawnSync } = require('node:child_process');
const ROOT = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

function revisarEntorno(env, cfg) {
  const B = [], W = [];
  if (env.OROK_REHEARSAL === '1') B.push('OROK_REHEARSAL=1: este servidor es el ENSAYO. En producción debe ser 0 (el Dockerfile trae 1 por defecto: definir OROK_REHEARSAL=0 en las variables del servicio).');
  if (env.OROK_TESTING === '1' || cfg?.testing) B.push('Modo de pruebas activo.');
  if (!cfg?.privateDir) B.push('Falta OROK_PRIVATE_DIR (directorio privado persistente).');
  if (cfg?.origin && /pruebas|ensayo|staging|localhost|127\.0\.0\.1/i.test(cfg.origin)) W.push('El origen parece de ensayo o local: ' + cfg.origin);
  if (!env.LOLA_POSTGRES_URL_FILE) W.push('LOLA_POSTGRES_URL_FILE no está definido: confirmar cómo se conecta a PostgreSQL.');
  if (!env.OROK_DEPLOY_HOOK_FILE) W.push('Sin OROK_DEPLOY_HOOK_FILE: el despliegue del código se hace con el botón «Deploy» del host.');
  return { bloqueos: B, advertencias: W };
}
function plan() {
  return [
    'Antes (en mantenimiento, con la versión ACTUAL corriendo):',
    '  node deploy/produccion.cjs antes            → revisa el entorno, las migraciones y crea el respaldo verificado',
    '  node deploy/produccion.cjs antes --migrar --desplegar   → además aplica migraciones aditivas y publica el código',
    'Después (con la versión NUEVA corriendo):',
    '  node deploy/produccion.cjs despues          → espera /api/health ' + pkg.version + ' y compara la base con el respaldo',
    'Si «despues» no da OK: no usar; volver a la imagen anterior y restaurar por id desde el respaldo (MIGRACION-R28-SIN-PERDIDA.md).',
  ].join('\n');
}
async function salud(origin, version, intentos = 30, espera = 10000, fetcher = fetch) {
  for (let i = 0; i < intentos; i++) {
    try { const r = await fetcher(origin.replace(/\/$/, '') + '/api/health', { signal: AbortSignal.timeout(8000) }); const j = await r.json(); if (r.ok && j.ok && j.version === version) return j; } catch {}
    await new Promise(r => setTimeout(r, espera));
  }
  throw Error('El host no respondió con la versión ' + version + ' en /api/health.');
}
function node(script, args = []) { const r = spawnSync(process.execPath, [path.join(__dirname, script), ...args], { encoding: 'utf8', cwd: ROOT, env: process.env }); if (r.status !== 0) throw Error(script + ' falló: ' + (r.stderr || r.stdout).trim().slice(0, 800)); return r.stdout; }

async function main() {
  const [accion, ...rest] = process.argv.slice(2);
  if (!['antes', 'despues'].includes(accion)) { console.log(plan()); return; }
  const { config: readConfig } = require('../config.cjs'), cfg = readConfig();
  const out = path.join(cfg.privateDir, 'deploy'); fs.mkdirSync(out, { recursive: true, mode: 0o700 });
  const log = (t) => { console.log(t); fs.appendFileSync(path.join(out, 'produccion.log'), new Date().toISOString() + ' ' + t + '\n', { mode: 0o600 }); };
  if (accion === 'antes') {
    const e = revisarEntorno(process.env, cfg); e.advertencias.forEach(w => log('ADVERTENCIA ' + w));
    if (e.bloqueos.length) { e.bloqueos.forEach(b => log('BLOQUEO ' + b)); process.exitCode = 2; return; }
    log('Versión a publicar: ' + pkg.version);
    log(node('check-postgres.cjs').trim());
    log(node('aplicar-migraciones.cjs').trim());
    const res = JSON.parse(node('create-preupdate-snapshot.cjs'));
    if (!res.ok) throw Error('El respaldo no se pudo verificar.');
    fs.writeFileSync(path.join(out, 'ultimo-respaldo.json'), JSON.stringify({ carpeta: res.folder, version_anterior: res.manifest.version, version_nueva: pkg.version, creado: res.manifest.created_at, total_leads: res.manifest.total_leads, status_counts: res.manifest.status_counts }, null, 2), { mode: 0o600 });
    log('Respaldo verificado: ' + res.folder + ' · ' + res.manifest.total_leads + ' leads');
    if (rest.includes('--migrar')) log(node('aplicar-migraciones.cjs', ['--aplicar']).trim());
    if (rest.includes('--desplegar')) {
      const f = process.env.OROK_DEPLOY_HOOK_FILE; if (!f) throw Error('Falta OROK_DEPLOY_HOOK_FILE con la URL del deploy hook del host.');
      const url = fs.readFileSync(f, 'utf8').trim(); if (!/^https:\/\//.test(url)) throw Error('El deploy hook debe ser https.');
      const r = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(30000) }); log('Deploy hook: HTTP ' + r.status);
      if (!r.ok) throw Error('El host rechazó el despliegue.');
    }
    log('Siguiente paso: cuando el host termine de publicar, ejecutar «node deploy/produccion.cjs despues».');
    return;
  }
  const i = rest.indexOf('--respaldo'); let dir = i >= 0 ? rest[i + 1] : null;
  if (!dir) { const u = path.join(out, 'ultimo-respaldo.json'); if (!fs.existsSync(u)) throw Error('No hay ultimo-respaldo.json: ejecutar primero «antes».'); dir = JSON.parse(fs.readFileSync(u, 'utf8')).carpeta; }
  const h = await salud(cfg.origin, pkg.version); log('Host en línea con la versión ' + h.version);
  const salida = spawnSync(process.execPath, [path.join(__dirname, 'verificar-actualizacion.cjs'), '--respaldo', dir], { encoding: 'utf8', cwd: ROOT, env: process.env });
  log(salida.stdout.trim()); if (salida.status !== 0) { log('VERIFICACIÓN FALLIDA: no usar esta versión; volver a la imagen anterior y restaurar por id.'); process.exitCode = 2; return; }
  log('Actualización verificada: se conservaron leads, comentarios, etapas y orden del Kanban.');
}
if (require.main === module) main().catch(e => { console.error(e.message); process.exitCode = 1; });
module.exports = { revisarEntorno, plan, salud };
