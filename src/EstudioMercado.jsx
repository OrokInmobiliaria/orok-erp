import React, {useEffect, useMemo, useState} from 'react';
import {Search, Upload, Link2, RefreshCw, Bot, EyeOff} from 'lucide-react';
import './greta.css';
// R74 · Estudio de mercado por distrito.
// 1) Gerencia elige un distrito y pide la investigación: Claude en la PC (conector del ERP) la toma, revisa los portales y sube comparables.
// 2) También se puede cargar cualquier base propia: Excel, CSV, Google Sheets, Markdown, JSON o PDF.
// 3) El ERP calcula precio por m² (mediana y rango) por moneda y por dormitorios.
const db = new Proxy({}, {get: (_, k) => (...a) => window.crmDB[k](...a)});
const num = v => v == null ? '—' : Number(v).toLocaleString('es-PE', {maximumFractionDigits: 0});
const mon = m => m === 'USD' ? 'US$' : 'S/';
const ESTADO = {pendiente: 'Esperando a Claude', en_curso: 'Claude investigando', completa: 'Completa', fallida: 'No se pudo completar'};
const MAX = 5.5 * 1024 * 1024;
const b64 = file => new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] || ''); r.onerror = () => ko(Error('No se pudo leer el archivo.')); r.readAsDataURL(file); });

export default function EstudioMercado() {
  const [cfg, setCfg] = useState({distritos: [], portales: []});
  const [distrito, setDistrito] = useState('');
  const [portales, setPortales] = useState(['Urbania', 'Adondevivir', 'Nexo Inmobiliario']);
  const [notas, setNotas] = useState('');
  const [tareas, setTareas] = useState([]);
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState({error: '', info: ''});
  const [link, setLink] = useState('');
  const [file, setFile] = useState(null);
  const [vista, setVista] = useState(null);
  const ok = info => setMsg({error: '', info}), ko = e => setMsg({error: e.message || String(e), info: ''});
  const cargar = async (d = distrito) => { try { const [t, r] = await Promise.all([db.mercadoTareas(), db.mercadoResumen({distrito: d || undefined})]); setTareas(t.tareas || []); setRes(r); } catch (e) { ko(e); } };
  useEffect(() => { db.mercadoConfig().then(setCfg).catch(ko); }, []);
  useEffect(() => { cargar(distrito); }, [distrito]);
  const run = async (k, fn) => { setBusy(k); setMsg({error: '', info: ''}); try { await fn(); } catch (e) { ko(e); } finally { setBusy(''); } };
  const pedir = () => run('pedir', async () => { if (!distrito) throw Error('Elige un distrito.'); await db.mercadoTareaCrear({distrito, portales, notas}); setNotas(''); ok('Investigación pedida. En tu PC, abre Claude y dile: «Toma la investigación de mercado pendiente del ERP». Los comparables aparecerán aquí.'); await cargar(); });
  const entrada = async previa => { if (link.trim()) return {url: link.trim(), distrito, vista_previa: previa}; if (!file) throw Error('Adjunta un archivo o pega un enlace.'); if (file.size > MAX) throw Error('El archivo supera 5 MB. Súbelo a Google Drive y pega el enlace.'); return {nombre: file.name, base64: await b64(file), distrito, vista_previa: previa}; };
  const previsualizar = () => run('vista', async () => setVista(await db.mercadoImportar(await entrada(true))));
  const importar = () => run('importar', async () => { const r = await db.mercadoImportar(await entrada(false)); setVista(null); setFile(null); setLink(''); ok(`Listo: ${r.nuevos} comparables nuevos y ${r.actualizados} actualizados${r.descartadas ? ` · ${r.descartadas} filas sin precio/área/distrito se omitieron` : ''}.`); await cargar(); });
  const descartar = c => run('d' + c.id, async () => { await db.mercadoDescartar({id: c.id}); await cargar(); });
  const bloques = useMemo(() => Object.entries(res?.por_moneda || {}), [res]);
  const portal = p => setPortales(v => v.includes(p) ? v.filter(x => x !== p) : [...v, p]);
  return <section className="greta mercado">
    <header className="greta-head"><div><div className="greta-kicker">Evaluar · M.O.R.A</div><h1>Estudio de mercado</h1></div>
      <div className="greta-actions"><select className="orok-input" value={distrito} onChange={e => setDistrito(e.target.value)} aria-label="Distrito"><option value="">Todos los distritos</option>{cfg.distritos.map(d => <option key={d}>{d}</option>)}</select>
        <button className="orok-btn" onClick={() => cargar()} disabled={!!busy}><RefreshCw size={15}/> Actualizar</button></div></header>
    {msg.error && <p className="greta-msg err" role="alert">{msg.error}</p>}{msg.info && <p className="greta-msg" role="status">{msg.info}</p>}

    <div className="greta-stats">
      <div className="greta-stat glass-card"><span>Comparables</span><b>{num(res?.comparables)}</b><small>{distrito || 'Todos los distritos'}</small></div>
      {bloques.map(([m, b]) => <div key={m} className="greta-stat glass-card"><span>Precio por m² ({mon(m)})</span><b>{mon(m)} {num(b.total.mediana)}</b><small>Rango típico {num(b.total.p25)} – {num(b.total.p75)} · {b.total.n} avisos · área mediana {num(b.total.area_mediana)} m²</small></div>)}
      <div className="greta-stat glass-card"><span>Fuentes</span><b>{Object.keys(res?.fuentes || {}).length}</b><small>{Object.entries(res?.fuentes || {}).slice(0, 4).map(([k, v]) => `${k} (${v})`).join(' · ') || 'Aún sin datos'}</small></div>
    </div>

    {bloques.length > 0 && <div className="glass-card" style={{padding: 16, marginBottom: 16}}><h3 style={{marginTop: 0}}>Por dormitorios</h3><div style={{overflowX: 'auto'}}><table className="greta-table"><thead><tr><th>Moneda</th><th>Dormitorios</th><th>Avisos</th><th>m² mediano</th><th>Precio mediano</th><th>Precio/m² (rango)</th></tr></thead><tbody>
      {bloques.flatMap(([m, b]) => Object.entries(b.por_dormitorios).sort().map(([k, v]) => <tr key={m + k}><td>{mon(m)}</td><td>{k}</td><td>{v.n}</td><td>{num(v.area_mediana)}</td><td>{mon(m)} {num(v.precio_mediano)}</td><td><b>{num(v.mediana)}</b> <small>({num(v.p25)} – {num(v.p75)})</small></td></tr>))}
    </tbody></table></div></div>}

    <div className="greta-cards" style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 16, marginBottom: 16}}>
      <div className="glass-card" style={{padding: 16}}>
        <h3 style={{marginTop: 0}}><Bot size={17}/> Pedir investigación a Claude</h3>
        <p className="greta-muted">Claude, en tu PC y conectado al ERP, revisa los portales del distrito aviso por aviso y sube los comparables con su enlace y fecha.</p>
        <div className="greta-chips" style={{display: 'flex', flexWrap: 'wrap', gap: 6, margin: '8px 0'}}>{cfg.portales.filter(p => p !== 'Otro').map(p => <label key={p} className="greta-check"><input type="checkbox" checked={portales.includes(p)} onChange={() => portal(p)}/> {p}</label>)}</div>
        <textarea className="orok-input" rows={2} placeholder="Notas (opcional): tipologías, rango de precio, solo estreno, etc." value={notas} onChange={e => setNotas(e.target.value)} style={{width: '100%'}}/>
        <button className="orok-btn orok-btn-primary" onClick={pedir} disabled={!!busy || !distrito} style={{marginTop: 8}}><Search size={15}/> {distrito ? 'Investigar ' + distrito : 'Elige un distrito arriba'}</button>
        {tareas.length > 0 && <ul className="greta-list" style={{marginTop: 12}}>{tareas.slice(0, 8).map(t => <li key={t.id}><b>{t.distrito}</b> · {ESTADO[t.estado] || t.estado} · {t.comparables || 0} comparables <small className="greta-muted">({new Date(t.creado).toLocaleDateString('es-PE')}{t.portales?.length ? ' · ' + t.portales.join(', ') : ''})</small>{t.resumen && <p className="greta-muted" style={{margin: '4px 0 0'}}>{t.resumen}</p>}</li>)}</ul>}
      </div>
      <div className="glass-card" style={{padding: 16}}>
        <h3 style={{marginTop: 0}}><Upload size={17}/> Cargar una base propia</h3>
        <p className="greta-muted">Excel, CSV, Google Sheets, Markdown, JSON o PDF. Debe tener precio, área (m²) y distrito; si falta el distrito se usa el elegido arriba.</p>
        <input type="file" accept=".xlsx,.csv,.tsv,.txt,.md,.json,.pdf" onChange={e => { setFile(e.target.files?.[0] || null); setLink(''); setVista(null); }}/>
        <div style={{display: 'flex', gap: 6, alignItems: 'center', margin: '8px 0'}}><Link2 size={15}/><input className="orok-input" style={{flex: 1}} placeholder="…o pega un enlace de Google Sheets / Drive" value={link} onChange={e => { setLink(e.target.value); setFile(null); setVista(null); }}/></div>
        <div style={{display: 'flex', gap: 8}}><button className="orok-btn" onClick={previsualizar} disabled={!!busy || (!file && !link.trim())}>{busy === 'vista' ? 'Leyendo…' : 'Vista previa'}</button>
          <button className="orok-btn orok-btn-primary" onClick={importar} disabled={!!busy || (!file && !link.trim())}>{busy === 'importar' ? 'Guardando…' : 'Guardar en el estudio'}</button></div>
        {vista && <div style={{marginTop: 10}}><p className="greta-muted">{vista.filas} filas leídas · {vista.validas} válidas · {vista.descartadas} sin datos suficientes. Primeras filas:</p>
          <div style={{overflowX: 'auto', maxHeight: 220}}><table className="greta-table"><thead><tr><th>Distrito</th><th>Proyecto</th><th>Precio</th><th>m²</th><th>Dorm.</th><th>Precio/m²</th></tr></thead><tbody>{vista.muestra.map(c => <tr key={c.id}><td>{c.distrito}</td><td>{c.proyecto || '—'}</td><td>{mon(c.moneda)} {num(c.precio)}</td><td>{num(c.area_m2)}</td><td>{c.dormitorios ?? '—'}</td><td>{num(c.precio_m2)}</td></tr>)}</tbody></table></div></div>}
      </div>
    </div>

    <div className="glass-card" style={{padding: 16}}>
      <h3 style={{marginTop: 0}}>Comparables {distrito && '· ' + distrito}</h3>
      {!res?.muestra?.length ? <p className="greta-muted">Aún no hay comparables{distrito ? ' en ' + distrito : ''}. Pide una investigación o carga una base.</p> :
      <div style={{overflowX: 'auto'}}><table className="greta-table"><thead><tr><th>Distrito</th><th>Proyecto</th><th>Precio</th><th>m²</th><th>Dorm.</th><th>Precio/m²</th><th>Etapa</th><th>Fuente</th><th></th></tr></thead><tbody>
        {res.muestra.map(c => <tr key={c.id}><td>{c.distrito}</td><td>{c.proyecto || c.direccion || '—'}{c.inmobiliaria && <small className="greta-muted"> · {c.inmobiliaria}</small>}</td><td>{mon(c.moneda)} {num(c.precio)}</td><td>{num(c.area_m2)}</td><td>{c.dormitorios ?? '—'}</td><td><b>{num(c.precio_m2)}</b></td><td>{c.etapa || '—'}</td>
          <td>{c.url ? <a href={c.url} target="_blank" rel="noopener noreferrer">{c.fuente || 'aviso'}</a> : (c.fuente || c.origen)}</td>
          <td><button className="orok-btn" title="Descartar (no se borra, solo deja de contar)" onClick={() => descartar(c)} disabled={!!busy}><EyeOff size={14}/></button></td></tr>)}
      </tbody></table></div>}
      {res?.comparables > 300 && <p className="greta-muted">Se muestran los 300 más recientes de {res.comparables}.</p>}
    </div>
  </section>;
}
