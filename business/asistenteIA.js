'use strict';
// R76 · IA que rellena lo operativo (mejoras 1, 2, 3 y 5).
// - iaSugerirLead: lee la ficha, los comentarios, la conversación del CRM/WhatsApp y (opcional) un dictado, y PROPONE
//   próxima acción con fecha, datos faltantes de la ficha, etapa sugerida y el comentario ordenado. Nada se guarda solo.
// - iaPedir: barra «Pídele a la IA». Interpreta un pedido en lenguaje natural y devuelve una respuesta y ACCIONES
//   propuestas (ir a una pantalla, abrir un lead, comentar, agendar próxima acción, completar ficha) que la persona aplica con un clic.
const text = (v, n = 600) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ').trim().slice(0, n);
const CAMPOS = { dni: 'DNI', email: 'Correo', address: 'Dirección', budget: 'Presupuesto (número)', unit_interest: 'Unidad o tipología de interés', purchase_horizon: 'Horizonte de compra', project: 'Proyecto' };
const HORIZONTES = ['Inmediato', '1-3 meses', '3-6 meses', '6-12 meses', 'Más de 12 meses'];
function jsonDe(s) { const t = String(s || ''); const a = t.indexOf('{'), b = t.lastIndexOf('}'); if (a < 0 || b < a) return {}; try { return JSON.parse(t.slice(a, b + 1)); } catch { return {}; } }
const hoyLima = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
function fechaHora(f, h) { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(f || ''))) return null; const hh = /^\d{2}:\d{2}$/.test(String(h || '')) ? h : '10:00'; const d = new Date(f + 'T' + hh + ':00-05:00'); return Number.isFinite(d.getTime()) ? d.toISOString() : null; }
function limpiarCampos(c, lead) {
  const out = {};
  for (const k of Object.keys(CAMPOS)) { let v = c?.[k]; if (v == null || v === '') continue;
    if (k === 'budget') { v = Number(String(v).replace(/[^\d.]/g, '')); if (!(v > 0)) continue; }
    else if (k === 'dni') { v = String(v).replace(/\D/g, ''); if (!/^\d{8}$/.test(v)) continue; }
    else if (k === 'email') { v = text(v, 120).toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) continue; }
    else if (k === 'purchase_horizon') { v = HORIZONTES.find(x => x.toLowerCase() === String(v).toLowerCase()) || text(v, 40); }
    else v = text(v, 200);
    if (String(lead?.[k] ?? '') === String(v)) continue; out[k] = v; }
  return out;
}
// R78 · Validación común de acciones propuestas (barra, L.O.L.A y G.R.E.T.A): solo tipos permitidos, leads del alcance y pantallas reales.
function validarAcciones(lista, { leads = [], tabs = {}, d = {} } = {}) {
    const ids = new Map(leads.map(l => [l.id, l])), out = [];
    for (const a of (Array.isArray(lista) ? lista : []).slice(0, 8)) {
      const t = a?.tipo, l = ids.get(String(a?.lead_id || '')), nombre = l ? [l.n, l.nombre].filter(Boolean).join(' · ') : '';
      if (t === 'navegar' && tabs[a.tab]) out.push({ tipo: t, tab: a.tab, etiqueta: 'Ir a ' + tabs[a.tab] });
      else if (t === 'abrir_lead' && l) out.push({ tipo: t, lead_id: l.id, nombre, etiqueta: 'Abrir ' + nombre });
      else if (t === 'comentario' && l && text(a.texto, 4000)) out.push({ tipo: t, lead_id: l.id, nombre, texto: text(a.texto, 4000), etiqueta: 'Comentar en ' + nombre });
      else if (t === 'proxima_accion' && l && text(a.texto, 300)) { const at = fechaHora(a.fecha, a.hora); if (at) out.push({ tipo: t, lead_id: l.id, nombre, texto: text(a.texto, 300), at, etiqueta: 'Agendar en ' + nombre }); }
      else if (t === 'completar_ficha' && l) { const lead = (d.leads || []).find(x => x.id === l.id), campos = limpiarCampos(a.campos, lead); if (Object.keys(campos).length) out.push({ tipo: t, lead_id: l.id, nombre, campos, etiquetas: CAMPOS, etiqueta: 'Completar ficha de ' + nombre }); }
    }
  return out;
}
// Vendedores y brokers: sin nombres ni teléfonos de clientes hacia el proveedor de IA (se identifican por número de lead).
const leadsCompactos = (d, user, mine) => { const g = user.role === 'Gerente'; return (d.leads || []).filter(l => l && !l.archived_at && mine(l, user)).slice(-400).map(l => ({ id: l.id, n: l.lead_number, ...(g ? { nombre: text(l.name, 60), tel: String(l.phone || '').slice(-4) } : {}), etapa: l.status, prox: text(l.next_action, 80), prox_at: l.next_action_at || null })); };
// Texto de instrucciones para que una IA del ERP proponga acciones al final de su respuesta.
function instruccionAcciones(tabs, conLeads = true) {
  return '\n\nACCIONES: si el pedido se resuelve haciendo algo en el ERP, al FINAL de tu respuesta agrega una línea que empiece exactamente con «ACCIONES:» seguida de un arreglo JSON. Tipos permitidos: {"tipo":"navegar","tab":"id de PANTALLAS"}' + (conLeads ? ', {"tipo":"abrir_lead","lead_id":"…"}, {"tipo":"comentario","lead_id":"…","texto":"…"}, {"tipo":"proxima_accion","lead_id":"…","texto":"…","fecha":"YYYY-MM-DD","hora":"HH:MM"}, {"tipo":"completar_ficha","lead_id":"…","campos":{' + Object.keys(CAMPOS).map(k => '"' + k + '":"…"').join(',') + '}}. Usa solo lead_id de LEADS_PARA_ACCIONES; si hay varios posibles, pregunta cuál y no propongas acciones sobre ellos' : '') + '. La persona aplica cada acción con un clic; no digas que ya lo hiciste. Si no hace falta ninguna acción, no agregues la línea. Hoy es ' + hoyLima() + ' (Lima).\nPANTALLAS (id: nombre): ' + JSON.stringify(tabs);
}
function separarAcciones(t) { const s = String(t || ''), i = s.lastIndexOf('ACCIONES:'); if (i < 0) return { texto: s.trim(), acciones: [] }; let a = []; try { const raw = s.slice(i + 9).trim(), k = raw.indexOf('['), e = raw.lastIndexOf(']'); a = JSON.parse(raw.slice(k, e + 1)); } catch { a = []; } return { texto: s.slice(0, i).trim(), acciones: Array.isArray(a) ? a : [] }; }
class AsistenteIA {
  constructor({ lola, conversation }) { this.lola = lola; this.conv = conversation; }
  mine(l, user) { return user.role === 'Gerente' || [l.sales_owner, l.assigned_to, l.broker_name].map(x => String(x || '').trim()).some(x => x && (x === user.name || (user.brokerName && x === user.brokerName))); }
  async ia(user, d, system, prompt, max = 1800) {
    const a = this.lola, c = a.raw(); if (!c.enabled) throw Error('La IA está apagada. Gerencia puede activarla en el panel de L.O.L.A.');
    const k = a.key(c, d.settings); if (!k.key) throw Error('Falta la clave del proveedor de IA.');
    await a.count(user, c);
    let lec = ''; if (a.lecciones) { try { lec = await a.lecciones.instrucciones('lola'); } catch {} }
    const r = await a.call(c, k.key, system + lec, [{ role: 'user', text: prompt }], { max });
    return jsonDe(r);
  }
  async sugerirLead(input, user, d) {
    const lead = (d.leads || []).find(l => l.id === text(input?.lead_id, 80)); if (!lead || !this.mine(lead, user)) throw Error('Lead no encontrado o no asignado a ti.');
    let chat = []; try { const c = await this.conv?.get(lead.id); chat = (c?.messages || []).slice(0, 25).reverse().map(m => ({ de: m.direction === 'inbound' ? 'cliente' : 'ÖRÖK', texto: text(m.text || m.body, 400), at: m.at })); } catch {}
    const ficha = { nombre: lead.name, etapa: lead.status, subestado: lead.substatus, origen: lead.source, proyecto: lead.project, ...Object.fromEntries(Object.keys(CAMPOS).map(k => [k, lead[k] ?? null])), proxima_accion: lead.next_action || null, proxima_accion_fecha: lead.next_action_at || null, recibido: lead.received_at || lead.created_at };
    const comentarios = (lead.comment_history || []).slice(-12).map(c => ({ at: c.at, autor: c.author, texto: text(c.text, 500) }));
    const system = 'Eres L.O.L.A, asistente comercial del CRM de ÖRÖK (Lima). Ayudas al asesor a no perder tiempo en lo operativo. PROPONES, no decides. Reglas: no inventes datos del cliente; un campo solo se propone si el cliente lo dijo en la conversación, el comentario o el dictado. La próxima acción debe ser concreta (qué, cómo) con fecha en días hábiles desde hoy ' + hoyLima() + ' (hora de Lima). La etapa sugerida debe ser una del embudo: Nuevo, Contactado, MQL, Cita, Cita Asistida, Calificado, Seguimiento, Separación, Venta, Perdido; solo sugiérela si hay evidencia. Devuelve SOLO JSON: {"resumen":"2-3 líneas","proxima_accion":{"texto":"…","fecha":"YYYY-MM-DD","hora":"HH:MM"},"etapa_sugerida":"…o vacío","motivo_etapa":"…","campos":{' + Object.entries(CAMPOS).map(([k, v]) => '"' + k + '":"' + v + ' o vacío"').join(',') + '},"comentario":"si hay dictado: el comentario ordenado, claro y breve; si no, vacío"}. Horizontes válidos: ' + HORIZONTES.join(', ') + '.';
    const prompt = 'FICHA (datos): ' + JSON.stringify(ficha) + '\nCOMENTARIOS RECIENTES (datos): ' + JSON.stringify(comentarios) + '\nCONVERSACIÓN RECIENTE (datos): ' + JSON.stringify(chat) + (input?.dictado ? '\nDICTADO DEL ASESOR AHORA (datos): ' + text(input.dictado, 3000) : '');
    const j = await this.ia(user, d, system, prompt, 1500);
    const pa = j.proxima_accion || {}, at = fechaHora(pa.fecha, pa.hora);
    return { lead_id: lead.id, resumen: text(j.resumen, 600), proxima_accion: pa.texto ? { texto: text(pa.texto, 300), at } : null, etapa_sugerida: text(j.etapa_sugerida, 40) !== lead.status ? text(j.etapa_sugerida, 40) : '', motivo_etapa: text(j.motivo_etapa, 300),
      campos: limpiarCampos(j.campos, lead), etiquetas: CAMPOS, comentario: text(j.comentario, 3000) };
  }
  async pedir(input, user, d, tabs) {
    const q = text(input?.texto, 1500); if (q.length < 3) throw Error('Escribe o dicta lo que necesitas.');
    const leads = leadsCompactos(d, user, (l, u) => this.mine(l, u));
    const system = 'Eres L.O.L.A, la barra «Pídele a la IA» del ERP de ÖRÖK. Interpretas el pedido de ' + text(user.name, 60) + ' (' + user.role + ') y devuelves una respuesta breve y, si corresponde, ACCIONES que la persona aplicará con un clic. Hoy es ' + hoyLima() + ' (Lima). Solo puedes proponer estas acciones: {"tipo":"navegar","tab":"id de pantalla de PANTALLAS"}, {"tipo":"abrir_lead","lead_id":"…"}, {"tipo":"comentario","lead_id":"…","texto":"…"}, {"tipo":"proxima_accion","lead_id":"…","texto":"…","fecha":"YYYY-MM-DD","hora":"HH:MM"}, {"tipo":"completar_ficha","lead_id":"…","campos":{' + Object.keys(CAMPOS).map(k => '"' + k + '":"…"').join(',') + '}}. Usa solo lead_id de LEADS (busca por número de lead y, si están, por nombre o últimos 4 dígitos). Si hay varios posibles, pregunta cuál en la respuesta y no propongas acciones sobre ellos. No inventes datos. Para preguntas de uso del ERP responde y propone navegar a la pantalla. Devuelve SOLO JSON: {"respuesta":"máximo 80 palabras","acciones":[…]}';
    const prompt = 'PEDIDO: ' + q + '\nPANTALLA ACTUAL: ' + text(input?.tab, 40) + '\nPANTALLAS (id: nombre): ' + JSON.stringify(tabs) + '\nLEADS (datos): ' + JSON.stringify(leads);
    const j = await this.ia(user, d, system, prompt, 1500);
    const out = validarAcciones(j.acciones, { leads, tabs, d });
    return { respuesta: text(j.respuesta, 800) || (out.length ? 'Esto propongo:' : 'No entendí el pedido. ¿Puedes decirlo de otra forma?'), acciones: out };
  }
}
const IA_ASISTENTE_METHODS = ['iaSugerirLead', 'iaPedir'];
const mineDe = (l, user) => user.role === 'Gerente' || [l.sales_owner, l.assigned_to, l.broker_name].map(x => String(x || '').trim()).some(x => x && (x === user.name || (user.brokerName && x === user.brokerName)));
module.exports = { AsistenteIA, IA_ASISTENTE_METHODS, limpiarCampos, fechaHora, CAMPOS, validarAcciones, leadsCompactos, instruccionAcciones, separarAcciones, mineDe };
