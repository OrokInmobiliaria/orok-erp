'use strict';
// R43 · Formularios instantáneos de G.R.E.T.A.
// - Meta: un formulario sirve para anuncios de Facebook e Instagram. TikTok: se entrega una ficha para copiar en su administrador.
// - Gerencia edita cada texto (bienvenida, preguntas, opciones, privacidad y cierre). Cada cambio sube la revisión y anula la aprobación.
// - Meta no permite editar un formulario ya publicado: para cambiarlo se crea una NUEVA VERSIÓN y la anterior se archiva.
// - El ERP solo prepara y encola. n8n (flujo inactivo hasta su prueba) lo crea en la página de Facebook con sus credenciales.
// - No toca leads: las respuestas llegan por el webhook de leads de Meta que ya usa el CRM (omnichannel.metaForms).
const { randomUUID } = require('node:crypto');
const { reached } = require('./adsAnalytics');

const now = () => new Date().toISOString();
const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const CONTACTO = {
  nombre: { meta: 'FULL_NAME', etiqueta: 'Nombre completo' },
  telefono: { meta: 'PHONE', etiqueta: 'Número de teléfono' },
  email: { meta: 'EMAIL', etiqueta: 'Correo electrónico' }
};
const ESTADOS = ['borrador', 'aprobado', 'en_cola', 'creado', 'error', 'reemplazado', 'archivado'];
const EN_META = ['en_cola', 'creado'];
const CRM_CAMPO = ['interes', 'comentario'];

function seguro(v, max, campo, { requerido = false } = {}) {
  const t = clean(v, max + 1);
  if (requerido && !t) throw Error('Completa: ' + campo + '.');
  if (t.length > max) throw Error(campo + ': máximo ' + max + ' caracteres.');
  if (/[<>]|javascript:|data:text/i.test(t)) throw Error(campo + ': contenido no permitido.');
  return t;
}
function telefono(v) { const d = String(v || '').replace(/[^\d]/g, ''); if (!/^\d{9,15}$/.test(d)) throw Error('Número de WhatsApp o teléfono no válido (con código de país, p. ej. 51987654321).'); return d; }
function https(v, campo) { let u; try { u = new URL(String(v || '').trim()); } catch { throw Error(campo + ': escribe un enlace https válido.'); } if (u.protocol !== 'https:' || u.username || u.password) throw Error(campo + ': el enlace debe empezar con https://.'); return u.href.slice(0, 500); }

// Valida y normaliza. Reglas de marca: sin precios, descuentos, escasez ni promesas; sin palabras prohibidas del proyecto.
function validarFormulario(input, brand = {}) {
  const f = input || {};
  const out = {
    nombre: seguro(f.nombre, 80, 'nombre interno', { requerido: true }),
    red: ['meta', 'tiktok'].includes(f.red) ? f.red : 'meta',
    tipo: f.tipo === 'mayor_intencion' ? 'mayor_intencion' : 'mas_volumen',
    proyecto: clean(f.proyecto, 80),
    campaign_id: /^[a-f0-9-]{36}$/.test(String(f.campaign_id || '')) ? f.campaign_id : null,
    intro: { titulo: seguro(f.intro?.titulo, 60, 'título de bienvenida', { requerido: true }), texto: seguro(f.intro?.texto, 400, 'texto de bienvenida') },
    contacto: [...new Set((Array.isArray(f.contacto) ? f.contacto : ['nombre', 'telefono']).filter(k => CONTACTO[k]))],
    preguntas: [],
    privacidad: { url: https(f.privacidad?.url, 'Política de privacidad'), texto: seguro(f.privacidad?.texto || 'Política de privacidad', 70, 'texto del enlace de privacidad', { requerido: true }) },
    cierre: { titulo: seguro(f.cierre?.titulo, 60, 'título final', { requerido: true }), texto: seguro(f.cierre?.texto, 300, 'texto final'), boton: ['whatsapp', 'web', 'llamar'].includes(f.cierre?.boton) ? f.cierre.boton : 'whatsapp', boton_texto: seguro(f.cierre?.boton_texto || 'Escríbenos por WhatsApp', 30, 'texto del botón', { requerido: true }), destino: '' }
  };
  if (!out.contacto.includes('nombre') || !(out.contacto.includes('telefono') || out.contacto.includes('email'))) throw Error('El formulario debe pedir nombre y al menos teléfono o correo.');
  out.contacto = Object.keys(CONTACTO).filter(k => out.contacto.includes(k));
  const pre = Array.isArray(f.preguntas) ? f.preguntas : [];
  if (pre.length > 5) throw Error('Hasta 5 preguntas propias: cada pregunta extra baja la cantidad de personas que terminan el formulario.');
  const ids = new Set(Object.keys(CONTACTO));
  out.preguntas = pre.map((p, i) => {
    // La pregunta de interés usa la clave «interes», que el CRM ya lee como interés del lead (metaLeadProfile).
    const id = p?.crm === 'interes' && !ids.has('interes') ? 'interes' : String(p?.id || '').toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'pregunta_' + (i + 1);
    if (!/^[a-z][a-z0-9_]{1,39}$/.test(id) || ids.has(id)) throw Error('Pregunta ' + (i + 1) + ': identificador repetido o no válido.');
    ids.add(id);
    const tipo = p?.tipo === 'texto' ? 'texto' : 'opciones';
    const q = { id, tipo, etiqueta: seguro(p?.etiqueta, 80, 'pregunta ' + (i + 1), { requerido: true }), crm: id === 'interes' ? 'interes' : 'comentario', opciones: [] };
    if (tipo === 'opciones') {
      q.opciones = [...new Set((Array.isArray(p?.opciones) ? p.opciones : []).map(o => seguro(o, 40, 'opción de la pregunta ' + (i + 1))).filter(Boolean))];
      if (q.opciones.length < 2 || q.opciones.length > 6) throw Error('Pregunta ' + (i + 1) + ': entre 2 y 6 opciones.');
    }
    return q;
  });
  const c = out.cierre;
  if (c.boton === 'whatsapp') { const d = telefono(f.cierre?.destino); c.destino = 'https://wa.me/' + d; }
  else if (c.boton === 'llamar') c.destino = '+' + telefono(f.cierre?.destino);
  else c.destino = https(f.cierre?.destino, 'Enlace del botón final');
  const copy = [out.intro.titulo, out.intro.texto, c.titulo, c.texto, c.boton_texto, ...out.preguntas.flatMap(q => [q.etiqueta, ...q.opciones])].join(' ');
  if (/(?:S\/|USD|PEN|US\$|\$)\s*\d|\d[\d.,]*\s*(?:soles|d[oó]lares|%)|\b(?:descuento|oferta|garantizad[oa]|[uú]ltimas? unidades|solo quedan|precio especial)\b/i.test(copy)) throw Error('El formulario contiene precios, descuentos, escasez o promesas no aprobadas.');
  const banned = (brand.forbidden_words || []).find(w => w && copy.toLowerCase().includes(String(w).toLowerCase()));
  if (banned) throw Error('El formulario usa una palabra prohibida por la marca: ' + banned + '.');
  return out;
}

// Cuerpo para POST /{page-id}/leadgen_forms de la Graph API de Meta (lo usa n8n). Se verifica en la prueba del flujo.
function paraMeta(f) {
  const t = f.cierre;
  return {
    name: (f.nombre + ' · v' + f.version).slice(0, 100), locale: 'es_LA',
    questions: [...f.contacto.map(k => ({ type: CONTACTO[k].meta })), ...f.preguntas.map(q => q.tipo === 'opciones'
      ? { type: 'CUSTOM', key: q.id, label: q.etiqueta, options: q.opciones.map((o, i) => ({ value: o, key: q.id + '_' + (i + 1) })) }
      : { type: 'CUSTOM', key: q.id, label: q.etiqueta })],
    privacy_policy: { url: f.privacidad.url, link_text: f.privacidad.texto },
    context_card: { title: f.intro.titulo, style: 'PARAGRAPH_STYLE', content: f.intro.texto ? [f.intro.texto] : [] },
    thank_you_page: t.boton === 'llamar'
      ? { title: t.titulo, body: t.texto, button_type: 'CALL_BUSINESS', button_text: t.boton_texto, business_phone_number: t.destino }
      : { title: t.titulo, body: t.texto, button_type: 'VIEW_WEBSITE', button_text: t.boton_texto, website_url: t.destino },
    follow_up_action_url: t.boton === 'llamar' ? f.privacidad.url : t.destino,
    is_optimized_for_quality: f.tipo === 'mayor_intencion'
  };
}
// Ficha legible para copiar en TikTok Ads Manager o revisar antes de crear en Meta.
function ficha(f) {
  const l = [f.nombre + ' · versión ' + f.version + ' · ' + (f.red === 'tiktok' ? 'TikTok (formulario instantáneo)' : 'Meta (Facebook e Instagram)'),
    'Tipo: ' + (f.tipo === 'mayor_intencion' ? 'mayor intención (pantalla de revisión antes de enviar)' : 'más volumen'), '',
    'BIENVENIDA', f.intro.titulo, f.intro.texto, '', 'DATOS DE CONTACTO', ...f.contacto.map(k => '- ' + CONTACTO[k].etiqueta), '', 'PREGUNTAS'];
  f.preguntas.forEach((q, i) => { l.push((i + 1) + '. ' + q.etiqueta + (q.tipo === 'texto' ? ' (respuesta libre)' : '')); q.opciones.forEach(o => l.push('   ○ ' + o)); });
  if (!f.preguntas.length) l.push('(sin preguntas propias)');
  l.push('', 'PRIVACIDAD', f.privacidad.texto + ': ' + f.privacidad.url, '', 'PANTALLA FINAL', f.cierre.titulo, f.cierre.texto, 'Botón: ' + f.cierre.boton_texto + ' → ' + f.cierre.destino);
  return l.filter((x, i, a) => !(x === '' && a[i - 1] === '')).join('\n');
}

class LeadForms {
  constructor(store) { this.store = store; this.forms = store.ref.collection('greta_formularios'); this.jobs = store.ref.collection('greta_formularios_trabajos'); }
  tx(fn) { return this.store.db.runTransaction(fn); }
  async lista() { return (await this.forms.limit(200).get()).docs.map(d => d.data()).sort((a, b) => String(b.actualizado).localeCompare(String(a.actualizado))); }
  async obtener(id) { const f = (await this.forms.doc(String(id)).get()).data(); if (!f) throw Error('Formulario no encontrado.'); return { ...f, payload_meta: paraMeta(f), ficha: ficha(f) }; }
  // Crear (sin id) o editar (id + revisión vigente). Editar anula la aprobación.
  async guardar(input, user, brand) {
    const v = validarFormulario(input, brand), quien = clean(user.name, 120);
    if (!input?.id) {
      const f = { id: randomUUID(), version: 1, origen_id: null, ...v, estado: 'borrador', revision: 1, aprobacion: null, externo: null, error: '', creado: now(), actualizado: now(), por: quien, historial: [{ at: now(), por: quien, accion: input?.redactado ? 'redactado por G.R.E.T.A' : 'creado', revision: 1 }] };
      await this.tx(async tx => { tx.set(this.forms.doc(f.id), f); });
      return f;
    }
    return this.tx(async tx => {
      const ref = this.forms.doc(String(input.id)), f = (await tx.get(ref)).data();
      if (!f) throw Error('Formulario no encontrado.');
      if (f.revision !== input.revision) throw Error('El formulario cambió; actualízalo antes de guardar.');
      if (EN_META.includes(f.estado) || f.estado === 'reemplazado') throw Error('Este formulario ya está en Meta y Meta no permite editarlo. Usa «Nueva versión» para cambiar los textos.');
      if (f.estado === 'archivado') throw Error('El formulario está archivado.');
      const next = { ...f, ...v, estado: 'borrador', aprobacion: null, error: '', revision: f.revision + 1, actualizado: now(), historial: [...f.historial, { at: now(), por: quien, accion: 'editado', revision: f.revision + 1 }].slice(-50) };
      tx.set(ref, next); return next;
    });
  }
  async aprobar(id, revision, user, brand) {
    return this.tx(async tx => {
      const ref = this.forms.doc(String(id)), f = (await tx.get(ref)).data();
      if (!f) throw Error('Formulario no encontrado.');
      if (f.revision !== revision) throw Error('El formulario cambió; revísalo de nuevo antes de aprobar.');
      if (f.estado !== 'borrador' && f.estado !== 'error') throw Error('Solo se aprueba un formulario en borrador.');
      validarFormulario(f, brand);
      const next = { ...f, estado: 'aprobado', aprobacion: { por: clean(user.name, 120), at: now(), revision }, actualizado: now(), historial: [...f.historial, { at: now(), por: clean(user.name, 120), accion: 'aprobado', revision }].slice(-50) };
      tx.set(ref, next); return next;
    });
  }
  // Encola la creación en Meta. Solo formularios aprobados en su revisión vigente; TikTok se copia a mano con la ficha.
  async solicitarCreacion(id, revision, user, requestId) {
    const rid = /^[a-f0-9-]{36}$/.test(String(requestId || '')) ? requestId : randomUUID();
    return this.tx(async tx => {
      const ref = this.forms.doc(String(id)), f = (await tx.get(ref)).data(), jr = this.jobs.doc(rid), old = (await tx.get(jr)).data();
      if (old) return { ok: true, duplicate: true, estado: f?.estado };
      if (!f) throw Error('Formulario no encontrado.');
      if (f.red !== 'meta') throw Error('TikTok no recibe formularios por esta vía: descarga la ficha y créalo en TikTok Ads Manager.');
      if (f.estado !== 'aprobado' || f.aprobacion?.revision !== f.revision || f.revision !== revision) throw Error('Aprueba esta versión del formulario antes de crearla en Meta.');
      tx.set(jr, { id: rid, tipo: 'crear', form_id: f.id, revision: f.revision, state: 'queued', attempts: 0, payload: paraMeta(f), created_at: now(), por: clean(user.name, 120) });
      tx.set(ref, { ...f, estado: 'en_cola', trabajo_id: rid, actualizado: now(), historial: [...f.historial, { at: now(), por: clean(user.name, 120), accion: 'enviado a Meta (cola n8n)', revision: f.revision }].slice(-50) });
      return { ok: true, job_id: rid };
    });
  }
  // Meta no edita un formulario publicado: se copia como versión nueva en borrador; la anterior se archiva en Meta al crear la nueva.
  async nuevaVersion(id, user) {
    return this.tx(async tx => {
      const ref = this.forms.doc(String(id)), f = (await tx.get(ref)).data();
      if (!f) throw Error('Formulario no encontrado.');
      if (f.estado !== 'creado') throw Error('Solo se versiona un formulario ya creado en Meta; los borradores se editan directamente.');
      const n = { ...f, id: randomUUID(), version: f.version + 1, origen_id: f.id, estado: 'borrador', revision: 1, aprobacion: null, externo: null, error: '', trabajo_id: null, creado: now(), actualizado: now(), por: clean(user.name, 120), historial: [{ at: now(), por: clean(user.name, 120), accion: 'nueva versión de v' + f.version, revision: 1 }] };
      tx.set(this.forms.doc(n.id), n);
      return n;
    });
  }
  async archivar(id, user) {
    return this.tx(async tx => {
      const ref = this.forms.doc(String(id)), f = (await tx.get(ref)).data();
      if (!f) throw Error('Formulario no encontrado.');
      if (f.estado === 'en_cola') throw Error('Espera a que n8n termine de crearlo antes de archivarlo.');
      if (f.externo?.form_id) { const rid = randomUUID(); tx.set(this.jobs.doc(rid), { id: rid, tipo: 'archivar', form_id: f.id, external_id: f.externo.form_id, state: 'queued', attempts: 0, created_at: now(), por: clean(user.name, 120) }); }
      const next = { ...f, estado: 'archivado', actualizado: now(), historial: [...f.historial, { at: now(), por: clean(user.name, 120), accion: 'archivado' + (f.externo?.form_id ? ' (también se archiva en Meta)' : ''), revision: f.revision }].slice(-50) };
      tx.set(ref, next); return next;
    });
  }
  // ---------- n8n: tomar, completar o fallar (con contrato de arrendamiento, sin repetir lo ya hecho) ----------
  async claim() {
    const docs = (await this.jobs.where('state', 'in', ['queued', 'claimed']).limit(20).get()).docs;
    for (const d of docs) {
      const r = await this.tx(async tx => {
        const j = (await tx.get(d.ref)).data();
        if (!j || j.state === 'claimed' && Date.parse(j.lease_until) > Date.now()) return null;
        if (j.attempts >= 3) { tx.set(d.ref, { ...j, state: 'failed', error: 'Tres intentos sin confirmación. Revisa el flujo n8n.', updated_at: now() }); return null; }
        let previo = null; // lecturas antes de escribir (regla de transacciones)
        if (j.tipo === 'crear') { const f = (await tx.get(this.forms.doc(j.form_id))).data(); if (f?.origen_id) { const o = (await tx.get(this.forms.doc(f.origen_id))).data(); previo = o?.externo?.form_id || null; } }
        const next = { ...j, state: 'claimed', lease_token: randomUUID(), lease_until: new Date(Date.now() + 300000).toISOString(), attempts: j.attempts + 1 };
        tx.set(d.ref, next);
        return { id: j.id, tipo: j.tipo, lease_token: next.lease_token, payload: j.payload || null, external_id: j.external_id || null, archivar_anterior: previo };
      });
      if (r) return { ok: true, job: r };
    }
    return { ok: true, job: null };
  }
  async complete(p) {
    const ext = String(p?.external_id || p?.form_id || '');
    return this.tx(async tx => {
      const jr = this.jobs.doc(String(p?.job_id || '')), j = (await tx.get(jr)).data();
      if (!j || j.lease_token !== p?.lease_token) throw Error('Trabajo de formulario no autorizado.');
      if (j.state === 'complete') return { ok: true, duplicate: true };
      const fr = this.forms.doc(j.form_id), f = (await tx.get(fr)).data();
      if (j.tipo === 'crear') {
        if (!/^\d{3,40}$/.test(ext)) throw Error('Falta el ID del formulario creado en Meta.');
        let origen = null; if (f?.origen_id) origen = (await tx.get(this.forms.doc(f.origen_id))).data();
        tx.set(jr, { ...j, state: 'complete', external_id: ext, updated_at: now() });
        if (f) tx.set(fr, { ...f, estado: 'creado', externo: { form_id: ext, creado_at: now() }, error: '', actualizado: now(), historial: [...f.historial, { at: now(), por: 'n8n', accion: 'creado en Meta (' + ext + ')', revision: f.revision }].slice(-50) });
        if (origen && origen.estado === 'creado') tx.set(this.forms.doc(origen.id), { ...origen, estado: 'reemplazado', reemplazado_por: f.id, actualizado: now(), historial: [...origen.historial, { at: now(), por: 'n8n', accion: 'reemplazado por v' + f.version, revision: origen.revision }].slice(-50) });
      } else tx.set(jr, { ...j, state: 'complete', updated_at: now() });
      return { ok: true };
    });
  }
  async fail(p) {
    return this.tx(async tx => {
      const jr = this.jobs.doc(String(p?.job_id || '')), j = (await tx.get(jr)).data();
      if (!j || j.lease_token !== p?.lease_token) throw Error('Trabajo de formulario no autorizado.');
      const error = clean(p?.error || 'Meta rechazó el formulario.', 300), fr = this.forms.doc(j.form_id), f = (await tx.get(fr)).data();
      tx.set(jr, { ...j, state: 'failed', error, updated_at: now() });
      if (f && j.tipo === 'crear') tx.set(fr, { ...f, estado: 'error', aprobacion: null, error, actualizado: now(), historial: [...f.historial, { at: now(), por: 'n8n', accion: 'error de Meta: ' + error, revision: f.revision }].slice(-50) });
      return { ok: true };
    });
  }
  // KPIs por formulario: leads del CRM con ese form_id (los marca el webhook de leads) y hasta qué etapa llegaron.
  async kpis(data, dias = 30) {
    const desde = Date.now() - dias * 86400000, forms = await this.lista();
    return forms.filter(f => f.externo?.form_id).map(f => {
      const ls = (data.leads || []).filter(l => l.form_meta?.form_id === f.externo.form_id && Date.parse(l.received_at || l.created_at || 0) >= desde);
      const cita = ls.filter(l => reached(l, 'Cita')).length, venta = ls.filter(l => reached(l, 'Venta')).length;
      return { id: f.id, nombre: f.nombre, version: f.version, estado: f.estado, leads: ls.length, citas: cita, ventas: venta, tasa_cita: ls.length ? Math.round(cita / ls.length * 1000) / 10 : null };
    });
  }
}
module.exports = { LeadForms, validarFormulario, paraMeta, ficha, CONTACTO, ESTADOS };
