'use strict';
// R45 · L.O.L.A Operaciones · Resguardo externo cifrado.
// Objetivo: que una caída del VPS (Hostinger + Easypanel, donde también está n8n) no haga perder nada trabajado.
// - Cada hora (configurable) arma un paquete con: base PostgreSQL completa (pg_dump o, si no está, exportación por tablas),
//   CRM legible, usuarios de acceso (Firestore) y el directorio privado (fotos, PDFs, configuraciones), con un manifiesto de conteos.
// - Lo cifra con la LLAVE PÚBLICA del ERP (RSA-OAEP + AES-256-GCM). La llave privada se entrega una sola vez a Gerencia y nunca
//   queda en el servidor: aunque alguien robe el servidor o el Drive, no puede abrir los respaldos.
// - Lo sube a una carpeta de Google Drive de la empresa (idealmente unidad compartida): una copia nueva por día y una copia
//   «última hora» que se actualiza (Drive guarda sus versiones). En Drive nunca se borra nada.
// - Verifica la copia remota descargándola y comparando su huella. Guarda un registro de cada resguardo.
const fs = require('node:fs'), fsp = require('node:fs/promises'), path = require('node:path'), crypto = require('node:crypto'), zlib = require('node:zlib');
const { pipeline } = require('node:stream/promises');
const { spawn } = require('node:child_process');

const MAGIC = Buffer.from('OROKBAK1\n');
const now = () => new Date().toISOString();
const limaDay = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(d);
const text = (v, n = 300) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const DEFAULT_CFG = { enabled: false, cada_horas: 1, drive_folder_id: '', incluir_archivos: true, max_locales: 24, n8n_url: '', erp_url: '' };
const EXCLUIR = ['backups', 'connection-backups', 'resguardo', 'resguardo-tmp', 'node_modules'];

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    let p; try { p = spawn(cmd, args, { stdio: ['ignore', opts.out ? 'pipe' : 'ignore', 'pipe'], env: { ...process.env, ...(opts.env || {}) } }); } catch (e) { return reject(e); }
    let err = ''; p.stderr.on('data', d => { err += d; if (err.length > 4000) err = err.slice(-4000); });
    if (opts.out) p.stdout.pipe(opts.out);
    p.on('error', reject); p.on('close', code => code === 0 ? resolve() : reject(Error(cmd + ' terminó con código ' + code + ': ' + err.trim().slice(-500))));
  });
}
async function sha256File(f) { const h = crypto.createHash('sha256'); await pipeline(fs.createReadStream(f), h); return h.digest('hex'); }
const fingerprint = pem => crypto.createHash('sha256').update(crypto.createPublicKey(pem).export({ type: 'spki', format: 'der' })).digest('hex').slice(0, 16);

// ---------- Cifrado híbrido: AES-256-GCM con llave aleatoria, envuelta con RSA-OAEP-SHA256 ----------
async function cifrar(entrada, salida, publicPem, meta = {}) {
  const key = crypto.randomBytes(32), iv = crypto.randomBytes(12);
  const header = Buffer.from(JSON.stringify({ alg: 'RSA-OAEP-256+A256GCM', huella: fingerprint(publicPem), clave: crypto.publicEncrypt({ key: publicPem, oaepHash: 'sha256', padding: crypto.constants.RSA_PKCS1_OAEP_PADDING }, key).toString('base64'), iv: iv.toString('base64'), ...meta }));
  const len = Buffer.alloc(4); len.writeUInt32BE(header.length);
  const out = fs.createWriteStream(salida, { mode: 0o600 }); out.write(Buffer.concat([MAGIC, len, header]));
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  await pipeline(fs.createReadStream(entrada), c, out);
  await fsp.appendFile(salida, c.getAuthTag());
  return JSON.parse(header);
}
async function descifrar(entrada, salida, privatePem) {
  const fd = await fsp.open(entrada, 'r'), st = await fd.stat(), head = Buffer.alloc(MAGIC.length + 4);
  await fd.read(head, 0, head.length, 0);
  if (!head.subarray(0, MAGIC.length).equals(MAGIC)) { await fd.close(); throw Error('No es un respaldo del ERP ÖRÖK.'); }
  const hl = head.readUInt32BE(MAGIC.length), hb = Buffer.alloc(hl); await fd.read(hb, 0, hl, head.length);
  const tag = Buffer.alloc(16); await fd.read(tag, 0, 16, st.size - 16); await fd.close();
  const h = JSON.parse(hb), key = crypto.privateDecrypt({ key: privatePem, oaepHash: 'sha256', padding: crypto.constants.RSA_PKCS1_OAEP_PADDING }, Buffer.from(h.clave, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(h.iv, 'base64')); d.setAuthTag(tag);
  await pipeline(fs.createReadStream(entrada, { start: head.length + hl, end: st.size - 17 }), d, fs.createWriteStream(salida, { mode: 0o600 }));
  return h;
}

// ---------- Google Drive (cuenta de servicio del ERP; la carpeta debe estar compartida con ella o ser de una unidad compartida) ----------
class DriveResguardo {
  constructor(credentialFile, folderId) { this.cred = credentialFile; this.folder = folderId; }
  async client() { if (!this.c) { const { GoogleAuth } = require('google-auth-library'); this.c = await new GoogleAuth({ keyFile: this.cred, scopes: ['https://www.googleapis.com/auth/drive'] }).getClient(); } return this.c; }
  async token() { return (await (await this.client()).getAccessToken()).token; }
  async subir(file, name, fileId = null) {
    const size = (await fsp.stat(file)).size, t = await this.token();
    const init = await fetch('https://www.googleapis.com/upload/drive/v3/files' + (fileId ? '/' + fileId : '') + '?uploadType=resumable&supportsAllDrives=true&fields=id,name,size,md5Checksum', {
      method: fileId ? 'PATCH' : 'POST', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': 'application/octet-stream', 'X-Upload-Content-Length': String(size) },
      body: JSON.stringify(fileId ? {} : { name, parents: [this.folder], description: 'Respaldo cifrado del ERP ÖRÖK (L.O.L.A Operaciones). Solo se abre con la llave privada de Gerencia.' }) });
    if (!init.ok) throw Error('Drive no aceptó el respaldo (' + init.status + '): ' + (await init.text()).slice(0, 200));
    const r = await fetch(init.headers.get('location'), { method: 'PUT', headers: { 'Content-Length': String(size) }, body: fs.createReadStream(file), duplex: 'half' });
    if (!r.ok) throw Error('La subida a Drive falló (' + r.status + ').');
    return r.json();
  }
  async huella(fileId) {
    const r = await fetch('https://www.googleapis.com/drive/v3/files/' + fileId + '?alt=media&supportsAllDrives=true', { headers: { Authorization: 'Bearer ' + await this.token() } });
    if (!r.ok) throw Error('No se pudo descargar el respaldo de Drive (' + r.status + ').');
    const h = crypto.createHash('sha256'); for await (const chunk of r.body) h.update(chunk); return h.digest('hex');
  }
  async ping() { const r = await fetch('https://www.googleapis.com/drive/v3/files/' + this.folder + '?supportsAllDrives=true&fields=id,name,capabilities/canAddChildren', { headers: { Authorization: 'Bearer ' + await this.token() } }); if (!r.ok) throw Error('Sin acceso a la carpeta de Drive (' + r.status + ').'); const j = await r.json(); if (j.capabilities && j.capabilities.canAddChildren === false) throw Error('La cuenta del ERP no puede escribir en esa carpeta.'); return j.name; }
}

class Resguardo {
  // opciones: authSnapshot() → usuarios de acceso; pgUrlFile; drive (para pruebas); fetcher; pgDump (true/false/'auto'); tarBin
  constructor(store, config, { authSnapshot, drive, fetcher, pgDump = 'auto', tarBin = 'tar', clock = () => Date.now() } = {}) {
    this.store = store; this.config = config; this.dir = config.privateDir; this.authSnapshot = authSnapshot; this.fetch = fetcher || ((...a) => fetch(...a));
    this.pgDump = pgDump; this.tarBin = tarBin; this.clock = clock; this.driveOverride = drive;
    this.reg = store.ref.collection('resguardo_registro'); this.lease = store.ref.collection('resguardo_lease').doc('principal'); this.timer = null;
  }
  cfgFile() { return path.join(this.dir, 'resguardo.json'); }
  pubFile() { return path.join(this.dir, 'resguardo-publica.pem'); }
  cfg() { try { return { ...DEFAULT_CFG, ...JSON.parse(fs.readFileSync(this.cfgFile(), 'utf8')) }; } catch { return { ...DEFAULT_CFG }; } }
  publica() { try { return fs.readFileSync(this.pubFile(), 'utf8'); } catch { return ''; } }
  drive() { const c = this.cfg(); if (this.driveOverride) return this.driveOverride; if (!c.drive_folder_id || !this.config.credential) return null; return new DriveResguardo(this.config.credential, c.drive_folder_id); }
  guardarCfg(input, user) {
    const c = this.cfg(), i = input || {};
    if (i.enabled !== undefined) { if (i.enabled === true && !this.publica()) throw Error('Primero genera la llave de los respaldos y guarda la llave privada.'); c.enabled = i.enabled === true; }
    if (i.cada_horas !== undefined) { const h = Math.round(+i.cada_horas); if (![1, 2, 3, 6, 12, 24].includes(h)) throw Error('Frecuencia: 1, 2, 3, 6, 12 o 24 horas.'); c.cada_horas = h; }
    if (i.drive_folder_id !== undefined) { const m = /[-\w]{20,}/.exec(String(i.drive_folder_id || '')); c.drive_folder_id = m ? m[0] : ''; }
    if (i.incluir_archivos !== undefined) c.incluir_archivos = i.incluir_archivos === true;
    for (const k of ['n8n_url', 'erp_url']) if (i[k] !== undefined) { const u = String(i[k] || '').trim(); if (u && !/^https:\/\/[^\s/]+(\/[^\s]*)?$/.test(u)) throw Error('Las direcciones deben empezar con https://.'); c[k] = u.replace(/\/$/, ''); }
    c.actualizado = { por: text(user.name, 120), at: now() };
    fs.mkdirSync(this.dir, { recursive: true, mode: 0o700 }); fs.writeFileSync(this.cfgFile(), JSON.stringify(c, null, 1), { mode: 0o600 });
    return c;
  }
  // La llave privada se devuelve UNA vez y no se guarda. Si ya existe una llave, generar otra exige confirmación (los respaldos viejos siguen abriéndose con la anterior).
  generarLlaves(input, user) {
    if (this.publica() && input?.reemplazar !== true) throw Error('Ya existe una llave. Generar otra solo si perdiste la privada: los respaldos anteriores seguirán necesitando la llave anterior.');
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 4096, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
    fs.mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    if (this.publica()) fs.renameSync(this.pubFile(), this.pubFile() + '.anterior-' + Date.now());
    fs.writeFileSync(this.pubFile(), publicKey, { mode: 0o600 });
    return { huella: fingerprint(publicKey), llave_privada: privateKey, aviso: 'Guarda esta llave privada en dos lugares seguros (por ejemplo, un USB y el gestor de contraseñas de la empresa). El ERP NO la conserva: sin ella los respaldos no se pueden abrir. No la pegues en chats.', por: text(user.name, 120) };
  }
  // ---------- Armar, cifrar, guardar local, subir y registrar ----------
  async crear({ motivo = 'programado', user = null } = {}) {
    const pub = this.publica(); if (!pub) throw Error('Falta la llave de los respaldos.');
    const at = this.clock(), owner = crypto.randomUUID();
    const ok = await this.store.db.runTransaction(async tx => { const l = (await tx.get(this.lease)).data() || {}; if (l.until > at) return false; tx.set(this.lease, { owner, until: at + 45 * 60000 }); return true; });
    if (!ok) return { omitido: true, aviso: 'Ya hay un resguardo en curso.' };
    const id = new Date(at).toISOString().replace(/[:.]/g, '-'), tmp = path.join(this.dir, 'resguardo-tmp', id), localDir = path.join(this.dir, 'resguardo');
    const reg = { id, at: new Date(at).toISOString(), motivo: text(motivo, 120), por: user ? text(user.name, 120) : 'L.O.L.A Operaciones', partes: [], avisos: [], estado: 'en_curso' };
    try {
      await fsp.mkdir(tmp, { recursive: true, mode: 0o700 }); await fsp.mkdir(localDir, { recursive: true, mode: 0o700 });
      // 1. CRM legible y conteos de control
      const crm = await this.store.read();
      await pipeline(require('node:stream').Readable.from([JSON.stringify(crm)]), zlib.createGzip({ level: 6 }), fs.createWriteStream(path.join(tmp, 'crm.json.gz')));
      reg.conteos = conteos(crm); reg.partes.push('crm.json.gz');
      // 2. Base PostgreSQL completa (todos los módulos)
      try { const p = await this.dumpPostgres(tmp); if (p) reg.partes.push(p); else reg.avisos.push('Sin conexión PostgreSQL configurada: solo se resguardó el CRM.'); } catch (e) { reg.avisos.push('PostgreSQL: ' + e.message); }
      // 3. Usuarios y accesos (Firestore)
      try { if (this.authSnapshot) { const a = await this.authSnapshot(); await fsp.writeFile(path.join(tmp, 'accesos.json'), JSON.stringify(a), { mode: 0o600 }); reg.partes.push('accesos.json'); } } catch (e) { reg.avisos.push('Accesos (Firestore): ' + e.message); }
      // 4. Directorio privado: archivos de campañas, documentos, configuraciones y skills del servidor
      if (this.cfg().incluir_archivos) { try { await this.tarPrivado(path.join(tmp, 'privado.tar')); reg.partes.push('privado.tar'); } catch (e) { reg.avisos.push('Archivos privados: ' + e.message); } }
      await fsp.writeFile(path.join(tmp, 'manifiesto.json'), JSON.stringify({ ...reg, version: require('../package.json').version }, null, 1));
      // Paquete único → gzip → cifrado
      const plano = path.join(this.dir, 'resguardo-tmp', id + '.tar.gz');
      await run(this.tarBin, ['-czf', plano, '-C', tmp, '.']);
      const final = path.join(localDir, 'ERP-OROK-' + id + '.orokbak');
      const h = await cifrar(plano, final, pub, { creado: reg.at, version: require('../package.json').version });
      reg.huella_llave = h.huella; reg.bytes = (await fsp.stat(final)).size; reg.sha256 = await sha256File(final); reg.archivo_local = path.basename(final);
      await fsp.rm(path.join(this.dir, 'resguardo-tmp'), { recursive: true, force: true });
      await this.podarLocales();
      // Subida a Drive: una copia nueva por día y la copia «última hora» que se actualiza.
      const d = this.drive();
      if (d) {
        try {
          const dia = limaDay(new Date(at)), st = await this.estadoDrive();
          const diaria = st.ultimo_dia !== dia;
          const r = diaria ? await d.subir(final, 'ERP-OROK-resguardo-' + dia + '.orokbak') : await (st.hora_id ? d.subir(final, '', st.hora_id) : d.subir(final, 'ERP-OROK-resguardo-ultima-hora.orokbak'));
          if (!diaria && !st.hora_id) await this.guardarEstadoDrive({ ...st, hora_id: r.id });
          if (diaria) await this.guardarEstadoDrive({ ...st, ultimo_dia: dia });
          reg.drive = { file_id: r.id, nombre: r.name || null, tipo: diaria ? 'diario' : 'ultima_hora' };
        } catch (e) { reg.avisos.push('Drive: ' + e.message); reg.drive = { error: e.message }; }
      } else reg.avisos.push('Sin carpeta de Drive configurada: la copia quedó solo en el servidor.');
      reg.estado = reg.drive?.file_id ? 'externo' : 'solo_local';
    } catch (e) { reg.estado = 'error'; reg.error = text(e.message, 500); await fsp.rm(path.join(this.dir, 'resguardo-tmp'), { recursive: true, force: true }).catch(() => {}); }
    finally { await this.store.db.runTransaction(async tx => { const l = (await tx.get(this.lease)).data(); if (l?.owner === owner) tx.set(this.lease, { owner, until: 0 }); }); }
    await this.store.db.runTransaction(async tx => { tx.set(this.reg.doc(id), reg); });
    return reg;
  }
  async estadoDrive() { return (await this.store.ref.collection('resguardo_lease').doc('drive').get()).data() || {}; }
  async guardarEstadoDrive(v) { await this.store.db.runTransaction(async tx => { tx.set(this.store.ref.collection('resguardo_lease').doc('drive'), v); }); }
  async podarLocales() { const dir = path.join(this.dir, 'resguardo'), max = this.cfg().max_locales; const f = (await fsp.readdir(dir)).filter(x => /^ERP-OROK-.+\.orokbak$/.test(x)).sort(); for (const x of f.slice(0, Math.max(0, f.length - max))) await fsp.rm(path.join(dir, x), { force: true }); }
  async dumpPostgres(tmp) {
    if (!this.config.postgresUrlFile) return null;
    const u = new URL(fs.readFileSync(this.config.postgresUrlFile, 'utf8').trim()), env = { PGHOST: u.hostname, PGPORT: u.port || '5432', PGUSER: decodeURIComponent(u.username), PGPASSWORD: decodeURIComponent(u.password), PGDATABASE: decodeURIComponent(u.pathname.slice(1)), PGSSLMODE: u.searchParams.get('sslmode') || 'prefer' };
    if (this.pgDump !== false) { try { await run('pg_dump', ['--format=custom', '--no-owner', '--no-privileges', '--file=' + path.join(tmp, 'postgres.dump')], { env }); return 'postgres.dump'; } catch (e) { if (this.pgDump === true) throw e; } }
    // Respaldo alternativo sin pg_dump: todas las tablas de los esquemas del ERP en JSON por líneas.
    const { Pool } = require('pg'), pool = new Pool({ connectionString: u.href, max: 1 }), out = zlib.createGzip(), ws = fs.createWriteStream(path.join(tmp, 'postgres-tablas.jsonl.gz')), done = pipeline(out, ws);
    try {
      const { rows: t } = await pool.query("SELECT table_schema s, table_name n FROM information_schema.tables WHERE table_type='BASE TABLE' AND table_schema NOT IN ('pg_catalog','information_schema') ORDER BY 1,2");
      for (const x of t) { const { rows } = await pool.query('SELECT * FROM ' + JSON.stringify(x.s) + '.' + JSON.stringify(x.n)); out.write(JSON.stringify({ tabla: x.s + '.' + x.n, filas: rows.length }) + '\n'); for (const r of rows) out.write(JSON.stringify(r) + '\n'); }
    } finally { out.end(); await done; await pool.end(); }
    return 'postgres-tablas.jsonl.gz';
  }
  async tarPrivado(dest) { const ex = EXCLUIR.flatMap(e => ['--exclude=./' + e]); await run(this.tarBin, ['-cf', dest, ...ex, '-C', this.dir, '.']); }
  // ---------- Verificación: descarga la copia de Drive y compara su huella con la que se subió ----------
  async verificar() {
    const ult = (await this.registros(20)).find(r => r.drive?.file_id && r.sha256); if (!ult) throw Error('Aún no hay un resguardo en Drive para verificar.');
    const d = this.drive(); if (!d) throw Error('Sin carpeta de Drive configurada.');
    let ok = false, error = ''; try { ok = (await d.huella(ult.drive.file_id)) === ult.sha256; if (!ok) error = 'La copia en Drive no coincide con la generada.'; } catch (e) { error = e.message; }
    const v = { at: now(), ok, error, resguardo: ult.id };
    await this.store.db.runTransaction(async tx => { const r = (await tx.get(this.reg.doc(ult.id))).data(); tx.set(this.reg.doc(ult.id), { ...r, verificacion: v }); });
    return v;
  }
  async registros(n = 30) { return (await this.reg.limit(500).get()).docs.map(d => d.data()).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, n); }
  // ---------- Salud de los servicios ----------
  async salud() {
    const c = this.cfg(), out = {}, t = async (k, fn) => { const t0 = Date.now(); try { out[k] = { ok: true, detalle: await fn(), ms: Date.now() - t0 }; } catch (e) { out[k] = { ok: false, detalle: text(e.message, 200), ms: Date.now() - t0 }; } };
    await t('base_de_datos', async () => { await this.store.read(); return 'responde'; });
    await t('drive', async () => { const d = this.drive(); if (!d) throw Error('sin carpeta configurada'); return 'carpeta ' + await d.ping(); });
    if (c.n8n_url) await t('n8n', async () => { const r = await this.fetch(c.n8n_url + '/healthz', { signal: AbortSignal.timeout(8000) }); if (!r.ok) throw Error('responde ' + r.status); return 'en línea'; });
    return out;
  }
  async estado() {
    const c = this.cfg(), regs = await this.registros(15), ok = regs.find(r => ['externo', 'solo_local'].includes(r.estado)), ext = regs.find(r => r.estado === 'externo');
    const limite = c.cada_horas * 3600000 * 2, atrasado = c.enabled && (!ok || this.clock() - Date.parse(ok.at) > limite);
    return { activo: c.enabled, config: { cada_horas: c.cada_horas, drive_folder_id: c.drive_folder_id, incluir_archivos: c.incluir_archivos, n8n_url: c.n8n_url, erp_url: c.erp_url }, llave: this.publica() ? { huella: fingerprint(this.publica()) } : null,
      ultimo: ok || null, ultimo_externo: ext || null, ultima_verificacion: regs.find(r => r.verificacion)?.verificacion || null, atrasado, registros: regs.map(r => ({ id: r.id, at: r.at, estado: r.estado, bytes: r.bytes || 0, motivo: r.motivo, avisos: r.avisos, error: r.error || '', conteos: r.conteos || null, drive: r.drive || null, verificacion: r.verificacion || null })) };
  }
  // ---------- Programación: revisa cada 5 minutos si toca; diario verifica la copia remota ----------
  start() {
    if (this.timer) return; const tick = async () => {
      try {
        const c = this.cfg(); if (!c.enabled) return;
        const ult = (await this.registros(1))[0];
        if (!ult || this.clock() - Date.parse(ult.at) >= c.cada_horas * 3600000) { const r = await this.crear({ motivo: 'programado' }); if (r.drive?.tipo === 'diario') await this.verificar().catch(() => {}); }
      } catch {}
    };
    this.timer = setInterval(tick, 5 * 60000); this.timer.unref?.(); setTimeout(tick, 60000).unref?.();
  }
  stop() { clearInterval(this.timer); this.timer = null; }
  async rpc(name, args, user) {
    if (user.role !== 'Gerente') throw Error('L.O.L.A Operaciones es de Gerencia.');
    if (name === 'opsEstado') return { ...(await this.estado()), salud: await this.salud() };
    if (name === 'opsResguardar') return this.crear({ motivo: 'manual', user });
    if (name === 'opsVerificar') return this.verificar();
    if (name === 'opsConfigGuardar') { this.guardarCfg(args[0] || {}, user); return this.estado(); }
    if (name === 'opsGenerarLlaves') return this.generarLlaves(args[0] || {}, user);
    throw Error('Operación no reconocida.');
  }
}
// Conteos que permiten comparar antes y después de una restauración: leads, comentarios y el orden del Kanban.
function conteos(d) {
  const leads = d.leads || [];
  const kanban = crypto.createHash('sha256').update(JSON.stringify(leads.map(l => [l.id, l.status || '', l.kanban_order ?? l.order ?? l.position ?? null]))).digest('hex').slice(0, 16);
  return { leads: leads.length, comentarios: leads.reduce((n, l) => n + (l.comment_history || []).length, 0), kanban_firma: kanban, unidades: (d.units || []).length, cotizaciones: (d.quotes || []).length, separaciones: (d.separations || []).length };
}
const OPS_METHODS = ['opsEstado', 'opsResguardar', 'opsVerificar', 'opsConfigGuardar', 'opsGenerarLlaves'];
module.exports = { Resguardo, DriveResguardo, OPS_METHODS, cifrar, descifrar, conteos, fingerprint };
