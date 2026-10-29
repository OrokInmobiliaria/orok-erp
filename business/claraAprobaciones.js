// R38 · Cadenas de aprobación de órdenes OC/OS del ERP ÖRÖK. Fuente única: el servidor y la pantalla usan este mismo archivo.
// Las reglas salen de la skill erp-orok-contabilidad (parámetro «aprobaciones»): la primera regla que calza define los pasos.
// Ninguna orden pasa a «Aprobada» (ni se emite al proveedor) sin todos los pasos aprobados por la persona asignada.
(function (root) {
  'use strict';
  const r2 = n => Math.round((+n || 0) * 100) / 100;
  const slug = s => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toUpperCase().slice(0, 40) || 'SIN-NOMBRE';
  const PRE_APROBACION = ['Borrador', 'En aprobación'];
  const POST_APROBACION = ['Aprobada', 'Enviada', 'Recibida', 'Facturada', 'Pagada', 'Cerrada'];

  // Misma huella que la pantalla usa para las firmas (canonical): si la orden cambia, la firma deja de valer.
  function canonical(o, igvRate) {
    const sub = r2((o.items || []).reduce((a, i) => a + r2((+i.cant || 0) * (+i.pu || 0)), 0));
    const igv = o.igv ? r2(sub * igvRate) : 0, total = r2(sub + igv + (+o.otros || 0));
    return JSON.stringify({ e: o.empresa, t: o.tipo, n: o.n, f: o.fecha, p: o.proveedor, c: o.comprobante, m: o.moneda, i: o.igv, d: o.detraccion_pct, it: (o.items || []).map(i => [i.descripcion, i.unidad, +i.cant, +i.pu]), pr: o.proyecto, pa: o.partida, co: o.condiciones, tot: total.toFixed(2) });
  }
  // Contenido que se bloquea desde que la orden entra a aprobación (incluye entrega y observaciones del documento).
  function contenido(o, igvRate) { return canonical(o, igvRate) + '|' + JSON.stringify(o.destino || {}) + '|' + String(o.obs || ''); }
  function totalOrden(o, igvRate) { const sub = r2((o.items || []).reduce((a, i) => a + r2((+i.cant || 0) * (+i.pu || 0)), 0)); return r2(sub + (o.igv ? r2(sub * igvRate) : 0) + (+o.otros || 0)); }

  function proyectoDe(o, proyectos) {
    const n = slug(o.proyecto); if (!o.proyecto) return null;
    return (proyectos || []).find(p => !p.eliminado && p.empresa === o.empresa && (slug(p.nombre) === n || p.id === o.proyecto_id)) || null;
  }
  function reglaPara(o, proyecto, A) {
    const cumple = r => (!r.empresa || [].concat(r.empresa).includes(o.empresa))
      && (!r.tipos || (proyecto && r.tipos.includes(proyecto.tipo)))
      && (!r.modulo || (proyecto && (proyecto.modulos || []).includes(r.modulo)));
    return (A.reglas || []).find(cumple) || null;
  }
  // Devuelve los pasos con la persona asignada a cada cargo. «faltan» lista los cargos sin persona (la orden no puede enviarse).
  function cadena(o, proyectos, directorio, A) {
    const proyecto = proyectoDe(o, proyectos), errores = [];
    if ((A.requiere_proyecto || []).includes(o.empresa) && !proyecto) errores.push(o.proyecto ? `El proyecto «${o.proyecto}» no está registrado en ${o.empresa}: regístralo en Proyectos.` : `Las órdenes de ${o.empresa} deben indicar un proyecto registrado.`);
    const regla = reglaPara(o, proyecto, A);
    if (!regla) { errores.push('Ninguna regla de aprobación aplica a esta orden. Revisa la skill erp-orok-contabilidad.'); return { regla: null, proyecto, pasos: [], faltan: [], errores }; }
    const activos = (directorio || []).filter(d => d && d.activo !== false && d.user_id);
    const faltan = [], gerencia = esGerencia(o.solicitante, directorio, A);
    // Si la orden la elabora Gerencia, se omiten los pasos de jefatura (Jefe de Obra, Jefe de Proyecto, jefe de área).
    const pasosRegla = gerencia ? regla.pasos.filter(c => !(A.gerencia_omite || []).includes(c)) : regla.pasos;
    const pasos = pasosRegla.map(cargo => {
      let d = null;
      if (cargo === 'Jefe de Obra' && proyecto && proyecto.jefe_obra) d = activos.find(x => x.user_id === proyecto.jefe_obra) || null;
      else d = activos.find(x => ((x.cargos || {})[cargo] || []).includes(o.empresa)) || null;
      if (!d) faltan.push(cargo === 'Jefe de Obra' ? `Jefe de Obra del proyecto ${proyecto ? proyecto.nombre : '(sin proyecto)'} (o uno por defecto para ${o.empresa})` : `${cargo} de ${o.empresa}`);
      return { cargo, user_id: d ? d.user_id : '', nombre: d ? d.nombre : '', email: d ? d.email || '' : '', estado: 'pendiente' };
    });
    if (faltan.length) errores.push('Falta asignar: ' + faltan.join(', ') + '. Gerencia lo configura en Aprobaciones.');
    return { regla: (regla.nombre || '') + (gerencia && pasosRegla.length < regla.pasos.length ? ' · elaborada por Gerencia' : ''), proyecto, pasos, faltan, errores, omitidos: regla.pasos.filter(c => !pasosRegla.includes(c)) };
  }
  // Pasos que toca aprobar ahora. En modo secuencial, el primer pendiente y los siguientes consecutivos de la misma persona.
  function turno(ap, secuencial) {
    const pasos = (ap && ap.pasos) || [], i = pasos.findIndex(p => p.estado !== 'aprobado');
    if (i < 0) return [];
    if (!secuencial) return pasos.map((p, k) => k).filter(k => pasos[k].estado !== 'aprobado');
    const out = [i]; for (let k = i + 1; k < pasos.length && pasos[k].estado !== 'aprobado' && pasos[k].user_id && pasos[k].user_id === pasos[i].user_id; k++) out.push(k);
    return out;
  }
  const completa = ap => !!(ap && ap.pasos && ap.pasos.length && ap.pasos.every(p => p.estado === 'aprobado'));

  // ¿La orden viene de Gerencia? Área «Gerencia» o una persona con cargo de gerencia (Gerencia General u Operaciones) en cualquier empresa.
  function esGerencia(sol, directorio, A) {
    if (!sol) return false; if (sol.area === 'Gerencia') return true;
    const d = (directorio || []).find(x => x && x.user_id && x.user_id === sol.user_id && !x.eliminado);
    return !!(d && (d.area === 'Gerencia' || Object.entries(d.cargos || {}).some(([c, es]) => (A.cargos_gerencia || []).includes(c) && (es || []).length)));
  }
  // Vincula el equipo de la skill con los usuarios del CRM por nombre (sin tildes ni mayúsculas; nombre y apellido).
  const tokens = s => String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean);
  function coincide(nombreEquipo, nombreUsuario) {
    const a = tokens(nombreEquipo), b = tokens(nombreUsuario); if (!a.length || !b.length) return false;
    const [chico, grande] = a.length <= b.length ? [a, b] : [b, a];
    return chico.length >= 2 ? chico.every(t => grande.includes(t)) : false;
  }
  const API = { canonical, coincide, esGerencia, contenido, totalOrden, proyectoDe, reglaPara, cadena, turno, completa, slug, PRE_APROBACION, POST_APROBACION };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.APROB = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
