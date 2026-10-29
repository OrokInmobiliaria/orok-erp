import React,{useState} from 'react';
import {api} from './dataService';
const money=n=>new Intl.NumberFormat('es-PE',{style:'currency',currency:'PEN'}).format(n);
const blank=()=>({concept:'',amount:'',date:new Date().toLocaleDateString('en-CA',{timeZone:'America/Lima'}),spend_type:'other',project:'',agency:'',source:'',campaign_name:''});
export default function MarketingExpenses({expenses,leads}){
 const [draft,setDraft]=useState(blank),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 async function submit(e){e.preventDefault();if(busy)return;setBusy(true);setError('');setMessage('');try{await api.addMarketingExpense({...draft,amount:Number(draft.amount)});setDraft(blank());setMessage('Gasto registrado.');}catch(e){setError(e.message);}finally{setBusy(false);}}
 async function remove(exp){if(!confirm('¿Eliminar el gasto «'+exp.concept+'» por '+money(exp.amount)+'?'))return;setBusy(true);setError('');try{await api.deleteMarketingExpense(exp.id);setMessage('Gasto eliminado.');}catch(e){setError(e.message);}finally{setBusy(false);}}
 const field=(key,label,props={})=><label style={{flex:'1 1 200px'}}>{label}<input aria-label={label} className="orok-input" value={draft[key]} onChange={e=>setDraft({...draft,[key]:e.target.value})} {...props}/></label>;
 return <section className="orok-card" style={{maxWidth:1100,margin:'0 auto'}}>
  <h2 style={{color:'var(--orok-brand)',marginTop:0}}>Control de gastos de marketing</h2>
  <p>Registra cualquier gasto de marketing. Proyecto, fuente y campaña son opcionales.</p>
  <p><strong>Total registrado: {money(expenses.reduce((n,e)=>n+Number(e.amount||0),0))}</strong></p>
  {error&&<p role="alert" style={{color:'#991b1b'}}>{error}</p>}{message&&<p role="status">{message}</p>}
  <form onSubmit={submit}><fieldset disabled={busy} style={{border:0,padding:0,display:'flex',flexWrap:'wrap',gap:16}}>
   {field('concept','Concepto',{required:true,maxLength:500,placeholder:'Agencia, fotografía, evento, impresiones…'})}
   {field('amount','Monto (S/)',{type:'number',required:true,min:'0.01',step:'0.01'})}
   {field('date','Fecha',{type:'date',required:true})}
   <label style={{flex:'1 1 200px'}}>Tipo de gasto<select aria-label="Tipo de gasto" className="orok-input" value={draft.spend_type} onChange={e=>setDraft({...draft,spend_type:e.target.value})}><option value="other">Gasto general de marketing</option><option value="campaign">Captación / publicidad</option></select></label>
   {[['project','Proyecto (opcional)'],['agency','Agencia (opcional)'],['source','Fuente (opcional)'],['campaign_name','Campaña (opcional)']].map(([key,label])=><React.Fragment key={key}>{field(key,label,{...(key==='agency'?{placeholder:'Escribe la agencia',maxLength:250}:{list:'expense-'+key,maxLength:250})})}{key!=='agency'&&<datalist id={'expense-'+key}>{[...new Set(leads.map(l=>l[key]).filter(Boolean))].map(v=><option key={v} value={v}/>)}</datalist>}</React.Fragment>)}
   <p style={{fontSize:12,width:'100%',margin:0}}>Para calcular costos por campaña, el gasto de captación necesita proyecto, fuente y campaña. Puedes dejar esos campos vacíos: el gasto se registra, pero no se reparte automáticamente entre campañas.</p>
   <button type="submit" className="orok-btn orok-btn-primary">{busy?'Guardando…':'Registrar gasto'}</button>
  </fieldset></form>
  <h3>Historial de egresos</h3>
  {!expenses.length?<p>No hay gastos registrados.</p>:<div className="table-scroll"><table style={{width:'100%',fontSize:13,borderCollapse:'collapse'}}><thead><tr>{['Fecha','Concepto y atribución','Monto','Acción'].map(label=><th key={label} style={{padding:12,textAlign:'left',background:'#faf7f5'}}>{label}</th>)}</tr></thead><tbody>{expenses.slice().reverse().map(exp=><tr key={exp.id} style={{borderBottom:'1px solid #eee'}}><td style={{padding:12}}>{exp.date}</td><td style={{padding:12}}><strong>{exp.concept}</strong><div>{[exp.project,exp.agency&&'Agencia: '+exp.agency,exp.source,exp.campaign_name].filter(Boolean).join(' · ')||'Gasto sin atribución a campaña'}</div><small>{exp.spend_type==='campaign'?'Captación / publicidad':'Gasto general'}{exp.created_by?' · '+exp.created_by:''}</small></td><td style={{padding:12,whiteSpace:'nowrap'}}>{money(exp.amount)}</td><td style={{padding:12}}><button aria-label={'Eliminar gasto · '+exp.concept} className="orok-btn orok-btn-secondary" disabled={busy} onClick={()=>remove(exp)}>Eliminar</button></td></tr>)}</tbody></table></div>}
 </section>;
}
