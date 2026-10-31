'use strict';
// R74 · Estudio de mercado por distrito.
// - Base de comparables por distrito (precio, área, dormitorios, precio por m², fuente, fecha y enlace).
// - Tareas de investigación: Gerencia elige el distrito; Claude en la PC (con el conector del ERP) toma la tarea, revisa los
//   portales aviso por aviso y sube los comparables. Cada dato guarda su fuente y fecha.
// - Carga de bases propias: Excel, CSV, Google Sheets (enlace), Markdown, JSON y PDF (lectura con la IA si el proveedor es Claude).
// - Nada se borra: un comparable repetido (mismo enlace o mismos datos) se actualiza; se pueden «descartar» sin borrar.
const { createHash, randomUUID } = require('node:crypto');
const now = () => new Date().toISOString();
const text = (v, n = 300) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const DISTRITOS = ['Barranco', 'Breña', 'Chorrillos', 'Jesús María', 'La Molina', 'La Victoria', 'Lima Cercado', 'Lince', 'Magdalena del Mar', 'Miraflores', 'Pueblo Libre', 'San Borja', 'San Isidro', 'San Miguel', 'Santiago de Surco', 'Surquillo', 'Los Olivos', 'San Martín de Porres', 'Ate', 'Santa Anita', 'San Luis', 'Rímac', 'Callao', 'Bellavista', 'La Perla', 'Independencia', 'Comas', 'Carabayllo', 'Puente Piedra', 'San Juan de Miraflores', 'Villa El Salvador', 'Villa María del Triunfo', 'San Juan de Lurigancho', 'Lurín', 'Punta Hermosa', 'Asia'];
const PORTALES = ['Urbania', 'Adondevivir', 'Nexo Inmobiliario', 'Properati', 'Babilonia', 'Mitula', 'Otro'];
const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const distritoDe = v => { const n = norm(v); return DISTRITOS.find(d => norm(d) === n) || DISTRITOS.find(d => n && norm(d).includes(n)) || text(v, 60); };
function numero(v) { if (v == null || v === '') return null; if (typeof v === 'number') return Number.isFinite(v) ? v : null; let s = String(v).replace(/[^\d.,-]/g, ''); if (/,\d{3}(\D|$)/.test(s) && !/\.\d{1,2}$/.test(s)) s = s.replace(/,/g, ''); else if (/\.\d{3}(\D|$)/.test(s) && /,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); else s = s.replace(/,/g, ''); const n = Number(s); return Number.isFinite(n) ? n : null; }
function moneda(precio, mon) { const m = norm(mon || ''); if (/us|\$|dolar|usd/.test(m) && !/s\/|sol/.test(m)) return 'USD'; if (/s\/|sol|pen/.test(m)) return 'PEN'; const p = String(precio || ''); if (/us\$|usd|\$\s?\d/i.test(p) && !/s\//i.test(p)) return 'USD'; return 'PEN'; }
const ALIAS = { precio: ['precio', 'price', 'valor', 'monto', 'precio venta', 'precio total'], moneda: ['moneda', 'currency'], area: ['area', 'm2', 'area techada', 'area total', 'metraje', 'superficie', 'tamano'], dormitorios: ['dormitorios', 'dorm', 'habitaciones', 'cuartos', 'recamaras'], banos: ['banos', 'bano'], piso: ['piso', 'nivel'], cochera: ['cochera', 'estacionamiento', 'parking'], distrito: ['distrito', 'district', 'zona'], direccion: ['direccion', 'address', 'ubicacion'], proyecto: ['proyecto', 'edificio', 'nombre', 'titulo', 'title'], inmobiliaria: ['inmobiliaria', 'constructora', 'desarrolladora', 'empresa'], url: ['url', 'link', 'enlace', 'aviso'], fuente: ['fuente', 'portal', 'source'], fecha: ['fecha', 'date', 'publicado'], etapa: ['etapa', 'estado', 'estado de obra', 'entrega'], precio_m2: ['precio m2', 'precio por m2', 'p m2', 'usd m2', 's m2', 'precio x m2'] };
function campo(h) { const n = norm(h).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim(); let best = null; for (const [k, list] of Object.entries(ALIAS)) for (const a of list) if (n === a || (a.length > 3 && n.includes(a))) { if (!best || a.length > best[1]) best = [k, a.length]; } return best ? best[0] : null; }
function limpiar(raw, base = {}) {
  const r = {}; for (const [k, v] of Object.entries(raw || {})) { const c = ALIAS[k] ? k : campo(k); if (c && (r[c] == null || r[c] === '')) r[c] = v; }
  const precio = numero(r.precio), area = numero(r.area), mon = moneda(r.precio, r.moneda || base.moneda);
  let pm2 = numero(r.precio_m2); if (!pm2 && precio && area) pm2 = Math.round(precio / area);
  const url = /^https?:\/\//i.test(String(r.url || '')) ? String(r.url).slice(0, 500) : '';
  const c = { distrito: distritoDe(r.distrito || base.distrito || ''), proyecto: text(r.proyecto, 140), inmobiliaria: text(r.inmobiliaria, 120), direccion: text(r.direccion, 200), precio: precio ? Math.round(precio) : null, moneda: mon, area_m2: area ? Math.round(area * 10) / 10 : null,
    precio_m2: pm2 || null, dormitorios: numero(r.dormitorios), banos: numero(r.banos), piso: text(r.piso, 20), cochera: text(r.cochera, 40), etapa: text(r.etapa, 60), url, fuente: text(r.fuente || base.fuente || (url ? new URL(url).hostname.replace(/^www\./, '') : ''), 80), fecha_aviso: text(r.fecha, 30) };
  if (!c.precio && !c.precio_m2) return null; if (!c.area_m2 && !c.precio_m2) return null; if (!c.distrito) return null;
  c.id = createHash('sha256').update(url ? 'u|' + url : ['d', norm(c.distrito), norm(c.proyecto), c.precio, c.area_m2, c.dormitorios].join('|')).digest('hex').slice(0, 32);
  return c;
}
function csvFilas(t) { const s = String(t || '').replace(/^﻿/, ''); const first = s.split(/\r?\n/)[0] || ''; const d = [';', '\t', ','].sort((a, b) => first.split(b).length - first.split(a).length)[0]; const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < s.length; i++) { const ch = s[i]; if (q) { if (ch === '"' && s[i + 1] === '"') { f += '"'; i++; } else if (ch === '"') q = false; else f += ch; } else if (ch === '"') q = true; else if (ch === d) { row.push(f); f = ''; } else if (ch === '\n') { row.push(f.replace(/\r$/, '')); rows.push(row); row = []; f = ''; } else f += ch; }
  if (f || row.length) { row.push(f); rows.push(row); } return rows.filter(r => r.some(x => String(x).trim())); }
function mdFilas(t) { return String(t || '').split(/\r?\n/).filter(l => /^\s*\|/.test(l) && !/^\s*\|?\s*:?-{2,}/.test(l)).map(l => l.trim().replace(/^\||\|$/g, '').split('|').map(x => x.trim())); }
function objetos(rows) { if (rows.length < 2) return []; let h = 0; for (let i = 0; i < Math.min(rows.length, 10); i++) if (rows[i].filter(campo).length >= 2) { h = i; break; } const head = rows[h]; return rows.slice(h + 1).map(r => Object.fromEntries(head.map((k, i) => [k, r[i]]))); }
async function xlsxObjetos(buf) { const ExcelJS = require('exceljs'), wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf); const out = []; wb.eachSheet(ws => { const rows = []; ws.eachRow({ includeEmpty: false }, r => rows.push(r.values.slice(1).map(v => v && typeof v === 'object' ? (v.text ?? v.result ?? v.hyperlink ?? '') : v))); out.push(...objetos(rows)); }); return out; }
const pct = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return Math.round(s[lo] + (s[hi] - s[lo]) * (i - lo)); };
class Mercado {
  constructor(store, config, { assistant, fetcher } = {}) { this.store = store; this.config = config; this.assistant = assistant; this.fetch = fetcher; const r = store.ref; this.comps = r.collection('mercado_comparables'); this.tareas = r.collection('mercado_tareas'); this.cargas = r.collection('mercado_cargas'); }
  tx(fn) { return this.store.db.runTransaction(fn); }
  manager(u) { if (u.role !== 'Gerente') throw Error('El estudio de mercado es de Gerencia.'); }
  async guardar(lista, meta, user) {
    let nuevos = 0, actualizados = 0; const ids = [];
    for (let i = 0; i < lista.length; i += 40) { const lote = lista.slice(i, i + 40); await this.tx(async tx => { const prev = []; for (const c of lote) prev.push((await tx.get(this.comps.doc(c.id))).data()); lote.forEach((c, j) => { const p = prev[j]; tx.set(this.comps.doc(c.id), { ...(p || {}), ...Object.fromEntries(Object.entries(c).filter(([, v]) => v !== null && v !== '')), id: c.id, origen: meta.origen, carga_id: meta.carga_id || p?.carga_id || null, tarea_id: meta.tarea_id || p?.tarea_id || null, creado: p?.creado || now(), actualizado: now(), por: text(user?.name, 120), descartado: p?.descartado || false }); p ? actualizados++ : nuevos++; ids.push(c.id); }); }); }
    return { nuevos, actualizados, ids };
  }
  async importar(input, user) {
    this.manager(user);
    const base = { distrito: input?.distrito || '', fuente: text(input?.fuente, 80), moneda: input?.moneda }; let filas = [], tipo = '';
    const nombre = text(input?.nombre, 160), ext = (nombre.match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase() || '';
    if (input?.url) { const { exportURL } = require('./sheetAccess'), { safeFetch } = require('../safe-network.cjs'); const u = exportURL(input.url); const r = await safeFetch(this.fetch || fetch)(u); if (!r.ok) throw Error('No se pudo leer el enlace (HTTP ' + r.status + '). Compártelo como «Cualquier persona con el enlace».'); const buf = Buffer.from(await r.arrayBuffer()); if (buf[0] === 0x50 && buf[1] === 0x4b) { filas = await xlsxObjetos(buf); tipo = 'xlsx-enlace'; } else { filas = objetos(csvFilas(require('./sheetAccess').decodeCSV ? require('./sheetAccess').decodeCSV(buf) : buf.toString('utf8'))); tipo = 'sheets'; } }
    else {
      const buf = Buffer.from(String(input?.base64 || ''), 'base64'); if (!buf.length && !input?.texto) throw Error('Adjunta un archivo o pega un enlace.'); if (buf.length > 15 * 1024 * 1024) throw Error('El archivo supera 15 MB.');
      if (ext === 'xlsx' || (buf[0] === 0x50 && buf[1] === 0x4b)) { filas = await xlsxObjetos(buf); tipo = 'xlsx'; }
      else if (ext === 'pdf' || buf.slice(0, 4).toString() === '%PDF') { filas = await this.pdf(buf, base, user); tipo = 'pdf'; }
      else { const t = input?.texto ? String(input.texto) : buf.toString('utf8'); if (ext === 'json' || /^\s*[\[{]/.test(t)) { const j = JSON.parse(t); filas = Array.isArray(j) ? j : (j.comparables || j.avisos || j.data || []); tipo = 'json'; } else if (ext === 'md' || /^\s*\|/m.test(t)) { filas = objetos(mdFilas(t)); tipo = 'md'; } else { filas = objetos(csvFilas(t)); tipo = 'csv'; } }
    }
    const limpios = filas.slice(0, 5000).map(f => limpiar(f, base)).filter(Boolean), descartadas = filas.length - limpios.length;
    if (!limpios.length) throw Error('No encontré filas con precio, área y distrito. Revisa que la tabla tenga encabezados como Precio, Área (m²), Dormitorios y Distrito.');
    const carga_id = randomUUID(); await this.tx(async tx => { tx.set(this.cargas.doc(carga_id), { id: carga_id, nombre: nombre || input?.url || 'Texto pegado', tipo, filas: filas.length, validas: limpios.length, descartadas, creado: now(), por: text(user.name, 120) }); });
    if (input?.vista_previa) return { tipo, filas: filas.length, validas: limpios.length, descartadas, muestra: limpios.slice(0, 15) };
    return { tipo, filas: filas.length, descartadas, ...(await this.guardar(limpios, { origen: 'carga:' + tipo, carga_id }, user)) };
  }
  async pdf(buf, base, user) {
    const a = this.assistant; const c = a?.raw?.(); if (!c?.enabled || c.provider !== 'claude') throw Error('Para leer PDF se necesita la IA con proveedor Claude activa (asistente L.O.L.A). También puedes exportar la tabla a Excel o CSV.');
    const data = this.readData ? await this.readData() : {}; const k = a.key(c, data.settings); if (!k.key) throw Error('Falta la clave de la IA.');
    const body = { model: c.model, max_tokens: 8000, system: 'Extrae avisos o comparables inmobiliarios del documento. Devuelve SOLO JSON: {"comparables":[{"proyecto":"","inmobiliaria":"","direccion":"","distrito":"","precio":0,"moneda":"PEN|USD","area":0,"dormitorios":0,"banos":0,"piso":"","cochera":"","etapa":"","url":"","fuente":"","fecha":""}]}. No inventes datos: deja vacío lo que no esté.', messages: [{ role: 'user', content: [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buf.toString('base64') } }, { type: 'text', text: 'Distrito por defecto: ' + (base.distrito || 'no indicado') + '.' }] }] };
    const r = await (this.fetch || fetch)('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': k.key, 'anthropic-version': '2023-06-01' }, body: JSON.stringify(body), signal: AbortSignal.timeout(120000) });
    const j = await r.json(); if (!r.ok) throw Error('La IA no pudo leer el PDF: ' + text(j?.error?.message, 200));
    const t = (j.content || []).map(b => b.text || '').join(''); const { jsonDe } = require('./greta'); return jsonDe(t).comparables || [];
  }
  async listar(input) {
    const d = input?.distrito ? distritoDe(input.distrito) : null;
    const rows = (d ? await this.comps.where('distrito', '==', d).limit(5000).get() : await this.comps.limit(5000).get()).docs.map(x => x.data()).filter(c => input?.incluir_descartados || !c.descartado);
    return rows.sort((a, b) => String(b.actualizado).localeCompare(String(a.actualizado)));
  }
  resumen(rows) {
    const porMon = m => rows.filter(c => c.moneda === m && c.precio_m2);
    const bloque = list => ({ n: list.length, p25: pct(list.map(c => c.precio_m2), .25), mediana: pct(list.map(c => c.precio_m2), .5), p75: pct(list.map(c => c.precio_m2), .75), area_mediana: pct(list.filter(c => c.area_m2).map(c => c.area_m2), .5), precio_mediano: pct(list.filter(c => c.precio).map(c => c.precio), .5) });
    const out = {};
    for (const m of ['PEN', 'USD']) { const l = porMon(m); if (!l.length) continue; const porDorm = {}; for (const c of l) { const k = c.dormitorios ? (c.dormitorios >= 4 ? '4+' : String(c.dormitorios)) : 's/d'; (porDorm[k] = porDorm[k] || []).push(c); } out[m] = { total: bloque(l), por_dormitorios: Object.fromEntries(Object.entries(porDorm).map(([k, v]) => [k, bloque(v)])) }; }
    const fuentes = {}; for (const c of rows) fuentes[c.fuente || 'sin fuente'] = (fuentes[c.fuente || 'sin fuente'] || 0) + 1;
    return { comparables: rows.length, por_moneda: out, fuentes, ultima_actualizacion: rows[0]?.actualizado || null };
  }
  async tareaCrear(input, user) {
    this.manager(user); const d = distritoDe(input?.distrito); if (!DISTRITOS.includes(d)) throw Error('Elige un distrito de la lista.');
    const portales = (Array.isArray(input?.portales) ? input.portales : PORTALES.slice(0, 3)).filter(p => PORTALES.includes(p));
    const t = { id: randomUUID(), distrito: d, portales, tipologias: text(input?.tipologias, 200), precio_max: numero(input?.precio_max), notas: text(input?.notas, 600), estado: 'pendiente', creado: now(), por: text(user.name, 120), comparables: 0 };
    await this.tx(async tx => { tx.set(this.tareas.doc(t.id), t); }); return t;
  }
  async tareasLista() { return (await this.tareas.limit(200).get()).docs.map(x => x.data()).sort((a, b) => String(b.creado).localeCompare(String(a.creado))).slice(0, 50); }
  async tareaTomar(input, user) {
    const all = await this.tareasLista(), t = input?.id ? all.find(x => x.id === input.id) : all.filter(x => x.estado === 'pendiente').sort((a, b) => a.creado.localeCompare(b.creado))[0];
    if (!t) return { tarea: null, mensaje: 'No hay investigaciones pendientes.' };
    const next = { ...t, estado: 'en_curso', tomada: now(), tomada_por: text(user.name, 120) }; await this.tx(async tx => { tx.set(this.tareas.doc(t.id), next); });
    return { tarea: next, instrucciones: 'Revisa los portales indicados para el distrito, aviso por aviso, a ritmo humano. Sube los comparables en lotes de hasta 50 con mercado_subir_comparables (incluye url, fuente y fecha). Al terminar llama a mercado_tarea_completar.' };
  }
  async subir(input, user) {
    const lista = (Array.isArray(input?.comparables) ? input.comparables : []).slice(0, 100), t = input?.tarea_id ? (await this.tareas.doc(text(input.tarea_id, 60)).get()).data() : null;
    const limpios = lista.map(c => limpiar(c, { distrito: c?.distrito || t?.distrito, fuente: c?.fuente })).filter(Boolean);
    if (!limpios.length) throw Error('Ningún comparable tenía precio, área y distrito.');
    const r = await this.guardar(limpios, { origen: 'claude', tarea_id: t?.id || null }, user);
    if (t) await this.tx(async tx => { const cur = (await tx.get(this.tareas.doc(t.id))).data(); tx.set(this.tareas.doc(t.id), { ...cur, comparables: (cur.comparables || 0) + r.nuevos, actualizado: now() }); });
    return { recibidos: lista.length, validos: limpios.length, ...r };
  }
  async tareaCompletar(input, user) { const ref = this.tareas.doc(text(input?.id, 60)), t = (await ref.get()).data(); if (!t) throw Error('Tarea no encontrada.'); const next = { ...t, estado: input?.estado === 'fallida' ? 'fallida' : 'completa', resumen: text(input?.resumen, 1500), terminada: now() }; await this.tx(async tx => { tx.set(ref, next); }); return next; }
  async descartar(input, user) { this.manager(user); const ref = this.comps.doc(text(input?.id, 40)), c = (await ref.get()).data(); if (!c) throw Error('Comparable no encontrado.'); await this.tx(async tx => { tx.set(ref, { ...c, descartado: input?.descartar !== false, actualizado: now() }); }); return { ok: true }; }
  async rpc(name, args, user, read) {
    const a = args?.[0] || {}; if (read) this.readData = read; if (name !== 'mercadoConfig') this.manager(user);
    if (name === 'mercadoConfig') return { distritos: DISTRITOS, portales: PORTALES };
    if (name === 'mercadoResumen') { const rows = await this.listar(a); return { ...this.resumen(rows), distrito: a.distrito || null, muestra: rows.slice(0, 300) }; }
    if (name === 'mercadoImportar') return this.importar(a, user);
    if (name === 'mercadoTareaCrear') return this.tareaCrear(a, user);
    if (name === 'mercadoTareas') return { tareas: await this.tareasLista() };
    if (name === 'mercadoTareaTomar') return this.tareaTomar(a, user);
    if (name === 'mercadoSubir') return this.subir(a, user);
    if (name === 'mercadoTareaCompletar') return this.tareaCompletar(a, user);
    if (name === 'mercadoDescartar') return this.descartar(a, user);
    throw Error('Operación de mercado no reconocida.');
  }
}
const MERCADO_METHODS = ['mercadoConfig', 'mercadoResumen', 'mercadoImportar', 'mercadoTareaCrear', 'mercadoTareas', 'mercadoTareaTomar', 'mercadoSubir', 'mercadoTareaCompletar', 'mercadoDescartar'];
module.exports = { Mercado, MERCADO_METHODS, DISTRITOS, PORTALES, limpiar, csvFilas, mdFilas, objetos, numero, distritoDe };
