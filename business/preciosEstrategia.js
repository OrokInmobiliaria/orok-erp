'use strict';
// R48 · Estrategia de precios dentro del ERP (Ventas › Estrategia de precios).
// - La línea base (lista Etapa 1, meta de recaudación, etapas, feria) se importa del Excel de estrategia o se edita en pantalla.
// - El avance real sale SOLO de las separaciones y ventas del CRM; no se escribe a mano.
// - El cálculo propone; Gerencia aprueba. Aplicar precios cambia el precio de lista de las unidades y deja historial.
// - M.O.R.A (Evaluador) recibe el estado en su feed de ventas para comparar real contra línea base.
const { randomUUID } = require('node:crypto');

const OPEN = new Set(['ACTIVE', 'CONFIRMED', 'RESERVED', 'SOLD']); // ACTIVE = reserva en curso: la unidad ya está comprometida
const now = () => new Date().toISOString();
const text = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const num = (v, lo = -1e12, hi = 1e12) => { const n = Number(v); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };
const round100 = n => Math.round(n / 100) * 100;
const pct = n => Math.round(n * 10000) / 100;
// «D101_2», «101», «Dpto 101» → «101»: mismo criterio que usa el resto del CRM para los números de unidad.
const unitKey = v => { const m = String(v ?? '').match(/(\d{3,4})/); return m ? m[1] : String(v ?? '').trim(); };
const METHODS = ['preciosEstrategia', 'preciosEstrategiaGuardar', 'preciosHistorial', 'preciosOfertaFeria'];
const MODALIDADES = { preventa: 'Preventa en planos', reserva: 'Reserva fuera de preventa' };

// ---------- Estudio de mercado del Evaluador (M.O.R.A) ----------
// Los comparables que el Evaluador barrió (Urbania, Adondevivir, Nexo…) se agrupan por dormitorios y tamaño para dar a cada
// unidad un S/ por m² de referencia de proyectos parecidos. Mismo criterio que el Evaluador: S/ por m² entre 1,500 y 30,000,
// sin usados salvo que el estudio los incluya, y los avisos (no vendidos) con el descuento de negociación aplicado.
const dormDe = tipo => { const t = String(tipo || ''); const m = t.match(/(\d)\s*D(?:orm|\b)/i); if (m) return Math.min(4, Number(m[1])); if (/loft|estudio|monoambiente/i.test(t)) return 1; return null; };
const quant = (arr, q) => { if (!arr.length) return null; const a = [...arr].sort((x, y) => x - y), i = (a.length - 1) * q, lo = Math.floor(i); return a[lo] + (a[Math.ceil(i)] - a[lo]) * (i - lo); };
const stats = arr => ({ n: arr.length, mediana: arr.length ? Math.round(quant(arr, .5)) : null, p25: arr.length ? Math.round(quant(arr, .25)) : null, p75: arr.length ? Math.round(quant(arr, .75)) : null });
function comparablesDe(ws) {
  const mk = ws?.mercado; if (!mk || !Array.isArray(mk.comps)) return [];
  const tc = Number(mk.tc) || 0, neg = (Number(mk.descNeg) || 0) / 100;
  return mk.comps.map(c => {
    const area = Number(c.area) || 0, precio = (Number(c.precio) || 0) * (c.moneda === 'USD' ? tc : 1);
    const pm2raw = area ? precio / area : 0, dmin = c.dmin ?? c.dorm_min, dmax = c.dmax ?? c.dorm_max;
    return { nombre: text(c.nombre, 80), area, estado: c.estado || 'venta', dorm: dmin != null && dmin === dmax ? Math.min(4, Number(dmin)) : null, pm2: c.estado === 'vendido' ? pm2raw : pm2raw * (1 - neg), incluido: c.excluido !== true && c.incluir !== false };
  }).filter(c => c.incluido && c.pm2 >= 1500 && c.pm2 <= 30000 && (mk.inclUsados || c.estado !== 'usado'));
}
function referenciaMercado(comps, u) {
  if (!comps.length) return null;
  const dorm = dormDe(u.tipo), cerca = c => c.area >= u.area * 0.8 && c.area <= u.area * 1.2;
  const niveles = [
    [dorm != null && `${dorm === 4 ? '4+' : dorm} dorm. y ${Math.round(u.area * .8)}–${Math.round(u.area * 1.2)} m²`, c => c.dorm === dorm && cerca(c)],
    [dorm != null && `${dorm === 4 ? '4+' : dorm} dormitorio${dorm === 1 ? '' : 's'}`, c => c.dorm === dorm],
    [`${Math.round(u.area * .8)}–${Math.round(u.area * 1.2)} m²`, cerca],
    ['Todo el estudio', () => true],
  ];
  for (const [label, f] of niveles) { if (!label) continue; const set = comps.filter(f).map(c => c.pm2); if (set.length >= 3 || label === 'Todo el estudio') return { criterio: label, ...stats(set) }; }
  return null;
}
function resumenMercado(ev) {
  const comps = comparablesDe(ev?.workspace);
  const grupo = (label, f) => ({ grupo: label, ...stats(comps.filter(f).map(c => c.pm2)) });
  return { evaluacion: ev?.id || null, proyecto: ev?.project?.nombre || '', actualizado: ev?.updated_at || null, distrito: text(ev?.workspace?.mercado?.distrito, 60), comparables: comps.length,
    sugerido_m2: ev?.analysis?.mercado?.precio_sugerido_m2 ?? null, rango_m2: ev?.analysis?.mercado?.rango_m2 || null,
    por_dormitorios: [1, 2, 3, 4].map(d => grupo(d === 4 ? '4 o más dorm.' : d + ' dorm.', c => c.dorm === d)).filter(g => g.n),
    por_tamano: [[0, 50, 'Hasta 50 m²'], [50, 65, '50–65 m²'], [65, 80, '65–80 m²'], [80, 1e9, 'Más de 80 m²']].map(([a, b, l]) => grupo(l, c => c.area >= a && c.area < b)).filter(g => g.n), comps };
}

function limpiarConfig(input = {}) {
  const unidades = (Array.isArray(input.unidades) ? input.unidades : []).map(u => ({
    unidad: unitKey(u.unidad), codigo: text(u.codigo || u.unidad, 40), tipo: text(u.tipo, 60), piso: num(u.piso, -5, 200),
    area: num(u.area, 1, 100000), precio_base: num(u.precio_base, 1, 1e9), ancla: u.ancla === true || /^s[ií]$/i.test(String(u.ancla || '')),
  })).filter(u => u.unidad && u.area && u.precio_base);
  if (!unidades.length) throw Error('La estrategia necesita al menos una unidad con área y precio de la Etapa 1.');
  if (new Set(unidades.map(u => u.unidad)).size !== unidades.length) throw Error('Hay unidades repetidas en la estrategia.');
  const etapas = (Array.isArray(input.etapas) && input.etapas.length ? input.etapas : [{ nombre: 'Etapa 1', alza: 0, umbral: 0 }]).map((e, i) => ({
    nombre: text(e.nombre || 'Etapa ' + (i + 1), 40), alza: num(e.alza, -0.5, 2) ?? 0, umbral: i === 0 ? 0 : (num(e.umbral, 0, 1) ?? 1),
  }));
  for (let i = 1; i < etapas.length; i++) if (etapas[i].umbral < etapas[i - 1].umbral) throw Error('Los umbrales de las etapas deben ir de menor a mayor.');
  const meta = num(input.meta_recaudacion, 1, 1e11);
  if (!meta) throw Error('Indica la meta de recaudación.');
  const f = input.feria || {};
  const reparto = (Array.isArray(f.reparto) ? f.reparto : [0.3, 0.4, 0.3]).slice(0, 3).map(x => num(x, 0, 1) ?? 0);
  return {
    proyecto: text(input.proyecto || 'Proyecto', 120), meta_recaudacion: meta,
    linea_base: num(input.linea_base, 1, 1e11) || meta, objetivo_superar_pct: num(input.objetivo_superar_pct, 0, 1) ?? 0.03,
    unidades, etapas,
    feria: {
      activa: f.activa !== false && !!f.fecha_inicio, fecha_inicio: /^\d{4}-\d{2}-\d{2}$/.test(String(f.fecha_inicio || '')) ? f.fecha_inicio : '',
      // Los cupos sirven para CUALQUIER unidad: el comprador elige. Las «ancla» solo son sugeridas para el stand.
      preventa: { descuento: num(f.preventa?.descuento ?? f.descuento_cupo, 0, 1e8) ?? 0, cupos: Math.round(num(f.preventa?.cupos ?? f.cupos, 0, 1000) ?? 0), condicion: text(f.preventa?.condicion || 'Separación del 1 % y firma de preventa en planos', 160) },
      reserva: { descuento: num(f.reserva?.descuento, 0, 1e8) ?? 0, cupos: Math.round(num(f.reserva?.cupos, 0, 1000) ?? 0), condicion: text(f.reserva?.condicion || 'Separación de S/ 1,500', 160) },
      reparto,
      metas: Object.fromEntries(['preventas', 'reservas', 'calificados', 'citas'].map(k => [k, Math.round(num(f.metas?.[k], 0, 100000) ?? 0)])),
      tasa_cierre: num(f.tasa_cierre, 0, 1) ?? 0.1,
    },
    fuente: { tipo: text(input.fuente?.tipo || 'manual', 20), nombre: text(input.fuente?.nombre, 160) },
    // Estudio de mercado: «referencia» solo compara; «tope» no deja que el sugerido pase el percentil 75 de proyectos parecidos.
    mercado: { evaluacion_id: /^[a-zA-Z0-9_-]{1,100}$/.test(String(input.mercado?.evaluacion_id || '')) ? input.mercado.evaluacion_id : '', modo: input.mercado?.modo === 'tope' ? 'tope' : 'referencia' },
  };
}

// Proyección de lo que falta vender recorriendo la escalera de etapas por valor de lista vendido (el mismo criterio del Excel:
// la Etapa 2 se activa al vender el X % del valor de la lista). No depende del orden en que se vendan las unidades.
function proyectarRestante(etapas, listaTotal, vendidoLista) {
  let desde = vendidoLista, valor = 0; const tramos = [];
  for (let i = 0; i < etapas.length; i++) {
    const ini = etapas[i].umbral * listaTotal, fin = i + 1 < etapas.length ? etapas[i + 1].umbral * listaTotal : listaTotal;
    const a = Math.max(desde, ini), b = Math.max(a, fin);
    if (b > a) { const v = (b - a) * (1 + etapas[i].alza); valor += v; tramos.push({ etapa: etapas[i].nombre, lista: b - a, valor: v }); desde = b; }
  }
  return { valor, tramos };
}

function calcular(cfg, data = {}, hoy = new Date(), mercado = null) {
  const units = new Map((data.units || []).map(u => [unitKey(u.unit_number), u]));
  const byUnitId = new Map((data.units || []).map(u => [u.id, unitKey(u.unit_number)]));
  const ventas = new Map(), quotes = new Map((data.quotes || []).map(q => [q.id, q]));
  for (const s of data.separations || []) {
    const status = String(s.status || '').toUpperCase(); if (!OPEN.has(status)) continue;
    const k = byUnitId.get(s.unit_id); if (!k) continue;
    const fecha = s.sold_at || s.confirmed_at || s.created_at || '';
    const q = quotes.get(s.quote_id), modalidad = MODALIDADES[q?.feria_modalidad] ? q.feria_modalidad : '';
    const prev = ventas.get(k); if (!prev || String(fecha) > String(prev.fecha)) ventas.set(k, { precio: Number(s.final_price || 0), fecha, estado: status === 'SOLD' ? 'Venta' : 'Separación', codigo: s.code || '', modalidad });
  }
  for (const [k, u] of units) if (!ventas.has(k) && (u.sold_lead_id || /^(SOLD|VENDID[OA]|VENTA)$/i.test(String(u.status || '')))) ventas.set(k, { precio: Number(u.sold_amount || u.price || 0), fecha: u.sold_at || '', estado: 'Venta', codigo: '' });

  const listaTotal = cfg.unidades.reduce((a, u) => a + u.precio_base, 0), areaTotal = cfg.unidades.reduce((a, u) => a + u.area, 0);
  let vendidoLista = 0, recaudado = 0, areaVendida = 0;
  const vendidas = [];
  for (const u of cfg.unidades) { const v = ventas.get(u.unidad); if (v) { vendidoLista += u.precio_base; recaudado += v.precio || u.precio_base; areaVendida += u.area; vendidas.push({ ...u, ...v, precio: v.precio || u.precio_base }); } }
  const avance = listaTotal ? vendidoLista / listaTotal : 0;
  let activa = 0; cfg.etapas.forEach((e, i) => { if (avance >= e.umbral) activa = i; });
  const etapa = cfg.etapas[activa];

  // Feria: cada venta separada con la oferta de feria (registrada en su cotización) consume un cupo de su modalidad.
  // Si una venta antigua no tiene modalidad, se clasifica por el descuento que recibió frente a su lista Etapa 1.
  const f = cfg.feria, inicio = f.fecha_inicio ? new Date(f.fecha_inicio + 'T00:00:00-05:00') : null;
  const fin = inicio ? new Date(inicio.getTime() + 3 * 86400000) : null;
  const modalidadDe = v => v.modalidad || (v.precio_base - v.precio >= f.preventa.descuento * 0.9 && f.preventa.descuento > 0 ? 'preventa' : v.precio < v.precio_base - 1 && f.reserva.descuento > 0 ? 'reserva' : '');
  const usados = { preventa: vendidas.filter(v => modalidadDe(v) === 'preventa').length, reserva: vendidas.filter(v => modalidadDe(v) === 'reserva').length };
  const cuposUsados = usados.preventa;
  const feriaVigente = !!(f.activa && fin && hoy < fin);
  const restantes = m => f[m].cupos ? Math.max(0, f[m].cupos - usados[m]) : 0;
  const descuentoPendiente = feriaVigente ? restantes('preventa') * f.preventa.descuento + restantes('reserva') * f.reserva.descuento : 0;

  const restante = proyectarRestante(cfg.etapas, listaTotal, vendidoLista);
  const proyectado = recaudado + restante.valor - descuentoPendiente;
  const escenario = (nombre, objetivo) => {
    const falta = objetivo - recaudado, base = restante.valor - descuentoPendiente;
    const ajuste = base > 0 ? falta / base - 1 : 0, areaRest = areaTotal - areaVendida;
    return { nombre, objetivo, diferencia_proyectada: Math.round(proyectado - objetivo), ajuste_pct: pct(ajuste), ratio_necesario_m2: areaRest > 0 ? Math.round(falta / areaRest) : 0, alcanzable_sin_ajuste: proyectado >= objetivo };
  };
  const escenarios = [escenario('Meta de recaudación', cfg.meta_recaudacion), escenario('Línea base del modelo', cfg.linea_base), escenario('Superar la meta', cfg.meta_recaudacion * (1 + cfg.objetivo_superar_pct))];
  const ajusteMeta = Math.max(0, escenarios[0].ajuste_pct / 100);

  const comps = mercado?.comps || [], tope = cfg.mercado?.modo === 'tope';
  const unidades = cfg.unidades.map(u => {
    const erp = units.get(u.unidad), v = ventas.get(u.unidad), ref = referenciaMercado(comps, u);
    const precioEtapa = round100(u.precio_base * (1 + etapa.alza));
    let sugerido = v ? null : round100(precioEtapa * (1 + ajusteMeta)), topado = false;
    if (sugerido && tope && ref?.p75 && sugerido > ref.p75 * u.area) { sugerido = round100(ref.p75 * u.area); topado = true; }
    const actual = Number(erp?.price || 0), ratio = sugerido ? Math.round(sugerido / u.area) : null;
    const posicion = !ref?.mediana || !ratio ? null : ratio > (ref.p75 || ref.mediana) ? 'Sobre el mercado' : ratio < (ref.p25 || ref.mediana) ? 'Bajo el mercado' : 'En rango de mercado';
    return { unidad: u.unidad, codigo: u.codigo, tipo: u.tipo, dormitorios: dormDe(u.tipo), piso: u.piso, area: u.area, ancla: u.ancla, precio_base: u.precio_base, en_erp: !!erp,
      mercado: ref ? { criterio: ref.criterio, n: ref.n, mediana_m2: ref.mediana, p25_m2: ref.p25, p75_m2: ref.p75, precio_mediana: ref.mediana ? round100(ref.mediana * u.area) : null } : null, posicion_mercado: posicion, topado_por_mercado: topado,
      precio_actual: actual || null, precio_etapa: precioEtapa, precio_sugerido: sugerido, ratio_sugerido_m2: ratio,
      diferencia_vs_actual: sugerido && actual ? sugerido - actual : null, estado: v ? v.estado : 'Disponible', precio_real: v ? v.precio : null, fecha: v ? String(v.fecha).slice(0, 10) : '' };
  });

  // Curva: lo esperado por la línea base para las mismas unidades vendidas contra lo realmente recaudado, en orden de venta.
  let accBase = 0, accReal = 0;
  const curva = vendidas.sort((a, b) => String(a.fecha).localeCompare(String(b.fecha))).map((v, i) => { accBase += v.precio_base * (1 + (cfg.etapas[0].alza || 0)); accReal += v.precio; return { n: i + 1, unidad: v.unidad, fecha: String(v.fecha).slice(0, 10), base: Math.round(accBase), real: Math.round(accReal) }; });

  let feria = null;
  if (f.activa && inicio) {
    const dias = [0, 1, 2].map(i => new Date(inicio.getTime() + i * 86400000).toISOString().slice(0, 10));
    const enDia = (iso, d) => String(iso || '').slice(0, 10) === d;
    const leads = data.leads || [];
    const calificadoSet = new Set(['Calificado', 'Cita', 'Cita Asistida', 'Evaluación GNB', 'Separación', 'Inicial', 'Minuta', 'Venta']);
    const real = dias.map(d => ({
      dia: d,
      preventas: (data.separations || []).filter(s => ['CONFIRMED', 'SOLD'].includes(String(s.status).toUpperCase()) && enDia(s.confirmed_at, d)).length,
      reservas: (data.separations || []).filter(s => ['ACTIVE', 'DRAFT', 'RESERVED'].includes(String(s.status).toUpperCase()) && enDia(s.created_at, d)).length,
      calificados: leads.filter(l => calificadoSet.has(l.status) && enDia(l.received_at || l.created_at, d)).length,
      citas: leads.reduce((a, l) => a + (l.appointments || []).filter(x => enDia(x.scheduled_at, d)).length, 0),
    }));
    const total = k => real.reduce((a, r) => a + r[k], 0);
    feria = { fecha_inicio: f.fecha_inicio, fecha_fin: dias[2], vigente: feriaVigente, dias, cupos: f.preventa.cupos, cupos_usados: cuposUsados, descuento_cupo: f.preventa.descuento, descuento_pendiente: descuentoPendiente,
      ofertas: Object.keys(MODALIDADES).map(m => ({ modalidad: m, nombre: MODALIDADES[m], descuento: f[m].descuento, condicion: f[m].condicion, cupos: f[m].cupos, usados: usados[m], restantes: restantes(m) })),
      metas: Object.fromEntries(Object.entries(f.metas).map(([k, m]) => [k, { meta: m, real: total(k), por_dia: f.reparto.map((p, i) => ({ meta: Math.round(m * p), real: real[i][k] })) }])),
      cierres_esperados: Math.round(f.metas.calificados * f.tasa_cierre * 10) / 10 };
  }

  const unidadesVend = vendidas.map(v => ({ unidad: v.unidad, modalidad: modalidadDe(v) }));
  return {
    generado: now(), proyecto: cfg.proyecto, fuente: cfg.fuente, ventas_feria: unidadesVend,
    meta_recaudacion: cfg.meta_recaudacion, linea_base: cfg.linea_base,
    lista_etapa1: listaTotal, area_total: Math.round(areaTotal * 100) / 100, ratio_lista_m2: areaTotal ? Math.round(listaTotal / areaTotal) : 0,
    unidades_total: cfg.unidades.length, unidades_vendidas: vendidas.length, avance_valor_pct: pct(avance),
    etapa_activa: etapa.nombre, siguiente_etapa: cfg.etapas[activa + 1] ? { nombre: cfg.etapas[activa + 1].nombre, umbral_pct: pct(cfg.etapas[activa + 1].umbral), falta_lista: Math.max(0, Math.round(cfg.etapas[activa + 1].umbral * listaTotal - vendidoLista)) } : null,
    etapas: cfg.etapas.map(e => ({ ...e, alza_pct: pct(e.alza), umbral_pct: pct(e.umbral) })),
    recaudado: Math.round(recaudado), restante_proyectado: Math.round(restante.valor), tramos: restante.tramos.map(t => ({ ...t, lista: Math.round(t.lista), valor: Math.round(t.valor) })),
    proyectado: Math.round(proyectado), brecha_vs_meta: Math.round(proyectado - cfg.meta_recaudacion), brecha_vs_linea_base: Math.round(proyectado - cfg.linea_base),
    escenarios, ajuste_sugerido_pct: pct(ajusteMeta), unidades, curva, feria,
    mercado: mercado ? { ...mercado, comps: undefined, modo: cfg.mercado?.modo || 'referencia' } : null,
  };
}

// Lo que el vendedor puede ofrecer hoy (cualquier rol): descuento por modalidad y cupos que quedan. No expone metas ni márgenes.
function ofertaFeria(cfg, data = {}, hoy = new Date()) {
  if (!cfg) return { vigente: false, ofertas: [] };
  const c = calcular(cfg, data, hoy);
  if (!c.feria?.vigente) return { vigente: false, ofertas: [], fecha_inicio: c.feria?.fecha_inicio || '' };
  return { vigente: true, fecha_inicio: c.feria.fecha_inicio, fecha_fin: c.feria.fecha_fin,
    ofertas: c.feria.ofertas.filter(o => o.descuento > 0 && (o.cupos === 0 || o.restantes > 0)).map(o => ({ modalidad: o.modalidad, nombre: o.nombre, descuento: o.descuento, condicion: o.condicion, cupos_restantes: o.cupos ? o.restantes : null })) };
}

class PreciosEstrategia {
  constructor(store) { this.store = store; this.col = store.db.collection('ventas_precios'); }
  ref() { return this.col.doc('estrategia'); }
  async config() { return (await this.ref().get()).data() || null; }
  gerente(user) { if (user?.role !== 'Gerente') throw Error('La estrategia de precios es solo para Gerencia.'); }
  // Evaluación del Evaluador (M.O.R.A) que alimenta el estudio de mercado: la elegida, o la activa más reciente del mismo proyecto.
  async evaluaciones() { try { return (await this.store.db.collection('mora_evaluations').get()).docs.map(x => x.data()).filter(e => e && e.active !== false); } catch { return []; } }
  async mercado(cfg) {
    const evs = await this.evaluaciones(); if (!evs.length) return null;
    const norm = v => String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const ev = evs.find(e => e.id === cfg?.mercado?.evaluacion_id) || evs.filter(e => norm(e.project?.nombre).includes(norm(cfg?.proyecto)) || norm(cfg?.proyecto).includes(norm(e.project?.nombre))).sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))[0];
    return ev ? resumenMercado(ev) : null;
  }
  async estado(user, d) {
    this.gerente(user);
    const doc = await this.config();
    const evs = (await this.evaluaciones()).map(e => ({ id: e.id, nombre: e.project?.nombre || e.id, actualizado: e.updated_at, comparables: comparablesDe(e.workspace).length }));
    if (!doc) return { configurada: false, evaluaciones: evs };
    return { configurada: true, revision: doc.revision, actualizado: doc.updated_at, por: doc.updated_by, config: doc.config, calculo: calcular(doc.config, d, new Date(), await this.mercado(doc.config)), aplicaciones: (doc.aplicaciones || []).slice(-10).reverse(), evaluaciones: evs };
  }
  async guardar(input, user, d) {
    this.gerente(user);
    const config = limpiarConfig(input?.config || input);
    const rev = Number(input?.revision || 0);
    const out = await this.store.db.runTransaction(async tx => {
      const ref = this.ref(), old = (await tx.get(ref)).data();
      if (old && rev && rev !== old.revision) throw Error('Otra persona cambió la estrategia. Actualiza antes de guardar.');
      const doc = { ...(old || {}), config, revision: (old?.revision || 0) + 1, updated_at: now(), updated_by: user.name,
        cambios: [...(old?.cambios || []), { at: now(), by: user.name, fuente: config.fuente }].slice(-30) };
      tx.set(ref, doc); return doc;
    });
    return { ok: true, revision: out.revision, calculo: calcular(config, d, new Date(), await this.mercado(config)) };
  }
  // Se ejecuta dentro de la transacción principal del CRM (mismo documento que unidades y separaciones).
  aplicarEnDatos(d, doc, seleccion, user, mercado = null) {
    this.gerente(user);
    if (!doc?.config) throw Error('Primero guarda la estrategia de precios.');
    const calc = calcular(doc.config, d, new Date(), mercado), want = new Set((Array.isArray(seleccion) ? seleccion : []).map(unitKey));
    const cambios = [];
    for (const u of calc.unidades) {
      if (!u.precio_sugerido || !u.en_erp || (want.size && !want.has(u.unidad))) continue;
      const unit = (d.units || []).find(x => unitKey(x.unit_number) === u.unidad);
      if (!unit || /^(SOLD|VENDID[OA]|VENTA)$/i.test(String(unit.status || ''))) continue;
      if (Number(unit.price || 0) === u.precio_sugerido) continue;
      cambios.push({ unidad: u.unidad, antes: Number(unit.price || 0), despues: u.precio_sugerido });
      unit.price = u.precio_sugerido; unit.price_updated_at = now(); unit.price_updated_by = user.name; unit.price_source = 'Estrategia de precios · ' + calc.etapa_activa;
    }
    if (!cambios.length) throw Error('No hay precios por cambiar: las unidades ya tienen el precio sugerido.');
    return { id: randomUUID(), at: now(), by: user.name, etapa: calc.etapa_activa, ajuste_pct: calc.ajuste_sugerido_pct, revision: doc.revision, cambios };
  }
  async registrarAplicacion(ap) {
    await this.store.db.runTransaction(async tx => { const ref = this.ref(), doc = (await tx.get(ref)).data() || {}; tx.set(ref, { ...doc, aplicaciones: [...(doc.aplicaciones || []), ap].slice(-100) }); });
  }
  async oferta(d) { return ofertaFeria((await this.config())?.config, d); }
  async historial(user) { this.gerente(user); return ((await this.config())?.aplicaciones || []).slice().reverse(); }
  // Para el Evaluador (M.O.R.A): resumen real vs línea base, sin precios por unidad.
  async paraMora(d) {
    const doc = await this.config(); if (!doc?.config) return null;
    const c = calcular(doc.config, d);
    return { schema: 'ventas.precios@1', etapa_activa: c.etapa_activa, avance_valor_pct: c.avance_valor_pct, recaudado: c.recaudado, proyectado: c.proyectado,
      meta_recaudacion: c.meta_recaudacion, linea_base: c.linea_base, brecha_vs_meta: c.brecha_vs_meta, ajuste_sugerido_pct: c.ajuste_sugerido_pct, curva: c.curva };
  }
  async rpc(name, args, user, readData) {
    if (name === 'preciosEstrategia') return this.estado(user, await readData());
    if (name === 'preciosEstrategiaGuardar') return this.guardar(args[0] || {}, user, await readData());
    if (name === 'preciosHistorial') return this.historial(user);
    if (name === 'preciosOfertaFeria') return ofertaFeria((await this.config())?.config, await readData());
    throw Error('Acción no válida.');
  }
}

module.exports = { PreciosEstrategia, PRECIOS_METHODS: METHODS, calcular, limpiarConfig, proyectarRestante, unitKey, ofertaFeria, MODALIDADES, resumenMercado, referenciaMercado, comparablesDe, dormDe };
