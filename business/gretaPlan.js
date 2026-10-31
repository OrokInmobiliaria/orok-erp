'use strict';
// R73 · G.R.E.T.A · Plan semanal de contenido.
// 1) Marca para contenido: colores, tipografías, forma de hablar, perfiles y hashtags base (privado: greta-plan-marca.json).
// 2) Análisis: perfiles de ÖRÖK (Instagram, Facebook, TikTok) + nicho de edificios boutique, con búsqueda web y, si están
//    conectadas, las métricas propias de Publicar. Devuelve qué funciona, pilares, ganchos, horarios y hashtags por red.
// 3) Semana (R74c, definición final de Martín): 7 piezas diarias (videos e imágenes) = 49 por semana. Cada pieza se
//    replica en Instagram, Facebook y TikTok con una VERSIÓN ADAPTADA a cada red (medidas, duración, hora, copy, CTA,
//    hashtags, audio y notas de adaptación). Se generan por día en dos llamadas paralelas (piezas 1-4 y 5-7). Cada pieza trae gancho de 0-2 s, guion por escenas, motion graphics, voz en off,
//    música, copy, CTA, hashtags y quién la produce (ERP o equipo).
// 4) Nada se publica sin aprobación. Las piezas aprobadas quedan listas para programarse en Publicar.
const fs = require('node:fs'), path = require('node:path'), { randomUUID } = require('node:crypto');
const now = () => new Date().toISOString();
const text = (v, n = 500) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, n);
const REDES = ['instagram', 'facebook', 'tiktok'];
const FORMATOS = ['reel', 'carrusel', 'imagen', 'historia', 'video'];
const ESTADOS = ['borrador', 'aprobada', 'rechazada', 'programada', 'publicada'];
const POR_DIA = 7;
// Mezcla diaria por red: videos e imágenes en horarios distintos (G.R.E.T.A puede ajustar el formato a lo que mejor funciona en cada red).
const SLOTS = [{ hora: '08:00', formato: 'imagen' }, { hora: '10:00', formato: 'reel' }, { hora: '12:30', formato: 'carrusel' }, { hora: '14:00', formato: 'reel' }, { hora: '17:00', formato: 'imagen' }, { hora: '19:00', formato: 'reel' }, { hora: '21:00', formato: 'reel' }];
// Características propias de cada red.
const SPECS = {
  instagram: 'Reel 9:16 1080×1920, 15-60 s (ideal 20-35 s), zona segura libre arriba 14% y abajo 20%; feed 4:5 1080×1350; carrusel 4:5 de 5-10 láminas; historia 9:16 con sticker (encuesta/pregunta/enlace). Copy hasta 2200 caracteres con gancho en la primera línea. De 3 a 5 hashtags.',
  facebook: 'Reel 9:16 1080×1920 15-60 s; video de feed 4:5 o 1:1 de 30-90 s con subtítulos siempre (se ve sin sonido); imagen 4:5 1080×1350 o 1:1; álbum/carrusel. Público algo mayor y familiar: copy más explicativo (2-4 párrafos cortos) y CTA directo a WhatsApp o visita al showroom. De 2 a 4 hashtags.',
  tiktok: 'Video 9:16 1080×1920, 15-45 s, ritmo rápido con cortes cada 2-3 s, texto en pantalla grande, tono más espontáneo y cercano (tendencias, detrás de cámaras, obra, preguntas frecuentes); zona segura libre abajo 15% y lateral derecho; modo foto (carrusel) 9:16 con audio. Caption corto (1-2 líneas) con pregunta. Audio en tendencia elegido al publicar. De 3 a 6 hashtags.',
};
const MAX_TAGS = { instagram: 5, facebook: 4, tiktok: 6 };
const tipoDe = f => f === 'carrusel' ? 'carrusel' : ['imagen', 'historia'].includes(f) ? 'imagen' : 'video';
function limpiarVersion(v, red, p) {
  const tags = [...new Set((Array.isArray(v?.hashtags) && v.hashtags.length ? v.hashtags : p.hashtags).map(hashtag).filter(Boolean))].slice(0, MAX_TAGS[red]);
  return { formato: text(v?.formato, 40) || (red === 'tiktok' && tipoDe(p.formato) !== 'video' ? 'modo foto' : p.formato), medidas: text(v?.medidas, 200) || SPECS[red].split(';')[0],
    duracion_seg: tipoDe(p.formato) === 'video' ? Math.max(0, Math.min(180, Number(v?.duracion_seg) || p.duracion_seg || 0)) : 0,
    hora: /^\d{2}:\d{2}$/.test(String(v?.hora || '')) ? v.hora : p.hora, copy: text(v?.copy, 2200) || p.copy, cta: text(v?.cta, 160) || p.cta,
    hashtags: tags, audio: text(v?.audio, 200), notas: text(v?.notas, 400) };
}
const DEFAULT_MARCA = {
  nombre: 'ÖRÖK Inmobiliaria',
  colores: [{ nombre: 'Terracota ÖRÖK', hex: '#85442A' }, { nombre: 'Café profundo', hex: '#5E2817' }, { nombre: 'Rojo arcilla', hex: '#B3362B' }, { nombre: 'Marfil', hex: '#FCFAF8' }, { nombre: 'Grafito', hex: '#292524' }],
  tipografias: { titulos: 'Outfit (Bold / Black, mayúsculas con espaciado)', textos: 'Outfit (Regular / Medium)' },
  tono: 'Cercano, seguro y elegante; arquitectura de autor y edificios boutique de pocos departamentos. Frases cortas, tuteo respetuoso, sin exageraciones ni presión de venta. Habla de diseño, calidad de vida, ubicación y privacidad.',
  palabras_si: ['boutique', 'diseño de autor', 'pocos vecinos', 'privacidad', 'acabados', 'luz natural', 'San Miguel'],
  palabras_no: ['el mejor', 'garantizado', 'última oportunidad', 'precios de locura', 'oferta única'],
  perfiles: { instagram: 'OROK Inmobiliaria (Instagram)', facebook: 'OROK Inmobiliaria (Facebook)', tiktok: 'orok 224 (TikTok)' },
  hashtags_base: ['#ORÖK', '#Infinity224', '#SanMiguel', '#DepartamentosLima'],
  nicho: 'Edificios boutique de pocos departamentos en Lima (arquitectura de autor, preventa, vivienda e inversión).',
};
function readJson(f, d) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } }
function writeJson(f, v) { fs.mkdirSync(path.dirname(f), { recursive: true, mode: 0o700 }); const t = f + '.' + process.pid + '.tmp'; fs.writeFileSync(t, JSON.stringify(v, null, 1), { mode: 0o600 }); fs.renameSync(t, f); }
const lista = (v, n = 20, m = 80) => (Array.isArray(v) ? v : String(v || '').split(/[\n,]+/)).map(x => text(x, m)).filter(Boolean).slice(0, n);
const hashtag = h => { const t = text(h, 40).replace(/\s+/g, ''); const x = t.startsWith('#') ? t : '#' + t; return /^#[\p{L}\p{N}_]{2,39}$/u.test(x) ? x : null; };
const fecha = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null;
function lunesDe(d) { const x = new Date(d + 'T12:00:00Z'), w = (x.getUTCDay() + 6) % 7; x.setUTCDate(x.getUTCDate() - w); return x.toISOString().slice(0, 10); }
function sumar(d, n) { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }
const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
function limpiarPieza(p, i, base) {
  const escenas = (Array.isArray(p?.guion) ? p.guion : []).slice(0, 12).map(e => ({ seg: text(e?.seg, 20), visual: text(e?.visual, 400), texto_pantalla: text(e?.texto_pantalla, 200), motion: text(e?.motion, 300), voz: text(e?.voz, 400) }));
  const g = p?.gancho || {};
  const out = {
    id: randomUUID(), semana_id: base.semana_id, fecha: base.fecha, red: base.red, orden: (base.desde || 0) + i + 1,
    hora: /^\d{2}:\d{2}$/.test(String(p?.hora || '')) ? p.hora : (base.red === 'todas' ? SLOTS : [])[(base.desde || 0) + i]?.hora || '19:00', medidas: text(p?.medidas, 200),
    formato: FORMATOS.includes(p?.formato) ? p.formato : 'reel', pilar: text(p?.pilar, 80), objetivo: text(p?.objetivo, 160), titulo: text(p?.titulo, 120),
    gancho: { texto_pantalla: text(g.texto_pantalla, 120), primera_frase: text(g.primera_frase, 200), visual: text(g.visual, 300) },
    guion: escenas, duracion_seg: Math.max(0, Math.min(180, Number(p?.duracion_seg) || 0)),
    motion_graphics: text(p?.motion_graphics, 800), voz_en_off: { texto: text(p?.voz_en_off?.texto, 1500), estilo: text(p?.voz_en_off?.estilo, 200) },
    musica: { estilo: text(p?.musica?.estilo, 160), bpm: text(p?.musica?.bpm, 20), sugerencia: text(p?.musica?.sugerencia, 200), nota: text(p?.musica?.nota, 200) },
    copy: text(p?.copy, 2200), cta: text(p?.cta, 160), hashtags: [...new Set((p?.hashtags || []).map(hashtag).filter(Boolean))].slice(0, MAX_TAGS[base.red] || 30),
    produccion: p?.produccion === 'equipo' ? 'equipo' : 'erp', recursos: text(p?.recursos, 400), marca: text(p?.marca, 300),
    estado: 'borrador', creado: now(), revision: 1,
  };
  if (base.red === 'todas') out.versiones = Object.fromEntries(REDES.map(r => [r, limpiarVersion(p?.versiones?.[r], r, out)]));
  return out;
}
class GretaPlan {
  async put(ref, v) { await this.g.store.db.runTransaction(async tx => { tx.set(ref, v); }); }
  async del(ref) { await this.g.store.db.runTransaction(async tx => { tx.delete(ref); }); }
  constructor(greta) { this.g = greta; const r = greta.store.ref; this.analisis = r.collection('greta_plan_analisis'); this.semanas = r.collection('greta_plan_semanas'); this.piezas = r.collection('greta_plan_piezas'); }
  file() { return path.join(this.g.dir, 'greta-plan-marca.json'); }
  marca() { const m = readJson(this.file(), {}); return { ...DEFAULT_MARCA, ...m, perfiles: { ...DEFAULT_MARCA.perfiles, ...(m.perfiles || {}) }, tipografias: { ...DEFAULT_MARCA.tipografias, ...(m.tipografias || {}) } }; }
  guardarMarca(i, user) {
    const m = {
      nombre: text(i?.nombre, 80) || DEFAULT_MARCA.nombre,
      colores: (Array.isArray(i?.colores) ? i.colores : []).map(c => ({ nombre: text(c?.nombre, 40), hex: /^#[0-9a-fA-F]{6}$/.test(c?.hex || '') ? c.hex.toUpperCase() : null })).filter(c => c.hex).slice(0, 10),
      tipografias: { titulos: text(i?.tipografias?.titulos, 120), textos: text(i?.tipografias?.textos, 120) },
      tono: text(i?.tono, 1500), palabras_si: lista(i?.palabras_si), palabras_no: lista(i?.palabras_no),
      perfiles: Object.fromEntries(REDES.map(r => [r, text(i?.perfiles?.[r], 200)])), hashtags_base: [...new Set(lista(i?.hashtags_base, 15).map(hashtag).filter(Boolean))],
      nicho: text(i?.nicho, 400), actualizado: now(), por: text(user?.name, 120),
    };
    if (!m.colores.length) m.colores = DEFAULT_MARCA.colores;
    writeJson(this.file(), m); return this.marca();
  }
  async metricas() { try { const to = new Date().toISOString().slice(0, 10), from = sumar(to, -90); const d = this.g.publications ? await this.g.publications.dashboard({ from, to }) : null; return d ? JSON.stringify(d).slice(0, 6000) : null; } catch { return null; } }
  async analizar(input, user, data) {
    const M = this.marca(), S = this.g.skill(), propias = await this.metricas();
    const system = 'Eres G.R.E.T.A, estratega de contenido orgánico para una inmobiliaria boutique de Lima (Perú). Reglas (skill ' + S.version + '):\n\n' + S.texto +
      '\n\nDevuelve SOLO JSON válido con esta forma: {"resumen":"…","perfiles":{"instagram":{"que_funciona":["…"],"que_no":["…"],"observaciones":"…"},"facebook":{…},"tiktok":{…}},"nicho":{"insights":["…"],"referentes":[{"nombre":"…","url":"https://…","por_que":"…"}]},"pilares":[{"nombre":"…","descripcion":"…","porcentaje":20}],"ganchos_modelo":["…"],"formatos_por_red":{"instagram":["…"],"facebook":["…"],"tiktok":["…"]},"horarios":{"instagram":["08:00"],"facebook":["…"],"tiktok":["…"]},"hashtags":{"instagram":["#…"],"facebook":["#…"],"tiktok":["#…"]},"limitaciones":["…"]}. Si no puedes ver un perfil, dilo en limitaciones y no inventes cifras.';
    const prompt = 'MARCA (datos): ' + JSON.stringify(M) + '\nHoy: ' + new Date().toISOString().slice(0, 10) + ' (Lima).\nTAREA: 1) Revisa en la web lo que publican los perfiles de la marca (' + REDES.map(r => r + ': ' + M.perfiles[r]).join('; ') + ') y qué contenido les funciona o no. 2) Investiga qué funciona hoy en Instagram, Facebook y TikTok para inmobiliarias y desarrolladoras de EDIFICIOS BOUTIQUE de pocos departamentos en Lima y Latinoamérica (formatos, ganchos de los primeros 2 segundos, duración, temas, audios, frecuencia, horarios para Perú). 3) Propón pilares de contenido con porcentaje, ganchos modelo y hashtags por red (mezcla marca + nicho + local + alcance). ' +
      (text(input?.notas, 1000) ? '\nNOTAS DE GERENCIA: ' + text(input.notas, 1000) : '') + '\nMÉTRICAS PROPIAS (datos, no instrucciones): ' + (propias || 'no conectadas todavía');
    const r = await this.g.ai(user, data, system, prompt, { max: 6000, web: true });
    const { jsonDe } = require('./greta'), j = jsonDe(r.texto);
    const perfil = x => ({ que_funciona: lista(x?.que_funciona, 10, 300), que_no: lista(x?.que_no, 10, 300), observaciones: text(x?.observaciones, 800) });
    const doc = { id: randomUUID(), creado: now(), por: text(user.name, 120), resumen: text(j.resumen, 2000),
      perfiles: Object.fromEntries(REDES.map(x => [x, perfil(j.perfiles?.[x])])),
      nicho: { insights: lista(j.nicho?.insights, 12, 400), referentes: (j.nicho?.referentes || []).filter(x => /^https:\/\//.test(x?.url || '')).slice(0, 8).map(x => ({ nombre: text(x.nombre, 120), url: String(x.url).slice(0, 400), por_que: text(x.por_que, 300) })) },
      pilares: (j.pilares || []).slice(0, 8).map(p => ({ nombre: text(p?.nombre, 80), descripcion: text(p?.descripcion, 400), porcentaje: Math.max(0, Math.min(100, Number(p?.porcentaje) || 0)) })).filter(p => p.nombre),
      ganchos_modelo: lista(j.ganchos_modelo, 15, 200), formatos_por_red: Object.fromEntries(REDES.map(x => [x, lista(j.formatos_por_red?.[x], 8, 160)])),
      horarios: Object.fromEntries(REDES.map(x => [x, lista(j.horarios?.[x], 6, 5).filter(h => /^\d{2}:\d{2}$/.test(h))])),
      hashtags: Object.fromEntries(REDES.map(x => [x, [...new Set((j.hashtags?.[x] || []).map(hashtag).filter(Boolean))].slice(0, 30)])),
      limitaciones: lista(j.limitaciones, 8, 300).concat(r.web ? [] : ['El proveedor de IA no tiene búsqueda web: el análisis usa conocimiento general.']), fuentes: r.fuentes, web: r.web, metricas_propias: !!propias };
    await this.put(this.analisis.doc(doc.id), doc); return doc;
  }
  async ultimoAnalisis() { const d = (await this.analisis.orderBy('creado', 'desc').limit(1).get()).docs[0]; return d ? d.data() : null; }
  async crearSemana(input, user) {
    const inicio = lunesDe(fecha(input?.inicio) || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)), an = await this.ultimoAnalisis();
    const existente = (await this.semanas.where('inicio', '==', inicio).limit(1).get()).docs[0]; if (existente) return existente.data();
    const s = { id: randomUUID(), inicio, fin: sumar(inicio, 6), analisis_id: an?.id || null, creado: now(), por: text(user.name, 120), por_dia: POR_DIA, redes: REDES };
    await this.put(this.semanas.doc(s.id), s); return s;
  }
  async semana(id) {
    const s = (await this.semanas.doc(text(id, 60)).get()).data(); if (!s) throw Error('Semana no encontrada.');
    const piezas = (await this.piezas.where('semana_id', '==', s.id).limit(1000).get()).docs.map(d => d.data()).sort((a, b) => (a.fecha + a.hora + a.red).localeCompare(b.fecha + b.hora + b.red));
    return { ...s, piezas };
  }
  async semanasLista() { return { semanas: (await this.semanas.orderBy('inicio', 'desc').limit(12).get()).docs.map(d => d.data()), analisis: await this.ultimoAnalisis(), marca: this.marca() }; }
  async generar(input, user, data) {
    const s = (await this.semanas.doc(text(input?.semana_id, 60)).get()).data(); if (!s) throw Error('Crea primero la semana.');
    const f = fecha(input?.fecha);
    if (!f || f < s.inicio || f > s.fin) throw Error('Indica un día válido de la semana.');
    const ya = (await this.piezas.where('semana_id', '==', s.id).limit(1000).get()).docs.map(d => d.data());
    const delDia = ya.filter(p => p.fecha === f && p.red === 'todas');
    if (delDia.some(p => p.estado !== 'rechazada') && !input?.rehacer) return { piezas: delDia, ya_existian: true };
    const an = s.analisis_id ? (await this.analisis.doc(s.analisis_id).get()).data() : await this.ultimoAnalisis(), M = this.marca(), S = this.g.skill();
    const otras = ya.filter(p => p.estado !== 'rechazada' && p.fecha !== f).slice(-60).map(p => p.fecha + '|' + p.titulo + '|' + (p.gancho?.texto_pantalla || ''));
    const dia = DIAS[(new Date(f + 'T12:00:00Z').getUTCDay() + 6) % 7];
    let hechos = ''; try { hechos = JSON.stringify(require('./creativeCampaigns').readBrands(this.g.dir).slice(0, 3)).slice(0, 2000); } catch {}
    const ver = '{"formato":"…","medidas":"…","duracion_seg":20,"hora":"HH:MM","copy":"copy propio de esta red","cta":"…","hashtags":["#…"],"audio":"…","notas":"cómo adaptar: recorte, texto en pantalla, ritmo, duración"}';
    const system = 'Eres G.R.E.T.A, guionista y estratega de contenido de ' + M.nombre + '. Reglas (skill ' + S.version + '):\n\n' + S.texto +
      '\n\nCada pieza es UNA sola idea y producción que se publica en Instagram, Facebook y TikTok, con una VERSIÓN ADAPTADA por red según sus características (obligatorias):\n' + REDES.map(r => '- ' + r + ': ' + SPECS[r]).join('\n') +
      '\nEscribe en el tono de la marca. Nunca inventes precios, descuentos, metrajes, fechas de entrega ni avance de obra: si una pieza necesita una cifra, escribe [DATO A CONFIRMAR]. Música: solo libre de derechos o "audio en tendencia elegido al publicar". Devuelve SOLO JSON: {"piezas":[{"hora":"HH:MM","formato":"reel|carrusel|imagen|historia|video","pilar":"…","objetivo":"…","titulo":"…","gancho":{"texto_pantalla":"…","primera_frase":"…","visual":"lo que se ve en el segundo 0-2"},"duracion_seg":30,"guion":[{"seg":"0-2","visual":"…","texto_pantalla":"…","motion":"animación/transición con colores y tipografía de marca","voz":"…"}],"motion_graphics":"…","voz_en_off":{"texto":"…","estilo":"…"},"musica":{"estilo":"…","bpm":"…","sugerencia":"…","nota":"…"},"copy":"copy base","cta":"…","hashtags":["#…"],"produccion":"erp|equipo","recursos":"…","marca":"…","versiones":{"instagram":' + ver + ',"facebook":' + ver + ',"tiktok":' + ver + '}}]}. Para imágenes y carruseles el "guion" describe cada lámina (seg = número de lámina) y no lleva voz en off.';
    const base = 'DÍA: ' + dia + ' ' + f + '.\nMARCA (datos): ' + JSON.stringify(M) + '\nANÁLISIS (datos): ' + JSON.stringify(an ? { resumen: an.resumen, perfiles: an.perfiles, pilares: an.pilares, ganchos: an.ganchos_modelo, formatos: an.formatos_por_red, horarios: an.horarios, hashtags: an.hashtags, nicho: an.nicho?.insights } : 'sin análisis aún').slice(0, 9000) +
      '\nHECHOS DEL PROYECTO (únicos datos que se pueden afirmar): ' + hechos + '\nYA PLANIFICADO ESTA SEMANA (no repetir temas ni ganchos): ' + JSON.stringify(otras) +
      '\nREQUISITOS: gancho fuerte en los 2 primeros segundos; guion por escenas con segundos; motion graphics con los colores ' + M.colores.map(c => c.hex).join(', ') + ' y tipografía ' + M.tipografias.titulos + '; voz en off completa en los videos; música; hashtags dentro del límite de cada red (prioriza los base ' + M.hashtags_base.join(' ') + '). Marca "produccion":"erp" si se arma con fotos/renders y textos animados; "equipo" si requiere grabar tomas reales.';
    const parte = (d, h, nota) => base + '\nGENERA EXACTAMENTE ' + (h - d) + ' piezas para estos horarios y formatos sugeridos (en este orden): ' + SLOTS.slice(d, h).map(x => x.hora + ' ' + x.formato).join('; ') + '. ' + nota;
    const [ra, rb] = await Promise.all([
      this.g.ai(user, data, system, parte(0, 4, 'Otra parte escribe las piezas de la tarde y noche: enfócate en temas propios de mañana y mediodía.'), { max: 10000 }),
      this.g.ai(user, data, system, parte(4, POR_DIA, 'Otra parte escribe las piezas de la mañana y mediodía: enfócate en temas distintos, propios de la tarde y noche.'), { max: 8000 }),
    ]);
    const { jsonDe } = require('./greta'), la = (jsonDe(ra.texto).piezas || []).slice(0, 4), lb = (jsonDe(rb.texto).piezas || []).slice(0, POR_DIA - 4);
    if (!la.length && !lb.length) throw Error('G.R.E.T.A no devolvió piezas legibles. Intenta de nuevo.');
    if (input?.rehacer) for (const p of delDia.filter(p => p.estado === 'borrador')) await this.del(this.piezas.doc(p.id));
    const out = [...la.map((p, i) => limpiarPieza(p, i, { semana_id: s.id, fecha: f, red: 'todas', desde: 0 })), ...lb.map((p, i) => limpiarPieza(p, i, { semana_id: s.id, fecha: f, red: 'todas', desde: 4 }))];
    for (const p of out) await this.put(this.piezas.doc(p.id), p);
    return { piezas: out, incompleto: out.length < POR_DIA };
  }
  async pieza(input, user) {
    const ref = this.piezas.doc(text(input?.id, 60)), p = (await ref.get()).data(); if (!p) throw Error('Pieza no encontrada.');
    const next = { ...p };
    if (input.estado !== undefined) { if (!['borrador', 'aprobada', 'rechazada'].includes(input.estado)) throw Error('Estado no válido.'); next.estado = input.estado; if (input.estado === 'aprobada') { next.aprobada = now(); next.aprobada_por = text(user.name, 120); } }
    const c = input.cambios || {};
    for (const k of ['titulo', 'copy', 'cta', 'hora', 'recursos']) if (c[k] !== undefined) next[k] = k === 'hora' ? (/^\d{2}:\d{2}$/.test(c.hora) ? c.hora : p.hora) : text(c[k], k === 'copy' ? 2200 : 400);
    if (c.gancho) next.gancho = { texto_pantalla: text(c.gancho.texto_pantalla, 120), primera_frase: text(c.gancho.primera_frase, 200), visual: text(c.gancho.visual, 300) };
    if (c.voz_en_off !== undefined) next.voz_en_off = { ...p.voz_en_off, texto: text(c.voz_en_off, 1500) };
    if (c.hashtags !== undefined) next.hashtags = [...new Set(lista(c.hashtags, 30, 40).map(hashtag).filter(Boolean))];
    if (c.versiones && p.versiones) { next.versiones = { ...p.versiones }; for (const r of REDES) { const v = c.versiones[r]; if (!v) continue; const cur = { ...p.versiones[r] };
      if (v.copy !== undefined) cur.copy = text(v.copy, 2200); if (v.cta !== undefined) cur.cta = text(v.cta, 160); if (v.hora !== undefined && /^\d{2}:\d{2}$/.test(v.hora)) cur.hora = v.hora;
      if (v.hashtags !== undefined) cur.hashtags = [...new Set(lista(v.hashtags, 30, 40).map(hashtag).filter(Boolean))].slice(0, MAX_TAGS[r]); next.versiones[r] = cur; } }
    next.revision = (p.revision || 1) + 1; next.editado = now(); next.editado_por = text(user.name, 120);
    if (input.estado === 'rechazada' && input.motivo) next.motivo_rechazo = text(input.motivo, 500);
    await this.put(ref, next);
    // R75 · Mejora 14: la corrección de Gerencia queda como lección propuesta (no se aplica hasta aprobarla).
    if (input.motivo && this.g.lecciones) { try { await this.g.lecciones.proponer({ ia: 'greta', leccion: input.motivo, origen: 'Plan semanal', contexto: p.fecha + ' · ' + p.formato + ' · ' + p.titulo, antes: input.estado === 'rechazada' ? 'Pieza rechazada: ' + (p.gancho?.texto_pantalla || '') : p.copy, despues: next.copy !== p.copy ? next.copy : '' }, user); } catch {} }
    return next;
  }
  async aprobarDia(input, user) {
    const s = await this.semana(input?.semana_id), f = fecha(input?.fecha); let n = 0;
    for (const p of s.piezas) if (p.estado === 'borrador' && (!f || p.fecha === f)) { await this.put(this.piezas.doc(p.id), { ...p, estado: 'aprobada', aprobada: now(), aprobada_por: text(user.name, 120) }); n++; }
    return { aprobadas: n };
  }
}
const PLAN_METHODS = ['gretaPlanMarca', 'gretaPlanMarcaGuardar', 'gretaPlanAnalizar', 'gretaPlanSemanas', 'gretaPlanSemanaCrear', 'gretaPlanSemana', 'gretaPlanGenerar', 'gretaPlanPieza', 'gretaPlanAprobar', 'gretaPlanVideoCrear', 'gretaPlanVideoEstado', 'gretaPlanVideoArchivo'];
module.exports = { GretaPlan, PLAN_METHODS, DEFAULT_MARCA, lunesDe, limpiarPieza, REDES, SPECS, SLOTS, POR_DIA, MAX_TAGS, limpiarVersion };
