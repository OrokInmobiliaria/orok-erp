'use strict';
// R75 · Mejora 14: aprendizaje aprobado por Gerencia.
// Cada corrección humana a una IA del ERP (pieza de G.R.E.T.A rechazada o editada, enseñanza directa a L.O.L.A, etc.)
// se guarda como LECCIÓN PROPUESTA. Nada cambia hasta que Gerencia la aprueba. Las aprobadas se agregan a las
// instrucciones de cada IA (sirven igual con Claude, OpenAI o Gemini). Nada se borra: se rechaza o se archiva.
const { randomUUID } = require('node:crypto');
const now = () => new Date().toISOString();
const text = (v, n = 600) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, n);
const IAS = { lola: 'L.O.L.A', greta: 'G.R.E.T.A', mora: 'M.O.R.A', diava: 'D.I.A.V.A', todas: 'Todas las IAs' };
const ESTADOS = ['propuesta', 'aprobada', 'rechazada', 'archivada'];
class Lecciones {
  constructor(store) { this.store = store; this.col = store.ref.collection('ia_lecciones'); this.cache = null; this.cargando = null; }
  tx(fn) { return this.store.db.runTransaction(fn); }
  async todas() { return (await this.col.limit(2000).get()).docs.map(d => d.data()).sort((a, b) => String(b.creado).localeCompare(String(a.creado))); }
  async refrescar() { const rows = await this.todas(); this.cache = rows.filter(l => l.estado === 'aprobada'); return this.cache; }
  async aprobadas(ia) { if (!this.cache) { this.cargando = this.cargando || this.refrescar(); await this.cargando; this.cargando = null; } return this.cache.filter(l => l.ia === ia || l.ia === 'todas'); }
  // Texto para agregar a las instrucciones de una IA (máximo ~40 lecciones, las más recientes primero).
  async instrucciones(ia) {
    const ls = (await this.aprobadas(ia)).slice(0, 40); if (!ls.length) return '';
    return '\n\nLECCIONES APROBADAS POR GERENCIA (obligatorias; tienen prioridad sobre tu criterio):\n' + ls.map((l, i) => (i + 1) + '. ' + l.leccion).join('\n');
  }
  // Registrar una corrección. Evita duplicar la misma lección propuesta.
  async proponer(input, user) {
    const ia = IAS[input?.ia] ? input.ia : null; if (!ia) throw Error('IA no válida.');
    const leccion = text(input?.leccion, 500); if (leccion.length < 8) throw Error('Escribe la lección (qué debe hacer o evitar la IA).');
    const prev = (await this.todas()).find(l => l.estado === 'propuesta' && l.ia === ia && l.leccion.toLowerCase() === leccion.toLowerCase());
    if (prev) return prev;
    const l = { id: randomUUID(), ia, leccion, origen: text(input?.origen, 80) || 'manual', contexto: text(input?.contexto, 600), antes: text(input?.antes, 800), despues: text(input?.despues, 800),
      estado: 'propuesta', creado: now(), por: text(user?.name, 120) || 'Sistema' };
    await this.tx(async tx => { tx.set(this.col.doc(l.id), l); }); return l;
  }
  async decidir(input, user) {
    if (user.role !== 'Gerente') throw Error('Solo Gerencia aprueba lecciones.');
    const ids = (Array.isArray(input?.ids) ? input.ids : [input?.id]).map(x => text(x, 60)).filter(Boolean).slice(0, 200), estado = input?.estado;
    if (!ESTADOS.includes(estado) || estado === 'propuesta') throw Error('Decisión no válida.');
    let n = 0;
    for (const id of ids) { const ref = this.col.doc(id), cur = (await ref.get()).data(); if (!cur) continue;
      const next = { ...cur, estado, decidido: now(), decidido_por: text(user.name, 120) }; if (input?.leccion && ids.length === 1) next.leccion = text(input.leccion, 500); if (input?.ia && IAS[input.ia] && ids.length === 1) next.ia = input.ia;
      await this.tx(async tx => { tx.set(ref, next); }); n++; }
    await this.refrescar(); return { actualizadas: n };
  }
  async rpc(name, args, user) {
    const a = args?.[0] || {};
    if (name === 'leccionesLista') { if (user.role !== 'Gerente') throw Error('Solo Gerencia revisa las lecciones.'); const rows = await this.todas(); return { lecciones: rows.slice(0, 500), ias: IAS, pendientes: rows.filter(l => l.estado === 'propuesta').length }; }
    if (name === 'leccionProponer') return this.proponer(a, user);
    if (name === 'leccionDecidir') return this.decidir(a, user);
    throw Error('Operación no reconocida.');
  }
}
const LECCIONES_METHODS = ['leccionesLista', 'leccionProponer', 'leccionDecidir'];
module.exports = { Lecciones, LECCIONES_METHODS, IAS };
