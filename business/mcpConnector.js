'use strict';
// R44 · Conector del ERP para Claude (servidor MCP remoto con OAuth 2.1 + PKCE).
// - Claude se conecta a https://<erp>/mcp. La persona inicia sesión en el ERP y autoriza; Claude actúa con SUS permisos.
// - Cada herramienta llama a los mismos métodos RPC que usa la pantalla, con una sesión de corta duración de esa persona:
//   el servidor del ERP sigue siendo la única autoridad de permisos (roles, áreas, empresas, aprobaciones).
// - Apagado por defecto (mcp.json en el directorio privado). Solo los roles configurados (por defecto Gerente) pueden conectar.
// - Tokens: aleatorios, guardados solo como hash; acceso 1 hora, renovación 30 días con rotación; revocables desde el ERP.
// - Las herramientas leen y proponen. No aprueban órdenes, no borran, no mueven etapas ni pagan.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');

const now = () => new Date().toISOString();
const sha = v => crypto.createHash('sha256').update(String(v)).digest('hex');
const rnd = (n = 32) => crypto.randomBytes(n).toString('base64url');
const text = (v, n = 500) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, n);
const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const ACCESS_TTL = 3600, REFRESH_TTL = 30 * 86400, CODE_TTL = 300, PENDING_TTL = 600;
const DEFAULT_CFG = { enabled: false, roles: ['Gerente'], extra_redirect_hosts: [] };

function readCfg(dir) { try { return { ...DEFAULT_CFG, ...JSON.parse(fs.readFileSync(path.join(dir, 'mcp.json'), 'utf8')) }; } catch { return { ...DEFAULT_CFG }; } }
function writeCfg(dir, cfg) { fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); const f = path.join(dir, 'mcp.json'), t = f + '.' + process.pid + '.tmp'; fs.writeFileSync(t, JSON.stringify(cfg, null, 1), { mode: 0o600 }); fs.renameSync(t, f); }
// Solo se aceptan redirecciones de Claude (web y escritorio) y de equipos locales (Claude Code), más hosts que Gerencia agregue.
function redirectOk(uri, cfg) {
  let u; try { u = new URL(String(uri)); } catch { return false; }
  if (u.username || u.password || u.hash) return false;
  if (u.protocol === 'http:') return ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  if (u.protocol !== 'https:') return false;
  return ['claude.ai', 'claude.com', ...(cfg.extra_redirect_hosts || [])].some(h => u.hostname === h || u.hostname.endsWith('.' + h));
}
const pkceOk = (verifier, challenge) => /^[A-Za-z0-9\-._~]{43,128}$/.test(String(verifier || '')) && crypto.createHash('sha256').update(String(verifier)).digest('base64url') === challenge;

// ---------- Herramientas: nombre, descripción, esquema y cómo se resuelven con los métodos del ERP ----------
const obj = (props = {}, required = []) => ({ type: 'object', properties: props, required, additionalProperties: false });
const ETAPAS_TXT = 'Etapa del Kanban tal como aparece en el CRM (por ejemplo «Contactado», «Cita», «Separación»).';
function leadCorto(l, conComentario = true) {
  const c = (l.comment_history || []).at(-1);
  return { id: l.id, numero: l.lead_number || null, nombre: l.name || '', telefono: l.phone || '', correo: l.email || '', etapa: l.status || '', origen: l.source || '', interes: l.interest || l.unit_interest || '', asesor: l.assigned_to || l.advisor || l.asesor || '', recibido: l.received_at || l.created_at || null, proxima_accion: l.next_action || l.nextAction || null, ...(conComentario && c ? { ultimo_comentario: { fecha: c.at, autor: c.author, texto: String(c.text || '').slice(0, 400) } } : {}) };
}
const recibido = l => Date.parse(l.received_at || l.created_at || 0) || 0;
const TOOLS = [
  { name: 'resumen_del_dia', title: 'Resumen del día', ro: true,
    description: 'Resumen de Gerencia o del usuario: leads nuevos y por etapa, órdenes OC/OS que le toca aprobar y, si es Gerencia, pendientes y sugerencias de marketing (G.R.E.T.A).',
    schema: obj(),
    run: async (a, x) => {
      const leads = await x.call('getLeads'), sem = Date.now() - 7 * 86400000, etapas = {};
      for (const l of leads) etapas[l.status || 'Sin etapa'] = (etapas[l.status || 'Sin etapa'] || 0) + 1;
      const out = { fecha: new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', dateStyle: 'full', timeStyle: 'short' }).format(new Date()), usuario: x.user.name, rol: x.user.role, crm: { leads_total: leads.length, nuevos_7_dias: leads.filter(l => recibido(l) >= sem).length, por_etapa: etapas } };
      try { out.ordenes_por_aprobar = (await pendientes(x)).length; } catch (e) { out.ordenes_por_aprobar = 'No disponible: ' + e.message; }
      if (x.user.role === 'Gerente') { try { const h = await x.call('gretaHoy'); out.marketing = { por_aprobar: h.por_aprobar, sugerencias: h.sugerencias, lo_que_preguntan_los_clientes: h.lola?.temas }; } catch (e) { out.marketing = 'No disponible: ' + e.message; } }
      return out;
    } },
  { name: 'buscar_leads', title: 'Buscar leads', ro: true,
    description: 'Busca leads del CRM por nombre, teléfono, correo o interés, y filtra por etapa y antigüedad. Devuelve como máximo 50.',
    schema: obj({ texto: { type: 'string', description: 'Texto a buscar (opcional).' }, etapa: { type: 'string', description: ETAPAS_TXT }, ultimos_dias: { type: 'integer', minimum: 1, maximum: 3650 }, limite: { type: 'integer', minimum: 1, maximum: 50 } }),
    run: async (a, x) => {
      const q = text(a.texto, 120).toLowerCase(), desde = a.ultimos_dias ? Date.now() - a.ultimos_dias * 86400000 : 0;
      const r = (await x.call('getLeads')).filter(l => (!a.etapa || String(l.status || '').toLowerCase() === String(a.etapa).toLowerCase()) && (!desde || recibido(l) >= desde) && (!q || [l.name, l.phone, l.email, l.interest, l.unit_interest, l.lead_number].some(v => String(v || '').toLowerCase().includes(q))));
      r.sort((m, n) => recibido(n) - recibido(m));
      return { total: r.length, leads: r.slice(0, Math.min(50, a.limite || 20)).map(l => leadCorto(l)) };
    } },
  { name: 'ver_lead', title: 'Ver un lead', ro: true,
    description: 'Ficha de un lead con sus últimos 15 comentarios.',
    schema: obj({ id: { type: 'string' } }, ['id']),
    run: async (a, x) => {
      const l = (await x.call('getLeads')).find(v => v.id === a.id || v.lead_number === a.id); if (!l) throw Error('Lead no encontrado.');
      return { ...leadCorto(l, false), comentarios: (l.comment_history || []).slice(-15).map(c => ({ fecha: c.at, autor: c.author, texto: String(c.text || '').slice(0, 1500) })) };
    } },
  { name: 'agregar_comentario_lead', title: 'Agregar comentario a un lead', ro: false,
    description: 'Agrega un comentario al historial de un lead, firmado por el usuario conectado. No cambia la etapa ni el orden del Kanban.',
    schema: obj({ id: { type: 'string' }, texto: { type: 'string', minLength: 1, maxLength: 4000 } }, ['id', 'texto']),
    run: async (a, x) => { const e = await x.call('addLeadComment', [a.id, { text: text(a.texto, 4000) + '\n(vía Claude)', requestId: 'mcp-' + crypto.randomUUID() }]); return { ok: true, comentario_id: e?.id || null }; } },
  { name: 'ordenes_por_aprobar', title: 'Órdenes OC/OS por aprobar', ro: true,
    description: 'Órdenes de compra o servicio que le toca aprobar ahora al usuario conectado, con monto, proveedor, empresa y proyecto. La aprobación se hace en el ERP.',
    schema: obj(),
    run: async (a, x) => ({ ordenes: (await pendientes(x)).map(ordenCorta) }) },
  { name: 'listar_ordenes', title: 'Listar órdenes OC/OS', ro: true,
    description: 'Órdenes de compra y de servicio visibles para el usuario, filtradas por empresa (BMG, MZA, MAAS) y texto. Máximo 50, las más recientes.',
    schema: obj({ empresa: { type: 'string', enum: ['BMG', 'MZA', 'MAAS'] }, texto: { type: 'string' }, limite: { type: 'integer', minimum: 1, maximum: 50 } }),
    run: async (a, x) => {
      const q = text(a.texto, 120).toLowerCase(), r = ((await x.call('claraList', [null]))?.data?.ordenes || []).filter(o => !o.eliminado && (!a.empresa || o.empresa === a.empresa) && (!q || JSON.stringify([o.n, o.proveedor, o.proyecto, o.descripcion, o.concepto]).toLowerCase().includes(q)));
      r.sort((m, n) => String(n.upd || n.fecha || '').localeCompare(String(m.upd || m.fecha || '')));
      return { total: r.length, ordenes: r.slice(0, Math.min(50, a.limite || 20)).map(ordenCorta) };
    } },
  { name: 'evaluaciones_inmobiliarias', title: 'Evaluaciones de M.O.R.A', ro: true,
    description: 'Lista las evaluaciones de proyectos del Evaluador (M.O.R.A) visibles para el usuario, con su resumen e indicadores.',
    schema: obj(), run: async (a, x) => ({ evaluaciones: (await x.call('getMoraEvaluations')).slice(0, 30) }) },
  { name: 'marketing_hoy', title: 'Marketing: hoy', ro: true,
    description: 'Pendientes de aprobación, pauta de 7 días, leads por origen, sugerencias de G.R.E.T.A y temas que preguntan los clientes (sin datos personales). Solo Gerencia.',
    schema: obj(), run: async (a, x) => x.call('gretaHoy') },
  { name: 'marketing_kpis', title: 'Marketing: pauta y KPIs', ro: true,
    description: 'KPIs de anuncios de Meta y TikTok cruzados con el CRM (costo por lead y por cita) y KPIs por formulario instantáneo. Solo Gerencia.',
    schema: obj({ dias: { type: 'integer', enum: [7, 14, 30, 90] }, red: { type: 'string', enum: ['facebook', 'instagram', 'tiktok'] } }),
    run: async (a, x) => ({ anuncios: await x.call('gretaKpis', [{ dias: a.dias || 7, platform: a.red || '' }]), formularios: (await x.call('gretaFormularios', [{ dias: a.dias || 30 }])).kpis }) },
  { name: 'marketing_tendencias', title: 'Marketing: radar de tendencias', ro: false,
    description: 'Pide a G.R.E.T.A una lectura nueva de tendencias del nicho en Facebook, Instagram y TikTok, con fuentes. Usa la IA del ERP y queda guardada. Solo Gerencia.',
    schema: obj({ nichos: { type: 'array', items: { type: 'string', enum: ['Departamentos en Lima', 'Arquitectura', 'Interiorismo', 'Construcción', 'Inversión inmobiliaria'] } }, redes: { type: 'array', items: { type: 'string', enum: ['facebook', 'instagram', 'tiktok'] } }, dias: { type: 'integer', enum: [7, 30] } }),
    run: async (a, x) => x.call('gretaTendencias', [a]) },
  { name: 'marketing_crear_alternativas', title: 'Marketing: crear alternativas de una tendencia', ro: false,
    description: 'Convierte una tendencia (lectura_id y tendencia_id de marketing_tendencias) en una campaña en borrador con piezas propuestas. Queda para revisión y aprobación de Gerencia en el Estudio.',
    schema: obj({ lectura_id: { type: 'string' }, tendencia_id: { type: 'string' } }, ['lectura_id', 'tendencia_id']),
    run: async (a, x) => x.call('gretaIdea', [{ ...a, request_id: crypto.randomUUID() }]) },
  { name: 'marketing_formularios', title: 'Marketing: formularios instantáneos', ro: true,
    description: 'Formularios instantáneos (Meta y TikTok) con su estado, versión y leads/citas que trajeron. Solo Gerencia.',
    schema: obj(), run: async (a, x) => { const r = await x.call('gretaFormularios', [{}]); return { formularios: r.formularios.map(f => ({ id: f.id, nombre: f.nombre, version: f.version, red: f.red, estado: f.estado, actualizado: f.actualizado })), kpis: r.kpis }; } },
  { name: 'marketing_redactar_formulario', title: 'Marketing: redactar formulario', ro: false,
    description: 'G.R.E.T.A redacta un formulario instantáneo en borrador (opcionalmente desde una campaña). Gerencia lo edita y aprueba en el ERP.',
    schema: obj({ campaign_id: { type: 'string' }, red: { type: 'string', enum: ['meta', 'tiktok'] } }),
    run: async (a, x) => x.call('gretaFormularioRedactar', [a]) },
  { name: 'estado_operaciones', title: 'Estado de operaciones (L.O.L.A Operaciones)', ro: true,
    description: 'Salud de la base de datos, Drive y n8n; último resguardo cifrado, si está atrasado, su verificación en Drive y los conteos de control (leads, comentarios, firma del Kanban). Solo Gerencia.',
    schema: obj(), run: async (a, x) => { const e = await x.call('opsEstado'); return { activo: e.activo, atrasado: e.atrasado, salud: e.salud, ultimo: e.ultimo && { at: e.ultimo.at, estado: e.ultimo.estado, bytes: e.ultimo.bytes, avisos: e.ultimo.avisos, conteos: e.ultimo.conteos }, ultima_verificacion: e.ultima_verificacion, llave_configurada: !!e.llave }; } },
  { name: 'preguntar_a_ia_del_erp', title: 'Preguntar a una IA del ERP', ro: true,
    description: 'Hace una consulta a L.O.L.A (CRM), C.L.A.R.A (contabilidad, solo Gerencia) o G.R.E.T.A (marketing, solo Gerencia), que responden con los datos y reglas de su módulo.',
    schema: obj({ ia: { type: 'string', enum: ['lola', 'clara', 'greta'] }, pregunta: { type: 'string', minLength: 2, maxLength: 3000 } }, ['ia', 'pregunta']),
    run: async (a, x) => {
      const q = text(a.pregunta, 3000);
      if (a.ia === 'greta') return { respuesta: (await x.call('gretaAsk', [{ pregunta: q }])).respuesta };
      if (a.ia === 'clara') { const r = await x.call('claraAsk', [{ messages: [{ role: 'user', text: q }] }]); return { respuesta: r.reply || r.respuesta || r.text || r }; }
      const r = await x.call('askLolaAssistant', [{ messages: [{ role: 'user', text: q }] }]); return { respuesta: r.reply };
    } }
];
function ordenCorta(o) { return { id: o.id, numero: o.n || o.numero || null, tipo: o.tipo || null, empresa: o.empresa || null, proveedor: o.proveedor_nombre || o.proveedor || null, proyecto: o.proyecto || null, total: o.total ?? null, moneda: o.moneda || null, estado: o.estado || null, solicitante: o.solicitante?.nombre || o.solicitante?.name || null, aprobacion: (o.aprobacion?.pasos || []).map(p => ({ rol: p.rol || p.cargo || null, nombre: p.nombre || p.name || null, estado: p.estado || 'pendiente' })), actualizado: o.upd || null }; }
async function pendientes(x) {
  const APROB = require('./claraAprobaciones'), yo = await x.call('claraWhoAmI'), ids = new Set([String(yo.id || ''), String(x.user.id || '')].filter(Boolean));
  const ordenes = (await x.call('claraList', [null]))?.data?.ordenes || [];
  return ordenes.filter(o => !o.eliminado && o.aprobacion && !APROB.completa(o.aprobacion) && !['anulada', 'borrador', 'observada'].includes(String(o.estado || '').toLowerCase())
    && APROB.turno(o.aprobacion, o.aprobacion.secuencial !== false).some(k => ids.has(String(o.aprobacion.pasos[k]?.user_id || ''))));
}

class McpConnector {
  // rpc(method, args, cookie) = el mismo despachador que usa la pantalla. issueSession(userId) = cookie de sesión breve de esa persona.
  constructor(store, config, { rpc, issueSession, version = '' } = {}) {
    this.store = store; this.config = config; this.dir = config.privateDir; this.rpcFn = rpc; this.issue = issueSession; this.version = version;
    const c = n => store.ref.collection(n);
    this.clients = c('mcp_clientes'); this.pending = c('mcp_solicitudes'); this.codes = c('mcp_codigos'); this.tokens = c('mcp_tokens'); this.audit = c('mcp_auditoria');
    this.rate = new Map();
  }
  cfg() { return readCfg(this.dir); }
  origin() { return String(this.config.origin || '').replace(/\/$/, ''); }
  tx(fn) { return this.store.db.runTransaction(fn); }
  async put(col, id, v) { await this.tx(async t => { t.set(col.doc(id), v); }); }
  async get(col, id) { return (await col.doc(String(id)).get()).data() || null; }
  // ---------- Metadatos OAuth (RFC 9728 y RFC 8414) ----------
  resourceMetadata() { const o = this.origin(); return { resource: o + '/mcp', authorization_servers: [o], bearer_methods_supported: ['header'], resource_name: 'ERP ÖRÖK', resource_documentation: o + '/mcp/ayuda' }; }
  serverMetadata() {
    const o = this.origin();
    return { issuer: o, authorization_endpoint: o + '/mcp/oauth/authorize', token_endpoint: o + '/mcp/oauth/token', registration_endpoint: o + '/mcp/oauth/register', revocation_endpoint: o + '/mcp/oauth/revoke',
      response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'], code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported: ['none'], scopes_supported: ['erp'] };
  }
  // ---------- Registro dinámico de clientes (RFC 7591) ----------
  async register(body) {
    const cfg = this.cfg(); if (!cfg.enabled) throw Object.assign(Error('El conector del ERP está apagado. Gerencia lo activa en Configuración › Conexiones de IA.'), { status: 403, code: 'access_denied' });
    const uris = Array.isArray(body?.redirect_uris) ? body.redirect_uris.map(String) : [];
    if (!uris.length || uris.length > 5 || !uris.every(u => redirectOk(u, cfg))) throw Object.assign(Error('Dirección de retorno no permitida.'), { status: 400, code: 'invalid_redirect_uri' });
    const c = { client_id: 'mcp-' + rnd(18), client_name: text(body?.client_name || 'Cliente MCP', 80), redirect_uris: uris, token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], client_id_issued_at: Math.floor(Date.now() / 1000) };
    const n = (await this.clients.limit(501).get()).docs.length; if (n >= 500) throw Object.assign(Error('Demasiados clientes registrados.'), { status: 400, code: 'invalid_client_metadata' });
    await this.put(this.clients, c.client_id, { ...c, creado: now() });
    return c;
  }
  // ---------- Autorización: valida la solicitud y guarda una solicitud pendiente (la persona confirma en la página del ERP) ----------
  async authorizeRequest(q) {
    const cfg = this.cfg(), c = await this.get(this.clients, q.get('client_id') || '');
    if (!cfg.enabled) return { error: 'El conector del ERP está apagado. Gerencia lo activa en Configuración › Conexiones de IA.' };
    if (!c) return { error: 'Cliente no registrado. Vuelve a agregar el conector en Claude.' };
    const redirect = q.get('redirect_uri') || c.redirect_uris[0];
    if (!c.redirect_uris.includes(redirect)) return { error: 'Dirección de retorno no registrada.' };
    const back = (error, desc) => { const u = new URL(redirect); u.searchParams.set('error', error); if (desc) u.searchParams.set('error_description', desc); if (q.get('state')) u.searchParams.set('state', q.get('state')); return { redirect: u.href }; };
    if (q.get('response_type') !== 'code') return back('unsupported_response_type');
    if (q.get('code_challenge_method') !== 'S256' || !/^[A-Za-z0-9\-_]{43,128}$/.test(q.get('code_challenge') || '')) return back('invalid_request', 'Se requiere PKCE S256.');
    const id = rnd(24);
    await this.put(this.pending, id, { id, client_id: c.client_id, client_name: c.client_name, redirect_uri: redirect, state: text(q.get('state'), 500), code_challenge: q.get('code_challenge'), scope: 'erp', resource: text(q.get('resource'), 300), exp: Date.now() + PENDING_TTL * 1000 });
    return { solicitud: id, cliente: c.client_name };
  }
  async decide(solicitud, user, permitir) {
    const p = await this.get(this.pending, solicitud); if (!p || p.exp < Date.now()) throw Error('La solicitud venció. Vuelve a conectar desde Claude.');
    await this.tx(async t => { t.delete(this.pending.doc(p.id)); });
    const u = new URL(p.redirect_uri); if (p.state) u.searchParams.set('state', p.state);
    if (!permitir) { u.searchParams.set('error', 'access_denied'); return { redirect: u.href }; }
    if (!this.cfg().roles.includes(user.role)) throw Error('Tu rol (' + user.role + ') aún no puede conectar Claude al ERP. Pídelo a Gerencia.');
    const code = rnd(32);
    await this.put(this.codes, sha(code), { client_id: p.client_id, redirect_uri: p.redirect_uri, code_challenge: p.code_challenge, user_id: user.id, user_name: user.name, user_role: user.role, version: user.version || null, exp: Date.now() + CODE_TTL * 1000 });
    u.searchParams.set('code', code);
    await this.log(user, 'conexión autorizada · ' + p.client_name, true);
    return { redirect: u.href };
  }
  // ---------- Tokens ----------
  async issueTokens(base) {
    const access = rnd(32), refresh = rnd(32), fam = base.familia || rnd(12);
    const t = { familia: fam, client_id: base.client_id, client_name: base.client_name || '', user_id: base.user_id, user_name: base.user_name, user_role: base.user_role, version: base.version || null, creado: base.creado || now(), ultimo_uso: null };
    await this.tx(async x => {
      x.set(this.tokens.doc(sha(access)), { ...t, tipo: 'acceso', exp: Date.now() + ACCESS_TTL * 1000 });
      x.set(this.tokens.doc(sha(refresh)), { ...t, tipo: 'renovacion', exp: Date.now() + REFRESH_TTL * 1000 });
    });
    return { access_token: access, token_type: 'Bearer', expires_in: ACCESS_TTL, refresh_token: refresh, scope: 'erp' };
  }
  async token(form) {
    const g = form.get('grant_type'), bad = (code, msg) => Object.assign(Error(msg), { status: 400, code });
    if (!this.cfg().enabled) throw bad('access_denied', 'El conector del ERP está apagado.');
    if (g === 'authorization_code') {
      const k = sha(form.get('code') || ''), c = await this.get(this.codes, k);
      await this.tx(async t => { t.delete(this.codes.doc(k)); }); // un código se usa una sola vez
      if (!c || c.exp < Date.now()) throw bad('invalid_grant', 'Código vencido o ya usado.');
      if (c.client_id !== form.get('client_id') || (form.get('redirect_uri') && form.get('redirect_uri') !== c.redirect_uri)) throw bad('invalid_grant', 'El código no corresponde a este cliente.');
      if (!pkceOk(form.get('code_verifier'), c.code_challenge)) throw bad('invalid_grant', 'Verificación PKCE fallida.');
      const cl = await this.get(this.clients, c.client_id);
      return this.issueTokens({ ...c, client_name: cl?.client_name });
    }
    if (g === 'refresh_token') {
      const k = sha(form.get('refresh_token') || ''), r = await this.get(this.tokens, k);
      if (!r || r.tipo !== 'renovacion' || r.revocado || r.exp < Date.now() || r.client_id !== form.get('client_id')) {
        if (r?.usado) await this.revokeFamily(r.familia, 'reutilización de un token de renovación'); // posible robo: se corta toda la conexión
        throw bad('invalid_grant', 'Token de renovación no válido.');
      }
      await this.tx(async t => { t.set(this.tokens.doc(k), { ...r, revocado: true, usado: true }); });
      return this.issueTokens({ ...r, familia: r.familia });
    }
    throw bad('unsupported_grant_type', 'Tipo de concesión no soportado.');
  }
  async revokeFamily(familia, motivo) {
    const docs = (await this.tokens.where('familia', '==', familia).limit(500).get()).docs;
    await this.tx(async t => { for (const d of docs) t.set(d.ref, { ...d.data(), revocado: true, motivo }); });
    return docs.length;
  }
  async revokeToken(tok) { const r = await this.get(this.tokens, sha(tok || '')); if (r) await this.revokeFamily(r.familia, 'revocado por el cliente'); return {}; }
  // Valida el token de acceso y devuelve la persona. Si la persona cambió su contraseña o su rol ya no está permitido, se corta.
  async bearer(header) {
    const m = /^Bearer\s+([A-Za-z0-9\-_]{20,200})$/.exec(String(header || '')); if (!m) return null;
    const k = sha(m[1]), t = await this.get(this.tokens, k);
    if (!t || t.tipo !== 'acceso' || t.revocado || t.exp < Date.now()) return null;
    if (!this.cfg().enabled || !this.cfg().roles.includes(t.user_role)) return null;
    return { ...t, key: k };
  }
  // ---------- MCP (JSON-RPC sobre HTTP, respuestas JSON) ----------
  async handle(msg, tok) {
    if (Array.isArray(msg)) { const out = (await Promise.all(msg.map(m => this.handle(m, tok)))).filter(Boolean); return out.length ? out : null; }
    const id = msg?.id, ok = result => ({ jsonrpc: '2.0', id, result }), fail = (code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
    if (msg?.jsonrpc !== '2.0' || typeof msg.method !== 'string') return fail(-32600, 'Solicitud no válida.');
    if (id === undefined) return null; // notificación
    if (msg.method === 'initialize') {
      const v = PROTOCOLS.includes(msg.params?.protocolVersion) ? msg.params.protocolVersion : PROTOCOLS[0];
      return ok({ protocolVersion: v, capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'erp-orok', title: 'ERP ÖRÖK', version: this.version },
        instructions: 'ERP ÖRÖK: CRM (L.O.L.A), Marketing (G.R.E.T.A), Evaluador (M.O.R.A) y Contabilidad (C.L.A.R.A). Actúas con los permisos de ' + tok.user_name + ' (' + tok.user_role + '). Responde en español de Perú. Los datos son de clientes reales: no los copies fuera de la conversación sin que te lo pidan. Las aprobaciones de órdenes y campañas se hacen en el ERP; aquí solo se consulta y se proponen borradores.' });
    }
    if (msg.method === 'ping') return ok({});
    if (msg.method === 'tools/list') return ok({ tools: TOOLS.map(t => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.schema, annotations: { title: t.title, readOnlyHint: t.ro, destructiveHint: false, idempotentHint: t.ro, openWorldHint: false } })) });
    if (msg.method === 'resources/list') return ok({ resources: [] });
    if (msg.method === 'prompts/list') return ok({ prompts: [] });
    if (msg.method === 'tools/call') {
      const t = TOOLS.find(x => x.name === msg.params?.name); if (!t) return fail(-32602, 'Herramienta desconocida.');
      const r = this.rate.get(tok.familia) || { n: 0, until: Date.now() + 60000 }; if (r.until < Date.now()) { r.n = 0; r.until = Date.now() + 60000; } if (++r.n > 120) return ok({ isError: true, content: [{ type: 'text', text: 'Demasiadas consultas en un minuto. Espera un momento.' }] }); this.rate.set(tok.familia, r);
      const t0 = Date.now();
      try {
        const x = await this.context(tok), value = await t.run(msg.params?.arguments || {}, x);
        await this.log(x.user, t.name, true, Date.now() - t0, Object.keys(msg.params?.arguments || {}));
        return ok({ content: [{ type: 'text', text: JSON.stringify(value, null, 1).slice(0, 200000) }], structuredContent: value && typeof value === 'object' && !Array.isArray(value) ? value : { value }, isError: false });
      } catch (e) {
        await this.log({ id: tok.user_id, name: tok.user_name, role: tok.user_role }, t.name, false, Date.now() - t0, [], e.message);
        return ok({ isError: true, content: [{ type: 'text', text: e.message || 'No se pudo completar la consulta.' }] });
      }
    }
    return fail(-32601, 'Método no soportado: ' + msg.method);
  }
  // Sesión breve de la persona y llamada al mismo despachador de la pantalla.
  async context(tok) {
    const s = await this.issue(tok.user_id, tok.version); if (!s?.cookie) { await this.revokeFamily(tok.familia, 'la cuenta cambió o ya no existe'); throw Error('Tu cuenta cambió (contraseña o acceso). Vuelve a conectar Claude al ERP.'); }
    const user = { id: tok.user_id, name: s.user?.name || tok.user_name, role: s.user?.role || tok.user_role };
    if (!this.cfg().roles.includes(user.role)) throw Error('Tu rol ya no tiene acceso al conector.');
    this.tx(async t => { const d = (await t.get(this.tokens.doc(tok.key))).data(); if (d) t.set(this.tokens.doc(tok.key), { ...d, ultimo_uso: now() }); }).catch(() => {});
    return { user, call: async (method, args = []) => (await this.rpcFn('db.' + method, args, s.cookie)).value };
  }
  async log(user, accion, ok, ms = 0, campos = [], error = '') { try { const id = crypto.randomUUID(); await this.put(this.audit, id, { id, at: now(), usuario: text(user?.name, 120), user_id: user?.id || null, accion: text(accion, 120), ok, ms, campos: campos.slice(0, 10), error: text(error, 300) }); } catch {} }
  // ---------- Administración desde el ERP ----------
  async conexiones(user) {
    const docs = (await this.tokens.where('tipo', '==', 'renovacion').limit(500).get()).docs.map(d => d.data()).filter(t => !t.revocado && t.exp > Date.now() && (user.role === 'Gerente' || t.user_id === user.id));
    const fam = new Map(); for (const t of docs) if (!fam.has(t.familia)) fam.set(t.familia, { id: t.familia, cliente: t.client_name || 'Claude', usuario: t.user_name, rol: t.user_role, desde: t.creado, vence: new Date(t.exp).toISOString() });
    const audit = (await this.audit.limit(300).get()).docs.map(d => d.data()).filter(a => user.role === 'Gerente' || a.user_id === user.id).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 30);
    const c = this.cfg();
    return { activo: c.enabled, roles: c.roles, url: this.origin() + '/mcp', conexiones: [...fam.values()], actividad: audit, herramientas: TOOLS.map(t => ({ nombre: t.name, titulo: t.title, solo_lectura: t.ro })) };
  }
  async rpc(name, args, user) {
    if (name === 'mcpConexiones') return this.conexiones(user);
    if (name === 'mcpRevocar') { const f = text(args[0], 40); const docs = (await this.tokens.where('familia', '==', f).limit(1).get()).docs; if (!docs.length) throw Error('Conexión no encontrada.'); if (user.role !== 'Gerente' && docs[0].data().user_id !== user.id) throw Error('Solo puedes cortar tus propias conexiones.'); await this.revokeFamily(f, 'cortada por ' + user.name); await this.log(user, 'conexión cortada', true); return this.conexiones(user); }
    if (name === 'mcpConfigGuardar') {
      if (user.role !== 'Gerente') throw Error('Requiere Gerencia.');
      const c = this.cfg(), i = args[0] || {};
      if (i.enabled !== undefined) c.enabled = i.enabled === true;
      if (Array.isArray(i.roles)) { const r = i.roles.filter(x => ['Gerente', 'Vendedor', 'Broker'].includes(x)); if (!r.includes('Gerente')) r.unshift('Gerente'); c.roles = [...new Set(r)]; }
      c.actualizado = { por: text(user.name, 120), at: now() }; writeCfg(this.dir, c);
      if (!c.enabled) { const docs = (await this.tokens.limit(2000).get()).docs; await this.tx(async t => { for (const d of docs) if (!d.data().revocado) t.set(d.ref, { ...d.data(), revocado: true, motivo: 'conector apagado' }); }); }
      await this.log(user, c.enabled ? 'conector activado' : 'conector apagado', true);
      return this.conexiones(user);
    }
    throw Error('Operación del conector no reconocida.');
  }
}
const MCP_METHODS = ['mcpConexiones', 'mcpRevocar', 'mcpConfigGuardar'];
module.exports = { McpConnector, MCP_METHODS, TOOLS, redirectOk, pkceOk, readCfg };
