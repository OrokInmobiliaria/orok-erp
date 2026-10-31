import React,{useEffect,useRef,useState} from 'react';
import {api} from './dataService';
import useDictado from './useDictado';
import {Accion} from './PideIA';
// R76 · Mejoras 1, 2 y 3: dictar el comentario y pedir a L.O.L.A la próxima acción, los datos faltantes de la ficha y la etapa sugerida.
function Sugerencia({lead, dictado, onComentario}) {
 const [s, setS] = useState(null), [busy, setBusy] = useState(false), [err, setErr] = useState('');
 const pedir = async () => { setBusy(true); setErr(''); try { const r = await api.iaSugerirLead({lead_id: lead.id, dictado}); setS(r); if (r.comentario && dictado) onComentario(r.comentario); } catch (e) { setErr(e.message); } finally { setBusy(false); } };
 return <div style={{marginTop: 8}}>
  <button type="button" className="orok-btn" style={{fontSize: 11, width: '100%'}} disabled={busy} onClick={pedir}>{busy ? 'L.O.L.A está leyendo la ficha…' : dictado ? '✨ Ordenar dictado y sugerir próxima acción' : '✨ Sugerir próxima acción y completar ficha'}</button>
  {err && <p role="alert" style={{color: '#991b1b'}}>{err}</p>}
  {s && <div style={{display: 'grid', gap: 6, marginTop: 6, padding: 8, borderRadius: 10, background: '#fdf4ee'}}>
   {s.resumen && <div><b>Resumen:</b> {s.resumen}</div>}
   {s.proxima_accion?.at && <Accion a={{tipo: 'proxima_accion', lead_id: lead.id, texto: s.proxima_accion.texto, at: s.proxima_accion.at, etiqueta: 'Próxima acción sugerida'}}/>}
   {Object.keys(s.campos || {}).length > 0 && <Accion a={{tipo: 'completar_ficha', lead_id: lead.id, campos: s.campos, etiquetas: s.etiquetas, etiqueta: 'Datos que faltan en la ficha'}}/>}
   {s.etapa_sugerida && <div><b>Etapa sugerida:</b> {s.etapa_sugerida}{s.motivo_etapa ? ' — ' + s.motivo_etapa : ''}<br/><small style={{color: '#57534e'}}>Cámbiala desde Gestión y seguimiento (pide la evidencia).</small></div>}
   {!s.proxima_accion?.at && !Object.keys(s.campos || {}).length && !s.etapa_sugerida && <small>Sin cambios sugeridos por ahora.</small>}
  </div>}
 </div>;
}
const stamp=at=>new Date(at).toLocaleString('es-PE',{timeZone:'America/Lima',dateStyle:'short',timeStyle:'short'});
// R75 · El borrador se guarda en este equipo hasta que el servidor confirma; si falla, aviso visible y «Reintentar».
const KEY=id=>'orok-comentario-'+id;
const leer=id=>{try{return localStorage.getItem(KEY(id))||'';}catch{return '';}};
const guardarLocal=(id,v)=>{try{v?localStorage.setItem(KEY(id),v):localStorage.removeItem(KEY(id));}catch{}};
export default function LeadComments({lead}){
 const [draft,setDraftState]=useState(()=>leer(lead.id)),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState([]),[ok,setOk]=useState('');
 const setDraft=v=>{setDraftState(v);guardarLocal(lead.id,v);};
 useEffect(()=>{setDraftState(leer(lead.id));setError('');setOk('');},[lead.id]);
 const request=useRef(null),[dictado,setDictado]=useState('');
 const voz=useDictado(t=>{setDictado(t);setDraft((draft?draft+'\n':'')+t);});
 const history=[...new Map([...(lead.comment_history||[]),...saved].map(c=>[c.id,c])).values()].sort((a,b)=>a.at.localeCompare(b.at));
 async function submit(e){
  e?.preventDefault?.();const text=draft.trim();if(!text||busy)return;
  if(request.current?.text!==text)request.current={text,requestId:crypto.randomUUID()};
  setBusy(true);setError('');setOk('');
  try{const entry=await api.addLeadComment(lead.id,request.current);if(!entry?.id)throw Error('El servidor no confirmó el guardado.');setSaved(rows=>[...rows,entry]);setDraft('');request.current=null;setOk('Guardado · '+stamp(entry.at||new Date().toISOString()));}
  catch(e){setError(e.message||'Sin conexión con el servidor.');}finally{setBusy(false);}
 }
 return <section aria-label={'Comentarios · '+lead.name} style={{fontSize:12,marginTop:12}}>
  <strong>Comentarios · hora de Lima</strong>
  <div style={{maxHeight:220,overflowY:'auto'}}>
   {lead.comments&&<div style={{padding:'8px 0',whiteSpace:'pre-wrap',overflowWrap:'anywhere',borderBottom:'1px solid #eee'}}><small style={{color:'#78716c'}}>Anteriores · sin fecha registrada</small><div>{lead.comments}</div></div>}
   {history.map(c=><div key={c.id} style={{padding:'8px 0',borderBottom:'1px solid #eee'}}><small style={{color:'#78716c'}}><time dateTime={c.at}>{stamp(c.at)}</time> · {c.author}</small><div style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{c.text}</div></div>)}
  </div>
  <form onSubmit={submit}>
   <textarea aria-label={'Nuevo comentario · '+lead.name} className="orok-input" maxLength={10000} rows={2} value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Añadir comentario…" style={{fontSize:12,margin:'8px 0'}}/>
   <div style={{display:'flex',gap:6}}>
    {voz.disponible&&<button type="button" className="orok-btn" onClick={voz.alternar} style={{fontSize:11}} aria-label={voz.escuchando?'Detener dictado':'Dictar comentario'}>{voz.escuchando?'■ Detener':'🎙 Dictar'}</button>}
    <button className="orok-btn orok-btn-secondary" type="submit" disabled={busy||!draft.trim()} style={{fontSize:11,flex:1}}>{busy?'Guardando…':'Agregar comentario'}</button>
   </div>
   {(voz.escuchando||voz.procesando||voz.error)&&<small style={{color:'#b42318'}}>{voz.error||(voz.escuchando?'● Escuchando… pulsa Detener al terminar':'Transcribiendo…')}</small>}
  </form>
  {error&&<div role="alert" style={{marginTop:8,padding:10,borderRadius:10,background:'#fef2f2',border:'2px solid #dc2626',color:'#991b1b'}}>
   <strong>⚠ El comentario NO se guardó.</strong><div>Tu texto sigue en el cuadro (también queda guardado en este equipo). Motivo: {error}</div>
   <button type="button" className="orok-btn orok-btn-primary" style={{fontSize:11,marginTop:6}} disabled={busy} onClick={submit}>{busy?'Reintentando…':'Reintentar ahora'}</button>
  </div>}
  {ok&&!error&&<p role="status" style={{color:'#15803d',margin:'6px 0 0'}}>✓ {ok}</p>}
  <Sugerencia key={lead.id} lead={lead} dictado={dictado} onComentario={t=>setDraft(t)}/>
 </section>;
}
