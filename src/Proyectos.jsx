import React, {useEffect, useMemo, useState} from 'react';
// R50 · Mis proyectos: proyectos independientes (Evaluación → Ventas → Construcción → Cierre), crear uno nuevo y entrar a él.
// El proyecto elegido queda en la sesión de este navegador; al cambiar, la pantalla se recarga con sus datos.
const db = new Proxy({}, {get: (_, k) => (...a) => window.crmDB[k](...a)});
const ETAPAS = [['evaluacion', 'Evaluación'], ['ventas', 'Ventas'], ['construccion', 'Construcción'], ['cierre', 'Cierre']];
const COLOR = {evaluacion: ['#FDF0E3', '#8A3A10'], ventas: ['#E6F0E8', '#24522F'], construccion: ['#E7EEF7', '#1D4E89'], cierre: ['#F1ECE8', '#4A423C']};
const S = v => v == null ? '—' : 'S/ ' + Number(v).toLocaleString('es-PE', {maximumFractionDigits: 0});
const card = {background: 'var(--orok-surface, #fff)', border: '1px solid rgba(148,163,184,.35)', borderRadius: 18, padding: 22, display: 'flex', flexDirection: 'column', gap: 16};

export async function usarProyecto(id) { await db.proyectoUsar(id); window.dispatchEvent(new CustomEvent('orok-proyecto', {detail: id})); }

export function ProyectoSelector() {
  const [data, setData] = useState(null), [busy, setBusy] = useState(false);
  const load = () => Promise.resolve().then(() => db.proyectosListar()).then(setData).catch(() => setData(null));
  useEffect(() => { load(); const on = () => { setBusy(false); load(); }; window.addEventListener('orok-proyecto', on); return () => window.removeEventListener('orok-proyecto', on); }, []);
  if (!data || !data.proyectos?.length) return null;
  return <label className="no-print" style={{display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11, fontWeight: 700, color: '#78716c', marginTop: 6}}>Proyecto
    <select aria-label="Proyecto activo" className="orok-input" disabled={busy} value={data.activo} style={{fontWeight: 700, fontSize: 14, padding: '6px 10px', minWidth: 230}}
      onChange={async e => { const v = e.target.value; if (v === '__todos') { window.dispatchEvent(new CustomEvent('orok-ir', {detail: 'proyectos'})); return; } setBusy(true); try { await usarProyecto(v); } catch (x) { alert(x.message); setBusy(false); } }}>
      {data.proyectos.map(p => <option key={p.id} value={p.id}>{p.nombre} · {p.etapa_nombre}</option>)}
      <option value="__todos">Ver todos mis proyectos…</option>
    </select></label>;
}

function Etapas({etapa}) {
  const i = ETAPAS.findIndex(e => e[0] === etapa);
  return <ol aria-label="Etapas del proyecto" style={{listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 6, fontSize: 12, fontWeight: 700}}>
    {ETAPAS.map(([id, n], k) => <li key={id} style={{borderTop: '4px solid ' + (k <= i ? '#85442A' : 'rgba(148,163,184,.35)'), paddingTop: 6, color: k <= i ? '#5E2F1C' : '#78716c'}}>{n}{k < i ? ' ✓' : ''}</li>)}
  </ol>;
}

function Nuevo({empresas, onClose, onCreated}) {
  const [f, setF] = useState({nombre: '', empresa: empresas?.[0] || 'BMG', distrito: '', direccion: '', etapa: 'evaluacion'}), [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const crear = async e => { e.preventDefault(); setBusy(true); setErr(''); try { const r = await db.proyectoCrear(f); onCreated(r.proyecto); } catch (x) { setErr(x.message); setBusy(false); } };
  const lab = {display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 700};
  return <div style={{position: 'fixed', inset: 0, background: 'rgba(31,26,23,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16}}>
    <form role="dialog" aria-modal="true" aria-labelledby="np-t" onSubmit={crear} style={{width: 'min(720px, 100%)', maxHeight: '92vh', overflow: 'auto', background: '#fff', borderRadius: 22, padding: 28, display: 'flex', flexDirection: 'column', gap: 18, color: '#1F1A17'}}>
      <div><h2 id="np-t" style={{margin: 0}}>Nuevo proyecto</h2><p style={{margin: '6px 0 0', fontSize: 14, color: '#6B625C'}}>Queda independiente: su propia evaluación, leads, inventario, precios, marketing y obra.</p></div>
      <div data-responsive-grid="true" style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16}}>
        <label style={{...lab, gridColumn: '1 / -1'}}>Nombre del proyecto<input className="orok-input" required minLength={3} value={f.nombre} placeholder="Ej.: Residencial [nombre]" onChange={e => setF({...f, nombre: e.target.value})}/></label>
        <label style={lab}>Empresa que lo desarrolla<select className="orok-input" value={f.empresa} onChange={e => setF({...f, empresa: e.target.value})}>{(empresas || []).map(x => <option key={x}>{x}</option>)}</select></label>
        <label style={lab}>Distrito<input className="orok-input" value={f.distrito} onChange={e => setF({...f, distrito: e.target.value})}/></label>
        <label style={{...lab, gridColumn: '1 / -1'}}>Dirección del terreno<input className="orok-input" value={f.direccion} onChange={e => setF({...f, direccion: e.target.value})}/></label>
      </div>
      <fieldset style={{border: 0, margin: 0, padding: 0}}><legend style={{fontSize: 13, fontWeight: 700, marginBottom: 10}}>Empieza en la etapa</legend>
        <div data-responsive-grid="true" style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12}}>
          {[['evaluacion', 'Evaluación', 'Terreno por evaluar: cabida, costos, mercado y flujo con M.O.R.A.'], ['ventas', 'Ventas', 'Ya evaluado: cargas inventario y precios y empiezas a vender.']].map(([id, n, d]) =>
            <label key={id} style={{display: 'flex', gap: 12, alignItems: 'flex-start', border: (f.etapa === id ? '2px solid #85442A' : '1px solid #D8CFC7'), background: f.etapa === id ? '#FBF5F1' : '#fff', borderRadius: 14, padding: '14px 16px', fontSize: 14, cursor: 'pointer'}}>
              <input type="radio" name="etapa" checked={f.etapa === id} onChange={() => setF({...f, etapa: id})} style={{marginTop: 3, accentColor: '#85442A'}}/>
              <span><b>{n}</b><br/><span style={{color: '#6B625C'}}>{d}</span></span></label>)}
        </div></fieldset>
      <p style={{margin: 0, fontSize: 13, color: '#6B625C', background: '#FAF7F4', borderRadius: 12, padding: 12}}>Arranca vacío: no copia leads, ventas ni precios de otros proyectos. Después cargas inventario, evaluación y los leads que elijas.</p>
      {err && <p role="alert" style={{color: '#b91c1c', margin: 0}}>{err}</p>}
      <div style={{display: 'flex', justifyContent: 'flex-end', gap: 10}}>
        <button type="button" className="orok-btn orok-btn-secondary" onClick={onClose} disabled={busy}>Cancelar</button>
        <button className="orok-btn orok-btn-primary" disabled={busy || f.nombre.trim().length < 3}>{busy ? 'Creando…' : 'Crear y entrar'}</button>
      </div>
    </form>
  </div>;
}

// R58 · Borrar proyecto con doble confirmación: una Gerencia lo solicita (escribiendo el nombre) y OTRA lo confirma;
// una de las dos debe ser la Gerencia General. El proyecto se archiva: deja de verse, pero sus datos se conservan.
function Borrar({data, onClose, onDone}) {
  const candidatos = data.proyectos.filter(p => !p.principal && !p.borrado), pendientes = data.proyectos.filter(p => p.borrado);
  const [id, setId] = useState(candidatos[0]?.id || ''), [conf, setConf] = useState(''), [motivo, setMotivo] = useState(''), [busy, setBusy] = useState(false), [err, setErr] = useState(''), [ok, setOk] = useState('');
  const sel = candidatos.find(p => p.id === id), norm = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const run = async (fn, msg) => { setBusy(true); setErr(''); setOk(''); try { await fn(); setOk(msg); await onDone(); } catch (x) { setErr(x.message); } finally { setBusy(false); } };
  const solicitar = e => { e.preventDefault(); run(async () => { await db.proyectoBorrarSolicitar(id, {confirmacion: conf, motivo}); setConf(''); setMotivo(''); }, `Solicitud registrada. Falta la segunda confirmación de otra Gerencia${data.soy_gerencia_general ? '' : ' (debe ser la Gerencia General)'}.`); };
  const confirmar = p => { if (!window.confirm(`Segunda confirmación: se borrará «${p.nombre}». Dejará de verse en Mis proyectos y en el selector; sus datos quedan archivados (no se eliminan). ¿Continuar?`)) return;
    run(async () => { await db.proyectoBorrarConfirmar(p.id); if (p.id === data.activo) window.dispatchEvent(new CustomEvent('orok-proyecto', {detail: 'infinity224'})); }, `«${p.nombre}» fue borrado (archivado).`); };
  const cancelar = p => run(() => db.proyectoBorrarCancelar(p.id), 'Solicitud cancelada.');
  const lab = {display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 700};
  const fecha = v => { try { return new Date(v).toLocaleString('es-PE', {dateStyle: 'medium', timeStyle: 'short'}); } catch { return v; } };
  return <div style={{position: 'fixed', inset: 0, background: 'rgba(31,26,23,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16}}>
    <div role="dialog" aria-modal="true" aria-labelledby="bp-t" style={{width: 'min(680px, 100%)', maxHeight: '92vh', overflow: 'auto', background: '#fff', borderRadius: 22, padding: 28, display: 'flex', flexDirection: 'column', gap: 18, color: '#1F1A17'}}>
      <div><h2 id="bp-t" style={{margin: 0}}>Borrar proyecto</h2><p style={{margin: '6px 0 0', fontSize: 14, color: '#6B625C'}}>Requiere <b>doble confirmación</b>: una Gerencia lo solicita y otra Gerencia lo confirma. Una de las dos debe ser la <b>Gerencia General</b>. El proyecto se archiva: deja de verse, pero sus datos no se eliminan. La solicitud vence en 7 días.</p></div>
      {pendientes.length > 0 && <div style={{display: 'flex', flexDirection: 'column', gap: 10}}><h3 style={{margin: 0, fontSize: 16}}>Pendientes de segunda confirmación</h3>
        {pendientes.map(p => <div key={p.id} style={{border: '1px solid #E8C9B8', background: '#FBF5F1', borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 8}}>
          <div><b>{p.nombre}</b> · solicitado por {p.borrado.por}{p.borrado.gg ? ' (Gerencia General)' : ''} el {fecha(p.borrado.at)}{p.borrado.motivo ? ' · ' + p.borrado.motivo : ''}</div>
          {!p.borrado.puedo_confirmar && <div style={{fontSize: 13, color: '#6B625C'}}>{p.borrado.mia ? 'Tú hiciste la solicitud: la segunda confirmación debe hacerla otra Gerencia.' : 'La segunda confirmación debe hacerla la Gerencia General.'}</div>}
          <div style={{display: 'flex', gap: 8, flexWrap: 'wrap'}}>
            {p.borrado.puedo_confirmar && <button type="button" className="orok-btn" disabled={busy} onClick={() => confirmar(p)} style={{background: '#b91c1c', color: '#fff'}}>Confirmar borrado</button>}
            <button type="button" className="orok-btn orok-btn-secondary" disabled={busy} onClick={() => cancelar(p)}>Cancelar solicitud</button></div>
        </div>)}</div>}
      {candidatos.length > 0 ? <form onSubmit={solicitar} style={{display: 'flex', flexDirection: 'column', gap: 14}}><h3 style={{margin: 0, fontSize: 16}}>Solicitar borrado</h3>
        <label style={lab}>Proyecto<select className="orok-input" value={id} onChange={e => { setId(e.target.value); setConf(''); }}>{candidatos.map(p => <option key={p.id} value={p.id}>{p.nombre} · {p.etapa_nombre}</option>)}</select></label>
        <label style={lab}>Escribe el nombre del proyecto para confirmar<input className="orok-input" value={conf} placeholder={sel?.nombre || ''} onChange={e => setConf(e.target.value)} autoComplete="off"/></label>
        <label style={lab}>Motivo (queda en el historial)<input className="orok-input" value={motivo} maxLength={200} onChange={e => setMotivo(e.target.value)}/></label>
        <div style={{display: 'flex', justifyContent: 'flex-end'}}><button className="orok-btn" disabled={busy || !sel || norm(conf) !== norm(sel.nombre)} style={{background: '#b91c1c', color: '#fff'}}>{busy ? 'Enviando…' : 'Solicitar borrado'}</button></div>
      </form> : !pendientes.length && <p style={{margin: 0, color: '#6B625C'}}>No hay proyectos que se puedan borrar. El proyecto principal no se borra.</p>}
      {err && <p role="alert" style={{color: '#b91c1c', margin: 0}}>{err}</p>}
      {ok && <p role="status" style={{color: '#24522F', margin: 0}}>{ok}</p>}
      <div style={{display: 'flex', justifyContent: 'flex-end'}}><button type="button" className="orok-btn orok-btn-secondary" onClick={onClose} disabled={busy}>Cerrar</button></div>
    </div>
  </div>;
}

export default function Proyectos({user}) {
  const [data, setData] = useState(null), [err, setErr] = useState(''), [filtro, setFiltro] = useState(''), [nuevo, setNuevo] = useState(false), [borrar, setBorrar] = useState(false), [busy, setBusy] = useState('');
  const load = () => Promise.resolve().then(() => db.proyectosListar()).then(setData).catch(e => setErr(e.message));
  useEffect(() => { load(); }, []);
  const lista = useMemo(() => (data?.proyectos || []).filter(p => !filtro || p.etapa === filtro), [data, filtro]);
  const avanzar = async p => {
    const i = ETAPAS.findIndex(e => e[0] === p.etapa), sig = ETAPAS[i + 1]; if (!sig) return;
    const nota = window.prompt(`Pasar «${p.nombre}» a ${sig[1]}. Nota para el historial (opcional):`, ''); if (nota === null) return;
    setBusy(p.id); setErr(''); try { await db.proyectoEtapa(p.id, sig[0], nota); await load(); } catch (e) { setErr(e.message); } finally { setBusy(''); }
  };
  const historial = async (p, modo) => { setBusy(p.id); setErr(''); try { await db.proyectoEditar(p.id, {historial_ia: modo}); await load(); } catch (e) { setErr(e.message); } finally { setBusy(''); } };
  const entrar = async id => { setBusy(id); try { await usarProyecto(id); } catch (e) { setErr(e.message); } finally { setBusy(''); } };
  if (!data) return <section className="orok-card" style={{padding: 20}}>{err ? <p role="alert" style={{color: '#b91c1c'}}>{err}</p> : 'Cargando proyectos…'}</section>;
  const cuenta = id => data.proyectos.filter(p => p.etapa === id).length;
  return <section style={{display: 'flex', flexDirection: 'column', gap: 20}}>
    <div style={{display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16}}>
      <div><h2 style={{margin: 0, fontSize: 28}}>Mis proyectos</h2><p style={{margin: '6px 0 0', color: '#6B625C', fontSize: 15}}>Cada proyecto es independiente y pueden avanzar varios a la vez. Estás trabajando en <b>{data.proyectos.find(p => p.id === data.activo)?.nombre}</b>.</p></div>
      <div style={{display: 'flex', gap: 10, flexWrap: 'wrap'}}>
        {data.puede_borrar && <button className="orok-btn orok-btn-secondary" onClick={() => setBorrar(true)} style={{color: '#b91c1c', borderColor: '#E8B4B4'}}>Borrar proyecto{data.proyectos.some(p => p.borrado) ? ' (' + data.proyectos.filter(p => p.borrado).length + ' pendiente)' : ''}</button>}
        {data.puede_crear && <button className="orok-btn orok-btn-primary" onClick={() => setNuevo(true)}>+ Nuevo proyecto</button>}
      </div>
    </div>
    <div role="group" aria-label="Filtrar por etapa" style={{display: 'flex', flexWrap: 'wrap', gap: 8}}>
      {[['', 'Todos', data.proyectos.length], ...ETAPAS.map(([id, n]) => [id, n, cuenta(id)])].map(([id, n, c]) =>
        <button key={id || 'todos'} type="button" aria-pressed={filtro === id} onClick={() => setFiltro(id)} className="orok-btn" style={{borderRadius: 999, padding: '7px 14px', fontSize: 13, background: filtro === id ? '#1F1A17' : 'transparent', color: filtro === id ? '#fff' : 'inherit', border: '1px solid #D8CFC7'}}>{n} ({c})</button>)}
    </div>
    {err && <p role="alert" style={{color: '#b91c1c', margin: 0}}>{err}</p>}
    <div data-responsive-grid="true" style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20}}>
      {lista.map(p => { const r = p.resumen || {}, i = ETAPAS.findIndex(e => e[0] === p.etapa), sig = ETAPAS[i + 1], activo = p.id === data.activo;
        return <article key={p.id} style={{...card, outline: activo ? '2px solid #85442A' : 'none'}}>
          <div style={{display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start'}}>
            <div><div style={{fontSize: 12, color: '#6B625C', fontWeight: 600}}>{[p.empresa, p.distrito].filter(Boolean).join(' · ')}</div><h3 style={{margin: '2px 0 0', fontSize: 22}}>{p.nombre}</h3></div>
            <span style={{padding: '5px 12px', borderRadius: 999, background: COLOR[p.etapa]?.[0], color: COLOR[p.etapa]?.[1], fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap'}}>{activo ? 'Abierto · ' : ''}{p.etapa_nombre}</span>
          </div>
          {p.borrado && <div role="note" style={{fontSize: 13, background: '#FDECEC', color: '#991b1b', borderRadius: 10, padding: '8px 12px'}}>Borrado solicitado por {p.borrado.por}: falta la segunda confirmación.</div>}
          <Etapas etapa={p.etapa}/>
          <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 12}}>
            {p.etapa === 'evaluacion'
              ? <><div><div style={{fontSize: 12, color: '#6B625C'}}>Evaluaciones</div><div style={{fontSize: 20, fontWeight: 800}}>{r.evaluaciones ?? '—'}</div></div><div><div style={{fontSize: 12, color: '#6B625C'}}>Unidades</div><div style={{fontSize: 20, fontWeight: 800}}>{r.unidades ?? '—'}</div></div><div><div style={{fontSize: 12, color: '#6B625C'}}>Leads</div><div style={{fontSize: 20, fontWeight: 800}}>{r.leads_activos ?? '—'}</div></div></>
              : <><div><div style={{fontSize: 12, color: '#6B625C'}}>Meta de recaudación</div><div style={{fontSize: 18, fontWeight: 800}}>{S(r.meta_recaudacion)}</div></div><div><div style={{fontSize: 12, color: '#6B625C'}}>Vendido</div><div style={{fontSize: 18, fontWeight: 800}}>{r.vendidas ?? 0} de {r.unidades ?? 0}</div></div><div><div style={{fontSize: 12, color: '#6B625C'}}>Leads activos</div><div style={{fontSize: 18, fontWeight: 800}}>{r.leads_activos ?? 0}</div></div></>}
          </div>
          {data.puede_crear && <label style={{display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 700, color: '#57534e'}}>Las IA de este proyecto pueden usar el historial de
            <select className="orok-input" aria-label={'Historial para las IA de ' + p.nombre} value={p.historial_ia || 'ninguno'} disabled={busy === p.id} onChange={e => historial(p, e.target.value)} style={{fontSize: 13, padding: '6px 10px'}}>
              {(data.historial_opciones || []).map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}</select>
            <span style={{fontWeight: 400}}>Cifras agregadas (precios, ventas, leads por fuente, inversión, evaluaciones, proveedores); nunca datos personales de clientes.</span></label>}
          <div style={{display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 'auto'}}>
            <button className="orok-btn orok-btn-primary" style={{flex: 1}} disabled={busy === p.id} onClick={() => entrar(p.id)}>{activo ? 'Ir al proyecto' : busy === p.id ? 'Abriendo…' : 'Entrar al proyecto'}</button>
            {data.puede_crear && sig && <button className="orok-btn orok-btn-secondary" disabled={busy === p.id} onClick={() => avanzar(p)}>Pasar a {sig[1]}…</button>}
          </div>
        </article>; })}
    </div>
    {borrar && <Borrar data={data} onClose={() => setBorrar(false)} onDone={load}/>}
    {nuevo && <Nuevo empresas={data.empresas} onClose={() => setNuevo(false)} onCreated={p => { setNuevo(false); window.dispatchEvent(new CustomEvent('orok-proyecto', {detail: p.id})); }}/>}
  </section>;
}
