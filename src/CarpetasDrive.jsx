import React, {useEffect, useState} from 'react';
// R59 · Carpetas en Drive: dónde crea el ERP la carpeta de cada proyecto nuevo (nombre del proyecto + 14 carpetas),
// por empresa. Por defecto: BMG → Mi unidad › 1.BMG › ÖRÖK; MZA → 2.Montezuma Arquitectos; MAAS → 3. MAAS Constructora.
const db = new Proxy({}, {get: (_, k) => (...a) => window.crmDB[k](...a)});
const NOMBRES = {BMG: 'BMG (ÖRÖK)', MZA: 'MZA (Montezuma Arquitectos)', MAAS: 'MAAS (Constructora)'};
export default function CarpetasDrive() {
  const [c, setC] = useState(null), [roots, setRoots] = useState({}), [on, setOn] = useState(true), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false);
  const cargar = () => db.getProjectDriveConfig().then(v => { setC(v); setOn(v.enabled); setRoots(Object.fromEntries(Object.entries(v.urls || {}).map(([k, u]) => [k, u || '']))); }).catch(e => setMsg(e.message));
  useEffect(() => { cargar(); }, []);
  const guardar = async () => { setBusy(true); setMsg(''); try { await db.saveProjectDriveConfig({enabled: on, roots}); await cargar(); setMsg('Guardado. Los proyectos nuevos crearán su carpeta en estas ubicaciones.'); } catch (e) { setMsg(e.message); } finally { setBusy(false); } };
  if (!c) return <div className="orok-card" style={{gridColumn: '1 / -1'}}><h2 style={{marginTop: 0, color: 'var(--orok-brand)'}}>Carpetas en Drive</h2><p>{msg || 'Cargando…'}</p></div>;
  return <div className="orok-card" style={{gridColumn: '1 / -1'}}>
    <h2 style={{marginTop: 0, color: 'var(--orok-brand)'}}>Carpetas en Drive</h2>
    <p>Al guardar una evaluación (o con «Crear carpetas en Drive» en el Evaluador), el ERP crea la carpeta del proyecto con su nombre y sus 14 carpetas dentro de la carpeta de su empresa. Nunca borra ni mueve nada en Drive.</p>
    <label style={{display: 'flex', gap: 8, alignItems: 'center', fontWeight: 700}}><input type="checkbox" checked={on} onChange={e => setOn(e.target.checked)}/>Crear carpetas de proyectos en Drive</label>
    <div style={{display: 'grid', gap: 12, marginTop: 14}}>
      {['BMG', 'MZA', 'MAAS'].map(k => <label key={k} style={{display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 700}}>{NOMBRES[k]} · enlace de la carpeta
        <div style={{display: 'flex', gap: 8}}><input className="orok-input" style={{flex: 1}} value={roots[k] || ''} placeholder="https://drive.google.com/drive/folders/…" onChange={e => setRoots({...roots, [k]: e.target.value})}/>
          {c.urls?.[k] && <a className="orok-btn orok-btn-secondary" href={c.urls[k]} target="_blank" rel="noopener noreferrer">Abrir</a>}</div></label>)}
    </div>
    <div style={{display: 'flex', gap: 8, marginTop: 14, alignItems: 'center', flexWrap: 'wrap'}}>
      <button className="orok-btn orok-btn-primary" disabled={busy} onClick={guardar}>{busy ? 'Guardando…' : 'Guardar carpetas'}</button>
      <span style={{fontSize: 12}}>{c.origen === 'predeterminado' ? 'Usando las carpetas predeterminadas de ÖRÖK.' : 'Configuración guardada por Gerencia.'}</span>
    </div>
    {msg && <p role="status">{msg}</p>}
  </div>;
}
