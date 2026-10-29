'use strict';
// R36 · Registro de equipos para el ERP instalado (PC, Mac, celular).
// - Instalar por primera vez exige un CÓDIGO DE INSTALACIÓN que solo existe en el servidor (lo genera Gerencia
//   con `node deploy/codigo-instalacion.cjs crear` o por RPC). Se guarda solo su huella (scrypt), vence y tiene usos limitados.
// - Al registrarse, el equipo recibe un token propio en una cookie HttpOnly; Gerencia puede revocarlo.
// - En el navegador (web) no hay instalación: se entra solo con usuario y contraseña, como siempre.
// - El código de instalación NO reemplaza la contraseña del usuario: se pide una vez por equipo y luego se inicia sesión normal.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const ALFA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const now = () => new Date().toISOString();
const text = (v, n = 80) => String(v ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, n);
const hashCode = (code, salt) => crypto.scryptSync(String(code).toUpperCase().replace(/[^A-Z0-9]/g, ''), salt, 32).toString('hex');
const hashToken = t => crypto.createHash('sha256').update(String(t)).digest('hex');

class DeviceEnrollment {
  constructor(config) { this.dir = config.privateDir; this.testing = !!config.testing; }
  file() { return path.join(this.dir, 'instalacion-equipos.json'); }
  read() { try { const j = JSON.parse(fs.readFileSync(this.file(), 'utf8')); return { codes: j.codes || [], devices: j.devices || [] }; } catch { return { codes: [], devices: [] }; } }
  write(d) { fs.mkdirSync(this.dir, { recursive: true }); const tmp = this.file() + '.tmp-' + process.pid + '-' + Date.now(); fs.writeFileSync(tmp, JSON.stringify(d, null, 2), { mode: 0o600 }); fs.renameSync(tmp, this.file()); }
  cookieName() { return this.testing ? 'orok_dev_device' : '__Host-orok_device'; }

  crearCodigo({ horas = 24, usos = 1, etiqueta = '', por = '' } = {}) {
    const h = Math.min(Math.max(Number(horas) || 24, 1), 24 * 14), u = Math.min(Math.max(Number(usos) || 1, 1), 10);
    const raw = Array.from(crypto.randomBytes(12), b => ALFA[b % ALFA.length]).join('');
    const code = 'ORK-' + raw.slice(0, 4) + '-' + raw.slice(4, 8) + '-' + raw.slice(8, 12), salt = crypto.randomBytes(16).toString('hex');
    const d = this.read(); const id = crypto.randomUUID();
    d.codes = d.codes.filter(c => Date.parse(c.vence) > Date.now() && c.usos_restantes > 0); // limpiar vencidos
    d.codes.push({ id, salt, hash: hashCode(code, salt), etiqueta: text(etiqueta), creado: now(), creado_por: text(por), vence: new Date(Date.now() + h * 3600e3).toISOString(), usos_restantes: u });
    this.write(d);
    return { codigo: code, id, vence: d.codes.at(-1).vence, usos: u }; // el código en claro solo se muestra esta vez
  }
  registrar({ codigo, equipo, plataforma } = {}, ip = '') {
    const d = this.read(), limpio = String(codigo || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (limpio.length < 12) throw Error('Código de instalación no válido.');
    const c = d.codes.find(x => Date.parse(x.vence) > Date.now() && x.usos_restantes > 0 && crypto.timingSafeEqual(Buffer.from(hashCode(limpio, x.salt), 'hex'), Buffer.from(x.hash, 'hex')));
    if (!c) throw Error('Código de instalación no válido o vencido. Pídele uno nuevo a Gerencia.');
    c.usos_restantes -= 1; c.ultimo_uso = now();
    const token = crypto.randomBytes(32).toString('base64url'), id = crypto.randomUUID();
    d.devices.push({ id, nombre: text(equipo || 'Equipo sin nombre', 60), plataforma: text(plataforma, 80), codigo_id: c.id, token: hashToken(token), registrado: now(), ultimo_uso: now(), ip: text(ip, 60), revocado: false });
    this.write(d);
    return { token, id, nombre: d.devices.at(-1).nombre };
  }
  valido(token) {
    if (!token) return null;
    const d = this.read(), t = hashToken(token), dev = d.devices.find(x => !x.revocado && x.token === t);
    if (!dev) return null;
    if (Date.now() - Date.parse(dev.ultimo_uso || 0) > 3600e3) { dev.ultimo_uso = now(); this.write(d); }
    return { id: dev.id, nombre: dev.nombre };
  }
  listar() { const d = this.read(); return { codigos: d.codes.map(({ salt, hash, ...c }) => ({ ...c, vigente: Date.parse(c.vence) > Date.now() && c.usos_restantes > 0 })), equipos: d.devices.map(({ token, ...e }) => e) }; }
  revocar(id, por = '') { const d = this.read(), dev = d.devices.find(x => x.id === id); if (!dev) throw Error('Equipo no encontrado.'); dev.revocado = true; dev.revocado_en = now(); dev.revocado_por = text(por); this.write(d); return { ok: true }; }
  anularCodigo(id) { const d = this.read(), c = d.codes.find(x => x.id === id); if (!c) throw Error('Código no encontrado.'); c.usos_restantes = 0; this.write(d); return { ok: true }; }

  async rpc(name, args, user) {
    if (user.role !== 'Gerente') throw Error('Requiere Gerencia.');
    if (name === 'createInstallCode') return this.crearCodigo({ ...(args[0] || {}), por: user.name });
    if (name === 'getInstallDevices') return this.listar();
    if (name === 'revokeInstallDevice') return this.revocar(String(args[0] || ''), user.name);
    if (name === 'cancelInstallCode') return this.anularCodigo(String(args[0] || ''));
    throw Error('Operación no reconocida.');
  }
}
const INSTALL_METHODS = ['createInstallCode', 'getInstallDevices', 'revokeInstallDevice', 'cancelInstallCode'];
module.exports = { DeviceEnrollment, INSTALL_METHODS };
