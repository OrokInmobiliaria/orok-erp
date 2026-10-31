import React, {useEffect, useRef, useState} from 'react';
import {Sparkles, Mic, Square, X, Check, Send} from 'lucide-react';
import {api} from './dataService';
import useDictado from './useDictado';
// R76 · Mejora 5: barra única «Pídele a la IA» (Ctrl/⌘ + J). L.O.L.A interpreta el pedido y PROPONE acciones;
// la persona aplica cada una con un clic. Nada se guarda sin ese clic.
const fmt = at => at ? new Date(at).toLocaleString('es-PE', {timeZone: 'America/Lima', dateStyle: 'medium', timeStyle: 'short'}) : '';
export async function aplicarAccion(a, {onGo, onOpenLead} = {}) {
  if (a.tipo === 'navegar') { onGo?.(a.tab); return 'Listo.'; }
  if (a.tipo === 'abrir_lead') { onOpenLead?.(a.lead_id); return 'Abierto.'; }
  if (a.tipo === 'comentario') { const e = await api.addLeadComment(a.lead_id, {text: a.texto + '\n(con L.O.L.A)', requestId: crypto.randomUUID()}); if (!e?.id) throw Error('No se confirmó el guardado.'); return 'Comentario guardado.'; }
  if (a.tipo === 'proxima_accion') { await api.updateLeadAdvanced(a.lead_id, {next_action: a.texto, next_action_at: a.at}); return 'Próxima acción agendada.'; }
  if (a.tipo === 'completar_ficha') { await api.updateLeadAdvanced(a.lead_id, a.campos); return 'Ficha actualizada.'; }
  throw Error('Acción no reconocida.');
}
export function Accion({a, ctx}) {
  const [estado, setEstado] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const run = async () => { setBusy(true); setErr(''); try { setEstado(await aplicarAccion(a, ctx)); } catch (e) { setErr(e.message); } finally { setBusy(false); } };
  return <div style={{border: '1px solid #e7dfd8', borderRadius: 12, padding: 10, background: '#fff', display: 'grid', gap: 4}}>
    <b style={{fontSize: 13}}>{a.etiqueta}</b>
    {a.texto && <div style={{fontSize: 13, whiteSpace: 'pre-wrap'}}>{a.texto}</div>}
    {a.at && <small style={{color: '#57534e'}}>📅 {fmt(a.at)}</small>}
    {a.campos && <ul style={{margin: 0, paddingLeft: 18, fontSize: 13}}>{Object.entries(a.campos).map(([k, v]) => <li key={k}>{a.etiquetas?.[k] || k}: <b>{String(v)}</b></li>)}</ul>}
    {estado ? <small style={{color: '#15803d'}}>✓ {estado}</small> : <button className="orok-btn orok-btn-primary" style={{justifySelf: 'start', fontSize: 12}} disabled={busy} onClick={run}><Check size={14}/> {busy ? 'Aplicando…' : 'Aplicar'}</button>}
    {err && <small role="alert" style={{color: '#b42318'}}>{err}</small>}
  </div>;
}
export default function PideIA({tab, onGo, onOpenLead}) {
  const [open, setOpen] = useState(false), [q, setQ] = useState(''), [busy, setBusy] = useState(false), [res, setRes] = useState(null), [err, setErr] = useState('');
  const input = useRef(null);
  const enviar = async texto => { const t = String(texto ?? q).trim(); if (!t || busy) return; setBusy(true); setErr(''); setRes(null); try { setRes(await api.iaPedir({texto: t, tab})); } catch (e) { setErr(e.message); } finally { setBusy(false); } };
  const voz = useDictado(t => { setQ(t); enviar(t); });
  useEffect(() => { const k = e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j') { e.preventDefault(); setOpen(o => !o); } if (e.key === 'Escape') setOpen(false); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);
  useEffect(() => { if (open) setTimeout(() => input.current?.focus(), 50); }, [open]);
  const ctx = {onGo: t => { setOpen(false); onGo?.(t); }, onOpenLead: id => { setOpen(false); onOpenLead?.(id); }};
  return <>
    <button className="pide-ia-btn" onClick={() => setOpen(true)} aria-label="Pídele a la IA (Ctrl+J)" title="Pídele a la IA (Ctrl+J)"><Sparkles size={16}/><span>Pídele a la IA</span></button>
    {open && <div role="dialog" aria-label="Pídele a la IA" className="pide-ia-overlay" onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div className="pide-ia-panel glass-card">
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}><strong style={{display: 'flex', gap: 6, alignItems: 'center', color: 'var(--orok-brand)'}}><Sparkles size={18}/> Pídele a la IA</strong><button className="orok-btn" onClick={() => setOpen(false)} aria-label="Cerrar"><X size={15}/></button></div>
        <small style={{color: '#57534e'}}>Ej.: «agenda llamar a Juan Pérez el martes a las 4», «anota en LD-0262 que pidió el 502», «¿dónde veo las cotizaciones?»</small>
        <form onSubmit={e => { e.preventDefault(); enviar(); }} style={{display: 'flex', gap: 6}}>
          <input ref={input} className="orok-input" style={{flex: 1, margin: 0}} value={q} onChange={e => setQ(e.target.value)} placeholder="Escribe o dicta lo que necesitas…" maxLength={1500}/>
          {voz.disponible && <button type="button" className="orok-btn" onClick={voz.alternar} aria-label={voz.escuchando ? 'Detener dictado' : 'Dictar'}>{voz.escuchando ? <Square size={15}/> : <Mic size={15}/>}</button>}
          <button className="orok-btn orok-btn-primary" disabled={busy || !q.trim()} aria-label="Enviar"><Send size={15}/></button>
        </form>
        {(voz.escuchando || voz.procesando) && <small style={{color: '#b42318'}}>{voz.escuchando ? '● Escuchando… pulsa ■ al terminar' : 'Transcribiendo…'}</small>}
        {(err || voz.error) && <p role="alert" style={{color: '#b42318', margin: 0}}>{err || voz.error}</p>}
        {busy && <p style={{color: '#78716c', margin: 0}}>Pensando…</p>}
        {res && <div style={{display: 'grid', gap: 8}}><p style={{margin: 0, whiteSpace: 'pre-wrap'}}>{res.respuesta}</p>{res.acciones.map((a, i) => <Accion key={i} a={a} ctx={ctx}/>)}</div>}
      </div></div>}
  </>;
}
