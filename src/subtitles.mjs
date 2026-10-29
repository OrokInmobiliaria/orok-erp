// R30 · Subtítulos a partir de las escenas de un reel o historia. Función pura.
// Usa la narración (voiceover) y, si no hay, el texto en pantalla (caption).
const MAX_LINE = 42, MAX_LINES = 2;

function wrap(textValue) {
  const words = String(textValue || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean), lines = [];
  let line = '';
  for (const w of words) { const next = line ? line + ' ' + w : w; if (next.length > MAX_LINE && line) { lines.push(line); line = w; } else line = next; }
  if (line) lines.push(line);
  return lines;
}
// Divide el texto de una escena en bloques de hasta 2 líneas, repartiendo el tiempo según la longitud.
export function cues(scenes) {
  const out = []; let t = 0;
  for (const scene of scenes || []) {
    const seconds = Math.max(1, Number(scene.seconds) || 1), lines = wrap(scene.voiceover || scene.caption);
    const blocks = [];
    for (let i = 0; i < lines.length; i += MAX_LINES) blocks.push(lines.slice(i, i + MAX_LINES));
    const total = blocks.reduce((n, b) => n + b.join(' ').length, 0) || 1;
    let cursor = t;
    blocks.forEach((b, i) => {
      const share = i === blocks.length - 1 ? t + seconds - cursor : seconds * (b.join(' ').length / total);
      out.push({ start: cursor, end: cursor + share, text: b.join('\n') });
      cursor += share;
    });
    t += seconds;
  }
  return out;
}
const pad = (n, w = 2) => String(n).padStart(w, '0');
function stamp(sec, comma) {
  const ms = Math.round(sec * 1000), h = Math.floor(ms / 3600000), m = Math.floor(ms % 3600000 / 60000), s = Math.floor(ms % 60000 / 1000), r = ms % 1000;
  return `${pad(h)}:${pad(m)}:${pad(s)}${comma ? ',' : '.'}${pad(r, 3)}`;
}
export function toSrt(scenes) { return cues(scenes).map((c, i) => `${i + 1}\n${stamp(c.start, true)} --> ${stamp(c.end, true)}\n${c.text}\n`).join('\n'); }
export function toVtt(scenes) { return 'WEBVTT\n\n' + cues(scenes).map(c => `${stamp(c.start, false)} --> ${stamp(c.end, false)}\n${c.text}\n`).join('\n'); }
