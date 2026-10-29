import React,{useRef,useState} from 'react';
import {api} from './dataService';
const stamp=at=>new Date(at).toLocaleString('es-PE',{timeZone:'America/Lima',dateStyle:'short',timeStyle:'short'});
export default function LeadComments({lead}){
 const [draft,setDraft]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState([]);
 const request=useRef(null);
 const history=[...new Map([...(lead.comment_history||[]),...saved].map(c=>[c.id,c])).values()].sort((a,b)=>a.at.localeCompare(b.at));
 async function submit(e){
  e.preventDefault();const text=draft.trim();if(!text||busy)return;
  if(request.current?.text!==text)request.current={text,requestId:crypto.randomUUID()};
  setBusy(true);setError('');
  try{const entry=await api.addLeadComment(lead.id,request.current);setSaved(rows=>[...rows,entry]);setDraft('');request.current=null;}catch(e){setError(e.message);}finally{setBusy(false);}
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
  {error&&<p role="alert" style={{color:'#991b1b'}}>{error}</p>}
 </section>;
}
