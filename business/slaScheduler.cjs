'use strict';

const {randomUUID}=require('node:crypto');
const {evaluateLeadSla}=require('./slaService');
const {event}=require('./lifecycle');

const ACTIVE_STATUSES=new Set(['Lead Inicial','Contactado','Información enviada','MQL','Cita','Cita Asistida','Calificado','Seguimiento','Separación','Inicial']);

function activeAfter(lead,activatedAt){
 const received=Date.parse(lead.received_at||lead.created_at||'');
 return Number.isFinite(received)&&received>=Date.UTC(2000,0,1)&&received>=Date.parse(activatedAt);
}
function semaphore(value){return ['Verde','Amarillo','Rojo','Crítico'].includes(value)?value:null;}
function snapshot(result,at,previous={}){
 // Only one traffic light controls the lead. While a user holds it manually,
 // we retain the automatic calculation and resume it on request.
 const manual=previous?.control_mode==='manual'&&semaphore(previous.manual_severity);
 return {
  severity:manual||result.severity,automatic_severity:result.severity,
  control_mode:manual?'manual':'automatic',manual_severity:manual||null,
  reason:result.reason,first_due_at:result.first_due_at,
  next_due_at:result.next_due_at,attempts:result.attempts,bot_result:result.bot_result||null,
  calculated_at:new Date(at).toISOString()
 };
}
function comparable(value){
 const {calculated_at,...rest}=value||{};
 return JSON.stringify(rest);
}
function inspect(data,{at=Date.now(),includeHistorical=false,allowMoves=true}={}){
 const settings=data.settings||{},sla=settings.sla||{};
 if(!sla.enabled||!sla.activated_at)return {enabled:false,eligible:0,changes:[],moves:[],assessments:[]};
 const changes=[],moves=[],assessments=[];
 for(const lead of data.leads||[]){
  if(!ACTIVE_STATUSES.has(lead.status)||(!includeHistorical&&!activeAfter(lead,sla.activated_at)))continue;
  const result=evaluateLeadSla(lead,{schedule:sla.schedule,policy:sla.policy},at);
  const state=snapshot(result,at,lead.sla);
  const changed=comparable(lead.sla)!==comparable(state);
  assessments.push({lead,state,result,changed});
  if(changed)changes.push({lead,state,result});
  if(allowMoves&&result.auto_move&&lead.status==='Lead Inicial')moves.push({lead,result});
 }
 return {enabled:true,eligible:assessments.length,changes,moves,assessments};
}
function slaScheduler({store,now=()=>Date.now(),interval=30*60*1000}){
 // Only one application instance may evaluate all leads.  cPanel can restart
 // or temporarily overlap Node workers; without this lease each one reads the
 // entire CRM and quickly exhausts the Firestore quota.
 const lease=store.ref?.collection('sla_jobs').doc('recalculate')||null;
 let timer=null,running=null,cooldownUntil=0;
 async function run(options={}){
  if(running)return running;
  if(!options.force&&cooldownUntil>now())return {enabled:false,eligible:0,updated:0,moved:0,skipped:true,reason:'quota_cooldown'};
  const owner=randomUUID(),atMs=now();
  running=(async()=>{
   const claimed=!lease?true:await store.db.runTransaction(async tx=>{
    const previous=(await tx.get(lease)).data()||{};
    if(previous.until>atMs)return false;
    tx.set(lease,{owner,until:atMs+10*60*1000});return true;
   });
   if(!claimed)return {enabled:false,eligible:0,updated:0,moved:0,skipped:true,reason:'already_running'};
   try{return await store.run(({read,write})=>{
   const data=read(),report=inspect(data,{at:now(),...options});
   if(!report.enabled)return {enabled:false,eligible:0,updated:0,moved:0};
   const at=new Date(now()).toISOString();let changed=false;
   for(const {lead,state} of report.changes){
    lead.sla=state;
    event(lead,'sla_updated','Sistema',{severity:state.severity,reason:state.reason,first_due_at:state.first_due_at,next_due_at:state.next_due_at},at);
    changed=true;
   }
   for(const {lead,result} of report.moves){
    // The guard is intentionally repeated here: no historical or non-initial
    // lead can be transferred by this process.
    if(lead.status!=='Lead Inicial')continue;
    lead.status=result.auto_move.status;lead.substatus=result.auto_move.substatus;
    lead.next_action='Reintentar contacto y registrar resultado';
    lead.next_action_at=result.first_due_at||at;
    lead.stage_history=[...(lead.stage_history||[]),{from:'Lead Inicial',to:lead.status,at,actor:'Sistema',observed:false}];
    event(lead,'operational_migration','Sistema',{from_status:'Lead Inicial',to_status:lead.status,substatus:lead.substatus,reason:result.auto_move.reason},at);
    changed=true;
   }
   if(changed)write(data);
   return {enabled:true,eligible:report.eligible,updated:report.changes.length,moved:report.moves.length};
   });}catch(error){
    if(/RESOURCE_EXHAUSTED|quota exceeded/i.test(String(error.message||'')))cooldownUntil=now()+interval;
    throw error;
   }finally{
    if(lease)await store.db.runTransaction(async tx=>{const snapshot=await tx.get(lease);if(snapshot.data()?.owner===owner)tx.set(lease,{owner,until:0},{merge:true});}).catch(()=>{});
   }
  })().finally(()=>{running=null;});
  return running;
 }
 async function preview(slaOverride,options={}){
  const data=await store.read();
  if(slaOverride)data.settings={...(data.settings||{}),sla:slaOverride};
  return inspect(data,{at:now(),...options});
 }
 function start(){if(!timer){timer=setInterval(()=>void run().catch(error=>console.error('No se pudo recalcular el SLA:',error.message)),interval);timer.unref?.();}}
 function stop(){if(timer){clearInterval(timer);timer=null;}}
 return {run,preview,start,stop,inspect};
}

module.exports={slaScheduler,inspect,activeAfter};
