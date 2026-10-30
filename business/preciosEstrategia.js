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
const METHODS = ['preciosCocheras', 'preciosEstrategia', 'preciosEstrategiaGuardar', 'preciosHistorial', 'preciosOfertaFeria', 'precioSolicitar', 'precioSolicitudes', 'precioDecidir'];
const VIGENCIA_DIAS = 7, ESTADOS = ['pendiente', 'aprobada', 'rechazada', 'observada', 'usada', 'vencida'];
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

// R49 · Ajuste manual por unidad o cochera: «pct» sobre el precio de la etapa activa (+0.03 = +3 %, −0.05 = −5 %) o «precio» fijo.
// Lo manual queda fuera del ajuste automático; el resto se recalcula para llegar a la meta.
const limpiarManual = m => {
  if (!m || typeof m !== 'object') return null;
  if (m.modo === 'pct') { const v = num(m.valor, -0.5, 0.5); return v == null ? null : { modo: 'pct', valor: Math.round(v * 1e6) / 1e6 }; }
  if (m.modo === 'precio') { const v = num(m.valor, 1, 1e9); return v ? { modo: 'precio', valor: Math.round(v) } : null; }
  return null;
};
// Estacionamientos del proyecto. Antes de R49 la cotización usaba S/ 56,000 fijos para A–D: ese es el valor por defecto.
const PRECIO_COCHERA_LEGADO = 56000;
const COCHERAS_DEFECTO = ['A', 'B', 'C', 'D'].map(codigo => ({ codigo, precio_base: PRECIO_COCHERA_LEGADO, manual: null }));
const cocherasDe = cfg => Array.isArray(cfg?.cocheras) ? cfg.cocheras : COCHERAS_DEFECTO;
// Estacionamientos comprometidos: los de cotizaciones con separación abierta (reserva, separación o venta).
function cocherasOcupadas(data = {}) {
  const quotes = new Map((data.quotes || []).map(q => [q.id, q])), out = new Map();
  for (const s of data.separations || []) {
    if (!OPEN.has(String(s.status || '').toUpperCase())) continue;
    const q = quotes.get(s.quote_id), cod = q?.parking && q.parking !== 'Ninguno' ? String(q.parking) : '';
    if (!cod) continue;
    const fecha = s.sold_at || s.confirmed_at || s.created_at || '', pp = Number(q.parking_price || PRECIO_COCHERA_LEGADO), lp = Number(q.price || 0), fp = Number(s.final_price || 0);
    const parte = lp > 0 && fp > 0 ? Math.round(pp * fp / lp) : pp, prev = out.get(cod);
    if (!prev || String(fecha) > String(prev.fecha)) out.set(cod, { precio: parte, fecha, estado: String(s.status).toUpperCase() === 'SOLD' ? 'Venta' : 'Separación', codigo: s.code || '', modalidad: '', separacion: s.id });
  }
  return out;
}

function limpiarConfig(input = {}) {
  const unidades = (Array.isArray(input.unidades) ? input.unidades : []).map(u => ({
    unidad: unitKey(u.unidad), codigo: text(u.codigo || u.unidad, 40), tipo: text(u.tipo, 60), piso: num(u.piso, -5, 200),
    area: num(u.area, 1, 100000), precio_base: num(u.precio_base, 1, 1e9), ancla: u.ancla === true || /^s[ií]$/i.test(String(u.ancla || '')), manual: limpiarManual(u.manual), precio_erp: num(u.precio_erp, 1, 1e9),
  })).filter(u => u.unidad && u.area && u.precio_base);
  if (!unidades.length) throw Error('La estrategia necesita al menos una unidad con área y precio de la Etapa 1.');
  if (new Set(unidades.map(u => u.unidad)).size !== unidades.length) throw Error('Hay unidades repetidas en la estrategia.');
  const etIn = Array.isArray(input.etapas) && input.etapas.length ? input.etapas : [{ nombre: 'Etapa 1', alza: 0, umbral: 0 }];
  // R49 · «avance» (solo con ancla ERP): 0 = precio Etapa 1 (oferta de preventa), 1 = precio ERP congelado; 0.5 = a mitad de camino.
  const etapas = etIn.map((e, i) => ({
    nombre: text(e.nombre || 'Etapa ' + (i + 1), 40), alza: num(e.alza, -0.5, 2) ?? 0, umbral: i === 0 ? 0 : (num(e.umbral, 0, 1) ?? 1),
    avance: i === 0 ? 0 : (num(e.avance, 0, 1.5) ?? (etIn.length > 1 ? Math.round(i / (etIn.length - 1) * 1000) / 1000 : 1)),
  }));
  for (let i = 1; i < etapas.length; i++) if (etapas[i].umbral < etapas[i - 1].umbral) throw Error('Los umbrales de las etapas deben ir de menor a mayor.');
  const cocheras = (Array.isArray(input.cocheras) ? input.cocheras : COCHERAS_DEFECTO).map(c => ({ codigo: text(c.codigo, 10).toUpperCase(), precio_base: num(c.precio_base, 1, 1e8), manual: limpiarManual(c.manual), precio_erp: num(c.precio_erp, 1, 1e8) }))
    .filter(c => /^[A-Z0-9-]{1,10}$/.test(c.codigo) && c.precio_base);
  if (new Set(cocheras.map(c => c.codigo)).size !== cocheras.length) throw Error('Hay estacionamientos repetidos en la estrategia.');
  const meta = num(input.meta_recaudacion, 1, 1e11);
  if (!meta) throw Error('Indica la meta de recaudación.');
  const f = input.feria || {};
  const reparto = (Array.isArray(f.reparto) ? f.reparto : [0.3, 0.4, 0.3]).slice(0, 3).map(x => num(x, 0, 1) ?? 0);
  return {
    proyecto: text(input.proyecto || 'Proyecto', 120), meta_recaudacion: meta,
    linea_base: num(input.linea_base, 1, 1e11) || meta, objetivo_superar_pct: num(input.objetivo_superar_pct, 0, 1) ?? 0.03,
    // R49 · ancla «erp»: la escalera parte de la oferta de preventa (Etapa 1) y sube hasta el precio ERP congelado de cada unidad.
    ancla: input.ancla === 'erp' ? 'erp' : 'etapa1', unidades, cocheras, etapas,
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

function calcular(cfg, data = {}, hoy = new Date(), mercado = null, cocherasAplicadas = {}) {
  const units = new Map((data.units || []).map(u => [unitKey(u.unit_number), u]));
  const byUnitId = new Map((data.units || []).map(u => [u.id, unitKey(u.unit_number)]));
  const ventas = new Map(), quotes = new Map((data.quotes || []).map(q => [q.id, q]));
  for (const s of data.separations || []) {
    const status = String(s.status || '').toUpperCase(); if (!OPEN.has(status)) continue;
    const k = byUnitId.get(s.unit_id); if (!k) continue;
    const fecha = s.sold_at || s.confirmed_at || s.created_at || '';
    const q = quotes.get(s.quote_id), modalidad = MODALIDADES[q?.feria_modalidad] ? q.feria_modalidad : '';
    // R49 · Si la separación incluye estacionamiento, su parte se cuenta en la cochera y no en el departamento.
    const cod = q?.parking && q.parking !== 'Ninguno', fp = Number(s.final_price || 0), lp = Number(q?.price || 0), pp = cod ? Number(q.parking_price || PRECIO_COCHERA_LEGADO) : 0;
    const precioDepa = cod ? Math.max(0, fp - (lp > 0 && fp > 0 ? Math.round(pp * fp / lp) : pp)) : fp;
    const prev = ventas.get(k); if (!prev || String(fecha) > String(prev.fecha)) ventas.set(k, { precio: precioDepa, fecha, estado: status === 'SOLD' ? 'Venta' : 'Separación', codigo: s.code || '', modalidad });
  }
  for (const [k, u] of units) if (!ventas.has(k) && (u.sold_lead_id || /^(SOLD|VENDID[OA]|VENTA)$/i.test(String(u.status || '')))) ventas.set(k, { precio: Number(u.sold_amount || u.price || 0), fecha: u.sold_at || '', estado: 'Venta', codigo: '' });

  const cochVentas = cocherasOcupadas(data);
  // Ítems de la estrategia: departamentos y estacionamientos (la meta de recaudación incluye ambos).
  const items = [...cfg.unidades.map(u => ({ ...u, kind: 'unidad' })),
    ...cocherasDe(cfg).map(c => ({ kind: 'cochera', unidad: 'EST-' + c.codigo, codigo: c.codigo, tipo: 'Estacionamiento', piso: null, area: 0, ancla: false, precio_base: c.precio_base, manual: c.manual || null }))];
  const ventaDe = it => it.kind === 'cochera' ? cochVentas.get(it.codigo) : ventas.get(it.unidad);
  const erpMode = cfg.ancla === 'erp';
  // Precio ERP de referencia: el congelado en la estrategia; si falta, el vigente (Inventario o precio aplicado del estacionamiento).
  const erpDe = it => it.precio_erp || (it.kind === 'cochera' ? Number(cocherasAplicadas?.[it.codigo] ?? it.precio_base) : Number(units.get(it.unidad)?.price || it.precio_base));
  const brecha = it => Math.max(0, erpDe(it) - it.precio_base);
  const precioEn = (it, i) => erpMode ? round100(it.precio_base + (cfg.etapas[i].avance ?? 1) * brecha(it)) : round100(it.precio_base * (1 + cfg.etapas[i].alza));
  const listaTotal = items.reduce((a, u) => a + u.precio_base, 0), areaTotal = cfg.unidades.reduce((a, u) => a + u.area, 0);
  let vendidoLista = 0, recaudado = 0, areaVendida = 0;
  const vendidas = [];
  for (const u of items) { const v = ventaDe(u); if (v) { vendidoLista += u.precio_base; recaudado += v.precio || u.precio_base; areaVendida += u.area; vendidas.push({ ...u, ...v, precio: v.precio || u.precio_base }); } }
  const avance = listaTotal ? vendidoLista / listaTotal : 0;
  // Con ancla ERP, cada etapa equivale a un alza promedio sobre la lista Etapa 1 (para proyectar con la misma escalera de umbrales).
  const brechaTotal = items.reduce((a, it) => a + brecha(it), 0), erpTotal = items.reduce((a, it) => a + Math.max(erpDe(it), it.precio_base), 0);
  const etapasEf = cfg.etapas.map(e => erpMode ? { ...e, alza: listaTotal ? (e.avance ?? 1) * brechaTotal / listaTotal : 0 } : e);
  let activa = 0; cfg.etapas.forEach((e, i) => { if (avance >= e.umbral) activa = i; });
  const etapa = cfg.etapas[activa];

  // Feria: cada venta separada con la oferta de feria (registrada en su cotización) consume un cupo de su modalidad.
  // Si una venta antigua no tiene modalidad, se clasifica por el descuento que recibió frente a su lista Etapa 1.
  const f = cfg.feria, inicio = f.fecha_inicio ? new Date(f.fecha_inicio + 'T00:00:00-05:00') : null;
  const fin = inicio ? new Date(inicio.getTime() + 3 * 86400000) : null;
  const modalidadDe = v => v.modalidad || (v.precio_base - v.precio >= f.preventa.descuento * 0.9 && f.preventa.descuento > 0 ? 'preventa' : v.precio < v.precio_base - 1 && f.reserva.descuento > 0 ? 'reserva' : '');
  const depas = vendidas.filter(v => v.kind === 'unidad');
  const usados = { preventa: depas.filter(v => modalidadDe(v) === 'preventa').length, reserva: depas.filter(v => modalidadDe(v) === 'reserva').length };
  const cuposUsados = usados.preventa;
  const feriaVigente = !!(f.activa && fin && hoy < fin);
  const restantes = m => f[m].cupos ? Math.max(0, f[m].cupos - usados[m]) : 0;
  const descuentoPendiente = feriaVigente ? restantes('preventa') * f.preventa.descuento + restantes('reserva') * f.reserva.descuento : 0;

  // R49 · Lo fijado a mano cuenta por su precio; el resto sigue la escalera de etapas y absorbe el ajuste para la meta.
  const objetivoManual = (it, precioEtapa) => !it.manual ? null : it.manual.modo === 'pct' ? round100(precioEtapa * (1 + it.manual.valor)) : Math.round(it.manual.valor);
  let manualTotal = 0, listaManual = 0, listaAuto = 0, cocherasPend = 0;
  for (const it of items) {
    if (ventaDe(it)) continue;
    const pe = precioEn(it, activa), m = objetivoManual(it, pe);
    if (m != null) { manualTotal += m; listaManual += it.precio_base; } else listaAuto += it.precio_base;
    if (it.kind === 'cochera') cocherasPend += m ?? pe;
  }
  const restante = proyectarRestante(etapasEf, listaTotal, vendidoLista);
  const restanteAuto = listaAuto + listaManual > 0 ? restante.valor * listaAuto / (listaAuto + listaManual) : 0;
  const proyectado = recaudado + manualTotal + restanteAuto - descuentoPendiente;
  const escenario = (nombre, objetivo) => {
    const falta = objetivo - recaudado - manualTotal, base = restanteAuto - descuentoPendiente;
    const ajuste = base > 0 ? falta / base - 1 : 0, areaRest = areaTotal - areaVendida;
    return { nombre, objetivo, diferencia_proyectada: Math.round(proyectado - objetivo), ajuste_pct: pct(ajuste), ratio_necesario_m2: areaRest > 0 ? Math.round((objetivo - recaudado - cocherasPend) / areaRest) : 0, alcanzable_sin_ajuste: proyectado >= objetivo };
  };
  const escenarios = [escenario('Meta de recaudación', cfg.meta_recaudacion), escenario('Línea base del modelo', cfg.linea_base), escenario('Superar la meta', cfg.meta_recaudacion * (1 + cfg.objetivo_superar_pct))];
  const ajusteMeta = Math.max(0, escenarios[0].ajuste_pct / 100);

  const comps = mercado?.comps || [], tope = cfg.mercado?.modo === 'tope';
  const unidades = items.map(u => {
    const coch = u.kind === 'cochera', erp = coch ? null : units.get(u.unidad), v = ventaDe(u), ref = coch ? null : referenciaMercado(comps, u);
    const precioEtapa = precioEn(u, activa), erpRef = erpDe(u);
    // Techo del sugerido (modo «tope», rango de mercado): percentil 75 del estudio de mercado; sin estudio, el precio ERP.
    // Nunca baja del precio de la etapa vigente: si el mercado está por debajo, se marca para revisión.
    let sugerido = v ? null : round100(precioEtapa * (1 + ajusteMeta)), topado = '';
    const techo = !tope ? null : ref?.p75 && u.area ? round100(ref.p75 * u.area) : erpMode ? erpRef : null;
    if (sugerido && techo && sugerido > techo) { sugerido = Math.max(precioEtapa, techo); topado = ref?.p75 && u.area ? 'mercado' : 'erp'; }
    const manual = v ? null : objetivoManual(u, precioEtapa), objetivo = v ? null : manual ?? sugerido;
    const actual = coch ? Number(cocherasAplicadas?.[u.codigo] ?? u.precio_base) : Number(erp?.price || 0), ratio = objetivo && u.area ? Math.round(objetivo / u.area) : null;
    const posicion = !ref?.mediana || !ratio ? null : ratio > (ref.p75 || ref.mediana) ? 'Sobre el mercado' : ratio < (ref.p25 || ref.mediana) ? 'Bajo el mercado' : 'En rango de mercado';
    return { kind: u.kind, unidad: u.unidad, codigo: u.codigo, tipo: u.tipo, dormitorios: coch ? null : dormDe(u.tipo), piso: u.piso, area: u.area, ancla: u.ancla, precio_base: u.precio_base, en_erp: coch || !!erp,
      manual: v ? null : u.manual || null, origen: v ? null : manual != null ? 'manual' : 'automatico', precio_objetivo: objetivo,
      mercado: ref ? { criterio: ref.criterio, n: ref.n, mediana_m2: ref.mediana, p25_m2: ref.p25, p75_m2: ref.p75, precio_mediana: ref.mediana ? round100(ref.mediana * u.area) : null } : null, posicion_mercado: posicion, topado_por_mercado: topado === 'mercado', topado_por_erp: topado === 'erp',
      precio_erp: erpRef, etapa_vs_erp_pct: erpRef ? pct(precioEtapa / erpRef - 1) : null, techo: techo || null,
      precios_etapas: cfg.etapas.map((e, i) => precioEn(u, i)),
      precio_actual: actual || null, precio_etapa: precioEtapa, precio_sugerido: sugerido, ratio_sugerido_m2: ratio,
      diferencia_vs_actual: objetivo && actual ? objetivo - actual : null, estado: v ? v.estado : 'Disponible', precio_real: v ? v.precio : null, fecha: v ? String(v.fecha).slice(0, 10) : '' };
  });

  // R49 · Lectura estadística del estudio de mercado (Evaluador): dónde quedan la oferta, el ERP y el sugerido frente a p25 / mediana / p75,
  // y si el mercado sostiene la meta aun con los precios en el techo.
  const libres = unidades.filter(u => u.estado === 'Disponible'), conMercado = libres.filter(u => u.mercado?.mediana_m2 && u.area);
  const m2 = (u, precio) => u.area ? precio / u.area : null, lista = arr => arr.map(u => u.kind === 'cochera' ? 'Est. ' + u.codigo : u.unidad).join(', ');
  const techoDe = u => u.origen === 'manual' ? u.precio_objetivo : u.mercado?.p75_m2 && u.area ? Math.max(u.precio_etapa, round100(u.mercado.p75_m2 * u.area)) : Math.max(u.precio_etapa, u.precio_erp || 0);
  const techoTotal = Math.round(recaudado + libres.reduce((a, u) => a + techoDe(u), 0) - descuentoPendiente);
  const medianaTotal = conMercado.length === libres.filter(u => u.kind === 'unidad').length && conMercado.length ? Math.round(recaudado + libres.reduce((a, u) => a + (u.mercado?.precio_mediana || u.precio_etapa), 0) - descuentoPendiente) : null;
  const ofertaBajoP25 = conMercado.filter(u => m2(u, u.precios_etapas[0]) < u.mercado.p25_m2), erpSobreP75 = conMercado.filter(u => m2(u, u.precio_erp) > u.mercado.p75_m2);
  const etapaSobreP75 = conMercado.filter(u => m2(u, u.precio_etapa) > u.mercado.p75_m2);
  const rec = [];
  if (!mercado) rec.push('Sin estudio de mercado: el techo del sugerido es el precio ERP. Haz el barrido de proyectos similares en el Evaluador para que el sugerido se ajuste a la estadística por dormitorios y tamaño.');
  else {
    if (ofertaBajoP25.length) rec.push(`La oferta de preventa (Etapa 1) queda bajo el percentil 25 del mercado en ${lista(ofertaBajoP25)}: puedes reducir el descuento de preventa sin dejar de ser atractivo.`);
    if (erpSobreP75.length) rec.push(`El precio ERP está sobre el percentil 75 del mercado en ${lista(erpSobreP75)}: la escalera difícilmente llegará ahí; el sugerido se queda en el techo del mercado.`);
    if (etapaSobreP75.length) rec.push(`El precio de la etapa vigente ya supera el percentil 75 en ${lista(etapaSobreP75)}: revisa esas unidades (tipología, vista, piso) o dales precio manual.`);
    if (!ofertaBajoP25.length && !erpSobreP75.length && !etapaSobreP75.length && conMercado.length) rec.push('La escalera completa (oferta de preventa → precio ERP) cae dentro del rango del mercado en todas las unidades con comparables.');
  }
  if (techoTotal < cfg.meta_recaudacion) rec.push(`Aun con todo en el techo (${mercado ? 'percentil 75 del mercado' : 'precio ERP'}), se proyecta ${techoTotal.toLocaleString('es-PE')}: faltan ${(cfg.meta_recaudacion - techoTotal).toLocaleString('es-PE')} para la meta. Opciones: menos descuento o menos cupos de feria, subir de etapa antes (umbral menor) o revisar la meta.`);
  else rec.push(`El techo ${mercado ? 'del mercado' : 'ERP'} sostiene la meta: hasta ${techoTotal.toLocaleString('es-PE')} si todo se vende en el techo.`);
  const diagnostico = { con_mercado: !!mercado, unidades_con_comparables: conMercado.length, techo_total: techoTotal, mediana_total: medianaTotal, alcanza_meta_con_techo: techoTotal >= cfg.meta_recaudacion,
    oferta_bajo_p25: ofertaBajoP25.map(u => u.unidad), erp_sobre_p75: erpSobreP75.map(u => u.unidad), etapa_sobre_p75: etapaSobreP75.map(u => u.unidad), recomendaciones: rec };

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
    unidades_total: cfg.unidades.length, unidades_vendidas: depas.length, cocheras_total: items.length - cfg.unidades.length, cocheras_vendidas: vendidas.length - depas.length, manual_total: Math.round(manualTotal), avance_valor_pct: pct(avance),
    etapa_activa: etapa.nombre, siguiente_etapa: cfg.etapas[activa + 1] ? { nombre: cfg.etapas[activa + 1].nombre, umbral_pct: pct(cfg.etapas[activa + 1].umbral), falta_lista: Math.max(0, Math.round(cfg.etapas[activa + 1].umbral * listaTotal - vendidoLista)) } : null,
    ancla: erpMode ? 'erp' : 'etapa1', erp_total: Math.round(erpTotal), diagnostico,
    etapas: etapasEf.map(e => ({ ...e, alza_pct: pct(e.alza), umbral_pct: pct(e.umbral), vs_erp_pct: erpTotal ? pct((listaTotal * (1 + e.alza)) / erpTotal - 1) : null })),
    recaudado: Math.round(recaudado), restante_proyectado: Math.round(manualTotal + restanteAuto), tramos: restante.tramos.map(t => ({ ...t, lista: Math.round(t.lista), valor: Math.round(t.valor) })),
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
  constructor(store, { origin = '' } = {}) { this.store = store; this.col = store.ref.collection('ventas_precios'); this.sol = store.ref.collection('ventas_precios_solicitudes'); this.origin = origin; this.mailer = null; this.directorio = null; }
  // ---------- Aprobación de precios (como OC/OS): toda rebaja o alza que proponga Ventas pasa por Gerencia ----------
  // Solo la oferta de feria vigente (ya aprobada en la estrategia) y la Gerencia no necesitan solicitud.
  async solicitar(input, user, d) {
    const unit = (d.units || []).find(u => u.id === input?.unit_id), lead = (d.leads || []).find(l => l.id === input?.lead_id);
    if (!unit) throw Error('Selecciona la unidad.'); if (!lead) throw Error('Selecciona el cliente (lead).');
    if (unit.sold_lead_id || /^(SOLD|VENDID[OA]|VENTA)$/i.test(String(unit.status || ''))) throw Error('La unidad ya está vendida.');
    const lista = Number(unit.price || 0), propuesto = Math.round(Number(input?.precio_propuesto) * 100) / 100, motivo = text(input?.motivo, 600);
    if (!lista) throw Error('La unidad no tiene precio de lista.');
    if (!(propuesto > 0) || propuesto < lista * 0.5 || propuesto > lista * 1.5) throw Error('Indica un precio propuesto razonable (entre −50 % y +50 % de la lista).');
    if (propuesto === lista) throw Error('El precio propuesto es igual a la lista: no necesita aprobación.');
    if (motivo.length < 5) throw Error('Explica el motivo para Gerencia.');
    const id = randomUUID(), at = now(), doc = { id, estado: 'pendiente', unit_id: unit.id, unidad: String(unit.unit_number), lead_id: lead.id, cliente: text(lead.name, 120), lead_number: text(lead.lead_number, 30),
      precio_lista: lista, precio_propuesto: propuesto, diferencia: Math.round((propuesto - lista) * 100) / 100, variacion_pct: pct(propuesto / lista - 1), tipo: propuesto < lista ? 'descuento' : 'incremento',
      motivo, solicitante: { id: String(user.id ?? user.name), nombre: user.name, rol: user.role }, creada: at, historial: [{ at, por: user.name, accion: 'solicitud', nota: motivo }] };
    await this.store.db.runTransaction(async tx => { tx.set(this.sol.doc(id), doc); });
    doc.avisos = await this.avisar(doc, 'solicitud');
    return doc;
  }
  async solicitudes(user, filtro = {}) {
    const rows = (await this.sol.limit(2000).get()).docs.map(x => x.data()).map(r => this.vigencia(r));
    const mine = user?.role === 'Gerente' ? rows : rows.filter(r => r.solicitante?.nombre === user?.name || r.solicitante?.id === String(user?.id ?? ''));
    return mine.filter(r => (!filtro.estado || r.estado === filtro.estado) && (!filtro.unit_id || r.unit_id === filtro.unit_id) && (!filtro.lead_id || r.lead_id === filtro.lead_id)).sort((a, b) => String(b.creada).localeCompare(String(a.creada))).slice(0, 300);
  }
  vigencia(r) { if (r.estado === 'aprobada' && Date.parse(r.vence) < Date.now()) return { ...r, estado: 'vencida' }; return r; }
  async decidir(id, input, user) {
    this.gerente(user);
    const decision = String(input?.decision || ''); if (!['aprobar', 'rechazar', 'observar'].includes(decision)) throw Error('Decisión no válida.');
    const nota = text(input?.comentario, 600); if (decision !== 'aprobar' && nota.length < 3) throw Error('Indica el motivo al vendedor.');
    const doc = await this.store.db.runTransaction(async tx => {
      const ref = this.sol.doc(String(id || '')), r = (await tx.get(ref)).data();
      if (!r) throw Error('La solicitud no existe.'); if (!['pendiente', 'observada'].includes(r.estado)) throw Error('Esta solicitud ya fue resuelta (' + r.estado + ').');
      const at = now(), aprobado = decision === 'aprobar' ? Math.round(Number(input?.precio_aprobado ?? r.precio_propuesto) * 100) / 100 : null;
      if (decision === 'aprobar' && !(aprobado > 0 && aprobado >= r.precio_lista * 0.5 && aprobado <= r.precio_lista * 1.5)) throw Error('Precio aprobado fuera de rango.');
      const next = { ...r, estado: decision === 'aprobar' ? 'aprobada' : decision === 'rechazar' ? 'rechazada' : 'observada', decidido_por: user.name, decidida: at, comentario: nota,
        ...(aprobado ? { precio_aprobado: aprobado, vence: new Date(Date.now() + VIGENCIA_DIAS * 86400000).toISOString() } : {}),
        historial: [...(r.historial || []), { at, por: user.name, accion: decision, nota, ...(aprobado ? { precio: aprobado } : {}) }] };
      tx.set(ref, next); return next;
    });
    doc.avisos = await this.avisar(doc, 'decision');
    return doc;
  }
  // Valida y consume la aprobación al generar la cotización: misma unidad, mismo cliente, misma lista y vigente.
  async aprobacionPara(id, unit, leadId) {
    const r = this.vigencia((await this.sol.doc(String(id || '')).get()).data() || {});
    if (!r.id) throw Error('La aprobación de precio no existe.');
    if (r.estado !== 'aprobada') throw Error('La solicitud de precio está ' + (r.estado || 'sin estado') + '.');
    if (r.unit_id !== unit?.id || r.lead_id !== leadId) throw Error('La aprobación de precio es para otra unidad o cliente.');
    if (Number(unit.price || 0) !== Number(r.precio_lista)) throw Error('La lista cambió desde la aprobación; solicita de nuevo.');
    return r;
  }
  async marcarUsada(id, quote) {
    await this.store.db.runTransaction(async tx => { const ref = this.sol.doc(String(id)), r = (await tx.get(ref)).data(); if (!r) return; tx.set(ref, { ...r, estado: 'usada', cotizacion: quote, usada: now(), historial: [...(r.historial || []), { at: now(), por: 'Sistema', accion: 'cotizada', nota: quote?.quote_code || '' }] }); });
  }
  async avisar(r, tipo) {
    const envios = [];
    try {
      const dir = this.directorio ? await this.directorio() : [];
      const money = v => 'S/ ' + Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const link = String(this.origin || '').replace(/\/$/, '') + '/?tab=precios';
      const resumen = `Unidad: ${r.unidad}\nCliente: ${r.cliente} (${r.lead_number || '—'})\nLista: ${money(r.precio_lista)}\nPropuesto: ${money(r.precio_propuesto)} (${r.variacion_pct > 0 ? '+' : ''}${r.variacion_pct} %)\nMotivo: ${r.motivo}`;
      if (tipo === 'solicitud') for (const g of dir.filter(x => x.role === 'Gerente' && x.email)) envios.push({ para: g.email, asunto: `Aprobación de precio · Unidad ${r.unidad} · ${r.tipo}`, cuerpo: `Hola ${g.name}:\n\n${r.solicitante.nombre} solicita un precio especial.\n\n${resumen}\n\nAprueba, observa o rechaza en Ventas › Estrategia de precios:\n${link}\n\nERP ÖRÖK` });
      else { const v = dir.find(x => x.name === r.solicitante?.nombre && x.email); if (v) envios.push({ para: v.email, asunto: `Precio ${r.estado} · Unidad ${r.unidad}`, cuerpo: `Hola ${v.name}:\n\nGerencia (${r.decidido_por}) ${r.estado === 'aprobada' ? 'aprobó el precio de ' + money(r.precio_aprobado) + '. Úsalo al cotizar dentro de ' + VIGENCIA_DIAS + ' días; pasará a la separación y la minuta.' : r.estado + ' la solicitud: ' + r.comentario}\n\n${resumen}\n\nERP ÖRÖK` }); }
      for (const e of envios) { try { if (!this.mailer?.notify) throw Error('Correo del servidor no disponible'); await this.mailer.notify({ to: e.para, subject: e.asunto, text: e.cuerpo }); e.ok = true; } catch (err) { e.ok = false; e.error = text(err.message, 160); } }
    } catch { /* el aviso por correo nunca bloquea la decisión: queda en la bandeja del ERP */ }
    return envios.map(e => ({ para: e.para, ok: e.ok, error: e.error }));
  }
  ref() { return this.col.doc('estrategia'); }
  async config() { return (await this.ref().get()).data() || null; }
  gerente(user) { if (user?.role !== 'Gerente') throw Error('La estrategia de precios es solo para Gerencia.'); }
  // Evaluación del Evaluador (M.O.R.A) que alimenta el estudio de mercado: la elegida, o la activa más reciente del mismo proyecto.
  async evaluaciones() { try { return (await this.store.ref.collection('mora_evaluations').get()).docs.map(x => x.data()).filter(e => e && e.active !== false); } catch { return []; } }
  async mercado(cfg) {
    const evs = await this.evaluaciones(); if (!evs.length) return null;
    const norm = v => String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const ev = evs.find(e => e.id === cfg?.mercado?.evaluacion_id) || evs.filter(e => norm(e.project?.nombre).includes(norm(cfg?.proyecto)) || norm(cfg?.proyecto).includes(norm(e.project?.nombre))).sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))[0];
    return ev ? resumenMercado(ev) : null;
  }
  // Estacionamientos para la cotización (cualquier rol): precio vigente y si siguen libres.
  async cocheras(d) {
    const doc = await this.config(), ap = doc?.cocheras_precios || {}, ocup = cocherasOcupadas(d);
    return cocherasDe(doc?.config).map(c => ({ codigo: c.codigo, precio: Number(ap[c.codigo] ?? c.precio_base), disponible: !ocup.has(c.codigo) }));
  }
  async precioCochera(codigo, d) {
    const c = (await this.cocheras(d)).find(x => x.codigo === String(codigo || ''));
    if (!c) throw Error('El estacionamiento elegido no existe en la estrategia de precios.');
    if (!c.disponible) throw Error(`El estacionamiento ${c.codigo} ya está separado o vendido.`);
    return c.precio;
  }
  async estado(user, d) {
    this.gerente(user);
    const doc = await this.config();
    const evs = (await this.evaluaciones()).map(e => ({ id: e.id, nombre: e.project?.nombre || e.id, actualizado: e.updated_at, comparables: comparablesDe(e.workspace).length }));
    if (!doc) return { configurada: false, evaluaciones: evs };
    return { configurada: true, revision: doc.revision, actualizado: doc.updated_at, por: doc.updated_by, config: doc.config, calculo: calcular(doc.config, d, new Date(), await this.mercado(doc.config), doc.cocheras_precios), aplicaciones: (doc.aplicaciones || []).slice(-10).reverse(), evaluaciones: evs };
  }
  async guardar(input, user, d) {
    this.gerente(user);
    const config = limpiarConfig(input?.config || input);
    const rev = Number(input?.revision || 0);
    // R49 · Con ancla ERP se congela el precio ERP de hoy en cada unidad o estacionamiento que aún no lo tenga
    // (así aplicar precios no mueve la referencia). «Tomar precios ERP de hoy» los vuelve a congelar.
    if (config.ancla === 'erp') {
      const ap = (await this.config())?.cocheras_precios || {}, porNum = new Map((d?.units || []).map(u => [unitKey(u.unit_number), u]));
      const refrescar = input?.refrescar_erp === true;
      for (const u of config.unidades) if (refrescar || !u.precio_erp) u.precio_erp = Number(porNum.get(u.unidad)?.price) || u.precio_erp || u.precio_base;
      for (const c of config.cocheras) if (refrescar || !c.precio_erp) c.precio_erp = Number(ap[c.codigo] ?? c.precio_base);
    }
    const out = await this.store.db.runTransaction(async tx => {
      const ref = this.ref(), old = (await tx.get(ref)).data();
      if (old && rev && rev !== old.revision) throw Error('Otra persona cambió la estrategia. Actualiza antes de guardar.');
      const doc = { ...(old || {}), config, revision: (old?.revision || 0) + 1, updated_at: now(), updated_by: user.name,
        cambios: [...(old?.cambios || []), { at: now(), by: user.name, fuente: config.fuente }].slice(-30) };
      tx.set(ref, doc); return doc;
    });
    return { ok: true, revision: out.revision, calculo: calcular(config, d, new Date(), await this.mercado(config), out.cocheras_precios) };
  }
  // Se ejecuta dentro de la transacción principal del CRM (mismo documento que unidades y separaciones).
  aplicarEnDatos(d, doc, seleccion, user, mercado = null) {
    this.gerente(user);
    if (!doc?.config) throw Error('Primero guarda la estrategia de precios.');
    const calc = calcular(doc.config, d, new Date(), mercado, doc.cocheras_precios), want = new Set((Array.isArray(seleccion) ? seleccion : []).map(unitKey));
    const cambios = [];
    for (const u of calc.unidades) {
      if (!u.precio_objetivo || !u.en_erp || (want.size && !want.has(u.unidad))) continue;
      const fuente = u.origen === 'manual' ? 'Estrategia de precios · ajuste manual' : 'Estrategia de precios · ' + calc.etapa_activa;
      // El precio de los estacionamientos vive en la estrategia (no son unidades de Inventario); se guarda al registrar la aplicación.
      if (u.kind === 'cochera') { if (u.precio_actual !== u.precio_objetivo) cambios.push({ unidad: u.unidad, cochera: u.codigo, antes: u.precio_actual, despues: u.precio_objetivo, origen: u.origen }); continue; }
      const unit = (d.units || []).find(x => unitKey(x.unit_number) === u.unidad);
      if (!unit || /^(SOLD|VENDID[OA]|VENTA)$/i.test(String(unit.status || ''))) continue;
      if (Number(unit.price || 0) === u.precio_objetivo) continue;
      cambios.push({ unidad: u.unidad, antes: Number(unit.price || 0), despues: u.precio_objetivo, origen: u.origen });
      unit.price = u.precio_objetivo; unit.price_updated_at = now(); unit.price_updated_by = user.name; unit.price_source = fuente;
    }
    if (!cambios.length) throw Error('No hay precios por cambiar: las unidades y estacionamientos ya tienen el precio objetivo.');
    return { id: randomUUID(), at: now(), by: user.name, etapa: calc.etapa_activa, ajuste_pct: calc.ajuste_sugerido_pct, revision: doc.revision, cambios };
  }
  async registrarAplicacion(ap) {
    await this.store.db.runTransaction(async tx => { const ref = this.ref(), doc = (await tx.get(ref)).data() || {}; const cp = { ...(doc.cocheras_precios || {}) }; for (const c of ap.cambios || []) if (c.cochera) cp[c.cochera] = c.despues;
      tx.set(ref, { ...doc, cocheras_precios: cp, aplicaciones: [...(doc.aplicaciones || []), ap].slice(-100) }); });
  }
  async oferta(d) { return ofertaFeria((await this.config())?.config, d); }
  async historial(user) { this.gerente(user); return ((await this.config())?.aplicaciones || []).slice().reverse(); }
  // Para el Evaluador (M.O.R.A): resumen real vs línea base, sin precios por unidad.
  async paraMora(d) {
    const doc = await this.config(); if (!doc?.config) return null;
    const c = calcular(doc.config, d, new Date(), null, doc.cocheras_precios);
    return { schema: 'ventas.precios@1', etapa_activa: c.etapa_activa, avance_valor_pct: c.avance_valor_pct, recaudado: c.recaudado, proyectado: c.proyectado,
      meta_recaudacion: c.meta_recaudacion, linea_base: c.linea_base, brecha_vs_meta: c.brecha_vs_meta, ajuste_sugerido_pct: c.ajuste_sugerido_pct, curva: c.curva };
  }
  async rpc(name, args, user, readData) {
    if (name === 'preciosCocheras') return this.cocheras(await readData());
    if (name === 'preciosEstrategia') return this.estado(user, await readData());
    if (name === 'preciosEstrategiaGuardar') return this.guardar(args[0] || {}, user, await readData());
    if (name === 'preciosHistorial') return this.historial(user);
    if (name === 'preciosOfertaFeria') return ofertaFeria((await this.config())?.config, await readData());
    if (name === 'precioSolicitar') return this.solicitar(args[0] || {}, user, await readData());
    if (name === 'precioSolicitudes') return this.solicitudes(user, args[0] || {});
    if (name === 'precioDecidir') return this.decidir(args[0], args[1] || {}, user);
    throw Error('Acción no válida.');
  }
}

module.exports = { PreciosEstrategia, PRECIOS_METHODS: METHODS, calcular, limpiarConfig, limpiarManual, cocherasOcupadas, COCHERAS_DEFECTO, PRECIO_COCHERA_LEGADO, proyectarRestante, unitKey, ofertaFeria, MODALIDADES, resumenMercado, referenciaMercado, comparablesDe, dormDe };
