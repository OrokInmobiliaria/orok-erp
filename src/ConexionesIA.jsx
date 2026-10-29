import React, {useEffect, useState} from 'react';
// R44 · Configuración › Conexiones de IA: activar el conector del ERP para Claude, ver quién está conectado, cortar conexiones y revisar la actividad.
const db = new Proxy({}, {get: (_, k) => (...a) => window.crmDB[k](...a)});
export default function ConexionesIA() {
  const [d, setD] = useState(null), [err, setErr] = useState(''), [busy, setBusy] = useState(false), [copiado, setCopiado] = useState(false);
  const load = () => db.mcpConexiones().then(setD).catch(e => setErr(e.message));
  useEffect(() => { load(); }, []);
  const run = async fn => { setBusy(true); setErr(''); try { setD(await fn()); } catch (e) { setErr(e.message); } finally { setBusy(false); } };
  const copiar = async () => { try { await navigator.clipboard.writeText(d.url); setCopiado(true); setTimeout(() => setCopiado(false), 2000); } catch {} };
  if (!d) return <section className="orok-card glass-card" style={{padding: 20, marginBottom: 16}}><h2 style={{margin: 0}}>Conexiones de IA</h2><p>{err || 'Cargando…'}</p></section>;
  return <section className="orok-card glass-card" aria-label="Conexiones de IA" style={{padding: 20, marginBottom: 16, borderRadius: 22}}>
    <div style={{display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12, alignItems: 'center'}}>
      <div><h2 style={{margin: 0}}>Conexiones de IA</h2><p style={{margin: '4px 0 0', opacity: .8}}>Conecta Claude al ERP para consultar leads, órdenes, evaluaciones y marketing con tus mismos permisos. Claude no puede aprobar, pagar ni borrar.</p></div>
      <label style={{display: 'flex', gap: 8, alignItems: 'center', fontWeight: 700}}><input className="switch" type="checkbox" checked={d.activo} disabled={busy} onChange={e => run(() => db.mcpConfigGuardar({enabled: e.target.checked}))}/> {d.activo ? 'Conector activo' : 'Conector apagado'}</label>
    </div>
    {d.activo && <ol style={{lineHeight: 1.6, margin: '14px 0'}}>
      <li>En Claude: Configuración › Conectores › «Agregar conector personalizado».</li>
      <li>Nombre: <b>ERP ÖRÖK</b>. URL: <code style={{userSelect: 'all'}}>{d.url}</code> <button type="button" className="orok-btn orok-btn-secondary" onClick={copiar}>{copiado ? 'Copiada' : 'Copiar'}</button></li>
      <li>Pulsa «Conectar», inicia sesión en el ERP si te lo pide y elige «Permitir».</li>
    </ol>}
    <p style={{fontSize: 13, opacity: .8}}>Pueden conectarse: {d.roles.join(', ')}. Si apagas el conector, todas las conexiones se cortan al instante.</p>
    <h3 style={{marginBottom: 6}}>Conectados ({d.conexiones.length})</h3>
    {d.conexiones.length ? <ul style={{listStyle: 'none', padding: 0, margin: 0}}>{d.conexiones.map(c => <li key={c.id} style={{display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderTop: '1px solid rgba(133,68,42,.14)'}}>
      <span><b>{c.usuario}</b> · {c.cliente} · desde {new Date(c.desde).toLocaleString('es-PE', {timeZone: 'America/Lima'})}</span>
      <button className="orok-btn orok-btn-secondary" disabled={busy} onClick={() => run(() => db.mcpRevocar(c.id))}>Cortar conexión</button></li>)}</ul> : <p style={{opacity: .75}}>Nadie conectado.</p>}
    <details style={{marginTop: 10}}><summary style={{cursor: 'pointer', fontWeight: 600}}>Qué puede hacer Claude ({d.herramientas.length})</summary><ul>{d.herramientas.map(h => <li key={h.nombre}>{h.titulo}{h.solo_lectura ? '' : ' · prepara borradores o agrega comentarios'}</li>)}</ul></details>
    <details style={{marginTop: 6}}><summary style={{cursor: 'pointer', fontWeight: 600}}>Actividad reciente</summary><ul style={{fontSize: 13}}>{d.actividad.map(a => <li key={a.id}>{new Date(a.at).toLocaleString('es-PE', {timeZone: 'America/Lima'})} · {a.usuario} · {a.accion}{a.ok ? '' : ' · error: ' + a.error}</li>)}</ul></details>
    {err && <p role="alert" style={{color: '#a32b1a'}}>{err}</p>}
  </section>;
}
