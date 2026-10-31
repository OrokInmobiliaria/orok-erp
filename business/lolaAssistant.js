'use strict';
// R33c · Asistente L.O.L.A para el equipo (botón flotante del CRM, por voz o por escrito).
// - Disponible para Gerente, Vendedor y Broker; responde dudas de uso del CRM, del proceso comercial,
//   del proyecto y del inventario. No ejecuta acciones: indica dónde hacerlas.
// - Proveedor a elección de Gerencia: Claude, ChatGPT (OpenAI) o Gemini. Las claves viven en el directorio
//   privado del servidor (lola-asistente.json) o se reutilizan las ya guardadas; nunca vuelven al navegador.
// - El contexto se arma en el servidor según el rol de la sesión: sin nombres ni teléfonos de clientes,
//   sin márgenes ni comisiones para ventas. No se guardan las conversaciones.
const fs = require('node:fs'), path = require('node:path');
const HELP = require('../src/helpContent.json');

const now = () => new Date().toISOString();
const text = (v, max = 500) => String(v ?? '').trim().slice(0, max);
const uidOf = u => String(u?.id ?? u?.uid ?? u?.name ?? '');
const limaDay = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const PROVIDERS = {
  claude: { label: 'Claude (Anthropic)', model: 'claude-haiku-5-5', host: 'api.anthropic.com' },
  openai: { label: 'ChatGPT (OpenAI)', model: 'gpt-5-mini', host: 'api.openai.com' },
  gemini: { label: 'Gemini (Google)', model: 'gemini-3.8-flash', host: 'generativelanguage.googleapis.com' }
};
const DEFAULTS = { enabled: false, provider: 'gemini', model: '', max_per_day: 80, voice_server: true };
const ROLES = ['Gerente', 'Vendedor', 'Broker'];
const soldUnit = u => !!u?.sold_lead_id || ['SOLD', 'VENDIDO', 'VENDIDA', 'VENTA'].includes(String(u?.status || '').toUpperCase());
const redact = s => String(s || '').replace(/sk-[A-Za-z0-9_-]{10,}|sk-ant-[A-Za-z0-9_-]+|AIza[0-9A-Za-z_-]{20,}/g, '[clave oculta]').slice(0, 240);

class LolaAssistant {
  constructor(store, config, options = {}) {
    this.store = store; this.dir = config.privateDir; this.fetch = options.fetcher || ((...a) => fetch(...a));
    this.usage = store.ref.collection('lola_assistant_usage');
  }
  file() { return path.join(this.dir, 'lola-asistente.json'); }
  raw() { try { return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(this.file(), 'utf8')) }; } catch { return { ...DEFAULTS }; } }
  creativeKey() { try { return JSON.parse(fs.readFileSync(path.join(this.dir, 'creative-claude.json'), 'utf8')).apiKey || ''; } catch { return ''; } }
  key(c, settings) {
    if (c.apiKey) return { key: c.apiKey, source: 'propia' };
    if (c.provider === 'claude' && this.creativeKey()) return { key: this.creativeKey(), source: 'Campañas IA (Claude)' };
    if (c.provider === 'gemini' && settings?.geminiApiKey) return { key: settings.geminiApiKey, source: 'Ajustes (Gemini)' };
    return { key: '', source: null };
  }
  publicConfig(settings) {
    const c = this.raw(), k = this.key(c, settings);
    return { enabled: c.enabled === true, provider: c.provider, provider_label: PROVIDERS[c.provider]?.label || c.provider, model: c.model || PROVIDERS[c.provider]?.model || '',
      default_model: PROVIDERS[c.provider]?.model || '', max_per_day: c.max_per_day, voice_server: c.voice_server !== false && c.provider !== 'claude',
      key_configured: !!k.key, key_source: k.source, own_key: !!c.apiKey, updated_at: c.updated_at || null, updated_by: c.updated_by || null,
      providers: Object.entries(PROVIDERS).map(([id, p]) => ({ id, label: p.label, default_model: p.model })) };
  }
  save(input, user, settings) {
    if (user.role !== 'Gerente') throw Error('Requiere Gerencia.');
    const c = this.raw(), provider = PROVIDERS[input?.provider] ? input.provider : c.provider;
    const next = { ...c, enabled: input?.enabled === true, provider, model: text(input?.model, 80).replace(/[^a-zA-Z0-9._:-]/g, ''),
      max_per_day: Math.max(5, Math.min(500, Number(input?.max_per_day) || DEFAULTS.max_per_day)), voice_server: input?.voice_server !== false,
      updated_by: text(user.name, 120), updated_at: now() };
    if (provider !== c.provider && !input?.apiKey) next.apiKey = ''; // una clave propia es de un proveedor
    if (input?.clearKey === true) next.apiKey = '';
    if (typeof input?.apiKey === 'string' && input.apiKey.trim()) {
      const k = input.apiKey.trim();
      if (k.length < 20 || k.length > 400 || /\s/.test(k)) throw Error('La clave no parece válida.');
      next.apiKey = k;
    }
    if (next.enabled && !this.key(next, settings).key) throw Error('Para activar el asistente registra una clave del proveedor elegido.');
    fs.mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    const tmp = this.file() + '.tmp-' + process.pid + '-' + Date.now();
    fs.writeFileSync(tmp, JSON.stringify(next, null, 2), { mode: 0o600 }); fs.renameSync(tmp, this.file()); try { fs.chmodSync(this.file(), 0o600); } catch {}
    return this.publicConfig(settings);
  }

  // ---------- Contexto según el rol de la sesión ----------
  async context(user, d) {
    const { navGroups } = await import('../src/navModel.mjs');
    const s = d.settings || {}, g = user.role === 'Gerente';
    const units = d.units || [];
    const sold = units.filter(soldUnit).length;
    const separated = new Set((d.separations || []).filter(x => ['CONFIRMED', 'RESERVED'].includes(x.status)).map(x => x.unit_id));
    const disponibles = units.filter(u => !soldUnit(u) && !separated.has(u.id) && !/bloq|reserv|separ/i.test(String(u.status || '')));
    const mine = l => g || [l.sales_owner, l.assigned_to, l.broker_name].map(x => String(x || '').trim()).some(x => x && (x === user.name || (user.brokerName && x === user.brokerName)));
    const leads = (d.leads || []).filter(l => l && mine(l));
    const byStage = {}; for (const l of leads) { const k = String(l.status || 'Sin etapa'); byStage[k] = (byStage[k] || 0) + 1; }
    const today = new Date().toISOString();
    const vencidas = leads.filter(l => l.next_action_at && String(l.next_action_at) < today && !/venta|perdid|desestim/i.test(String(l.status || ''))).length;
    const proyecto = { nombre: s.projectName || 'Infinity 224', web: s.webUrl || null, separacion_pct: s.separationPct ?? null, tipo_cambio: s.exchangeRate ?? null,
      ...(g ? { comision_global_pct: s.globalCommissionPct ?? null, comision_vendedor_pct: s.sellerCommissionPct ?? null } : {}) };
    return {
      usuario: { nombre: user.name, rol: user.role },
      fecha_lima: limaDay(),
      menu_disponible: navGroups(user.role, 'crm').map(x => ({ grupo: x.label, opciones: x.items.map(i => i[1]) })),
      proyecto,
      inventario: { total: units.length, vendidas: sold, separadas: units.filter(u => !soldUnit(u) && separated.has(u.id)).length, disponibles: disponibles.length,
        unidades_disponibles: disponibles.slice(0, 80).map(u => ({ unidad: String(u.unit_number || ''), tipologia: text(u.unit_type, 40), piso: u.floor ?? null,
          area_techada: u.covered_area ?? null, area_libre: u.free_area ?? null, precio_lista: u.price ?? null })) },
      mis_leads: { alcance: g ? 'todo el equipo' : 'solo los asignados a ti', total: leads.length, por_etapa: byStage, acciones_vencidas: vencidas },
      manual: HELP.manual.map(x => ({ tema: x.title, texto: x.text })),
      playbook: HELP.playbook.map(x => ({ tema: x.title, texto: x.text })),
      ruta_comercial: HELP.route.map(x => x.label + ': ' + x.detail),
      guia_modulos: (HELP.modulos || []).filter(m => g || m.roles === 'todos').map(m => ({ modulo: m.title, ia_hace: m.ia, decides_tu: m.tu }))
    };
  }
  system(ctx, voice) {
    return `Eres L.O.L.A, la asistente interna del CRM Inmobiliario de ÖRÖK (Lima, Perú). Ayudas a ${ctx.usuario.nombre} (${ctx.usuario.rol}) con dudas sobre:
- cómo usar el CRM (dónde está cada opción del menú y qué hace),
- el proceso comercial de ÖRÖK (manual y playbook),
- el proyecto y el inventario disponible,
- cómo redactar mensajes a clientes (WhatsApp, correo) con tono profesional y cercano.
REGLAS
1. Usa solo el CONTEXTO. Si un dato no está, dilo y sugiere a quién preguntar (Gerencia) o dónde mirarlo en el CRM. No inventes precios, áreas ni disponibilidad.
2. No ejecutas acciones: explica los pasos y el lugar del menú ("Ventas > Kanban de leads", por ejemplo). Solo menciona opciones que estén en menu_disponible.
3. No tienes datos personales de clientes y no los pidas. No reveles márgenes, costos, utilidades ni comisiones que no estén en el contexto.
4. La evaluación financiera de proyectos y el estudio de mercado son de M.O.R.A, en el módulo Evaluador Inmobiliario, solo para Gerencia.
5. Respuestas en español peruano neutro, claras y breves${voice ? ': máximo 70 palabras, en frases cortas que suenen bien leídas en voz alta, sin listas ni símbolos' : ': máximo 160 palabras; usa guiones para pasos'}. Sin tablas.
CONTEXTO (JSON):
${JSON.stringify(ctx)}`;
  }

  // ---------- Proveedores ----------
  // R54 · `opts.max` amplía la respuesta (p. ej. JSON de «Dictar o adjuntar») y cada mensaje puede traer imágenes o PDF (`images: [{mime, b64, name}]`).
  async call(c, key, system, messages, opts = {}) {
    const model = c.model || PROVIDERS[c.provider].model, max = Math.min(4000, Math.max(200, Number(opts.max) || 700));
    const imgs = m => Array.isArray(m.images) ? m.images : [];
    const post = async (url, headers, body) => {
      if (new URL(url).hostname !== PROVIDERS[c.provider].host) throw Error('Destino no permitido.');
      const r = await this.fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(opts.max ? 90000 : 45000) });
      let j = null; try { j = await r.json(); } catch {}
      if (!r.ok) throw Error(`${PROVIDERS[c.provider].label} respondió ${r.status}: ${redact(j?.error?.message || j?.message || 'sin detalle')}`);
      return j;
    };
    if (c.provider === 'claude') {
      const j = await post('https://api.anthropic.com/v1/messages', { 'x-api-key': key, 'anthropic-version': '2023-06-01' }, { model, max_tokens: max, system, messages: messages.map(m => ({ role: m.role, content: imgs(m).length ? [...imgs(m).map(i => i.mime === 'application/pdf' ? { type: 'document', source: { type: 'base64', media_type: i.mime, data: i.b64 } } : { type: 'image', source: { type: 'base64', media_type: i.mime, data: i.b64 } }), { type: 'text', text: m.text }] : m.text })) });
      return (j?.content || []).filter(x => x.type === 'text').map(x => x.text).join('').trim();
    }
    if (c.provider === 'openai') {
      const j = await post('https://api.openai.com/v1/chat/completions', { Authorization: 'Bearer ' + key }, { model, max_completion_tokens: max * 3, messages: [{ role: 'system', content: system }, ...messages.map(m => ({ role: m.role, content: imgs(m).length ? [{ type: 'text', text: m.text }, ...imgs(m).map(i => i.mime === 'application/pdf' ? { type: 'file', file: { filename: i.name || 'documento.pdf', file_data: 'data:application/pdf;base64,' + i.b64 } } : { type: 'image_url', image_url: { url: 'data:' + i.mime + ';base64,' + i.b64 } })] : m.text }))] });
      return String(j?.choices?.[0]?.message?.content || '').trim();
    }
    const j = await post(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { 'x-goog-api-key': key }, {
      systemInstruction: { parts: [{ text: system }] }, contents: messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.text }, ...imgs(m).map(i => ({ inline_data: { mime_type: i.mime, data: i.b64 } }))] })),
      generationConfig: { maxOutputTokens: max * 2, temperature: opts.json ? 0.2 : 0.4 } });
    return (j?.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();
  }
  async count(user, c) {
    const id = (uidOf(user) + '-' + limaDay()).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
    return this.store.db.runTransaction(async tx => {
      const ref = this.usage.doc(id), u = (await tx.get(ref)).data() || { id, uid: uidOf(user), day: limaDay(), n: 0 };
      if (u.n >= c.max_per_day) throw Error('Alcanzaste el límite diario de consultas al asistente. Vuelve a intentar mañana o consulta a Gerencia.');
      tx.set(ref, { ...u, n: u.n + 1, updated_at: now() }); return u.n + 1;
    });
  }
  async ask(input, user, d) {
    if (!ROLES.includes(user.role)) throw Error('Rol no autorizado.');
    const c = this.raw();
    if (!c.enabled) throw Error(user.role === 'Gerente' ? 'El asistente está apagado. Actívalo con el engranaje del panel.' : 'El asistente aún no está activado. Pídeselo a Gerencia.');
    const k = this.key(c, d.settings);
    if (!k.key) throw Error('Falta la clave del proveedor. Gerencia puede registrarla con el engranaje del panel.');
    const msgs = (Array.isArray(input?.messages) ? input.messages : []).slice(-10).map(m => ({ role: m?.role === 'assistant' ? 'assistant' : 'user', text: text(m?.text, 2000) })).filter(m => m.text);
    while (msgs.length && msgs[0].role !== 'user') msgs.shift();
    if (!msgs.length || msgs[msgs.length - 1].role !== 'user') throw Error('Escribe tu consulta.');
    for (let i = msgs.length - 1; i > 0; i--) if (msgs[i].role === msgs[i - 1].role) { msgs[i - 1].text += '\n' + msgs[i].text; msgs.splice(i, 1); }
    await this.count(user, c);
    const ctx=await this.context(user,d);if(this.projectDrive){const drive=await this.projectDrive.context('lola',d.settings?.projectName||'Infinity224',user);if(drive?.fuentes?.length||drive?.historial_otros_proyectos)ctx.drive=drive;}
    let extra = ''; if (this.lecciones) { try { extra = await this.lecciones.instrucciones('lola'); } catch {} } // R75 · lecciones aprobadas
    const reply = await this.call(c, k.key, this.system(ctx, input?.voice === true) + extra, msgs);
    if (!reply) throw Error('El asistente no devolvió respuesta. Intenta de nuevo.');
    return { reply: reply.slice(0, 4000), provider: PROVIDERS[c.provider].label };
  }
  // Dictado de respaldo cuando el navegador no tiene reconocimiento de voz (Gemini u OpenAI).
  async transcribe(input, user, d) {
    const c = this.raw();
    if (!c.enabled || c.voice_server === false || c.provider === 'claude') throw Error('El dictado por el servidor no está disponible con este proveedor.');
    const k = this.key(c, d.settings); if (!k.key) throw Error('Falta la clave del proveedor.');
    const mime = String(input?.mime || '').split(';')[0];
    if (!['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav'].includes(mime)) throw Error('Formato de audio no compatible.');
    const b64 = String(input?.audio || '');
    if (!/^[A-Za-z0-9+/=]+$/.test(b64) || b64.length < 100 || b64.length > 6000000) throw Error('El audio no es válido o es muy largo (máximo 1 minuto).');
    await this.count(user, c);
    if (c.provider === 'gemini') {
      const model = c.model || PROVIDERS.gemini.model;
      const r = await this.fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { method: 'POST', signal: AbortSignal.timeout(45000),
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': k.key },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Transcribe literalmente este audio en español. Devuelve solo el texto.' }, { inline_data: { mime_type: mime, data: b64 } }] }] }) });
      const j = await r.json().catch(() => null); if (!r.ok) throw Error('Gemini no pudo transcribir el audio.');
      return { text: (j?.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim().slice(0, 2000) };
    }
    const form = new FormData();
    form.append('model', 'gpt-4o-mini-transcribe'); form.append('language', 'es');
    form.append('file', new Blob([Buffer.from(b64, 'base64')], { type: mime }), 'consulta.' + (mime.split('/')[1] || 'webm'));
    const r = await this.fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: 'Bearer ' + k.key }, body: form, signal: AbortSignal.timeout(45000) });
    const j = await r.json().catch(() => null); if (!r.ok) throw Error('OpenAI no pudo transcribir el audio.');
    return { text: String(j?.text || '').trim().slice(0, 2000) };
  }
  async test(user, d) {
    if (user.role !== 'Gerente') throw Error('Requiere Gerencia.');
    const c = this.raw(), k = this.key(c, d.settings);
    if (!k.key) throw Error('Falta la clave del proveedor.');
    const reply = await this.call(c, k.key, 'Responde solo: "L.O.L.A lista".', [{ role: 'user', text: 'Prueba de conexión' }]);
    return { ok: true, reply: reply.slice(0, 120), provider: PROVIDERS[c.provider].label, model: c.model || PROVIDERS[c.provider].model };
  }
  async rpc(name, args, user, readData) {
    if (name === 'getLolaAssistant') { const d = await readData(); const p = this.publicConfig(d.settings); return user.role === 'Gerente' ? p : { enabled: p.enabled && p.key_configured, provider_label: p.provider_label, voice_server: p.voice_server }; }
    if (name === 'saveLolaAssistant') return this.save(args[0] || {}, user, (await readData()).settings);
    if (name === 'testLolaAssistant') return this.test(user, await readData());
    if (name === 'askLolaAssistant') return this.ask(args[0] || {}, user, await readData());
    if (name === 'transcribeLolaAssistant') return this.transcribe(args[0] || {}, user, await readData());
    throw Error('Operación no reconocida.');
  }
}
const LOLA_ASSIST_METHODS = ['getLolaAssistant', 'saveLolaAssistant', 'testLolaAssistant', 'askLolaAssistant', 'transcribeLolaAssistant'];
module.exports = { LolaAssistant, LOLA_ASSIST_METHODS, PROVIDERS };
