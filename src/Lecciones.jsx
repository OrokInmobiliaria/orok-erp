import React, {useEffect, useMemo, useState} from 'react';
import {Check, X, Archive, Plus, Sparkles} from 'lucide-react';
// R75 · Mejora 14: Lecciones de la IA. Las correcciones del equipo llegan como lecciones propuestas; Gerencia las aprueba
// (o edita y aprueba) y desde ese momento L.O.L.A, G.R.E.T.A, M.O.R.A y D.I.A.V.A las siguen, con cualquier proveedor de IA.
const db = new Proxy({}, {get: (_, k) => (...a) => window.crmDB[k](...a)});
const ESTADO = {propuesta: ['Por revisar', '#a16207'], aprobada: ['Aprobada', '#15803d'], rechazada: ['Rechazada', '#b42318'], archivada: ['Archivada', '#78716c']};

export default function Lecciones() {
  const [data, setData] = useState(null), [err, setErr] = useState(''), [info, setInfo] = useState(''), [filtro, setFiltro] = useState('propuesta'), [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState({}), [nueva, setNueva] = useState({ia: 'lola', leccion: ''});
  const cargar = () => db.leccionesLista().then(setData).catch(e => setErr(e.message));
  useEffect(() => { cargar(); }, []);
  const lista = useMemo(() => (data?.lecciones || []).filter(l => filtro === 'todas' || l.estado === filtro), [data, filtro]);
  const run = async fn => { setBusy(true); setErr(''); setInfo(''); try { await fn(); await cargar(); } catch (e) { setErr(e.message); } finally { setBusy(false); } };
  const decidir = (l, estado) => run(async () => { await db.leccionDecidir({id: l.id, estado, ...(edit[l.id] ? {leccion: edit[l.id]} : {})}); setInfo(estado === 'aprobada' ? 'Lección aprobada: la IA ya la sigue.' : 'Listo.'); });
  const todas = estado => run(async () => { const r = await db.leccionDecidir({ids: lista.map(l => l.id), estado}); setInfo(r.actualizadas + ' lecciones actualizadas.'); });
  const agregar = () => run(async () => { const l = await db.leccionProponer(nueva); await db.leccionDecidir({id: l.id, estado: 'aprobada'}); setNueva({...nueva, leccion: ''}); setInfo('Lección agregada y aprobada.'); });
  const ias = data?.ias || {};
  return <section style={{maxWidth: 1040, margin: '0 auto', display: 'grid', gap: 16}}>
    <div className="orok-card" style={{padding: 20}}>
      <h2 style={{margin: 0, display: 'flex', gap: 8, alignItems: 'center', color: 'var(--orok-brand)'}}><Sparkles size={22}/> Lecciones de la IA</h2>
      <p style={{margin: '6px 0 0', color: '#57534e'}}>Cuando alguien corrige a una IA (por ejemplo, rechaza una publicación y explica por qué), aquí aparece una lección propuesta. Solo las que apruebas cambian cómo trabajan L.O.L.A, G.R.E.T.A, M.O.R.A y D.I.A.V.A, sea con Claude o con GPT.</p>
    </div>
    <div className="orok-card" style={{padding: 16, display: 'grid', gap: 8}}>
      <strong>Enseñar algo directamente</strong>
      <div style={{display: 'flex', gap: 8, flexWrap: 'wrap'}}>
        <select className="orok-input" style={{width: 'auto'}} value={nueva.ia} onChange={e => setNueva({...nueva, ia: e.target.value})}>{Object.entries(ias).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <input className="orok-input" style={{flex: 1, minWidth: 240}} placeholder="Ej.: «Nunca prometas fecha de entrega sin confirmarla con Gerencia»" value={nueva.leccion} onChange={e => setNueva({...nueva, leccion: e.target.value})}/>
        <button className="orok-btn orok-btn-primary" disabled={busy || nueva.leccion.trim().length < 8} onClick={agregar}><Plus size={15}/> Agregar</button>
      </div>
    </div>
    <div style={{display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center'}}>
      {['propuesta', 'aprobada', 'rechazada', 'archivada', 'todas'].map(k => <button key={k} className={'orok-btn' + (filtro === k ? ' orok-btn-primary' : '')} onClick={() => setFiltro(k)}>{k === 'todas' ? 'Todas' : ESTADO[k][0]}{k === 'propuesta' && data?.pendientes ? ` (${data.pendientes})` : ''}</button>)}
      {filtro === 'propuesta' && lista.length > 1 && <><button className="orok-btn" disabled={busy} onClick={() => todas('aprobada')}><Check size={15}/> Aprobar todas</button><button className="orok-btn" disabled={busy} onClick={() => todas('rechazada')}><X size={15}/> Rechazar todas</button></>}
    </div>
    {err && <p role="alert" style={{color: '#b42318', margin: 0}}>{err}</p>}{info && <p role="status" style={{color: '#15803d', margin: 0}}>{info}</p>}
    {!data && !err && <p style={{color: '#78716c'}}>Cargando…</p>}
    {data && !lista.length && <div className="orok-card" style={{padding: 20, textAlign: 'center', color: '#57534e'}}>{filtro === 'propuesta' ? 'No hay lecciones por revisar.' : 'No hay lecciones en esta lista.'}</div>}
    {lista.map(l => { const [et, col] = ESTADO[l.estado] || ESTADO.propuesta; return <article key={l.id} className="orok-card" style={{padding: 16, borderLeft: '4px solid ' + col, display: 'grid', gap: 6}}>
      <small style={{color: '#78716c'}}><b style={{color: col}}>{et}</b> · {ias[l.ia] || l.ia} · {l.origen} · {new Date(l.creado).toLocaleString('es-PE')} · {l.por}</small>
      {l.estado === 'propuesta' ? <textarea className="orok-input" rows={2} value={edit[l.id] ?? l.leccion} onChange={e => setEdit({...edit, [l.id]: e.target.value})}/> : <div style={{fontSize: 15}}>{l.leccion}</div>}
      {l.contexto && <small style={{color: '#57534e'}}>Contexto: {l.contexto}</small>}
      {(l.antes || l.despues) && <small style={{color: '#57534e'}}>{l.antes && <>Antes: «{l.antes.slice(0, 220)}» </>}{l.despues && <>· Después: «{l.despues.slice(0, 220)}»</>}</small>}
      <div style={{display: 'flex', gap: 6, flexWrap: 'wrap'}}>
        {l.estado !== 'aprobada' && <button className="orok-btn orok-btn-primary" disabled={busy} onClick={() => decidir(l, 'aprobada')}><Check size={15}/> Aprobar</button>}
        {l.estado === 'propuesta' && <button className="orok-btn" disabled={busy} onClick={() => decidir(l, 'rechazada')}><X size={15}/> Rechazar</button>}
        {l.estado === 'aprobada' && <button className="orok-btn" disabled={busy} onClick={() => decidir(l, 'archivada')}><Archive size={15}/> Dejar de aplicar</button>}
      </div>
    </article>; })}
  </section>;
}
