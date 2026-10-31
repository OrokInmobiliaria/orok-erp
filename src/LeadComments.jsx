import React,{useEffect,useRef,useState} from 'react';
import {api} from './dataService';
const stamp=at=>new Date(at).toLocaleString('es-PE',{timeZone:'America/Lima',dateStyle:'short',timeStyle:'short'});
// R75 · El borrador se guarda en este equipo hasta que el servidor confirma; si falla, aviso visible y «Reintentar».
const KEY=id=>'orok-comentario-'+id;
const leer=id=>{try{return localStorage.getItem(KEY(id))||'';}catch{return '';}};
const guardarLocal=(id,v)=>{try{v?localStorage.setItem(KEY(id),v):localStorage.removeItem(KEY(id));}catch{}};
export default function LeadComments({lead}){
 const [draft,setDraftState]=useState(()=>leer(lead.id)),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState([]),[ok,setOk]=useState('');
 const setDraft=v=>{setDraftState(v);guardarLocal(lead.id,v);};
 useEffect(()=>{setDraftState(leer(lead.id));setError('');setOk('');},[lead.id]);
 const request=useRef(null);
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
   <button className="orok-btn orok-btn-secondary" type="submit" disabled={busy||!draft.trim()} style={{fontSize:11,width:'100%'}}>{busy?'Guardando…':'Agregar comentario'}</button>
  </form>
  {error&&<div role="alert" style={{marginTop:8,padding:10,borderRadius:10,background:'#fef2f2',border:'2px solid #dc2626',color:'#991b1b'}}>
   <strong>⚠ El comentario NO se guardó.</strong><div>Tu texto sigue en el cuadro (también queda guardado en este equipo). Motivo: {error}</div>
   <button type="button" className="orok-btn orok-btn-primary" style={{fontSize:11,marginTop:6}} disabled={busy} onClick={submit}>{busy?'Reintentando…':'Reintentar ahora'}</button>
  </div>}
  {ok&&!error&&<p role="status" style={{color:'#15803d',margin:'6px 0 0'}}>✓ {ok}</p>}
 </section>;
}
