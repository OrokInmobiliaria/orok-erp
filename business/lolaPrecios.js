'use strict';
// R64 · Precios que Gerencia autoriza a L.O.L.A (por proyecto): rango de precios por etapa (p. ej. preventa) y promociones
// vigentes (p. ej. descuentos por feria hasta agotar stock). L.O.L.A NO inventa cifras: el servidor arma la respuesta solo con
// estos datos. Cualquier otra cifra, negociación o precio de una unidad sigue bloqueado y pasa a un asesor.
const ETAPAS = ['preventa', 'lanzamiento', 'en construcción', 'entrega inmediata', 'venta'];
const text = (v, n = 200) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const soles = n => 'S/ ' + Math.round(Number(n)).toLocaleString('en-US');
const monto = (v, campo) => { if (v === '' || v == null) return null; const n = Number(String(v).replace(/[^\d.]/g, '')); if (!Number.isFinite(n) || n < 0 || n > 1e9) throw Error(campo + ' no es un monto válido.'); return Math.round(n); };
const hoyLima = (clock = Date.now()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(clock));

function limpiar(input, actor) {
  const enabled = input?.enabled === true, etapa = ETAPAS.includes(input?.etapa) ? input.etapa : 'preventa';
  const desde = monto(input?.desde, 'El precio «desde»'), hasta = monto(input?.hasta, 'El precio «hasta»');
  if (enabled && (!desde || !hasta)) throw Error('Indica el precio desde y hasta para que L.O.L.A pueda comunicarlo.');
  if (desde && hasta && desde > hasta) throw Error('El precio «desde» no puede ser mayor que el «hasta».');
  const promociones = (Array.isArray(input?.promociones) ? input.promociones : []).slice(0, 5).map((p, i) => {
    const t = text(p?.texto, 120); if (!t) return null;
    if (/\d/.test(t)) throw Error('Promoción ' + (i + 1) + ': escribe el monto en su casilla, no dentro del texto.');
    const v = text(p?.vigente_hasta, 10); if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw Error('Promoción ' + (i + 1) + ': fecha de vigencia no válida.');
    return { texto: t, monto_max: monto(p?.monto_max, 'El monto de la promoción ' + (i + 1)), hasta_agotar_stock: p?.hasta_agotar_stock === true, vigente_hasta: v || null };
  }).filter(Boolean);
  return { enabled, etapa, desde, hasta, promociones, updated_at: new Date().toISOString(), updated_by: text(actor, 120) };
}
function vigente(p, clock = Date.now()) { return p && p.enabled === true && p.desde > 0 && p.hasta >= p.desde ? p : null; }
function promosVigentes(p, clock = Date.now()) { const hoy = hoyLima(clock); return (p?.promociones || []).filter(x => !x.vigente_hasta || x.vigente_hasta >= hoy); }
// Respuesta determinista (sin IA) para la PRIMERA consulta de precio de la conversación.
function respuesta(p, proyecto, clock = Date.now()) {
  const promos = promosVigentes(p, clock).map(x => x.texto + (x.monto_max ? ' de hasta ' + soles(x.monto_max) : '') + (x.hasta_agotar_stock ? ', hasta agotar stock' : ''));
  const nombre = text(proyecto, 60) || 'el proyecto';
  return '¡Con gusto te cuento! 😊 En ' + p.etapa + ', los departamentos de ' + nombre + ' van desde ' + soles(p.desde) + ' hasta ' + soles(p.hasta) + '.'
    + (promos.length ? ' Además, hay ' + promos.join('; ') + '.' : '')
    + ' El precio exacto depende del departamento y te lo confirma un asesor. ¿Te gustaría agendar una cita o visitar el showroom?';
}
// DNI peruano (8 dígitos) o carné de extranjería (9 dígitos cuando se menciona «carné»/«CE»). Un celular (9 dígitos que empieza en 9) no cuenta.
function documento(textIn) {
  const s = String(textIn || ''), dni = s.match(/(?:^|[^\d])(\d{8})(?:[^\d]|$)/);
  if (dni) return { tipo: 'DNI', numero: dni[1] };
  const ce = /\b(?:carn[eé]|ce|extranjer[ií]a)\b/i.test(s) && s.match(/(?:^|[^\d])(\d{9})(?:[^\d]|$)/);
  return ce ? { tipo: 'CE', numero: ce[1] } : null;
}
const NEGATIVA = /\b(?:no (?:quiero|deseo|tengo|doy|voy a dar)|prefiero no|sin dni|no es necesario)\b/;
module.exports = { ETAPAS, limpiar, vigente, promosVigentes, respuesta, documento, NEGATIVA, soles };
