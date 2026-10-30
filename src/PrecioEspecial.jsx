import React, {useEffect, useState} from 'react';
// R48 · Precio especial en la cotización (Ventas): toda rebaja o alza frente a la lista pasa por Gerencia, como una OC/OS.
// El vendedor solicita; Gerencia aprueba, observa o rechaza en Ventas › Estrategia de precios (con aviso por correo).
// Una aprobación vigente (7 días, misma unidad, cliente y lista) se usa al cotizar y pasa a la separación y la minuta.
const db = new Proxy({}, {get: (_, k) => (...a) => window.crmDB[k](...a)});
const S = v => 'S/ ' + Number(v || 0).toLocaleString('es-PE', {maximumFractionDigits: 2});
const ESTADO = {pendiente: ['Pendiente de Gerencia', '#9a3412'], aprobada: ['Aprobada', '#166534'], rechazada: ['Rechazada', '#991b1b'], observada: ['Observada', '#9a3412'], usada: ['Ya cotizada', '#57534e'], vencida: ['Vencida', '#57534e']};

export default function PrecioEspecial({unit, leadId, value, onChange, disabled}) {
  const [rows, setRows] = useState([]), [precio, setPrecio] = useState(''), [motivo, setMotivo] = useState(''), [busy, setBusy] = useState(false), [msg, setMsg] = useState(''), [err, setErr] = useState('');
  const load = () => { if (!unit?.id || !leadId) { setRows([]); return; } Promise.resolve().then(() => db.precioSolicitudes({unit_id: unit.id, lead_id: leadId})).then(setRows).catch(() => setRows([])); };
  useEffect(load, [unit?.id, leadId]);
  const enviar = async () => {
    setBusy(true); setErr(''); setMsg('');
    try { const r = await db.precioSolicitar({unit_id: unit.id, lead_id: leadId, precio_propuesto: Number(precio), motivo}); setMsg(`Solicitud enviada a Gerencia (${r.tipo} de ${S(Math.abs(r.diferencia))}).`); setPrecio(''); setMotivo(''); load(); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  if (!leadId) return <p style={{fontSize: 12, margin: '8px 0'}}>Selecciona el cliente para pedir un precio especial a Gerencia.</p>;
  const aprobadas = rows.filter(r => r.estado === 'aprobada');
  return <div style={{border: '1px solid rgba(148,163,184,.45)', borderRadius: 10, padding: 10, margin: '8px 0 16px', opacity: disabled ? .55 : 1}}>
    <b style={{fontSize: 14}}>Precio especial (requiere Gerencia)</b>
    <p style={{fontSize: 12, margin: '4px 0 8px'}}>Lista actual: {S(unit?.price)}. Cualquier rebaja o alza se aprueba como una orden; el precio aprobado pasa a la cotización, la separación y la minuta.</p>
    {aprobadas.length > 0 && <label style={{display: 'grid', gap: 4, fontSize: 13, fontWeight: 600, marginBottom: 8}}>Usar precio aprobado
      <select aria-label="Usar precio aprobado" className="orok-input" disabled={disabled} value={value || ''} onChange={e => onChange(e.target.value)}>
        <option value="">Precio de lista (sin cambio)</option>
        {aprobadas.map(r => <option key={r.id} value={r.id}>{S(r.precio_aprobado)} · aprobado por {r.decidido_por} · vence {new Date(r.vence).toLocaleDateString('es-PE', {timeZone: 'America/Lima'})}</option>)}
      </select></label>}
    {rows.filter(r => r.estado !== 'aprobada').slice(0, 3).map(r => <div key={r.id} style={{fontSize: 12, padding: '4px 0', borderTop: '1px solid rgba(148,163,184,.3)'}}>
      <span style={{color: ESTADO[r.estado]?.[1], fontWeight: 700}}>{ESTADO[r.estado]?.[0] || r.estado}</span> · {S(r.precio_propuesto)} ({r.variacion_pct > 0 ? '+' : ''}{r.variacion_pct} %){r.comentario ? ' · Gerencia: ' + r.comentario : ''}</div>)}
    <div data-responsive-grid="true" style={{display: 'grid', gridTemplateColumns: '1fr', gap: 8, marginTop: 6}}>
      <label style={{display: 'grid', gap: 4, fontSize: 12}}>Precio propuesto (S/)<input className="orok-input" type="number" step="100" disabled={disabled} value={precio} onChange={e => setPrecio(e.target.value)}/></label>
      <label style={{display: 'grid', gap: 4, fontSize: 12}}>Motivo para Gerencia<input className="orok-input" disabled={disabled} value={motivo} placeholder="Ej.: cliente cierra hoy con inicial del 30 %" onChange={e => setMotivo(e.target.value)}/></label>
      <button type="button" className="orok-btn orok-btn-secondary" disabled={disabled || busy || !precio || motivo.trim().length < 5} onClick={enviar}>{busy ? 'Enviando…' : 'Enviar a Gerencia'}</button>
    </div>
    {err && <p role="alert" style={{color: '#b91c1c', fontSize: 12, margin: '6px 0 0'}}>{err}</p>}{msg && <p role="status" style={{color: '#166534', fontSize: 12, margin: '6px 0 0'}}>{msg}</p>}
  </div>;
}
