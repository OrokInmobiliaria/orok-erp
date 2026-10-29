'use strict';
const {createHash}=require('node:crypto');
const {WhatsAppInbox}=require('./whatsappInbox');
const {nextWorkingInstant,evaluateLeadSla}=require('./slaService');
const {activeAfter}=require('./slaScheduler.cjs');
const {event}=require('./lifecycle');
const {permitted}=require('./approvedRecovery');
const {BODY,content}=require('./recoveryTemplate');
const hash=v=>createHash('sha256').update(v).digest('hex');
const DEFAULT={enabled:true,delaysMinutes:[120,1440,4320],maxAttempts:3};
const TEXT='¿Deseas continuar con tu consulta de Infinity 224? Puedo ayudarte con información del proyecto, coordinar una visita al showroom o contactar a un asesor. Si prefieres que no te escribamos más, responde BAJA.';
function policy(settings){return {...DEFAULT,...settings.lolaFollowup,maxAttempts:Math.min(3,Math.max(1,Number(settings.lolaFollowup?.maxAttempts)||3))};}
function setup(input,actor){const delays=input?.delaysMinutes;if(!Array.isArray(delays)||delays.length!==3||delays.some(n=>!Number.isInteger(n)||n<30||n>30*1440)||delays[1]<delays[0]||delays[2]<delays[1])throw Error('Define tres esperas crecientes entre 30 minutos y 30 días.');return {enabled:input.enabled===true,delaysMinutes:delays,maxAttempts:Math.min(3,Math.max(1,Number(input.maxAttempts)||3)),updated_by:actor,updated_at:new Date().toISOString()};}
function inspect(data,lead,t,clock=Date.now()){
 const p=policy(data.settings||{}),s=data.settings?.sla,c=t.auto_followup;
 const blocked=reason=>({eligible:false,reason});
 if(!p.enabled)return blocked('Seguimiento automático desactivado.');
 if(!s?.enabled||!s.activated_at||!lead||!activeAfter(lead,s.activated_at))return blocked('Fuera del alcance de activación del SLA.');
 if(!['Lead Inicial','Contactado','Información enviada','MQL','Calificado','Seguimiento'].includes(lead.status))return blocked('La etapa requiere otra gestión; no se contacta automáticamente.');
 if(t.mode!=='auto'||lead.lola_paused||t.handoff||lead.sla?.control_mode==='manual')return blocked('Atención o control manual.');
 if((lead.appointments||[]).some(a=>a.status==='scheduled')||t.booking&&['listing','checking','writing','cancel_check','review'].includes(t.booking.phase))return blocked('Hay una cita o gestión de calendario.');
 if(lead.opt_out||t.opt_out)return blocked('El contacto solicitó la baja.');
 // Continuing the customer's inquiry within the service window needs no separate follow-up form.
 // Proactive recovery after expiry retains the recorded permission and approved-template guards.
 const transport=Date.parse(t.last_inbound_at)+86400000>clock?'text':'template';
 if(transport==='template')try{permitted(lead,t);}catch(e){return blocked(e.message);}
 if(!c||c.inbound_id!==t.last_inbound_message_id||c.inbound_at!==t.last_inbound_at)return blocked('No hay un mensaje de LOLA sin respuesta para este ciclo.');
 if(c.index>=p.maxAttempts||c.stopped)return blocked('Cadencia concluida o en revisión.');
 if(!Number.isFinite(Date.parse(c.anchor_at)))return blocked('Falta un mensaje saliente comprobado.');
 const base=c.last_attempt_at||c.anchor_at,elapsed=new Date(Date.parse(base)+p.delaysMinutes[c.index]*60000),due=nextWorkingInstant(elapsed,s.schedule);
 if(!due)return blocked('No hay horario SLA válido.');
 let target=due;
 // A future next action entered in CRM is never brought forward by the bot.
 if(lead.next_action_at&&Date.parse(lead.next_action_at)>target.getTime())target=nextWorkingInstant(lead.next_action_at,s.schedule);
 const working=nextWorkingInstant(new Date(clock),s.schedule);if(!working||working.getTime()>Math.floor(clock/60000)*60000)return {eligible:false,reason:'Fuera del horario del SLA.',due_at:target?.toISOString()};
 if(!target||target.getTime()>clock)return {eligible:false,reason:'Espera de cadencia o próxima acción.',due_at:target?.toISOString()};
 return {eligible:true,due_at:target.toISOString(),index:c.index,transport,cycle:c.cycle};
}
class AutomaticFollowup{
 constructor(service){this.s=service;this.jobs=service.store.ref.collection('lola_automatic_followups');this.cursor=null;}
 async arm(leadId,messageId,at,text){
  if(this.s.channel!=='whatsapp')return;
  return this.s.store.db.runTransaction(async tx=>{const ref=this.s.thread(leadId),t=(await tx.get(ref)).data()||{};if(t.mode!=='auto'||t.opt_out||!t.last_inbound_message_id)return;
   if(text!==undefined&&!/[?¿]/.test(text)&&!['contact','slots','confirm'].includes(t.booking?.phase)&&t.offer?.state!=='pending')return;
   const m=(await tx.get(ref.collection('messages').doc(hash(t.business_phone_id+'\0'+t.last_inbound_message_id)))).data()||{},last=String(m.transcript||m.text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
   if(/^(?:(?:muchas )?gracias|gracias por (?:todo|la informacion|tu ayuda)|no[ ,]+gracias|ahora no(?: quiero continuar)?|por ahora no(?: quiero continuar)?|no me interesa|no deseo continuar)[.!\s]*$/.test(last))return;
   const cycle=hash(leadId+'\0'+t.last_inbound_message_id),old=t.auto_followup;
   if(old?.cycle===cycle&&old.index>0)return;
   tx.set(ref,{...t,auto_followup:{cycle,inbound_id:t.last_inbound_message_id,inbound_at:t.last_inbound_at,anchor_at:at,anchor_message_id:messageId,index:0,stopped:false}});
  });
 }
 async get(){const d=await this.s.store.read();return {policy:policy(d.settings||{}),sla_enabled:d.settings?.sla?.enabled===true,source:'Horarios, alcance y movimientos del SLA del mismo CRM'};}
 async save(input,actor){return this.s.store.run(({read,write})=>{const d=read();d.settings={...d.settings,lolaFollowup:setup(input,actor)};write(d);return {ok:true};});}
 async runOne(leadId){
  const before=await this.s.store.read(),lead=before.leads.find(l=>l.id===leadId),t=(await this.s.thread(leadId).get()).data()||{},check=inspect(before,lead,t);
  if(!check.eligible)return {state:'skipped',...check};
  const last=t.last_job_id?(await this.s.jobs.doc(t.last_job_id).get()).data():null;
  if(last&&!['complete','cancelled','failed','blocked'].includes(last.state))return {state:'skipped',reason:'LOLA está preparando una respuesta.'};
  this.s.gateway.assertRecipient(t.business_phone_id,t.phone,{send:true,automatic:true});
  if(check.transport==='template')await this.s.gateway.approvedRecovery(t.business_phone_id);
  const ref=this.jobs.doc(hash(check.cycle+':'+check.index)),requestId=hash(ref.id).slice(0,8)+'-'+hash(ref.id).slice(8,12)+'-'+hash(ref.id).slice(12,16)+'-'+hash(ref.id).slice(16,20)+'-'+hash(ref.id).slice(20,32);
  const attempt=await this.s.store.run(async({tx,read})=>{const tr=this.s.thread(leadId),fresh=(await tx.get(tr)).data()||{},old=(await tx.get(ref)).data(),data=read(),l=data.leads.find(l=>l.id===leadId),c=inspect(data,l,fresh);if(old)return null;if(!c.eligible||c.cycle!==check.cycle||c.index!==check.index||c.transport!==check.transport)return null;
   const value={lead_id:leadId,cycle:c.cycle,index:c.index,state:'sending',at:new Date().toISOString(),transport:c.transport};tx.set(ref,value);return {t:fresh,lead:l,value};});
  if(!attempt)return {state:'duplicate_or_changed'};
  let id=null;
  try{
   // Last check after claiming, including permissions, human control and any inbound audio/text.
   const d=await this.s.store.read(),live=(await this.s.thread(leadId).get()).data()||{},c=inspect(d,d.leads.find(l=>l.id===leadId),live);
   if(!c.eligible||c.cycle!==check.cycle||c.index!==check.index||c.transport!==check.transport)throw Object.assign(Error('La conversación cambió antes del seguimiento.'),{definitive:true});
   if(check.transport==='text'){const r=await this.s.send(leadId,{request_id:requestId,text:TEXT},'LOLA · seguimiento automático',{automatic:true,followup:true,expected:{generation:live.generation,control_version:live.control_version||0}});id=r.message_id;}
   else {
    const draft={id:ref.id};id=await this.s.gateway.send(live.business_phone_id,live.phone,content(attempt.lead,draft),{automatic:true});
    await WhatsAppInbox.prototype.ingest.call(this.s,{business_phone_id:live.business_phone_id,phone:live.phone,message:{id,direction:'outbound',type:'text',text:BODY.replace('{{1}}',String(attempt.lead.name||'👋').split(' ')[0]),sender:'LOLA · seguimiento automático · plantilla Meta',at:new Date().toISOString()}});
   }
   const at=new Date().toISOString();
   await this.s.store.run(async({tx,read,write})=>{const tr=this.s.thread(leadId),fresh=(await tx.get(tr)).data()||{},job=(await tx.get(ref)).data(),receipt=this.s.receipts.doc(hash(attempt.t.business_phone_id+'\0'+id)),r=(await tx.get(receipt)).data(),d=read(),l=d.leads.find(l=>l.id===leadId);
    tx.set(ref,{...job,state:'accepted',message_id:id,accepted_at:at});tx.set(receipt,{...r,automation_processed:true});
    const sameCycle=fresh.auto_followup?.cycle===check.cycle&&fresh.last_inbound_message_id===attempt.t.last_inbound_message_id,still=sameCycle&&fresh.mode==='auto'&&(fresh.control_version||0)===(attempt.t.control_version||0)&&!fresh.opt_out&&inspect(d,l,fresh).eligible;
    let next={...fresh};if(sameCycle){next.auto_followup={...fresh.auto_followup,index:check.index+1,last_attempt_at:at,last_message_id:id};if(check.transport==='template')next.recovery={id:ref.id,state:'template_accepted',source_inbound_at:fresh.last_inbound_at,resume_lola:still,template_delivery:{state:'accepted',message_id:id,requested_at:attempt.value.at,accepted_at:at,automatic:true}};}
    if(l){event(l,'attempt','LOLA · automático',{channel:'whatsapp',message_id:id,transport:check.transport,result:'provider_accepted',automatic:true},at);l.contact_attempts=(Number(l.contact_attempts)||0)+1;event(l,'lola_followup','LOLA · automático',{cycle:check.cycle,index:check.index+1,message_id:id,transport:check.transport},at);
     // Use existing SLA logic; never synthesize contact, qualification, visit, sale or Lost.
     const assessment=evaluateLeadSla(l,{schedule:d.settings.sla.schedule,policy:d.settings.sla.policy},at);
     if(still&&l.status==='Lead Inicial'&&assessment.auto_move&&l.sla?.control_mode!=='manual'&&!l.lola_paused&&!next.handoff){const from=l.status;l.status=assessment.auto_move.status;l.substatus=assessment.auto_move.substatus;l.stage_history=[...(l.stage_history||[]),{from,to:l.status,at,actor:'LOLA · SLA',observed:false}];event(l,'operational_migration','LOLA · SLA',{from_status:from,to_status:l.status,reason:assessment.auto_move.reason},at);}
     if(still){const p=policy(d.settings),nextDelay=p.delaysMinutes[check.index+1],due=nextDelay?nextWorkingInstant(new Date(Date.parse(at)+nextDelay*60000),d.settings.sla.schedule):nextWorkingInstant(new Date(Date.parse(at)+1440*60000),d.settings.sla.schedule);if(!l.next_action_at||Date.parse(l.next_action_at)<=Date.parse(at)){l.next_action=nextDelay?'LOLA: próximo seguimiento si continúa sin respuesta':'Vendedor: revisar cadencia agotada sin respuesta';l.next_action_at=due?.toISOString()||at;}}write(d);
    }tx.set(tr,next);
   });return {state:'accepted',message_id:id,index:check.index+1,transport:check.transport};
  }catch(e){await this.s.store.db.runTransaction(async tx=>{const tr=this.s.thread(leadId),fresh=(await tx.get(tr)).data()||{},old=(await tx.get(ref)).data();tx.set(ref,{...old,state:id?'accepted_unrecorded':e.definitive?'cancelled':'unknown',message_id:id,reason:String(e.message).slice(0,240)});if(fresh.auto_followup?.cycle===check.cycle)tx.set(tr,{...fresh,auto_followup:{...fresh.auto_followup,stopped:true,review_reason:'Revisar envío; no se reintenta automáticamente.'}});});return {state:id?'accepted_unrecorded':e.definitive?'cancelled':'unknown',reason:e.message};}
 }
 async maintenance(){
  if(this.s.channel!=='whatsapp')return {skipped:true};
  let q=this.s.threads.orderBy('lead_id');if(this.cursor)q=q.startAfter(this.cursor);
  const docs=(await q.limit(100).get()).docs,results=[];let processed=0,attempts=0;const started=Date.now();
  for(const doc of docs){if(attempts>=2||Date.now()-started>45000)break;processed++;let result;
   try{result=await this.runOne(doc.data().lead_id);}catch(e){result={state:'blocked',reason:String(e.message).slice(0,240)};}
   results.push({lead_id:doc.data().lead_id,...result});if(!['skipped','duplicate_or_changed'].includes(result.state))attempts++;
  }
  this.cursor=processed&&((processed<docs.length)||docs.length===100)?docs[processed-1].data().lead_id:null;
  return {scanned:processed,attempts,results};
 }
}
module.exports={AutomaticFollowup,policy,setup,inspect,DEFAULT,TEXT};
