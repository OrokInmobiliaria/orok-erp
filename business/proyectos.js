'use strict';
// R50 · Multiproyecto: registro de proyectos independientes (Evaluación → Ventas → Construcción → Cierre).
// Cada proyecto guarda sus datos en su propio espacio (orok_projects/<id>) de la misma base; Infinity 224 sigue
// siendo el proyecto principal con sus datos intactos. Los usuarios y sus permisos son los mismos en todos.
const { randomBytes } = require('node:crypto');

const ETAPAS = ['evaluacion', 'ventas', 'construccion', 'cierre'];
const ETAPA_NOMBRE = { evaluacion: 'Evaluación', ventas: 'Ventas', construccion: 'Construcción', cierre: 'Cierre' };
const EMPRESAS = ['BMG', 'MZA', 'MAAS'];
const METHODS = ['proyectosListar', 'proyectoCrear', 'proyectoUsar', 'proyectoEtapa', 'proyectoEditar'];
const COOKIE = 'orok_proyecto';
const text = (v, max = 120) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const now = () => new Date().toISOString();
const slug = s => text(s, 60).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'proyecto';
const validId = id => typeof id === 'string' && /^[a-z0-9][a-z0-9_-]{0,99}$/i.test(id);
const norm = v => text(v, 200).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

function cookieDe(header) {
  const raw = String(header || '').split(';').map(x => x.trim()).find(x => x.startsWith(COOKIE + '='));
  const v = raw ? decodeURIComponent(raw.slice(COOKIE.length + 1)) : '';
  return validId(v) ? v : '';
}

function limpiarNuevo(input = {}) {
  const nombre = text(input.nombre, 80);
  if (nombre.length < 3) throw Error('Escribe el nombre del proyecto (mínimo 3 letras).');
  const empresa = EMPRESAS.includes(input.empresa) ? input.empresa : null;
  if (!empresa) throw Error('Elige la empresa que desarrolla el proyecto.');
  const etapa = input.etapa === 'ventas' ? 'ventas' : 'evaluacion';
  return { nombre, empresa, etapa, distrito: text(input.distrito, 60), direccion: text(input.direccion, 160) };
}

class ProyectosRegistro {
  constructor(store, { principalId = 'infinity224', principalNombre = 'Infinity 224' } = {}) {
    this.store = store; this.col = store.ref.collection('erp_proyectos');
    this.principalId = principalId; this.principalNombre = principalNombre;
  }
  principal(doc) {
    return { id: this.principalId, nombre: this.principalNombre, empresa: 'BMG', etapa: 'ventas', distrito: '', direccion: '', principal: true, creado: null, ...(doc || {}), activo: true };
  }
  async todos() {
    const docs = (await this.col.get()).docs.map(d => d.data()).filter(p => p && validId(p.id));
    const princ = docs.find(p => p.id === this.principalId);
    return [this.principal(princ), ...docs.filter(p => p.id !== this.principalId && p.archivado !== true)];
  }
  async uno(id) { return (await this.todos()).find(p => p.id === id) || null; }
  async porNombre(nombre) { const n = norm(nombre); if (!n) return null; return (await this.todos()).find(p => norm(p.nombre) === n || norm(p.id) === n) || null; }
  gerente(user) { if (user?.role !== 'Gerente') throw Error('Crear proyectos o cambiar su etapa es solo para Gerencia.'); }
  async reservar(input, user) {
    this.gerente(user);
    const base = limpiarNuevo(input), lista = await this.todos();
    if (lista.some(p => norm(p.nombre) === norm(base.nombre))) throw Error('Ya existe un proyecto con ese nombre.');
    const id = slug(base.nombre) + '-' + randomBytes(3).toString('hex');
    return { id, ...base, principal: false, creado: now(), creado_por: user.name, historial: [{ at: now(), por: user.name, etapa: base.etapa, nota: 'Proyecto creado' }] };
  }
  async registrar(doc) {
    await this.store.db.runTransaction(async tx => { const ref = this.col.doc(doc.id); if ((await tx.get(ref)).data()) throw Error('El proyecto ya existe.'); tx.set(ref, doc); });
    return doc;
  }
  async etapa(id, etapa, user, nota = '') {
    this.gerente(user);
    if (!ETAPAS.includes(etapa)) throw Error('Etapa no válida.');
    const actual = await this.uno(id); if (!actual) throw Error('El proyecto no existe.');
    const doc = { ...actual, etapa, historial: [...(actual.historial || []), { at: now(), por: user.name, etapa, nota: text(nota, 200) }].slice(-50) };
    delete doc.activo;
    await this.store.db.runTransaction(async tx => tx.set(this.col.doc(id), doc));
    return doc;
  }
  async editar(id, input, user) {
    this.gerente(user);
    const actual = await this.uno(id); if (!actual) throw Error('El proyecto no existe.');
    const doc = { ...actual };
    if (input.nombre != null) { const n = text(input.nombre, 80); if (n.length < 3) throw Error('Nombre muy corto.'); doc.nombre = n; }
    if (input.empresa != null) { if (!EMPRESAS.includes(input.empresa)) throw Error('Empresa no válida.'); doc.empresa = input.empresa; }
    if (input.distrito != null) doc.distrito = text(input.distrito, 60);
    if (input.direccion != null) doc.direccion = text(input.direccion, 160);
    delete doc.activo;
    await this.store.db.runTransaction(async tx => tx.set(this.col.doc(id), doc));
    return doc;
  }
}

// Cifras de la tarjeta de cada proyecto (sin datos personales).
async function resumenDe(ctx) {
  const d = await ctx.cache.read();
  const cerrados = new Set(['Perdido', 'Desestimado', 'Venta']);
  const leads = d.leads || [], units = d.units || [];
  const vendidas = units.filter(u => u.sold_lead_id || /^(SOLD|VENDID[OA]|VENTA)$/i.test(String(u.status || ''))).length;
  let meta = null, evaluaciones = 0;
  try { meta = (await ctx.store.ref.collection('ventas_precios').doc('estrategia').get()).data()?.config?.meta_recaudacion ?? null; } catch {}
  try { evaluaciones = (await ctx.store.ref.collection('mora_evaluations').get()).docs.filter(x => x.data()?.active !== false).length; } catch {}
  return { leads_activos: leads.filter(l => !cerrados.has(l.status)).length, leads_total: leads.length, unidades: units.length, vendidas, meta_recaudacion: meta, evaluaciones };
}

// Conecta el registro con los espacios de datos de cada proyecto. `abrir(id)` crea (o abre) el almacenamiento y
// `contexto(store, cache, id)` arma la aplicación de ese proyecto. El principal ya viene armado.
function proyectosHub({ principal, abrir, contexto, registro, onNuevo = () => {} }) {
  const ctxs = new Map([[registro.principalId, principal]]), abriendo = new Map();
  async function obtener(id) {
    if (!id || id === registro.principalId) return principal;
    if (ctxs.has(id)) return ctxs.get(id);
    if (!abriendo.has(id)) abriendo.set(id, (async () => {
      const p = await registro.uno(id); if (!p) return null;
      const store = await abrir(id, null), cache = store.watch(), ctx = contexto(store, cache, id);
      ctxs.set(id, ctx); onNuevo(ctx); return ctx;
    })().finally(() => abriendo.delete(id)));
    return (await abriendo.get(id)) || principal;
  }
  return {
    registro, ctxs, obtener,
    idDe: header => cookieDe(header) || registro.principalId,
    resolver: header => obtener(cookieDe(header)),
    async porNombre(nombre) { const p = await registro.porNombre(nombre); return p ? obtener(p.id) : principal; },
    cerrar() { for (const [id, c] of ctxs) if (id !== registro.principalId) { try { c.cache.close(); c.store.close?.(); } catch {} } },
    async rpc(name, args, user, header) {
      const activo = cookieDe(header) || registro.principalId;
      if (name === 'proyectosListar') {
        const lista = await registro.todos(), out = [];
        for (const p of lista) {
          let resumen = null; try { resumen = await resumenDe(await obtener(p.id)); } catch { resumen = null; }
          out.push({ id: p.id, nombre: p.nombre, empresa: p.empresa, etapa: p.etapa, etapa_nombre: ETAPA_NOMBRE[p.etapa], distrito: p.distrito || '', direccion: p.direccion || '', principal: !!p.principal, creado: p.creado || null, resumen });
        }
        return { value: { activo: lista.some(p => p.id === activo) ? activo : registro.principalId, proyectos: out, etapas: ETAPAS.map(id => ({ id, nombre: ETAPA_NOMBRE[id] })), empresas: EMPRESAS, puede_crear: user?.role === 'Gerente' } };
      }
      if (name === 'proyectoCrear') {
        const doc = await registro.reservar(args[0] || {}, user);
        await abrir(doc.id, { settings: { projectName: doc.nombre, companyName: doc.empresa, projectDistrict: doc.distrito, projectAddress: doc.direccion } });
        await registro.registrar(doc);
        return { value: { ok: true, proyecto: { id: doc.id, nombre: doc.nombre, etapa: doc.etapa } }, usar: doc.id };
      }
      if (name === 'proyectoUsar') {
        const id = String(args[0] || ''); const p = await registro.uno(id); if (!p) throw Error('El proyecto no existe.');
        await obtener(p.id);
        return { value: { ok: true, id: p.id, nombre: p.nombre }, usar: p.id };
      }
      if (name === 'proyectoEtapa') return { value: await registro.etapa(String(args[0] || ''), String(args[1] || ''), user, args[2]) };
      if (name === 'proyectoEditar') return { value: await registro.editar(String(args[0] || ''), args[1] || {}, user) };
      throw Error('Acción no válida.');
    },
  };
}

module.exports = { ProyectosRegistro, proyectosHub, resumenDe, cookieDe, limpiarNuevo, PROYECTOS_METHODS: METHODS, ETAPAS, ETAPA_NOMBRE, EMPRESAS, COOKIE };
