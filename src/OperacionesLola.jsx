import React, {useEffect, useState} from 'react';
// R45 · Configuración › L.O.L.A Operaciones: salud de servicios y resguardo externo cifrado (Drive) para no perder nada ante una caída.
const db = new Proxy({}, {get: (_, k) => (...a) => window.crmDB[k](...a)});
const fmt = b => !b ? '—' : b > 1e9 ? (b / 1e9).toFixed(2) + ' GB' : b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.round(b / 1e3) + ' KB';
const fecha = v => v ? new Date(v).toLocaleString('es-PE', {timeZone: 'America/Lima'}) : '—';
const SERV = {base_de_datos: 'Base de datos', drive: 'Google Drive (resguardos)', n8n: 'n8n'};
export default function OperacionesLola() {
  const [d, setD] = useState(null), [f, setF] = useState(null), [err, setErr] = useState(''), [msg, setMsg] = useState(''), [busy, setBusy] = useState(''), [llave, setLlave] = useState(null);
  const load = () => db.opsEstado().then(x => { setD(x); setF(x.config); }).catch(e => setErr(e.message));
  useEffect(() => { load(); }, []);
  const run = async (k, fn, ok) => { setBusy(k); setErr(''); setMsg(''); try { const r = await fn(); if (ok) setMsg(typeof ok === 'function' ? ok(r) : ok); await load(); return r; } catch (e) { setErr(e.message); } finally { setBusy(''); } };
  const generar = () => run('k', async () => { const r = await db.opsGenerarLlaves(d.llave ? {reemplazar: true} : {}); setLlave(r); return r; });
  const bajar = () => { const b = new Blob([llave.llave_privada], {type: 'application/x-pem-file'}), u = URL.createObjectURL(b), a = document.createElement('a'); a.href = u; a.download = 'ERP-OROK-llave-privada-respaldos-' + llave.huella + '.pem'; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 2000); };
  if (!d) return <section className="orok-card glass-card" style={{padding: 20, marginBottom: 16, borderRadius: 22}}><h2 style={{margin: 0}}>L.O.L.A Operaciones</h2><p>{err || 'Revisando servicios…'}</p></section>;
  const u = d.ultimo;
  return <section className="orok-card glass-card" aria-label="L.O.L.A Operaciones" style={{padding: 20, marginBottom: 16, borderRadius: 22}}>
    <div style={{display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12, alignItems: 'center'}}>
      <div><h2 style={{margin: 0}}>L.O.L.A Operaciones</h2><p style={{margin: '4px 0 0', opacity: .8}}>Vigila los servicios y guarda fuera del servidor una copia cifrada de todo el ERP, para que una caída no haga perder nada.</p></div>
      <span style={{fontWeight: 700, padding: '6px 12px', borderRadius: 999, background: d.atrasado ? 'rgba(176,62,40,.15)' : d.activo ? 'rgba(46,107,63,.15)' : 'rgba(110,90,78,.15)', color: d.atrasado ? '#8a2e1c' : d.activo ? '#1f5130' : '#4a3a30'}}>{d.atrasado ? 'Resguardo atrasado' : d.activo ? 'Resguardo activo' : 'Resguardo apagado'}</span>
    </div>
    <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 10, margin: '14px 0'}}>
      {Object.entries(d.salud || {}).map(([k, v]) => <div key={k} style={{padding: 12, borderRadius: 16, background: 'rgba(255,255,255,.5)'}}><b>{v.ok ? '● ' : '○ '}{SERV[k] || k}</b><div style={{fontSize: 13, color: v.ok ? '#1f5130' : '#8a2e1c'}}>{v.detalle}</div></div>)}
      <div style={{padding: 12, borderRadius: 16, background: 'rgba(255,255,255,.5)'}}><b>Último resguardo</b><div style={{fontSize: 13}}>{u ? fecha(u.at) + ' · ' + fmt(u.bytes) + (u.estado === 'externo' ? ' · en Drive' : ' · solo en el servidor') : 'Aún no hay'}</div>{d.ultima_verificacion && <div style={{fontSize: 13}}>Verificado en Drive: {d.ultima_verificacion.ok ? 'sí' : 'NO · ' + d.ultima_verificacion.error} ({fecha(d.ultima_verificacion.at)})</div>}</div>
    </div>
    {u?.conteos && <p style={{fontSize: 13, opacity: .85}}>Conteos de control del último resguardo: {u.conteos.leads} leads · {u.conteos.comentarios} comentarios · firma del Kanban {u.conteos.kanban_firma} · {u.conteos.separaciones} separaciones.</p>}
    {llave && <div role="alert" style={{padding: 14, borderRadius: 16, background: 'rgba(176,62,40,.10)', margin: '10px 0'}}>
      <b>Llave privada de los respaldos (huella {llave.huella})</b><p style={{margin: '6px 0'}}>{llave.aviso}</p>
      <button className="orok-btn orok-btn-primary" onClick={bajar}>Descargar llave privada</button> <button className="orok-btn orok-btn-secondary" onClick={() => setLlave(null)}>Ya la guardé en dos lugares</button>
    </div>}
    {f && <fieldset style={{border: '1px solid rgba(133,68,42,.16)', borderRadius: 16, padding: 14, display: 'grid', gap: 10}}>
      <legend style={{fontWeight: 700}}>Configuración del resguardo</legend>
      <label>Carpeta de Google Drive (ID o enlace; mejor una unidad compartida de la empresa, compartida con la cuenta de servicio del ERP)<input className="orok-input" value={f.drive_folder_id} onChange={e => setF({...f, drive_folder_id: e.target.value})} placeholder="https://drive.google.com/drive/folders/…"/></label>
      <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 10}}>
        <label>Frecuencia<select className="orok-input" value={f.cada_horas} onChange={e => setF({...f, cada_horas: +e.target.value})}>{[1, 2, 3, 6, 12, 24].map(h => <option key={h} value={h}>Cada {h} hora{h > 1 ? 's' : ''}</option>)}</select></label>
        <label>Dirección de n8n (para vigilarlo)<input className="orok-input" value={f.n8n_url} onChange={e => setF({...f, n8n_url: e.target.value})} placeholder="https://…"/></label>
      </div>
      <label style={{display: 'flex', gap: 8, alignItems: 'center'}}><input type="checkbox" checked={f.incluir_archivos} onChange={e => setF({...f, incluir_archivos: e.target.checked})}/> Incluir archivos del servidor (fotos y videos de campañas, documentos, configuraciones)</label>
      <div style={{display: 'flex', flexWrap: 'wrap', gap: 8}}>
        <button className="orok-btn orok-btn-secondary" disabled={!!busy} onClick={() => run('c', () => db.opsConfigGuardar(f), 'Guardado.')}>Guardar</button>
        <button className="orok-btn orok-btn-secondary" disabled={!!busy} onClick={generar}>{d.llave ? 'Generar llave nueva (si perdiste la privada)' : 'Generar llave de los respaldos'}</button>
        <button className="orok-btn orok-btn-primary" disabled={!!busy || !d.llave} onClick={() => run('a', () => db.opsConfigGuardar({...f, enabled: !d.activo}), d.activo ? 'Resguardo apagado.' : 'Resguardo activo: el primero corre en minutos.')}>{d.activo ? 'Apagar resguardo' : 'Activar resguardo'}</button>
        <button className="orok-btn orok-btn-secondary" disabled={!!busy || !d.llave} onClick={() => run('r', () => db.opsResguardar(), r => r.estado === 'error' ? 'Error: ' + r.error : 'Resguardo listo · ' + fmt(r.bytes) + (r.avisos.length ? ' · ' + r.avisos.join(' ') : ''))}>{busy === 'r' ? 'Resguardando…' : 'Resguardar ahora'}</button>
        <button className="orok-btn orok-btn-secondary" disabled={!!busy || !d.ultimo_externo} onClick={() => run('v', () => db.opsVerificar(), r => r.ok ? 'La copia en Drive coincide.' : 'Atención: ' + r.error)}>Verificar copia en Drive</button>
      </div>
      {d.llave && <small style={{opacity: .75}}>Llave configurada · huella {d.llave.huella}. La llave privada no está en el servidor: sin ella los respaldos no se pueden abrir.</small>}
    </fieldset>}
    <details style={{marginTop: 10}}><summary style={{cursor: 'pointer', fontWeight: 600}}>Historial de resguardos</summary><ul style={{fontSize: 13}}>{d.registros.map(r => <li key={r.id}>{fecha(r.at)} · {r.motivo} · {r.estado === 'externo' ? 'en Drive' : r.estado === 'solo_local' ? 'solo en el servidor' : r.estado === 'error' ? 'ERROR: ' + r.error : r.estado} · {fmt(r.bytes)}{r.avisos?.length ? ' · ' + r.avisos.join(' ') : ''}</li>)}</ul></details>
    {msg && <p role="status">{msg}</p>}{err && <p role="alert" style={{color: '#a32b1a'}}>{err}</p>}
  </section>;
}
