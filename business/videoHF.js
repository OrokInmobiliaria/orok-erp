'use strict';
// R77 · Mejora 16: videos automáticos con HyperFrames (Apache 2.0, de HeyGen).
// De cada pieza de VIDEO aprobada del Plan semanal se arma una composición HTML con la marca (colores, Outfit, ÖRÖK),
// el gancho de 0-2 s, las escenas del guion y el CTA, y se renderiza un MP4 por red con sus medidas y duración:
// Instagram y TikTok 9:16 (1080×1920), Facebook 9:16 o 4:5 (1080×1350) según la versión. Se procesa en cola, de a uno,
// para no cargar el servidor. Sin telemetría. La música y la voz se agregan al publicar (audio en tendencia o voz real).
const fs = require('node:fs'), path = require('node:path'), { spawn } = require('node:child_process'), { randomUUID } = require('node:crypto');
const now = () => new Date().toISOString();
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const REDES = ['instagram', 'facebook', 'tiktok'];
const MAXDUR = { instagram: 60, facebook: 90, tiktok: 45 };
const esVideo = f => !['imagen', 'carrusel', 'historia', 'modo foto'].includes(String(f || '').toLowerCase());
function medidas(red, version) { const m = String(version?.medidas || ''); return red === 'facebook' && /4:5|1350/.test(m) && !/9:16/.test(m.split(/[;,]/)[0]) ? { w: 1080, h: 1350 } : { w: 1080, h: 1920 }; }
// Escenas: gancho (0-2 s) + guion + CTA. Duración de cada escena desde «seg» («2-5» = 3 s), entre 1.5 y 6 s.
function escenas(p, red) {
  const out = [], g = p.gancho?.texto_pantalla || p.titulo; if (g) out.push({ texto: g, dur: 2, tipo: 'gancho' });
  for (const e of (p.guion || []).slice(0, 12)) {
    const t = String(e.texto_pantalla || '').trim() || String(e.voz || '').split(/[.!?]/)[0].trim(); if (!t || t === g) continue;
    const m = String(e.seg || '').match(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)/); let d = m ? Number(m[2]) - Number(m[1]) : 3; d = Math.max(1.5, Math.min(6, d || 3));
    out.push({ texto: t.slice(0, 140), dur: d, tipo: 'escena' });
  }
  const cta = p.versiones?.[red]?.cta || p.cta; if (cta) out.push({ texto: cta.slice(0, 120), dur: 2.5, tipo: 'cta' });
  let total = 0; const lim = MAXDUR[red] || 60; return out.filter(s => (total += s.dur) <= lim || s.tipo === 'cta').map(s => ({ ...s, dur: Math.round(s.dur * 10) / 10 }));
}
function composicion(p, red, marca) {
  const { w, h } = medidas(red, p.versiones?.[red]), c = (marca?.colores || []).map(x => x.hex), [c0, c1, c2, c3, c4] = [c[0] || '#85442A', c[1] || '#5E2817', c[2] || '#B3362B', c[3] || '#FCFAF8', c[4] || '#292524'];
  const es = escenas(p, red); if (!es.length) throw Error('La pieza no tiene textos para animar.');
  let t = 0; const clips = [], anim = [];
  // TikTok: cortes más rápidos y texto más grande; Facebook: subtítulo base siempre visible.
  const fs1 = Math.round(w * (red === 'tiktok' ? 0.092 : 0.082));
  es.forEach((e, i) => {
    const cls = e.tipo === 'gancho' ? 'gancho' : e.tipo === 'cta' ? 'cta' : '';
    clips.push(`<div id="s${i}" class="clip esc ${cls}" data-start="${t}" data-duration="${e.dur}" data-track-index="0"><div class="txt">${esc(e.texto)}</div></div>`);
    anim.push(e.tipo === 'gancho' ? `tl.fromTo("#s${i} .txt",{opacity:0,scale:1.25},{opacity:1,scale:1,duration:.35,ease:"back.out(1.6)"},${t});`
      : `tl.fromTo("#s${i} .txt",{opacity:0,y:${Math.round(h * 0.03)}},{opacity:1,y:0,duration:.4,ease:"power3.out"},${t});`);
    t = Math.round((t + e.dur) * 10) / 10;
  });
  const html = `<!doctype html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=${w}, height=${h}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Outfit:wght@500;700;800&display=swap" rel="stylesheet">
<script src="gsap.min.js"></script><style>
*{margin:0;padding:0;box-sizing:border-box}html,body{width:${w}px;height:${h}px;overflow:hidden;background:${c4}}
#root{width:100%;height:100%;position:relative;font-family:Outfit,Arial,sans-serif;background:linear-gradient(160deg,${c1},${c0} 58%,${c2})}
.esc{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:${Math.round(h * 0.14)}px ${Math.round(w * 0.09)}px ${Math.round(h * 0.2)}px}
.txt{color:${c3};font-size:${fs1}px;font-weight:800;line-height:1.08;text-align:center;letter-spacing:-.02em;text-wrap:balance}
.gancho .txt{font-size:${Math.round(fs1 * 1.2)}px;text-transform:uppercase;letter-spacing:.01em}
.cta .txt{background:${c3};color:${c1};padding:${Math.round(w * 0.035)}px ${Math.round(w * 0.06)}px;border-radius:${Math.round(w * 0.05)}px;font-size:${Math.round(fs1 * 0.8)}px}
.marca{position:absolute;left:0;right:0;top:${Math.round(h * 0.07)}px;text-align:center;color:${c3};font:700 ${Math.round(w * 0.045)}px Outfit,Arial;letter-spacing:.3em;opacity:.92}
.linea{position:absolute;left:${Math.round(w * 0.42)}px;right:${Math.round(w * 0.42)}px;top:${Math.round(h * 0.07 + w * 0.07)}px;height:3px;background:${c3};opacity:.6}
</style></head><body><div id="root" data-composition-id="main" data-start="0" data-duration="${t}" data-width="${w}" data-height="${h}">
${clips.join('\n')}
<div class="marca clip" data-start="0" data-duration="${t}" data-track-index="1">${esc(marca?.nombre?.split(' ')[0] || 'ÖRÖK')}</div><div class="linea clip" data-start="0" data-duration="${t}" data-track-index="2"></div>
</div><script>const tl=gsap.timeline({paused:true});${anim.join('')}window.__timelines["main"]=tl;tl.seek(0);</script></body></html>`;
  return { html, w, h, duracion: t, escenas: es.length };
}
class VideoHF {
  constructor(plan) { this.plan = plan; this.g = plan.g; this.col = this.g.store.ref.collection('greta_videos'); this.corriendo = false; this.spawn = spawn; }
  dir() { return path.join(this.g.dir, 'videos'); }
  async put(ref, v) { await this.g.store.db.runTransaction(async tx => { tx.set(ref, v); }); }
  disponible() { try { require.resolve('hyperframes/package.json'); require.resolve('gsap/dist/gsap.min.js'); return true; } catch { return false; } }
  async crear(input, user) {
    const p = (await this.plan.piezas.doc(String(input?.pieza_id || '').slice(0, 60)).get()).data(); if (!p) throw Error('Pieza no encontrada.');
    if (p.estado !== 'aprobada') throw Error('Primero aprueba la pieza.');
    if (!esVideo(p.formato)) throw Error('Esta pieza es una imagen o carrusel: se arma en el Estudio creativo.');
    if (!this.disponible()) throw Error('El generador de videos no está instalado en este servidor.');
    const redes = p.red && p.red !== 'todas' ? [p.red] : REDES, marca = this.plan.marca(), trabajos = [];
    for (const red of redes) {
      if (p.versiones?.[red] && !esVideo(p.versiones[red].formato)) continue;
      const comp = composicion(p, red, marca), id = p.id + '_' + red;
      const job = { id, pieza_id: p.id, semana_id: p.semana_id, fecha: p.fecha, titulo: p.titulo, red, estado: 'en_cola', medidas: comp.w + '×' + comp.h, duracion: comp.duracion, creado: now(), por: String(user?.name || '').slice(0, 120), intento: randomUUID() };
      const d = path.join(this.dir(), id); fs.mkdirSync(d, { recursive: true, mode: 0o700 });
      fs.writeFileSync(path.join(d, 'index.html'), comp.html); fs.copyFileSync(require.resolve('gsap/dist/gsap.min.js'), path.join(d, 'gsap.min.js'));
      fs.writeFileSync(path.join(d, 'hyperframes.json'), JSON.stringify({ name: 'orok-' + id }));
      await this.put(this.col.doc(id), job); trabajos.push(job);
    }
    if (!trabajos.length) throw Error('Ninguna versión de esta pieza es video.');
    this.procesar(); return { trabajos };
  }
  async estado(input) { const rows = (await this.col.where('pieza_id', '==', String(input?.pieza_id || '').slice(0, 60)).limit(10).get()).docs.map(d => d.data()); return { videos: rows, disponible: this.disponible() }; }
  async archivo(input) {
    const j = (await this.col.doc(String(input?.id || '').slice(0, 120)).get()).data(); if (!j || j.estado !== 'listo') throw Error('El video aún no está listo.');
    const f = path.join(this.dir(), j.id, 'video.mp4'); if (!fs.existsSync(f)) throw Error('No se encontró el archivo. Vuelve a crearlo.');
    return { nombre: 'OROK_' + j.fecha + '_' + j.red + '_' + String(j.titulo || 'video').replace(/[^\w\-áéíóúñÁÉÍÓÚÑ ]/g, '').slice(0, 40).trim().replace(/\s+/g, '-') + '.mp4', mime: 'video/mp4', base64: fs.readFileSync(f).toString('base64') };
  }
  render(dir, out) {
    return new Promise((ok, ko) => {
      const bin = path.join(path.dirname(require.resolve('hyperframes/package.json')), 'bin', 'hyperframes.mjs');
      const env = { ...process.env, DO_NOT_TRACK: '1', HYPERFRAMES_NO_TELEMETRY: '1', HYPERFRAMES_SKIP_SKILLS: '1' };
      const chrome = process.env.HYPERFRAMES_BROWSER_PATH || ['/usr/bin/chromium-browser', '/usr/bin/chromium'].find(x => fs.existsSync(x)); if (chrome) { env.HYPERFRAMES_BROWSER_PATH = chrome; env.PUPPETEER_EXECUTABLE_PATH = chrome; }
      const ch = this.spawn(process.execPath, [bin, 'render', dir, '-o', out, '-q', 'standard', '-w', '1', '--quiet'], { env, cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
      let log = ''; ch.stdout?.on('data', b => { log = (log + b).slice(-4000); }); ch.stderr?.on('data', b => { log = (log + b).slice(-4000); });
      const tope = setTimeout(() => ch.kill('SIGKILL'), 8 * 60000);
      ch.on('error', e => { clearTimeout(tope); ko(e); });
      ch.on('close', code => { clearTimeout(tope); code === 0 && fs.existsSync(out) ? ok() : ko(Error('El render terminó con error. ' + log.replace(/\s+/g, ' ').slice(-300))); });
    });
  }
  async procesar() {
    if (this.corriendo) return; this.corriendo = true;
    try {
      for (;;) {
        const job = (await this.col.where('estado', '==', 'en_cola').limit(20).get()).docs.map(d => d.data()).sort((a, b) => String(a.creado).localeCompare(String(b.creado)))[0]; if (!job) break;
        const ref = this.col.doc(job.id), d = path.join(this.dir(), job.id);
        await this.put(ref, { ...job, estado: 'renderizando', inicio: now() });
        try { await this.render(d, path.join(d, 'video.mp4')); const size = fs.statSync(path.join(d, 'video.mp4')).size; await this.put(ref, { ...job, estado: 'listo', fin: now(), bytes: size }); }
        catch (e) { await this.put(ref, { ...job, estado: 'error', fin: now(), error: String(e.message || e).slice(0, 400) }); }
      }
    } finally { this.corriendo = false; }
  }
}
module.exports = { VideoHF, composicion, escenas, medidas, esVideo };
