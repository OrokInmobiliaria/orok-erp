import React, {useEffect, useRef, useState} from 'react';
import {Sparkles, Mic, Square, Volume2, VolumeX, Send, X, Settings, RotateCcw} from 'lucide-react';
import {api} from './dataService';
import './greta.css';
// R42 · Módulo Marketing con G.R.E.T.A (Gestión de Redes, Estrategia, Tendencias y Anuncios).
// Pantallas: Hoy, Tendencias, Publicar, Pauta y KPIs, y la configuración de imágenes. Todo usa el servidor (G.R.E.T.A),
// que reutiliza Campañas IA (Estudio), la cola de publicación y la atribución de anuncios del CRM.
const db = new Proxy({}, {get: (_, k) => (...a) => window.crmDB[k](...a)});
const NICHOS = ['Departamentos en Lima', 'Arquitectura', 'Interiorismo', 'Construcción', 'Inversión inmobiliaria'];
const FORMATO = {graphic: 'Gráfica', carousel: 'Carrusel', reel: 'Reel', story: 'Historia'};
const ACCION = {aumentar: ['Subir', 'up'], reducir: ['Reducir', 'down'], mantener: ['Mantener', 'flat'], sin_datos: ['Sin datos', 'flat']};
const money = (v, cur = 'PEN') => v == null ? '—' : (cur === 'USD' ? 'US$ ' : 'S/ ') + Number(v).toLocaleString('es-PE', {minimumFractionDigits: 2, maximumFractionDigits: 2});
const num = v => v == null ? '—' : Number(v).toLocaleString('es-PE', {maximumFractionDigits: 0});
const pct = v => v == null ? '—' : Number(v).toLocaleString('es-PE', {maximumFractionDigits: 2}) + ' %';
function useLoad(fn, deps = []) {
  const [state, set] = useState({data: null, error: '', busy: true});
  const run = () => { set(s => ({...s, busy: true, error: ''})); return fn().then(data => set({data, error: '', busy: false})).catch(e => set(s => ({...s, error: e.message || 'No se pudo cargar.', busy: false}))); };
  useEffect(() => { run(); }, deps);
  return [state, run];
}
function Head({kicker, title, children}) {
  return <header className="greta-head"><div><div className="greta-kicker">{kicker}</div><h1>{title}</h1></div>{children && <div className="greta-actions">{children}</div>}</header>;
}
function Msg({error, info}) { return <>{error && <p className="greta-msg err" role="alert">{error}</p>}{info && <p className="greta-msg" role="status">{info}</p>}</>; }

// ---------- Hoy ----------
export function GretaHoy({onGo}) {
  const [{data, error, busy}] = useLoad(() => db.gretaHoy());
  const t = data?.pauta?.totales?.[0];
  const hora = Number(new Intl.DateTimeFormat('es-PE', {timeZone: 'America/Lima', hour: 'numeric', hour12: false}).format(new Date()));
  return <section className="greta">
    <Head kicker="G.R.E.T.A · Gestión de Redes, Estrategia, Tendencias y Anuncios" title={(hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches') + (data?.saludo ? ', ' + data.saludo.split(' ')[0] : '')}>
      <button className="orok-btn orok-btn-primary" onClick={() => onGo('mkTrends')}>Crear algo nuevo</button>
    </Head>
    <Msg error={error}/>
    {busy && !data && <p className="greta-muted">Preparando tu día…</p>}
    {data && <>
      <div className="greta-stats">
        <button className="greta-stat glass-card" onClick={() => onGo('campaigns')}><span>Para aprobar</span><b>{data.por_aprobar.length}</b><small>{data.por_aprobar.slice(0, 2).map(c => c.titulo).join(' · ') || 'Nada pendiente'}</small></button>
        <button className="greta-stat glass-card" onClick={() => onGo('mkKpis')}><span>Pauta · 7 días</span><b>{t ? money(t.spend, t.currency) : '—'}</b><small>{t ? `${num(t.crm_leads)} leads del CRM · ${data.pauta.anuncios} anuncios` : 'Sin datos de anuncios todavía'}</small></button>
        <button className="greta-stat glass-card" onClick={() => onGo('marketing')}><span>Leads · 30 días</span><b>{num(data.lola.leads_30d)}</b><small>{data.lola.por_origen.slice(0, 2).map(o => o.origen + ' ' + o.n).join(' · ') || 'Ya están en el CRM con su origen'}</small></button>
      </div>
      <div className="greta-row">
        <div className="glass-card greta-grow">
          <h2>G.R.E.T.A sugiere hoy</h2>
          {data.sugerencias.length ? <ul className="greta-list">{data.sugerencias.map((s, i) => <li key={i}><div><b>{s.titulo}</b><small>{s.detalle}</small></div><button className="orok-btn orok-btn-secondary" onClick={() => onGo(s.ir)}>{s.tipo === 'pauta' ? 'Revisar' : 'Crear'}</button></li>)}</ul> : <p className="greta-muted">Todo al día.</p>}
        </div>
        <div className="glass-card dark greta-side">
          <div className="greta-kicker light">Lo que preguntan los clientes · desde L.O.L.A</div>
          {data.lola.temas.length ? <div className="greta-chips">{data.lola.temas.map(t => <span key={t.id}>{t.tema} · {t.menciones}</span>)}</div> : <p>Aún no hay temas en los últimos 30 días.</p>}
          <p className="small">Temas resumidos, sin datos personales. G.R.E.T.A le avisa a L.O.L.A {data.para_lola?.campanas_activas?.length ? `${data.para_lola.campanas_activas.length} campaña(s) activa(s)` : 'las campañas activas'} para que responda igual que el anuncio.</p>
        </div>
      </div>
    </>}
  </section>;
}

// ---------- Tendencias ----------
export function GretaTendencias({onOpenCampaign}) {
  const [nichos, setNichos] = useState(NICHOS.slice(0, 2)), [redes, setRedes] = useState(['facebook', 'instagram', 'tiktok']), [dias, setDias] = useState(7);
  const [brands, setBrands] = useState([]), [project, setProject] = useState('');
  const [{data: hist}, reload] = useLoad(() => db.gretaTendenciasLista());
  const [sel, setSel] = useState(null), [busy, setBusy] = useState(''), [error, setError] = useState(''), [info, setInfo] = useState('');
  useEffect(() => { db.getCreativeBrand().then(b => { const list = b?.brands || []; setBrands(list); setProject(p => p || list[0]?.id || ''); }).catch(() => {}); }, []);
  useEffect(() => { if (!sel && hist?.lecturas?.length) setSel(hist.lecturas[0]); }, [hist]);
  const toggle = (list, set, v) => set(list.includes(v) ? list.filter(x => x !== v) : [...list, v]);
  const radar = async () => { setBusy('radar'); setError(''); setInfo(''); try { const r = await db.gretaTendencias({nichos, redes, dias, project_id: project}); setSel(r); reload(); } catch (e) { setError(e.message); } finally { setBusy(''); } };
  const crear = async t => { setBusy(t.id); setError(''); setInfo(''); try { const r = await db.gretaIdea({lectura_id: sel.id, tendencia_id: t.id, project_id: project, request_id: crypto.randomUUID()}); if (r.aviso) setInfo(r.aviso); onOpenCampaign(r.campaign_id); } catch (e) { setError(e.message); } finally { setBusy(''); } };
  return <section className="greta">
    <Head kicker="Crear · Tendencias" title="Qué está funcionando en tu nicho">
      {brands.length > 1 && <label className="greta-inline">Proyecto<select className="orok-input" value={project} onChange={e => setProject(e.target.value)}>{brands.map(b => <option key={b.id} value={b.id}>{b.project || b.name}</option>)}</select></label>}
      <button className="orok-btn orok-btn-primary" disabled={!!busy || !nichos.length || !redes.length} onClick={radar}>{busy === 'radar' ? 'Buscando tendencias…' : 'Actualizar radar'}</button>
    </Head>
    <div className="glass-card greta-filters">
      <div role="group" aria-label="Redes"><span>Redes</span>{['facebook', 'instagram', 'tiktok'].map(r => <button key={r} type="button" aria-pressed={redes.includes(r)} onClick={() => toggle(redes, setRedes, r)}>{{facebook:'Facebook',instagram:'Instagram',tiktok:'TikTok'}[r]}</button>)}</div>
      <div role="group" aria-label="Nicho"><span>Nicho</span>{NICHOS.map(n => <button key={n} type="button" aria-pressed={nichos.includes(n)} onClick={() => toggle(nichos, setNichos, n)}>{n}</button>)}</div>
      <div role="group" aria-label="Periodo"><span>Periodo</span>{[7, 30].map(d => <button key={d} type="button" aria-pressed={dias === d} onClick={() => setDias(d)}>{d} días</button>)}</div>
      {hist?.lecturas?.length > 1 && <label className="greta-inline">Lecturas anteriores<select className="orok-input" value={sel?.id || ''} onChange={e => setSel(hist.lecturas.find(l => l.id === e.target.value))}>{hist.lecturas.map(l => <option key={l.id} value={l.id}>{new Date(l.creado).toLocaleString('es-PE', {timeZone: 'America/Lima', dateStyle: 'short', timeStyle: 'short'})} · {l.filtros.nichos.join(', ')}</option>)}</select></label>}
    </div>
    <Msg error={error} info={info}/>
    {!sel && <div className="glass-card"><p>Aún no hay una lectura del nicho. Pulsa «Actualizar radar»: G.R.E.T.A busca formatos, temas y hashtags que están funcionando y los cruza con tus publicaciones y con lo que preguntan los clientes.</p></div>}
    {sel && <div className="greta-row">
      <div className="greta-cards greta-grow">
        {sel.tendencias.map(t => <article key={t.id} className="glass-card greta-trend">
          <div className="greta-trend-top"><span className="greta-badge">{FORMATO[t.formato] || t.formato} · {t.redes.map(r => r === 'tiktok' ? 'TikTok' : r === 'instagram' ? 'Instagram' : 'Facebook').join(' + ')}</span><span className={'greta-fit ' + t.encaje}>Encaje {t.encaje}</span></div>
          <h3>{t.titulo}</h3>
          <p>{t.por_que}</p>
          {t.como_aplicarlo && <p className="greta-muted"><b>Para ÖRÖK:</b> {t.como_aplicarlo}</p>}
          {t.senal && <p className="greta-signal">Señal: {t.senal} · confianza {t.confianza}</p>}
          {t.ejemplos.length > 0 && <p className="greta-links">{t.ejemplos.map((e, i) => <a key={i} href={e.url} target="_blank" rel="noopener noreferrer">{e.titulo || 'Ejemplo ' + (i + 1)}</a>)}</p>}
          <button className="orok-btn orok-btn-primary" disabled={!!busy} onClick={() => crear(t)}>{busy === t.id ? 'Creando alternativas…' : 'Crear alternativas'}</button>
        </article>)}
      </div>
      <aside className="greta-side">
        {sel.resumen && <div className="glass-card dark"><div className="greta-kicker light">Lectura de G.R.E.T.A</div><p>{sel.resumen}</p></div>}
        {sel.hashtags.length > 0 && <div className="glass-card"><h2>Hashtags que suben</h2><div className="greta-chips soft">{sel.hashtags.map(h => <span key={h}>{h}</span>)}</div></div>}
        {sel.lola?.temas?.length > 0 && <div className="glass-card"><h2>Lo que preguntan los clientes</h2><div className="greta-chips soft">{sel.lola.temas.map(t => <span key={t.id}>{t.tema}</span>)}</div></div>}
        <div className="glass-card"><h2>Fuentes</h2>{sel.fuentes.length ? <ul className="greta-sources">{sel.fuentes.map((f, i) => <li key={i}><a href={f.url} target="_blank" rel="noopener noreferrer">{f.titulo || f.url}</a></li>)}</ul> : <p className="greta-muted">Sin fuentes web en esta lectura.</p>}
          {sel.limitaciones.map((l, i) => <p key={i} className="greta-muted small">{l}</p>)}</div>
      </aside>
    </div>}
  </section>;
}

// ---------- Estudio: generar o editar imágenes (dentro de Recursos de la campaña) ----------
export function GretaImagen({campaign, onDone}) {
  const fotos = (campaign?.media || []).filter(m => m.kind === 'image');
  const [prompt, setPrompt] = useState(''), [base, setBase] = useState(''), [formato, setFormato] = useState('portrait'), [n, setN] = useState(2), [busy, setBusy] = useState(false), [msg, setMsg] = useState(''), [err, setErr] = useState('');
  const atajos = ['Cielo de atardecer', 'Quitar objetos del fondo', 'Amoblar el ambiente', 'Mejorar la luz natural', 'Versión de noche con luces encendidas'];
  const go = async () => { setBusy(true); setErr(''); setMsg(''); try { const r = await db.gretaImagen({campaign_id: campaign.id, prompt, base_token: base || undefined, formato, n}); setMsg(r.imagenes.length + ' imagen(es) agregadas a los recursos. ' + r.aviso); onDone?.(); } catch (e) { setErr(e.message); } finally { setBusy(false); } };
  return <div className="glass-card greta-img">
    <h3>{base ? 'Editar mi foto con G.R.E.T.A' : 'Crear imágenes con G.R.E.T.A'}</h3>
    <div className="greta-img-grid">
      <label>Foto base (opcional)<select className="orok-input" value={base} onChange={e => setBase(e.target.value)}><option value="">Sin foto: imagen nueva</option>{fotos.map(m => <option key={m.id} value={m.token}>{m.label}</option>)}</select></label>
      <label>Formato<select className="orok-input" value={formato} onChange={e => setFormato(e.target.value)}><option value="portrait">Feed 4:5</option><option value="vertical">Reel / historia 9:16</option><option value="square">Cuadrado 1:1</option></select></label>
      <label>Versiones<select className="orok-input" value={n} onChange={e => setN(+e.target.value)}>{[1, 2, 3].map(x => <option key={x}>{x}</option>)}</select></label>
    </div>
    <label>{base ? '¿Qué quieres cambiar?' : 'Describe la imagen'}<textarea className="orok-input" rows={2} maxLength={1500} value={prompt} onChange={e => setPrompt(e.target.value)} placeholder={base ? 'Ej.: cielo de atardecer, quitar el andamio del fondo y agregar dos sillas.' : 'Ej.: sala luminosa de un departamento moderno en San Miguel, luz de tarde.'}/></label>
    <div className="greta-chips soft">{atajos.map(a => <button key={a} type="button" onClick={() => setPrompt(p => (p ? p + '. ' : '') + a)}>{a}</button>)}</div>
    <div className="greta-row-tight"><button className="orok-btn orok-btn-primary" disabled={busy || prompt.trim().length < 8} onClick={go}>{busy ? 'Generando…' : 'Generar'}</button><small className="greta-muted">Se guardan como «referencial» en Recursos y la original se conserva.</small></div>
    <Msg error={err} info={msg}/>
  </div>;
}

// ---------- Publicar o exportar ----------
export function GretaPublicar({onGo}) {
  const [{data: list, error}] = useLoad(() => db.getCreativeCampaigns());
  const aprobadas = (list?.campaigns || []).filter(c => c.status === 'approved');
  const [id, setId] = useState(''), [c, setC] = useState(null), [busy, setBusy] = useState(''), [msg, setMsg] = useState(''), [err, setErr] = useState(''), [when, setWhen] = useState(''), [pauta, setPauta] = useState({});
  useEffect(() => { if (!id && aprobadas[0]) setId(aprobadas[0].id); }, [list]);
  useEffect(() => { if (id) db.getCreativeCampaign(id).then(setC).catch(e => setErr(e.message)); }, [id]);
  const exportsOf = p => (c?.exports || []).filter(e => e.revision === c.revision && !e.is_draft && String(e.filename || '').includes('-' + p.id + '-'));
  const caption = p => (p.caption + ((c.brand?.hashtags || []).length && !p.caption.includes((c.brand.hashtags || []).join(' ')) ? '\n\n' + c.brand.hashtags.join(' ') : '')).slice(0, 2200);
  const descargar = async p => { for (const e of exportsOf(p)) { const a = document.createElement('a'); a.href = e.url; a.download = e.filename || 'pieza'; document.body.append(a); a.click(); a.remove(); } const b = new Blob([caption(p)], {type: 'text/plain;charset=utf-8'}), u = URL.createObjectURL(b), a = document.createElement('a'); a.href = u; a.download = (p.id || 'pieza') + '-texto.txt'; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 2000); setMsg('Paquete descargado: ábrelo en Instagram, Edits, TikTok o Meta Business Suite para retocarlo.'); };
  const enviar = async (p, channel, modo) => { setBusy(p.id + channel + modo); setErr(''); setMsg(''); try { const at = modo === 'borrador' || !when ? new Date(Date.now() + 120000) : new Date(when + ':00-05:00'); await db.requestPublication({campaign_id: c.id, piece_id: p.id, channel, modo, scheduled_at: at.toISOString(), request_id: crypto.randomUUID()}); setMsg(modo === 'borrador' ? (channel === 'tiktok' ? 'En cola: n8n lo deja en tus borradores de TikTok para terminarlo en su editor.' : 'En cola: n8n lo deja como no publicado en Meta Business Suite.') : 'Programado para ' + at.toLocaleString('es-PE', {timeZone: 'America/Lima'}) + '.'); } catch (e) { setErr(e.message); } finally { setBusy(''); } };
  return <section className="greta">
    <Head kicker="Publicar · piezas aprobadas por Gerencia" title="¿Lo publicamos o lo terminas en la app?">
      {aprobadas.length > 0 && <label className="greta-inline">Campaña<select className="orok-input" value={id} onChange={e => setId(e.target.value)}>{aprobadas.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}</select></label>}
    </Head>
    <Msg error={error || err} info={msg}/>
    {!aprobadas.length && <div className="glass-card"><p>No hay campañas aprobadas. Aprueba una en Estudio y exporta sus piezas (versión sin marca de borrador).</p><button className="orok-btn orok-btn-secondary" onClick={() => onGo('campaigns')}>Ir al Estudio</button></div>}
    {c && <>
      <label className="greta-inline">Fecha y hora para programar (Lima)<input className="orok-input" type="datetime-local" value={when} onChange={e => setWhen(e.target.value)}/></label>
      {(c.proposal?.creatives || []).map(p => { const ex = exportsOf(p), v = ex.find(e => /^video/.test(e.mime)), im = ex.find(e => /^image/.test(e.mime)), listo = ex.length > 0;
        return <article key={p.id} className="glass-card greta-pub">
          <div className="greta-pub-media">{v ? <video src={v.url} controls muted playsInline/> : im ? <img src={im.url} alt={'Pieza ' + p.headline}/> : <div className="greta-ph">Exporta esta pieza en Estudio</div>}</div>
          <div className="greta-pub-body">
            <div className="greta-badge">{FORMATO[p.format]} · {p.headline}</div>
            <p className="greta-caption">{caption(p)}</p>
            <div className="greta-dest"><b>TikTok</b><span>A tus borradores: agregas el audio en tendencia y efectos en su editor.</span><div><button className="orok-btn orok-btn-primary" disabled={!listo || !!busy} onClick={() => enviar(p, 'tiktok', 'borrador')}>Enviar a borradores</button><button className="orok-btn orok-btn-secondary" disabled={!listo || !!busy} onClick={() => enviar(p, 'tiktok', 'publicar')}>Programar</button></div></div>
            <div className="greta-dest"><b>Instagram</b><span>No recibe borradores: descarga y ábrelo en Instagram o Edits, o prográmalo tal cual.</span><div><button className="orok-btn orok-btn-primary" disabled={!listo} onClick={() => descargar(p)}>Descargar para editar</button><button className="orok-btn orok-btn-secondary" disabled={!listo || !!busy} onClick={() => enviar(p, 'instagram', 'publicar')}>Programar</button></div></div>
            <div className="greta-dest"><b>Facebook</b><span>Queda como no publicada en Meta Business Suite para revisarla allí.</span><div><button className="orok-btn orok-btn-primary" disabled={!listo || !!busy} onClick={() => enviar(p, 'facebook', 'borrador')}>Guardar en Business Suite</button><button className="orok-btn orok-btn-secondary" disabled={!listo || !!busy} onClick={() => enviar(p, 'facebook', 'publicar')}>Programar</button></div></div>
            <label className="greta-check"><input type="checkbox" checked={!!pauta[p.id]} onChange={e => setPauta(x => ({...x, [p.id]: e.target.checked}))}/> Esta publicación lleva pauta</label>
            {pauta[p.id] && <p className="greta-muted small">La pauta se activa en el administrador de anuncios de Meta o TikTok. Después vincula el anuncio a esta pieza en Pauta y KPIs (Pruebas A/B) para seguir sus KPIs y los leads del CRM. <button className="orok-btn orok-btn-secondary" onClick={() => onGo('mkKpis')}>Ir a Pauta y KPIs</button></p>}
          </div>
        </article>; })}
    </>}
  </section>;
}

// ---------- Pauta y KPIs ----------
export function GretaKpis({onGo}) {
  const [dias, setDias] = useState(7), [platform, setPlatform] = useState('');
  const [{data, error, busy}] = useLoad(() => db.gretaKpis({dias, platform}), [dias, platform]);
  const [lectura, setLectura] = useState(''), [leyendo, setLeyendo] = useState(false), [err, setErr] = useState('');
  const [{data: forms}] = useLoad(() => db.gretaFormularios({dias}).catch(() => null), [dias]);
  const leer = async () => { setLeyendo(true); setErr(''); try { setLectura((await db.gretaKpisLectura({dias, platform})).lectura); } catch (e) { setErr(e.message); } finally { setLeyendo(false); } };
  const rows = data?.anuncios || [], cur = data?.totales?.[0]?.currency || 'PEN', mine = rows.filter(r => r.moneda === cur);
  const s = k => mine.reduce((a, r) => a + (Number(r[k]) || 0), 0), spend = s('inversion'), imp = s('impresiones'), clk = s('clics'), leads = s('leads_crm'), citas = s('citas');
  const tiles = [['Inversión', money(spend, cur)], ['Impresiones', num(imp)], ['CTR', pct(imp ? clk / imp * 100 : null)], ['Costo por clic', money(clk ? spend / clk : null, cur)], ['Costo por lead (CRM)', money(leads ? spend / leads : null, cur)], ['Costo por cita', money(citas ? spend / citas : null, cur)]];
  return <section className="greta">
    <Head kicker="Medir · Meta y TikTok cruzados con el CRM" title="Pauta y KPIs">
      <select className="orok-input" aria-label="Red" value={platform} onChange={e => setPlatform(e.target.value)}><option value="">Meta y TikTok</option><option value="facebook">Facebook</option><option value="instagram">Instagram</option><option value="tiktok">TikTok</option></select>
      <select className="orok-input" aria-label="Periodo" value={dias} onChange={e => setDias(+e.target.value)}>{[7, 14, 30, 90].map(d => <option key={d} value={d}>Últimos {d} días</option>)}</select>
      <button className="orok-btn orok-btn-primary" disabled={leyendo || !rows.length} onClick={leer}>{leyendo ? 'Leyendo…' : 'Lectura de G.R.E.T.A'}</button>
    </Head>
    <Msg error={error || err}/>
    <div className="greta-tiles">{tiles.map(([l, v]) => <div key={l} className="glass-card"><span>{l}</span><b>{v}</b></div>)}</div>
    {lectura && <div className="glass-card dark greta-answer"><div className="greta-kicker light">Lectura de G.R.E.T.A</div>{lectura.split('\n').map((l, i) => <p key={i}>{l}</p>)}<p className="small">G.R.E.T.A no cambia presupuestos: la decisión es de Gerencia y se aplica en Meta o TikTok.</p></div>}
    <div className="glass-card">
      <h2>Anuncios del periodo</h2>
      {busy && !data ? <p className="greta-muted">Cargando…</p> : !rows.length ? <p>Aún no hay datos de anuncios en este periodo. Sincroniza o importa el reporte de Meta y TikTok en <button className="orok-btn orok-btn-secondary" onClick={() => onGo('marketing')}>Ventas atribuidas</button>.</p> :
      <div className="greta-table"><table><thead><tr><th>Anuncio</th><th>Red</th><th className="n">Inversión</th><th className="n">CTR</th><th className="n">CPC</th><th className="n">Leads CRM</th><th className="n">Citas</th><th className="n">Costo por lead</th><th className="n">Costo por cita</th><th>G.R.E.T.A</th></tr></thead>
        <tbody>{rows.map(r => <tr key={r.id}><td><b>{r.nombre}</b></td><td>{(r.plataformas || []).join(', ') || r.red}</td><td className="n">{money(r.inversion, r.moneda)}</td><td className="n">{pct(r.ctr)}</td><td className="n">{money(r.cpc, r.moneda)}</td><td className="n">{num(r.leads_crm)}</td><td className="n">{num(r.citas)}</td><td className="n">{money(r.cpl_crm, r.moneda)}</td><td className="n">{money(r.costo_cita, r.moneda)}</td>
          <td>{r.recomendacion ? <span className={'greta-reco ' + (ACCION[r.recomendacion.accion]?.[1] || 'flat')} title={r.recomendacion.motivo}>{ACCION[r.recomendacion.accion]?.[0] || r.recomendacion.accion}</span> : '—'}</td></tr>)}</tbody></table></div>}
      <p className="greta-muted small">Leads y citas salen del CRM, no del pixel. {data?.aviso}</p>
    </div>
    {forms?.kpis?.length > 0 && <div className="glass-card">{/* R43 · KPIs por formulario instantáneo */}
      <h2>Formularios instantáneos</h2>
      <div className="greta-table"><table><thead><tr><th>Formulario</th><th>Estado</th><th className="n">Leads</th><th className="n">Citas</th><th className="n">Ventas</th><th className="n">Lead → cita</th></tr></thead>
        <tbody>{forms.kpis.map(k => <tr key={k.id}><td><b>{k.nombre}</b> · v{k.version}</td><td>{k.estado === 'creado' ? 'En Meta' : k.estado}</td><td className="n">{num(k.leads)}</td><td className="n">{num(k.citas)}</td><td className="n">{num(k.ventas)}</td><td className="n">{pct(k.tasa_cita)}</td></tr>)}</tbody></table></div>
      <p className="greta-muted small">Leads del CRM que llegaron por cada formulario en los últimos {forms.dias} días y la etapa a la que llegaron.</p>
    </div>}
  </section>;
}

// ---------- Marca › G.R.E.T.A (imágenes y enlace con L.O.L.A) ----------
export function GretaConfig() {
  const [{data, error}, reload] = useLoad(() => db.gretaConfig());
  const [f, setF] = useState(null), [fo, setFo] = useState({privacidad_url: '', whatsapp: ''}), [key, setKey] = useState(''), [msg, setMsg] = useState(''), [err, setErr] = useState('');
  useEffect(() => { if (data) { setF(data.imagenes); setFo(data.formularios || {privacidad_url: '', whatsapp: ''}); } }, [data]);
  const save = async () => { setErr(''); setMsg(''); try { await db.gretaConfigGuardar({imagenes: {proveedor: f.proveedor, modelo: f.modelo, calidad: f.calidad, habilitado: f.habilitado, max_por_dia: f.max_por_dia, ...(key ? {apiKey: key} : {})}, formularios: fo}); setKey(''); setMsg('Guardado.'); reload(); } catch (e) { setErr(e.message); } };
  const lola = async () => { setErr(''); setMsg(''); try { const r = await db.gretaAvisarLola(); setMsg('L.O.L.A ya conoce ' + r.campanas + ' campaña(s) activa(s).'); } catch (e) { setErr(e.message); } };
  if (!f) return <div className="glass-card"><Msg error={error}/>{!error && <p className="greta-muted">Cargando G.R.E.T.A…</p>}</div>;
  return <div className="glass-card greta-config">
    <h2>G.R.E.T.A · imágenes y enlace con L.O.L.A</h2>
    <p className="greta-muted small">G.R.E.T.A usa el proveedor de IA de L.O.L.A para textos y análisis. Las imágenes usan su propio proveedor. Reglas: skill greta-marketing ({data.skill.version}, {data.skill.fuente}).</p>
    <div className="greta-img-grid">
      <label>Proveedor de imágenes<select className="orok-input" value={f.proveedor} onChange={e => setF({...f, proveedor: e.target.value, modelo: e.target.value === 'openai' ? 'gpt-image-1' : 'gemini-2.5-flash-image'})}><option value="openai">OpenAI (recomendado para editar fotos)</option><option value="google">Google Gemini</option></select></label>
      <label>Modelo<input className="orok-input" value={f.modelo} onChange={e => setF({...f, modelo: e.target.value})}/></label>
      <label>Calidad<select className="orok-input" value={f.calidad} onChange={e => setF({...f, calidad: e.target.value})}><option value="low">Baja (más barata)</option><option value="medium">Media</option><option value="high">Alta</option></select></label>
      <label>Máximo por día<input className="orok-input" type="number" min={1} max={200} value={f.max_por_dia} onChange={e => setF({...f, max_por_dia: +e.target.value})}/></label>
      <label>Clave del proveedor<input className="orok-input" type="password" autoComplete="off" value={key} onChange={e => setKey(e.target.value)} placeholder={f.clave ? 'Guardada (' + f.clave_origen + ')' : 'Pega la clave'}/></label>
    </div>
    <label className="greta-check"><input type="checkbox" checked={f.habilitado} onChange={e => setF({...f, habilitado: e.target.checked})}/> Generación de imágenes activa</label>
    <div className="greta-img-grid">{/* R43 · datos fijos de los formularios instantáneos */}
      <label>Política de privacidad (enlace https para formularios)<input className="orok-input" value={fo.privacidad_url} onChange={e => setFo({...fo, privacidad_url: e.target.value})} placeholder="https://…"/></label>
      <label>WhatsApp de ventas (código de país)<input className="orok-input" value={fo.whatsapp} onChange={e => setFo({...fo, whatsapp: e.target.value})} placeholder="51987654321"/></label>
    </div>
    <div className="greta-row-tight"><button className="orok-btn orok-btn-primary" onClick={save}>Guardar</button><button className="orok-btn orok-btn-secondary" onClick={lola}>Avisar a L.O.L.A las campañas activas</button></div>
    <p className="greta-muted small">Video con IA ({data.video.proveedor} · {data.video.modelo}): {data.video.habilitado ? 'activo' : 'pendiente; por ahora los reels se arman con tus clips y fotos en Estudio'}.</p>
    <Msg error={err} info={msg}/>
  </div>;
}

// ---------- Asistente flotante G.R.E.T.A (igual que L.O.L.A en el CRM, M.O.R.A en el Evaluador y D.I.A.V.A en Contabilidad) ----------
const PANTALLA = {mkHome: 'Hoy', mkTrends: 'Tendencias', mkPlan: 'Plan semanal', campaigns: 'Estudio', mkForms: 'Formularios', mkPublish: 'Publicar', mkKpis: 'Pauta y KPIs', marketing: 'Ventas atribuidas', mkBrand: 'Marca'};
const SUGERIR = ['¿Qué publico esta semana para llevar más visitas al showroom?', '¿Qué anuncio conviene revisar y por qué?', 'Dame 3 ganchos para un reel del showroom'];
const SRG = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
const plano = t => String(t || '').replace(/\*\*|__|`|#+\s/g, '').replace(/^\s*[-•]\s+/gm, '').replace(/\s+/g, ' ').trim();
const vozPref = () => { try { return localStorage.getItem('greta-asistente-voz') === '1'; } catch { return false; } };
export function GretaAssistant({user, tab, onGo}) {
  const [open, setOpen] = useState(false), [status, setStatus] = useState(null), [msgs, setMsgs] = useState([]), [input, setInput] = useState('');
  const [busy, setBusy] = useState(false), [listening, setListening] = useState(false), [speak, setSpeak] = useState(vozPref);
  const rec = useRef(null), log = useRef(null);
  useEffect(() => { if (open && !status) api.getLolaAssistant().then(setStatus).catch(() => setStatus({enabled: false})); }, [open]);
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [msgs, busy]);
  useEffect(() => { try { localStorage.setItem('greta-asistente-voz', speak ? '1' : '0'); } catch {} if (!speak) window.speechSynthesis?.cancel(); }, [speak]);
  useEffect(() => () => { rec.current?.abort?.(); window.speechSynthesis?.cancel(); }, []);
  const enabled = !!(status?.enabled && status.key_configured);
  const say = t => { if (!speak || !window.speechSynthesis) return; const u = new SpeechSynthesisUtterance(plano(t)), v = window.speechSynthesis.getVoices(); u.voice = v.find(x => /es[-_]PE/i.test(x.lang)) || v.find(x => /^es/i.test(x.lang)) || null; u.lang = u.voice?.lang || 'es-PE'; window.speechSynthesis.cancel(); window.speechSynthesis.speak(u); };
  async function send(text) {
    const q = String(text || '').trim(); if (!q || busy) return;
    const next = [...msgs.filter(m => m.role !== 'error'), {role: 'user', text: q}];
    setMsgs(next); setInput(''); setBusy(true);
    try { const r = await db.gretaAsk({mensajes: next.slice(-10).map(({role, text}) => ({role, text})), contexto: 'Pantalla abierta: ' + (PANTALLA[tab] || tab)}); setMsgs(m => [...m, {role: 'assistant', text: r.respuesta, provider: r.proveedor, drive:r.drive}]); say(r.respuesta); }
    catch (e) { setMsgs(m => [...m, {role: 'error', text: e.message}]); }
    finally { setBusy(false); }
  }
  function dictate() {
    if (listening) { rec.current?.stop?.(); return; }
    if (!SRG) { setMsgs(m => [...m, {role: 'error', text: 'Este navegador no reconoce voz. Usa Chrome, Edge o Safari, o escribe tu consulta.'}]); return; }
    window.speechSynthesis?.cancel();
    const r = new SRG(); rec.current = r; r.lang = 'es-PE'; r.interimResults = true; r.continuous = false; let fin = '';
    r.onresult = e => { let t = ''; for (const x of e.results) t += x[0].transcript; setInput(t); if (e.results[e.results.length - 1].isFinal) fin = t; };
    r.onerror = e => { setListening(false); if (e.error === 'not-allowed') setMsgs(m => [...m, {role: 'error', text: 'Permite el micrófono en el navegador para hablar con G.R.E.T.A.'}]); };
    r.onend = () => { setListening(false); if (fin.trim()) send(fin); };
    setListening(true); r.start();
  }
  return <>
    {!open && <button className="lola-fab greta-fab no-print" onClick={() => setOpen(true)} aria-label="Abrir el asistente G.R.E.T.A"><Sparkles size={18} aria-hidden="true"/><span>G.R.E.T.A</span></button>}
    {open && <section className="lola-panel no-print" role="dialog" aria-label="Asistente G.R.E.T.A">
      <header className="lola-head">
        <div><b>G.R.E.T.A</b><small>{'Asistente de Marketing' + (status?.provider_label ? ' · ' + status.provider_label : '')}</small></div>
        <div className="lola-row">
          <button className="lola-icon" onClick={() => setSpeak(s => !s)} aria-pressed={speak} title={speak ? 'Respuestas en voz alta: sí' : 'Respuestas en voz alta: no'}>{speak ? <Volume2 size={17}/> : <VolumeX size={17}/>}</button>
          <button className="lola-icon" onClick={() => { setMsgs([]); window.speechSynthesis?.cancel(); }} title="Nueva conversación"><RotateCcw size={16}/></button>
          <button className="lola-icon" onClick={() => { setOpen(false); onGo('mkBrand'); }} title="Configurar G.R.E.T.A (Marca)"><Settings size={16}/></button>
          <button className="lola-icon" onClick={() => { setOpen(false); window.speechSynthesis?.cancel(); rec.current?.abort?.(); }} aria-label="Cerrar G.R.E.T.A"><X size={17}/></button>
        </div>
      </header>
      <div className="lola-log" ref={log} aria-live="polite">
        {!msgs.length && <div className="lola-empty">
          {status && !enabled ? <p>G.R.E.T.A usa el mismo proveedor de IA que L.O.L.A. Actívalo desde el asistente L.O.L.A del CRM (engranaje) y vuelve aquí.</p>
            : <><p>Hola, {String(user.name || '').split(' ')[0]}. Soy G.R.E.T.A. Pregúntame por escrito o con el micrófono sobre tendencias, contenido, publicaciones o pauta. Veo lo que preguntan los clientes a L.O.L.A, sin datos personales.</p>
              <div className="lola-chips">{SUGERIR.map(q => <button key={q} onClick={() => send(q)} disabled={!enabled}>{q}</button>)}</div></>}
        </div>}
        {msgs.map((m, i) => m.role === 'user' ? <div key={i} className="lola-msg lola-user">{m.text}</div> : m.role === 'error' ? <div key={i} className="lola-msg lola-error" role="alert">{m.text}</div>
          : <div key={i} className="lola-msg lola-bot">{String(m.text).split('\n').map((l, j) => <p key={j}>{l.replace(/\*\*(.+?)\*\*/g, '$1')}</p>)}{m.provider && <small>{m.provider}</small>}{m.drive && <small role="status">{m.drive.state==='complete'?'Archivado en Drive':m.drive.state==='queued'?'Archivo pendiente de confirmación en Drive':m.drive.state==='error'?'No archivado: '+m.drive.reason:'Archivo de Drive sin configurar'}</small>}</div>)}
        {busy && <div className="lola-msg lola-bot lola-typing">G.R.E.T.A está pensando…</div>}
      </div>
      <form className="lola-input" onSubmit={e => { e.preventDefault(); send(input); }}>
        <button type="button" className={'lola-mic' + (listening ? ' on' : '')} onClick={dictate} disabled={!enabled || busy} aria-pressed={listening} title={listening ? 'Detener' : 'Hablar'}>{listening ? <Square size={16}/> : <Mic size={18}/>}</button>
        <textarea rows={1} value={input} placeholder={listening ? 'Escuchando…' : 'Escribe tu consulta'} disabled={!enabled} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}/>
        <button type="submit" className="lola-send" disabled={!enabled || busy || !input.trim()} aria-label="Enviar"><Send size={17}/></button>
      </form>
    </section>}
  </>;
}

// ---------- R43 · Estudio: armado automático de piezas ----------
export function GretaArmar({campaign, onDone}) {
  const [gen, setGen] = useState(false), [busy, setBusy] = useState(false), [msg, setMsg] = useState(''), [err, setErr] = useState('');
  const sin = (campaign?.proposal?.creatives || []).reduce((n, p) => n + p.scenes.filter(s => !s.asset_id).length, 0);
  if (!campaign?.proposal?.creatives?.length || campaign.status === 'approved') return null;
  const go = async () => { setBusy(true); setErr(''); setMsg(''); try { const r = await db.gretaArmar({campaign_id: campaign.id, generar_imagenes: gen}); setMsg(r.aviso + (r.asignadas ? ' · ' + r.asignadas + ' escena(s) con recurso' : '') + (r.generadas ? ' · ' + r.generadas + ' imagen(es) nuevas «referencial»' : '')); onDone?.(); } catch (e) { setErr(e.message); } finally { setBusy(false); } };
  return <div className="glass-card greta-img">
    <h3>Armar las piezas con G.R.E.T.A</h3>
    <p className="greta-muted small">{sin ? sin + ' escena(s) o lámina(s) sin foto. ' : 'Todas las escenas tienen recurso. '}G.R.E.T.A elige la foto o el clip más adecuado de tus Recursos para cada escena; tú revisas y apruebas.</p>
    <label className="greta-check"><input type="checkbox" checked={gen} onChange={e => setGen(e.target.checked)}/> Si falta una foto adecuada, generar imágenes referenciales (hasta 4)</label>
    <div className="greta-row-tight"><button className="orok-btn orok-btn-primary" disabled={busy || !sin} onClick={go}>{busy ? 'Armando…' : 'Armar piezas'}</button></div>
    <Msg error={err} info={msg}/>
  </div>;
}

// ---------- R43 · Crear › Formularios instantáneos (editables) ----------
const ESTADO_F = {borrador: 'Borrador', aprobado: 'Aprobado', en_cola: 'Creándose en Meta', creado: 'En Meta', error: 'Error de Meta', reemplazado: 'Reemplazado', archivado: 'Archivado'};
const CONTACTO_F = {nombre: 'Nombre completo', telefono: 'Número de teléfono', email: 'Correo electrónico'};
const nuevoF = cf => ({nombre: '', red: 'meta', tipo: 'mas_volumen', proyecto: '', campaign_id: null, intro: {titulo: '', texto: ''}, contacto: ['nombre', 'telefono'], preguntas: [],
  privacidad: {url: cf?.privacidad_url || '', texto: 'Política de privacidad'}, cierre: {titulo: '¡Gracias por escribirnos!', texto: 'Un asesor se comunicará contigo muy pronto.', boton: cf?.whatsapp ? 'whatsapp' : 'web', boton_texto: cf?.whatsapp ? 'Escríbenos por WhatsApp' : 'Conoce el proyecto', destino: cf?.whatsapp || ''}});
const destinoEditable = c => c.boton === 'web' ? c.destino : String(c.destino || '').replace(/[^\d]/g, '');
function FormPreview({f, paso, setPaso}) {
  const pasos = ['Bienvenida', 'Preguntas', 'Contacto', 'Final'];
  return <div className="greta-phone" aria-label="Vista previa del formulario">
    <div className="greta-phone-top"><b>{f.proyecto || 'ÖRÖK'}</b><small>Formulario · {f.red === 'tiktok' ? 'TikTok' : 'Facebook e Instagram'}</small></div>
    <div className="greta-phone-body">
      {paso === 0 && <><h4>{f.intro.titulo || 'Título de bienvenida'}</h4><p>{f.intro.texto || 'Texto de bienvenida (opcional).'}</p></>}
      {paso === 1 && (f.preguntas.length ? f.preguntas.map((q, i) => <div key={i} className="greta-phone-q"><b>{q.etiqueta || 'Pregunta ' + (i + 1)}</b>{q.tipo === 'texto' ? <div className="greta-phone-in">Respuesta</div> : q.opciones.map((o, j) => <div key={j} className="greta-phone-opt">{o || 'Opción'}</div>)}</div>) : <p className="greta-muted">Sin preguntas propias.</p>)}
      {paso === 2 && <>{f.contacto.map(k => <div key={k} className="greta-phone-q"><b>{CONTACTO_F[k]}</b><div className="greta-phone-in">Se completa con su perfil</div></div>)}<p className="small">Al enviar aceptas la <u>{f.privacidad.texto || 'Política de privacidad'}</u>{f.tipo === 'mayor_intencion' ? '. Revisarás tus datos antes de enviar.' : '.'}</p></>}
      {paso === 3 && <><h4>{f.cierre.titulo || 'Título final'}</h4><p>{f.cierre.texto}</p><div className="greta-phone-btn">{f.cierre.boton_texto || 'Botón'}</div></>}
    </div>
    <div className="greta-phone-steps" role="tablist">{pasos.map((p, i) => <button key={p} type="button" role="tab" aria-selected={paso === i} onClick={() => setPaso(i)}>{p}</button>)}</div>
  </div>;
}
export function GretaFormularios() {
  const [{data, error}, reload] = useLoad(() => db.gretaFormularios({dias: 30}));
  const [f, setF] = useState(null), [sel, setSel] = useState(''), [dirty, setDirty] = useState(false), [busy, setBusy] = useState(''), [msg, setMsg] = useState(''), [err, setErr] = useState(''), [paso, setPaso] = useState(0);
  const [camps, setCamps] = useState([]), [campRed, setCampRed] = useState({campaign_id: '', red: 'meta'});
  useEffect(() => { db.getCreativeCampaigns().then(r => setCamps((r?.campaigns || []).filter(c => c.status !== 'archived'))).catch(() => {}); }, []);
  const cf = data?.config || {}, lista = data?.formularios || [], kpi = Object.fromEntries((data?.kpis || []).map(k => [k.id, k]));
  const abrir = x => { setSel(x?.id || ''); setF(x ? {...x, cierre: {...x.cierre, destino: destinoEditable(x.cierre)}} : nuevoF(cf)); setDirty(false); setMsg(''); setErr(''); setPaso(0); };
  const fijo = f && ['en_cola', 'creado', 'reemplazado', 'archivado'].includes(f.estado);
  const set = (path, v) => { setDirty(true); setF(x => { const n = structuredClone(x); const k = path.split('.'); let o = n; while (k.length > 1) o = o[k.shift()]; o[k[0]] = v; return n; }); };
  const run = async (key, fn, ok) => { setBusy(key); setErr(''); setMsg(''); try { const r = await fn(); if (ok) setMsg(typeof ok === 'function' ? ok(r) : ok); return r; } catch (e) { setErr(e.message); } finally { setBusy(''); } };
  const guardar = () => run('g', async () => { const r = await db.gretaFormularioGuardar(f); await reload(); abrir(r); return r; }, 'Guardado. Revísalo en la vista previa y apruébalo.');
  const redactar = () => run('r', async () => { const r = await db.gretaFormularioRedactar({campaign_id: campRed.campaign_id || undefined, red: campRed.red}); await reload(); if (r.ok) abrir(r.formulario); else { setSel(''); setF({...nuevoF(cf), ...r.borrador, cierre: {...nuevoF(cf).cierre, ...r.borrador.cierre}, privacidad: {...nuevoF(cf).privacidad, ...r.borrador.privacidad}}); setDirty(true); setErr(r.aviso); } return r; }, r => r.ok ? 'G.R.E.T.A redactó el formulario. Edita lo que quieras y guarda.' : '');
  const accion = (key, fn, ok) => run(key, async () => { const r = await fn(); await reload(); if (r?.id) abrir(r); else if (f?.id) abrir(await db.gretaFormulario({id: f.id})); return r; }, ok);
  const descargar = () => run('d', async () => { const r = await db.gretaFormulario({id: f.id}); const b = new Blob([r.ficha], {type: 'text/plain;charset=utf-8'}), u = URL.createObjectURL(b), a = document.createElement('a'); a.href = u; a.download = 'formulario-' + (f.nombre || 'greta').replace(/[^\w-]+/g, '-').toLowerCase() + '-v' + f.version + '.txt'; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 2000); }, 'Ficha descargada.');
  const pregunta = (i, k, v) => set('preguntas', f.preguntas.map((q, j) => j === i ? {...q, [k]: v} : q));
  const mover = (i, d) => { const p = [...f.preguntas], j = i + d; if (j < 0 || j >= p.length) return; [p[i], p[j]] = [p[j], p[i]]; set('preguntas', p); };
  return <section className="greta">
    <Head kicker="Crear · Formularios instantáneos" title="Formularios para tus anuncios">
      <button className="orok-btn orok-btn-secondary" onClick={() => abrir(null)}>Nuevo en blanco</button>
    </Head>
    <Msg error={error}/>
    {(!cf.privacidad_url || !cf.whatsapp) && <p className="greta-msg">Configura una vez la política de privacidad y el WhatsApp de ventas en Marca › G.R.E.T.A; así cada formulario nuevo los trae listos.</p>}
    <div className="glass-card greta-filters">
      <span className="greta-kicker">Redactar con G.R.E.T.A</span>
      <label className="greta-inline">Campaña<select className="orok-input" value={campRed.campaign_id} onChange={e => setCampRed({...campRed, campaign_id: e.target.value})}><option value="">Sin campaña</option>{camps.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
      <label className="greta-inline">Red<select className="orok-input" value={campRed.red} onChange={e => setCampRed({...campRed, red: e.target.value})}><option value="meta">Facebook e Instagram</option><option value="tiktok">TikTok</option></select></label>
      <button className="orok-btn orok-btn-primary" disabled={!!busy} onClick={redactar}>{busy === 'r' ? 'Redactando…' : 'Redactar formulario'}</button>
    </div>
    <div className="greta-forms">
      <aside className="greta-forms-list">
        {!lista.length && <div className="glass-card"><p className="greta-muted">Aún no hay formularios.</p></div>}
        {lista.map(x => <button key={x.id} type="button" className={'glass-card greta-form-item' + (x.id === sel ? ' on' : '')} onClick={() => abrir(x)}>
          <b>{x.nombre}</b><small>v{x.version} · {x.red === 'tiktok' ? 'TikTok' : 'Meta'} · <span className={'greta-estado ' + x.estado}>{ESTADO_F[x.estado]}</span></small>
          {kpi[x.id] && <small>{kpi[x.id].leads} leads · {kpi[x.id].citas} citas (30 días)</small>}
        </button>)}
      </aside>
      {f && <div className="glass-card greta-form-edit">
        <div className="greta-form-cols">
          <div className="greta-form-fields">
            {fijo && <p className="greta-msg">{f.estado === 'archivado' ? 'Formulario archivado.' : 'Meta no permite editar un formulario ya creado. Usa «Nueva versión» para cambiar los textos: la versión anterior se archiva al crear la nueva.'}</p>}
            {f.error && <p className="greta-msg err">{f.error}</p>}
            <fieldset disabled={fijo}>
              <legend>Datos</legend>
              <div className="greta-img-grid">
                <label>Nombre interno<input className="orok-input" value={f.nombre} maxLength={80} onChange={e => set('nombre', e.target.value)} placeholder="Infinity 224 · visitas showroom"/></label>
                <label>Red<select className="orok-input" value={f.red} onChange={e => set('red', e.target.value)}><option value="meta">Facebook e Instagram (Meta)</option><option value="tiktok">TikTok (ficha para copiar)</option></select></label>
                <label>Tipo<select className="orok-input" value={f.tipo} onChange={e => set('tipo', e.target.value)}><option value="mas_volumen">Más volumen</option><option value="mayor_intencion">Mayor intención (revisa antes de enviar)</option></select></label>
              </div>
            </fieldset>
            <fieldset disabled={fijo} onFocus={() => setPaso(0)}>
              <legend>Bienvenida</legend>
              <label>Título <small>{f.intro.titulo.length}/60</small><input className="orok-input" maxLength={60} value={f.intro.titulo} onChange={e => set('intro.titulo', e.target.value)}/></label>
              <label>Texto <small>{f.intro.texto.length}/400</small><textarea className="orok-input" rows={3} maxLength={400} value={f.intro.texto} onChange={e => set('intro.texto', e.target.value)}/></label>
            </fieldset>
            <fieldset disabled={fijo} onFocus={() => setPaso(1)}>
              <legend>Preguntas propias ({f.preguntas.length}/5)</legend>
              {f.preguntas.map((q, i) => <div key={i} className="greta-q">
                <input className="orok-input" maxLength={80} value={q.etiqueta} onChange={e => pregunta(i, 'etiqueta', e.target.value)} placeholder={'Pregunta ' + (i + 1)} aria-label={'Pregunta ' + (i + 1)}/>
                <div className="greta-q-ctrl">
                  <select className="orok-input" value={q.tipo} onChange={e => pregunta(i, 'tipo', e.target.value)} aria-label="Tipo de respuesta"><option value="opciones">Opciones</option><option value="texto">Respuesta libre</option></select>
                  <select className="orok-input" value={q.crm} onChange={e => pregunta(i, 'crm', e.target.value)} aria-label="Dónde va en el CRM"><option value="comentario">CRM: comentario</option><option value="interes">CRM: interés</option></select>
                  <button type="button" className="orok-btn orok-btn-secondary" onClick={() => mover(i, -1)} aria-label="Subir">↑</button><button type="button" className="orok-btn orok-btn-secondary" onClick={() => mover(i, 1)} aria-label="Bajar">↓</button>
                  <button type="button" className="orok-btn orok-btn-secondary" onClick={() => set('preguntas', f.preguntas.filter((_, j) => j !== i))}>Quitar</button></div>
                {q.tipo === 'opciones' && <div className="greta-opts">{q.opciones.map((o, j) => <span key={j}><input className="orok-input" maxLength={40} value={o} onChange={e => pregunta(i, 'opciones', q.opciones.map((x, k) => k === j ? e.target.value : x))} aria-label={'Opción ' + (j + 1)}/><button type="button" aria-label="Quitar opción" onClick={() => pregunta(i, 'opciones', q.opciones.filter((_, k) => k !== j))}>×</button></span>)}
                  {q.opciones.length < 6 && <button type="button" className="orok-btn orok-btn-secondary" onClick={() => pregunta(i, 'opciones', [...q.opciones, ''])}>+ Opción</button>}</div>}
              </div>)}
              {f.preguntas.length < 5 && <button type="button" className="orok-btn orok-btn-secondary" onClick={() => set('preguntas', [...f.preguntas, {id: 'pregunta_' + (f.preguntas.length + 1), tipo: 'opciones', etiqueta: '', crm: 'comentario', opciones: ['', '']}])}>+ Pregunta</button>}
            </fieldset>
            <fieldset disabled={fijo} onFocus={() => setPaso(2)}>
              <legend>Contacto y privacidad</legend>
              <div className="greta-row-tight">{Object.entries(CONTACTO_F).map(([k, l]) => <label key={k} className="greta-check"><input type="checkbox" checked={f.contacto.includes(k)} disabled={k === 'nombre'} onChange={e => set('contacto', e.target.checked ? [...f.contacto, k] : f.contacto.filter(x => x !== k))}/> {l}</label>)}</div>
              <div className="greta-img-grid">
                <label>Enlace de la política de privacidad<input className="orok-input" value={f.privacidad.url} onChange={e => set('privacidad.url', e.target.value)} placeholder="https://…"/></label>
                <label>Texto del enlace<input className="orok-input" maxLength={70} value={f.privacidad.texto} onChange={e => set('privacidad.texto', e.target.value)}/></label>
              </div>
            </fieldset>
            <fieldset disabled={fijo} onFocus={() => setPaso(3)}>
              <legend>Pantalla final</legend>
              <label>Título <small>{f.cierre.titulo.length}/60</small><input className="orok-input" maxLength={60} value={f.cierre.titulo} onChange={e => set('cierre.titulo', e.target.value)}/></label>
              <label>Texto <small>{f.cierre.texto.length}/300</small><textarea className="orok-input" rows={2} maxLength={300} value={f.cierre.texto} onChange={e => set('cierre.texto', e.target.value)}/></label>
              <div className="greta-img-grid">
                <label>Botón<select className="orok-input" value={f.cierre.boton} onChange={e => set('cierre.boton', e.target.value)}><option value="whatsapp">Abrir WhatsApp</option><option value="llamar">Llamar</option><option value="web">Abrir una página</option></select></label>
                <label>Texto del botón<input className="orok-input" maxLength={30} value={f.cierre.boton_texto} onChange={e => set('cierre.boton_texto', e.target.value)}/></label>
                <label>{f.cierre.boton === 'web' ? 'Enlace (https)' : 'Número con código de país'}<input className="orok-input" value={f.cierre.destino} onChange={e => set('cierre.destino', e.target.value)} placeholder={f.cierre.boton === 'web' ? 'https://…' : '51987654321'}/></label>
              </div>
            </fieldset>
          </div>
          <FormPreview f={f} paso={paso} setPaso={setPaso}/>
        </div>
        <div className="greta-row-tight greta-form-actions">
          {!fijo && <button className="orok-btn orok-btn-primary" disabled={!!busy || !dirty && !!f.id} onClick={guardar}>{busy === 'g' ? 'Guardando…' : 'Guardar'}</button>}
          {f.id && ['borrador', 'error'].includes(f.estado) && <button className="orok-btn orok-btn-primary" disabled={!!busy || dirty} title={dirty ? 'Guarda los cambios primero' : ''} onClick={() => accion('a', () => db.gretaFormularioAprobar({id: f.id, revision: f.revision}), 'Aprobado por Gerencia.')}>Aprobar</button>}
          {f.id && f.estado === 'aprobado' && f.red === 'meta' && <button className="orok-btn orok-btn-primary" disabled={!!busy} onClick={() => accion('c', () => db.gretaFormularioCrear({id: f.id, revision: f.revision, request_id: crypto.randomUUID()}), 'En cola: n8n lo crea en tu página de Facebook y servirá para Facebook e Instagram.')}>Crear en Meta</button>}
          {f.id && f.estado === 'creado' && <button className="orok-btn orok-btn-primary" disabled={!!busy} onClick={() => accion('v', () => db.gretaFormularioVersion({id: f.id}), 'Nueva versión en borrador: edítala, apruébala y créala.')}>Nueva versión</button>}
          {f.id && <button className="orok-btn orok-btn-secondary" disabled={!!busy} onClick={descargar}>Descargar ficha</button>}
          {f.id && !['archivado', 'en_cola'].includes(f.estado) && <button className="orok-btn orok-btn-secondary" disabled={!!busy} onClick={() => accion('x', () => db.gretaFormularioArchivar({id: f.id}), 'Archivado.')}>Archivar</button>}
          {f.externo?.form_id && <small className="greta-muted">ID en Meta: {f.externo.form_id}</small>}
        </div>
        <Msg error={err} info={msg}/>
        {f.historial?.length > 0 && <details className="small"><summary>Historial</summary><ul>{[...f.historial].reverse().map((h, i) => <li key={i}>{new Date(h.at).toLocaleString('es-PE', {timeZone: 'America/Lima'})} · {h.por} · {h.accion} (rev. {h.revision})</li>)}</ul></details>}
      </div>}
    </div>
  </section>;
}

// R73 · Plan semanal de contenido: marca, análisis de perfiles y nicho, 5 piezas diarias por red y aprobación.
const REDES_PLAN = [['instagram', 'Instagram'], ['facebook', 'Facebook'], ['tiktok', 'TikTok']];
const DIAS_PLAN = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const ESTADO_PLAN = {borrador: ['Borrador', '#a16207'], aprobada: ['Aprobada', '#15803d'], rechazada: ['Rechazada', '#b42318'], programada: ['Programada', '#1d4ed8'], publicada: ['Publicada', '#57534e']};
const lunesPlan = d => {const x = new Date(d + 'T12:00:00Z'), w = (x.getUTCDay() + 6) % 7; x.setUTCDate(x.getUTCDate() - w); return x.toISOString().slice(0, 10);};
const sumarPlan = (d, n) => {const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10);};
function Copiar({value}) {const [ok, setOk] = useState(false); return <button type="button" className="orok-btn" style={{padding: '4px 10px', fontSize: 12}} onClick={() => {try {navigator.clipboard.writeText(value); setOk(true); setTimeout(() => setOk(false), 1500);} catch {}}}>{ok ? 'Copiado ✓' : 'Copiar'}</button>;}
function MarcaPlan({marca, onSaved}) {
  const [m, setM] = useState(marca), [busy, setBusy] = useState(false), [msg, setMsg] = useState('');
  useEffect(() => setM(marca), [marca]);
  if (!m) return null;
  const save = async () => {setBusy(true); setMsg(''); try {const r = await db.gretaPlanMarcaGuardar({...m, palabras_si: String(m.palabras_si).split(','), palabras_no: String(m.palabras_no).split(','), hashtags_base: String(m.hashtags_base).split(/[\s,]+/)}); setM(r); onSaved?.(r); setMsg('Marca guardada.');} catch (e) {setMsg(e.message);} finally {setBusy(false);}};
  const f = (k, v) => setM(x => ({...x, [k]: v}));
  return <details className="orok-card" style={{padding: 16}}><summary style={{cursor: 'pointer', fontWeight: 700}}>1 · Marca para contenido (colores, tipografía, forma de hablar, perfiles)</summary>
    <div style={{display: 'grid', gap: 10, marginTop: 12}}>
      <div style={{display: 'flex', gap: 8, flexWrap: 'wrap'}}>{(m.colores || []).map((c, i) => <label key={i} style={{display: 'grid', gap: 4, fontSize: 12}}>{c.nombre || 'Color ' + (i + 1)}<input type="color" value={c.hex} onChange={e => f('colores', m.colores.map((x, j) => j === i ? {...x, hex: e.target.value} : x))}/></label>)}</div>
      <label>Tipografía de títulos<input className="orok-input" value={m.tipografias?.titulos || ''} onChange={e => f('tipografias', {...m.tipografias, titulos: e.target.value})}/></label>
      <label>Tipografía de textos<input className="orok-input" value={m.tipografias?.textos || ''} onChange={e => f('tipografias', {...m.tipografias, textos: e.target.value})}/></label>
      <label>Forma de hablar (tono)<textarea className="orok-input" rows={3} value={m.tono || ''} onChange={e => f('tono', e.target.value)}/></label>
      <label>Palabras que sí usamos (separadas por coma)<input className="orok-input" value={[].concat(m.palabras_si || []).join(', ')} onChange={e => f('palabras_si', e.target.value)}/></label>
      <label>Palabras que no usamos<input className="orok-input" value={[].concat(m.palabras_no || []).join(', ')} onChange={e => f('palabras_no', e.target.value)}/></label>
      {REDES_PLAN.map(([k, l]) => <label key={k}>Perfil de {l} (nombre o enlace)<input className="orok-input" value={m.perfiles?.[k] || ''} onChange={e => f('perfiles', {...m.perfiles, [k]: e.target.value})}/></label>)}
      <label>Hashtags base<input className="orok-input" value={[].concat(m.hashtags_base || []).join(' ')} onChange={e => f('hashtags_base', e.target.value)}/></label>
      <label>Nicho<input className="orok-input" value={m.nicho || ''} onChange={e => f('nicho', e.target.value)}/></label>
      <div><button className="orok-btn orok-btn-primary" disabled={busy} onClick={save}>{busy ? 'Guardando…' : 'Guardar marca'}</button> <span role="status">{msg}</span></div>
    </div></details>;
}
function AnalisisPlan({analisis, onDone}) {
  const [busy, setBusy] = useState(false), [err, setErr] = useState(''), [notas, setNotas] = useState('');
  const run = async () => {setBusy(true); setErr(''); try {onDone(await db.gretaPlanAnalizar({notas}));} catch (e) {setErr(e.message);} finally {setBusy(false);}};
  const a = analisis;
  return <section className="orok-card" style={{padding: 16, display: 'grid', gap: 10}}>
    <strong>2 · Análisis de perfiles (Instagram, Facebook, TikTok) y del nicho de edificios boutique</strong>
    <textarea className="orok-input" rows={2} placeholder="Notas para G.R.E.T.A (opcional): campañas en curso, lo que quieres destacar…" value={notas} onChange={e => setNotas(e.target.value)}/>
    <div><button className="orok-btn orok-btn-primary" disabled={busy} onClick={run}>{busy ? 'Analizando en la web… (1-2 min)' : a ? 'Volver a analizar' : 'Analizar ahora'}</button> {err && <span style={{color: '#b42318'}}>{err}</span>}</div>
    {a && <div style={{fontSize: 13, display: 'grid', gap: 8}}>
      <small style={{color: '#78716c'}}>Último análisis: {new Date(a.creado).toLocaleString('es-PE')}{a.metricas_propias ? ' · con tus métricas' : ' · sin métricas propias (conecta las cuentas en Publicar)'}</small>
      <p style={{margin: 0}}>{a.resumen}</p>
      <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10}}>{REDES_PLAN.map(([k, l]) => <div key={k} style={{border: '1px solid #e7dfd8', borderRadius: 12, padding: 10}}><b>{l}</b><div style={{color: '#15803d'}}>Funciona: {(a.perfiles?.[k]?.que_funciona || []).join(' · ') || '—'}</div><div style={{color: '#b42318'}}>No funciona: {(a.perfiles?.[k]?.que_no || []).join(' · ') || '—'}</div><div>Horarios: {(a.horarios?.[k] || []).join(', ') || '—'}</div><div style={{color: '#57534e'}}>{(a.hashtags?.[k] || []).join(' ')}</div></div>)}</div>
      {!!a.pilares?.length && <div><b>Pilares:</b> {a.pilares.map(p => p.nombre + ' ' + p.porcentaje + '%').join(' · ')}</div>}
      {!!a.ganchos_modelo?.length && <div><b>Ganchos modelo:</b> {a.ganchos_modelo.join(' · ')}</div>}
      {!!a.limitaciones?.length && <div style={{color: '#a16207'}}>⚠ {a.limitaciones.join(' · ')}</div>}
      {!!a.fuentes?.length && <details><summary>Fuentes ({a.fuentes.length})</summary>{a.fuentes.map(f => <div key={f.url}><a href={f.url} target="_blank" rel="noopener noreferrer">{f.titulo || f.url}</a></div>)}</details>}
    </div>}
  </section>;
}
function PiezaPlan({p, onChange, onClose}) {
  const [busy, setBusy] = useState(false), [err, setErr] = useState(''), [copy, setCopy] = useState(p.copy), [tags, setTags] = useState((p.hashtags || []).join(' ')), [hora, setHora] = useState(p.hora);
  const [red, setRed] = useState('instagram'), [vers, setVers] = useState(() => Object.fromEntries(Object.entries(p.versiones || {}).map(([k, v]) => [k, {copy: v.copy, hora: v.hora, cta: v.cta, hashtags: (v.hashtags || []).join(' ')}])));
  const multi = !!p.versiones, setV = (k, val) => setVers(o => ({...o, [red]: {...o[red], [k]: val}}));
  const cambios = () => multi ? {versiones: Object.fromEntries(Object.entries(vers).map(([k, v]) => [k, {...v, hashtags: v.hashtags.split(/\s+/)}]))} : {copy, hashtags: tags.split(/\s+/), hora};
  const act = async body => {setBusy(true); setErr(''); try {onChange(await db.gretaPlanPieza({id: p.id, ...body}));} catch (e) {setErr(e.message);} finally {setBusy(false);}};
  const [et, col] = ESTADO_PLAN[p.estado] || ESTADO_PLAN.borrador;
  const versTxt = multi ? REDES_PLAN.map(([k, l]) => { const v = p.versiones[k] || {}, e = vers[k] || {}; return `\n— ${l.toUpperCase()} · ${v.formato} · ${v.medidas}${v.duracion_seg ? ' · ' + v.duracion_seg + ' s' : ''} · ${e.hora}\nCOPY: ${e.copy}\nCTA: ${e.cta}\n${e.hashtags}${v.audio ? '\nAUDIO: ' + v.audio : ''}${v.notas ? '\nADAPTACIÓN: ' + v.notas : ''}`; }).join('\n') : '';
  const todo = ['GANCHO (0-2 s): ' + p.gancho?.texto_pantalla + ' / ' + p.gancho?.primera_frase, 'VISUAL: ' + p.gancho?.visual, ...(p.guion || []).map(e => `[${e.seg}] ${e.visual} | Texto: ${e.texto_pantalla} | Motion: ${e.motion} | Voz: ${e.voz}`), 'MOTION: ' + p.motion_graphics, 'VOZ EN OFF (' + (p.voz_en_off?.estilo || '') + '): ' + p.voz_en_off?.texto, 'MÚSICA: ' + [p.musica?.estilo, p.musica?.bpm && p.musica.bpm + ' BPM', p.musica?.sugerencia, p.musica?.nota].filter(Boolean).join(' · '), ...(multi ? [versTxt] : ['COPY: ' + copy, 'CTA: ' + p.cta, tags])].join('\n');
  return <div role="dialog" aria-label={'Pieza ' + p.titulo} style={{position: 'fixed', inset: 0, background: 'rgba(30,25,20,.35)', zIndex: 2000, display: 'grid', placeItems: 'center', padding: 16}} onClick={e => {if (e.target === e.currentTarget) onClose();}}>
    <div className="orok-card" style={{width: 'min(760px,100%)', maxHeight: '90dvh', overflow: 'auto', padding: 20, display: 'grid', gap: 10, background: '#fff'}}>
      <div style={{display: 'flex', justifyContent: 'space-between', gap: 8}}><div><small style={{color: '#78716c'}}>{multi ? 'Instagram · Facebook · TikTok' : p.red} · {p.fecha} · {p.formato} · {p.pilar} · {p.produccion === 'equipo' ? 'Graba el equipo' : 'Lo arma el ERP'}</small><h3 style={{margin: '4px 0'}}>{p.titulo}</h3><b style={{color: col}}>{et}</b></div><button className="orok-btn" onClick={onClose} aria-label="Cerrar"><X size={16}/></button></div>
      <div style={{background: '#fdf4ee', borderRadius: 12, padding: 12}}><b>Gancho 0-2 s</b><div style={{fontSize: 18, fontWeight: 800, color: '#85442A'}}>{p.gancho?.texto_pantalla}</div><div>🎙 {p.gancho?.primera_frase}</div><div style={{color: '#57534e'}}>🎬 {p.gancho?.visual}</div></div>
      {!!p.guion?.length && <div style={{overflowX: 'auto'}}><table style={{width: '100%', fontSize: 12, borderCollapse: 'collapse'}}><thead><tr>{['Seg', 'Visual', 'Texto en pantalla', 'Motion', 'Voz'].map(h => <th key={h} style={{textAlign: 'left', borderBottom: '1px solid #e7dfd8', padding: 4}}>{h}</th>)}</tr></thead><tbody>{p.guion.map((e, i) => <tr key={i}>{[e.seg, e.visual, e.texto_pantalla, e.motion, e.voz].map((v, j) => <td key={j} style={{verticalAlign: 'top', padding: 4, borderBottom: '1px solid #f1ebe6'}}>{v}</td>)}</tr>)}</tbody></table></div>}
      {p.medidas && <div><b>Formato y medidas:</b> {p.medidas}</div>}
      <div><b>Motion graphics:</b> {p.motion_graphics}</div>
      <div><b>Voz en off</b> ({p.voz_en_off?.estilo}): {p.voz_en_off?.texto}</div>
      <div><b>Música:</b> {[p.musica?.estilo, p.musica?.bpm && p.musica.bpm + ' BPM', p.musica?.sugerencia, p.musica?.nota].filter(Boolean).join(' · ')}</div>
      {p.recursos && <div><b>Recursos:</b> {p.recursos}</div>}{p.marca && <div><b>Marca:</b> {p.marca}</div>}
      {multi ? <div style={{border: '1px solid #e7dfd8', borderRadius: 12, padding: 10, display: 'grid', gap: 8}}>
        <div role="tablist" style={{display: 'flex', gap: 6}}>{REDES_PLAN.map(([k, l]) => <button key={k} role="tab" aria-selected={red === k} className={'orok-btn' + (red === k ? ' orok-btn-primary' : '')} onClick={() => setRed(k)}>{l}</button>)}</div>
        {(() => { const v = p.versiones[red] || {}, e = vers[red] || {}; return <>
          <small style={{color: '#57534e'}}><b>{v.formato}</b> · {v.medidas}{v.duracion_seg ? ' · ' + v.duracion_seg + ' s' : ''}{v.audio ? ' · Audio: ' + v.audio : ''}</small>
          {v.notas && <small style={{color: '#57534e'}}>Adaptación: {v.notas}</small>}
          <label>Hora<input className="orok-input" type="time" value={e.hora || ''} onChange={x => setV('hora', x.target.value)}/></label>
          <label>Copy para {red}<textarea className="orok-input" rows={5} value={e.copy || ''} onChange={x => setV('copy', x.target.value)}/></label>
          <label>CTA<input className="orok-input" value={e.cta || ''} onChange={x => setV('cta', x.target.value)}/></label>
          <label>Hashtags<textarea className="orok-input" rows={2} value={e.hashtags || ''} onChange={x => setV('hashtags', x.target.value)}/></label>
        </>; })()}
      </div> : <>
      <label>Hora<input className="orok-input" type="time" value={hora} onChange={e => setHora(e.target.value)}/></label>
      <label>Copy (texto de la publicación)<textarea className="orok-input" rows={5} value={copy} onChange={e => setCopy(e.target.value)}/></label>
      <div><b>CTA:</b> {p.cta}</div>
      <label>Hashtags<textarea className="orok-input" rows={2} value={tags} onChange={e => setTags(e.target.value)}/></label></>}
      <div style={{display: 'flex', gap: 8, flexWrap: 'wrap'}}>
        <button className="orok-btn" disabled={busy} onClick={() => act({cambios: cambios()})}>Guardar cambios</button>
        <button className="orok-btn orok-btn-primary" disabled={busy} onClick={() => act({estado: 'aprobada', cambios: cambios()})}>Aprobar</button>
        <button className="orok-btn" disabled={busy} onClick={() => act({estado: 'rechazada'})}>Rechazar</button>
        <Copiar value={todo}/>
      </div>{err && <p role="alert" style={{color: '#b42318'}}>{err}</p>}
    </div></div>;
}
export function GretaPlanSemanal() {
  const [lista, setLista] = useState(null), [sem, setSem] = useState(null), [err, setErr] = useState(''), [prog, setProg] = useState(null), [abierta, setAbierta] = useState(null);
  const [inicio, setInicio] = useState(() => lunesPlan(sumarPlan(new Date().toISOString().slice(0, 10), 7)));
  const cargar = async id => {try {const l = await db.gretaPlanSemanas(); setLista(l); const sid = id || sem?.id || l.semanas?.[0]?.id; if (sid) setSem(await db.gretaPlanSemana({id: sid}));} catch (e) {setErr(e.message);}};
  useEffect(() => {cargar();}, []);
  const crear = async () => {setErr(''); try {const s = await db.gretaPlanSemanaCrear({inicio}); await cargar(s.id);} catch (e) {setErr(e.message);}};
  const generar = async (dias = [0, 1, 2, 3, 4, 5, 6], rehacer = false) => {
    if (!sem) return; setErr(''); const tareas = dias.map(d => sumarPlan(sem.inicio, d)); let i = 0, fallos = [];
    for (const fecha of tareas) {setProg({i, n: tareas.length, txt: fecha}); try {await db.gretaPlanGenerar({semana_id: sem.id, fecha, rehacer});} catch (e) {fallos.push(fecha + ': ' + e.message);} i++; setSem(await db.gretaPlanSemana({id: sem.id}));}
    setProg(null); if (fallos.length) setErr('Algunas no se generaron (puedes reintentar): ' + fallos.slice(0, 3).join(' | '));
  };
  const aprobarDia = async fecha => {try {await db.gretaPlanAprobar({semana_id: sem.id, fecha}); setSem(await db.gretaPlanSemana({id: sem.id}));} catch (e) {setErr(e.message);}};
  const piezas = sem?.piezas || [], cuenta = k => piezas.filter(p => p.estado === k).length;
  return <div style={{display: 'grid', gap: 16}}>
    <div className="orok-card" style={{padding: 16}}><h2 style={{margin: 0}}>Plan semanal de contenido</h2><p style={{margin: '6px 0 0', color: '#57534e'}}>G.R.E.T.A analiza tus perfiles y lo que funciona en edificios boutique, y prepara 7 publicaciones diarias (videos e imágenes) que se publican en Instagram, Facebook y TikTok, con una versión adaptada a cada red (medidas, duración, horario, copy y hashtags), con gancho, guion, motion graphics, voz en off, música, copy y hashtags. Nada se publica sin aprobación.</p></div>
    <MarcaPlan marca={lista?.marca} onSaved={() => cargar()}/>
    <AnalisisPlan analisis={lista?.analisis} onDone={a => setLista(l => ({...l, analisis: a}))}/>
    <section className="orok-card" style={{padding: 16, display: 'grid', gap: 10}}>
      <strong>3 · Semana</strong>
      <div style={{display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end'}}>
        <label>Semana que empieza el lunes<input className="orok-input" type="date" value={inicio} onChange={e => setInicio(lunesPlan(e.target.value))}/></label>
        <button className="orok-btn" onClick={crear}>Crear o abrir semana</button>
        {lista?.semanas?.length > 0 && <select className="orok-input" value={sem?.id || ''} onChange={e => cargar(e.target.value)} style={{width: 'auto'}}>{lista.semanas.map(s => <option key={s.id} value={s.id}>{s.inicio} al {s.fin}</option>)}</select>}
        {sem && <button className="orok-btn orok-btn-primary" disabled={!!prog} onClick={() => generar()}>{prog ? `Generando ${prog.i + 1}/${prog.n} · ${prog.txt}` : piezas.length ? 'Completar lo que falta' : 'Generar semana completa (49 piezas)'}</button>}
      </div>
      {sem && <small style={{color: '#57534e'}}>{piezas.length} piezas · {cuenta('aprobada')} aprobadas · {cuenta('borrador')} por revisar · {cuenta('rechazada')} rechazadas. Generar la semana toma unos minutos (7 pasos, uno por día).</small>}
      {err && <p role="alert" style={{color: '#b42318', margin: 0}}>{err}</p>}
      {sem && <div style={{display: 'grid', gap: 8}}>
        {DIAS_PLAN.map((d, i) => {const fecha = sumarPlan(sem.inicio, i), ps = piezas.filter(p => p.fecha === fecha && p.estado !== 'rechazada').sort((a, b) => (a.hora || '').localeCompare(b.hora || '')); return <div key={fecha} style={{display: 'grid', gridTemplateColumns: '84px 1fr', gap: 8, background: '#fbf8f5', borderRadius: 12, padding: 8}}>
          <div><b>{d}</b><br/><small>{fecha.slice(5)}</small><br/>
            {!ps.length && <button className="orok-btn" style={{fontSize: 11, padding: '4px 8px', marginTop: 4}} disabled={!!prog} onClick={() => generar([i])}>Generar 7</button>}
            {ps.length > 0 && ps.every(p => p.estado === 'borrador') && <button className="orok-btn" style={{fontSize: 11, padding: '4px 8px', marginTop: 4}} disabled={!!prog} onClick={() => generar([i], true)}>Rehacer</button>}
            {ps.some(p => p.estado === 'borrador') && <button className="orok-btn" style={{fontSize: 11, padding: '4px 8px', marginTop: 4}} onClick={() => aprobarDia(fecha)}>Aprobar día</button>}</div>
          <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 6}}>
            {ps.map(p => {const [et, col] = ESTADO_PLAN[p.estado] || ESTADO_PLAN.borrador; return <button key={p.id} onClick={() => setAbierta(p)} style={{textAlign: 'left', border: '1px solid #e7dfd8', borderLeft: '4px solid ' + col, borderRadius: 10, background: '#fff', padding: '6px 8px', cursor: 'pointer', font: 'inherit', fontSize: 12}}><b>{p.hora}</b> · {p.formato} <span style={{color: col}}>· {et}</span><div style={{fontWeight: 600}}>{p.titulo}</div><div style={{color: '#85442A'}}>“{p.gancho?.texto_pantalla}”</div><small style={{color: '#78716c'}}>{p.versiones ? 'IG · FB · TikTok' : p.red}</small></button>;})}
            {!ps.length && <small style={{color: '#78716c', alignSelf: 'center'}}>Sin piezas aún.</small>}
          </div></div>;})}
      </div>}
      <small style={{color: '#78716c'}}>Las piezas aprobadas se programan en <b>Publicar</b> cuando sus cuentas estén conectadas. Las marcadas «Graba el equipo» necesitan tomas reales; las demás se arman con fotos y renders del proyecto.</small>
    </section>
    {abierta && <PiezaPlan key={abierta.id + abierta.revision} p={abierta} onClose={() => setAbierta(null)} onChange={p => {setAbierta(p); setSem(s => ({...s, piezas: s.piezas.map(x => x.id === p.id ? p : x)}));}}/>}
  </div>;
}
