// R32 · Canales de chat y su relación con los leads. Funciones puras (sin red).
export const CHANNELS = {
  whatsapp: {label: 'WhatsApp', color: '#1f9d55', soft: 'rgba(31,157,85,.12)'},
  instagram: {label: 'Instagram', color: '#c13584', soft: 'rgba(193,53,132,.12)'},
  messenger: {label: 'Messenger', color: '#0a7cff', soft: 'rgba(10,124,255,.12)'},
  tiktok: {label: 'TikTok', color: '#111111', soft: 'rgba(17,17,17,.10)'},
};
export const ORDER = ['whatsapp', 'instagram', 'messenger', 'tiktok'];
const time = v => { const t = Date.parse(v || ''); return Number.isFinite(t) ? t : 0; };

// Agrupa los hilos por lead: { leadId: [{channel, thread_id, last_message_at, ...}] } (más reciente primero).
export function indexByLead(threads = []) {
  const map = {};
  for (const t of threads) {
    if (!t || !t.lead_id || !CHANNELS[t.channel]) continue;
    (map[t.lead_id] ||= []).push(t);
  }
  for (const k of Object.keys(map)) map[k].sort((a, b) => time(b.last_message_at) - time(a.last_message_at));
  return map;
}

// Canales disponibles para una tarjeta del Kanban. WhatsApp aparece si el lead tiene teléfono
// (permite abrir o iniciar su conversación); las redes, solo si ya existe un hilo vinculado.
export function channelsForLead(lead, index = {}) {
  const out = [], seen = new Set(), threads = index[lead?.id] || [];
  const phone = String(lead?.phone || '').replace(/\D/g, '');
  const wa = threads.find(t => t.channel === 'whatsapp');
  if (wa || phone.length >= 9) { out.push({channel: 'whatsapp', thread_id: lead.id, has_messages: !!wa, last_message_at: wa?.last_message_at || null}); seen.add('whatsapp:' + lead.id); }
  for (const t of threads) {
    if (t.channel === 'whatsapp') continue;
    const key = t.channel + ':' + t.thread_id;
    if (seen.has(key)) continue; seen.add(key);
    out.push({channel: t.channel, thread_id: t.thread_id, has_messages: true, last_message_at: t.last_message_at || null});
  }
  return out.sort((a, b) => ORDER.indexOf(a.channel) - ORDER.indexOf(b.channel));
}

// Conteos por pestaña de la bandeja y filtro por canal y búsqueda.
export function inboxView(threads = [], leads = [], {channel = '', query = ''} = {}) {
  const byId = new Map(leads.map(l => [l.id, l]));
  const q = String(query).trim().toLowerCase();
  const rows = threads.filter(t => CHANNELS[t.channel]).map(t => ({...t, display_name: byId.get(t.lead_id)?.name || t.name || 'Contacto sin vincular', linked: !!(t.lead_id && byId.has(t.lead_id))}));
  const counts = {all: rows.length};
  for (const c of ORDER) counts[c] = rows.filter(r => r.channel === c).length;
  const list = rows.filter(r => (!channel || r.channel === channel) && (!q || [r.display_name, r.preview].join(' ').toLowerCase().includes(q)))
    .sort((a, b) => time(b.last_message_at) - time(a.last_message_at));
  return {counts, list};
}
