// R32c · Búsqueda de leads. Pura y sin red.
// Varias palabras = todas deben coincidir (en cualquier campo). Ignora tildes, mayúsculas y signos.
// Los números se comparan solo por dígitos: "999 111 222", "+51 999111222" y "51999111222" coinciden.
const norm = v => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('es-PE');
const word = v => norm(v).replace(/[^\p{L}\p{N}@._-]+/gu, ' ').trim();
const digits = v => String(v ?? '').replace(/\D/g, '');

export const FIELDS = [
  ['code', 'código', l => [l.lead_number, l.code]],
  ['id', 'ID', l => [l.id]],
  ['name', 'nombre', l => [l.name, l.last_name, l.surname, l.apellido]],
  ['dni', 'DNI', l => [l.dni]],
  ['phone', 'teléfono', l => [l.phone, l.phone2, l.whatsapp]],
  ['email', 'correo', l => [l.email]],
  ['social', 'red social', (l, extra) => extra.social?.[l.id] || []],
  ['quote', 'cotización', l => [l.last_quote?.code, l.quote_code, l.last_quote?.unit_number && 'dpto ' + l.last_quote.unit_number, l.dpto1, l.dpto2]],
  ['campaign', 'campaña', l => [l.campaign_name, l.ad_name, l.adset_name]],
  ['source', 'fuente', l => [l.source]],
  ['owner', 'responsable', l => [l.sales_owner]],
  ['project', 'proyecto', l => [l.project, l.unit_interest]],
];

function tokenMatch(token, lead, extra) {
  const t = word(token).replace(/^@/, ''), d = digits(token), onlyDigits = /^\+?[\d\s-]+$/.test(String(token).trim());
  for (const [key, label, get] of FIELDS) {
    for (const raw of get(lead, extra)) {
      if (raw === undefined || raw === null || raw === '') continue;
      if (onlyDigits && d.length >= 3) {
        const v = digits(raw);
        if (!v) continue;
        const local = v.startsWith('51') && v.length === 11 ? v.slice(2) : v, q = d.startsWith('51') && d.length === 11 ? d.slice(2) : d;
        if (v.includes(d) || local.includes(q)) return {key, label, exact: v === d || local === q};
      }
      const w = word(raw);
      if (t && w.includes(t)) return {key, label, exact: w === t, prefix: w.startsWith(t) || w.split(' ').some(p => p.startsWith(t))};
      const ct = t.replace(/[^\p{L}\p{N}]/gu, ''), cw = w.replace(/[^\p{L}\p{N}]/gu, '');
      if (ct.length >= 3 && cw.includes(ct)) return {key, label, exact: cw === ct, prefix: cw.startsWith(ct)};
    }
  }
  return null;
}

// Devuelve [{lead, score, matched:[etiquetas]}] ordenado por relevancia. extra.social: {leadId: ['@usuario', ...]}
export function searchLeads(leads = [], query = '', extra = {}, limit = Infinity) {
  const tokens = String(query).trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const out = [];
  for (const lead of leads) {
    if (!lead) continue;
    let score = 0; const matched = new Set(); let ok = true;
    for (const tk of tokens) {
      const m = tokenMatch(tk, lead, extra);
      if (!m) { ok = false; break; }
      matched.add(m.label);
      score += m.exact ? 30 : m.prefix ? 12 : 5;
      if (['code', 'dni', 'phone', 'id'].includes(m.key) && m.exact) score += 40;
    }
    if (ok) out.push({lead, score, matched: [...matched]});
  }
  out.sort((a, b) => b.score - a.score || String(a.lead.name || '').localeCompare(String(b.lead.name || ''), 'es'));
  return out.slice(0, limit);
}

// Mapa leadId -> nombres de usuario en redes, a partir del índice de chats.
export function socialHandles(threads = []) {
  const map = {};
  for (const t of threads) if (t?.lead_id && t.channel !== 'whatsapp' && t.name) (map[t.lead_id] ||= []).push(t.name, '@' + t.name);
  return map;
}
