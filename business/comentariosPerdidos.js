'use strict';
// R71 · Búsqueda de comentarios perdidos del Kanban (solo lectura) y restauración aditiva.
// Revisa las copias que existen en el servidor (respaldos automáticos, copias antes de conexiones y otros JSON del
// directorio privado) y lista los comentarios que aparecen ahí pero ya no están en el lead actual. Restaurar solo
// AÑADE el comentario con su fecha, autor e identificador originales; nunca borra ni reemplaza nada.
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib');
const MAX_BYTES = 120 * 1024 * 1024;
function* walk(dir, depth = 0) {
  if (depth > 5) return; let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!/^(node_modules|files|whatsapp-media|wa-audio-.*|resguardo-tmp)$/.test(e.name)) yield* walk(p, depth + 1); }
    else if (e.isFile() && /\.json(\.gz)?$/i.test(e.name)) yield p;
  }
}
function leer(file) {
  const st = fs.statSync(file); if (st.size > MAX_BYTES) return null;
  let buf = fs.readFileSync(file); if (/\.gz$/i.test(file)) buf = zlib.gunzipSync(buf);
  const j = JSON.parse(buf.toString('utf8'));
  const data = Array.isArray(j?.leads) ? j : Array.isArray(j?.data?.leads) ? j.data : Array.isArray(j?.backup?.leads) ? j.backup : null;
  return data ? { data, creado: j.created_at || j.data?.created_at || null, motivo: j.reason || '', mtime: st.mtime.toISOString() } : null;
}
function buscar(privateDir, current, { since = '2026-10-29T15:45:00.000Z' } = {}) {
  const actuales = new Map((current.leads || []).concat(current.archived_leads || []).map(l => [String(l.id), l]));
  const ids = new Map([...actuales].map(([id, l]) => [id, new Set((l.comment_history || []).map(c => c.id))]));
  const fuentes = [], faltantes = new Map();
  for (const file of walk(privateDir)) {
    let f; try { f = leer(file); } catch (e) { fuentes.push({ archivo: path.relative(privateDir, file), error: String(e.message).slice(0, 120) }); continue; }
    if (!f) continue;
    let n = 0;
    for (const l of f.data.leads.concat(f.data.archived_leads || [])) {
      for (const c of l.comment_history || []) {
        if (!c?.id || String(c.at || '') < since) continue;
        if (ids.get(String(l.id))?.has(c.id)) continue;
        n++;
        if (!faltantes.has(c.id)) { const a = actuales.get(String(l.id)); faltantes.set(c.id, { comment_id: c.id, lead_id: l.id, lead_number: l.lead_number || a?.lead_number || '', nombre: l.name || a?.name || '', lead_existe: !!a, at: c.at, autor: c.author || '', texto: String(c.text || ''), fuente: path.relative(privateDir, file) }); }
      }
    }
    fuentes.push({ archivo: path.relative(privateDir, file), creado: f.creado, modificado: f.mtime, motivo: f.motivo, leads: f.data.leads.length, comentarios_faltantes: n });
  }
  return { desde: since, fuentes: fuentes.sort((a, b) => String(a.modificado || '').localeCompare(String(b.modificado || ''))), faltantes: [...faltantes.values()].sort((a, b) => String(a.at).localeCompare(String(b.at))) };
}
function restaurar(data, encontrados, elegidos, actor, lifecycle) {
  const pedir = new Set((elegidos || []).map(String)); let restaurados = 0; const omitidos = [];
  for (const c of encontrados) {
    if (pedir.size && !pedir.has(String(c.comment_id))) continue;
    const lead = (data.leads || []).find(l => String(l.id) === String(c.lead_id)); if (!lead) { omitidos.push({ comment_id: c.comment_id, motivo: 'El lead ya no existe en el Kanban.' }); continue; }
    const hist = lead.comment_history || []; if (hist.some(x => x.id === c.comment_id)) continue;
    lead.comment_history = [...hist, { id: c.comment_id, request_id: 'restaurado-' + c.comment_id, text: c.texto, at: c.at, author: c.autor || 'Sin autor', restored_at: new Date().toISOString(), restored_by: actor }].sort((a, b) => String(a.at).localeCompare(String(b.at)));
    lifecycle.event(lead, 'comment', actor, { comment_id: c.comment_id, source: 'Restauración de comentario perdido' }); restaurados++;
  }
  return { restaurados, omitidos };
}
module.exports = { buscar, restaurar, walk };
