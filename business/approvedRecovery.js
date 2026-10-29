'use strict';
const {createHash}=require('node:crypto'),{WhatsAppInbox}=require('./whatsappInbox');
const {NAME,LANGUAGE,BODY,BUTTONS,personalized,content}=require('./recoveryTemplate');
const hash=v=>createHash('sha256').update(v).digest('hex'),now=()=>new Date().toISOString();
const uuid=v=>/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v||'');
function permitted(lead,t){if(lead.opt_out||t.opt_out)throw Error('El contacto solicitó la baja.');const c=lead.whatsapp_followup_consent;if(c?.granted!==true||!c.evidence||!c.granted_at)throw Error('Registra la autorización real del cliente para seguimiento antes de enviar esta recuperación.');}
function attach(Recovery){
 Recovery.prototype.recordConsent=async function(leadId,input,actor){
  const evidence=String(input.evidence||'').trim(),granted=Date.parse(input.granted_at);if(input.confirmed!==true||evidence.length<8||evidence.length>500||!Number.isFinite(granted)||granted>Date.now())throw Error('Confirma la autorización e indica evidencia y fecha reales del permiso del cliente.');
  return this.s.store.run(async({tx,read,write})=>{const data=read(),lead=data.leads.find(l=>l.id===leadId),tr=this.s.thread(leadId),t=(await tx.get(tr)).data()||{};if(!lead)throw Error('Lead no encontrado.');if(lead.opt_out||t.opt_out)throw Error('El contacto solicitó la baja. No se puede sustituir por una autorización del operador.');if(lead.whatsapp_followup_consent?.revoked_at&&granted<=Date.parse(lead.whatsapp_followup_consent.revoked_at))throw Error('El permiso anterior fue revocado. Se requiere una nueva autorización posterior a la baja.');lead.whatsapp_followup_consent={granted:true,granted_at:new Date(granted).toISOString(),evidence,recorded_by:actor,recorded_at:now(),basis:'Declaración del usuario CRM; no aprobación de Meta'};write(data);tx.set(tr.collection('audit').doc(hash(evidence+granted+actor)),{action:'followup_consent_recorded',actor,at:now(),evidence,granted_at:new Date(granted).toISOString()});return {ok:true};});
 };
 Recovery.prototype.previewTemplate=async function(leadId){
  const data=await this.s.store.read(),lead=data.leads.find(l=>l.id===leadId),t=(await this.s.thread(leadId).get()).data()||{};if(!lead)throw Error('Lead no encontrado.');if(lead.opt_out||t.opt_out)throw Error('El contacto solicitó la baja.');
  const approved=await this.s.gateway.approvedRecovery(t.business_phone_id);
  return {ok:true,name:NAME,language:LANGUAGE,status:approved.status,category:approved.category,text:BODY.replace('{{1}}',personalized(lead)),buttons:BUTTONS,consent:lead.whatsapp_followup_consent||null};
 };
 Recovery.prototype.sendTemplate=async function(leadId,input,actor){
  if(!uuid(input.request_id))throw Error('Solicitud de envío no válida.');
  const outRef=this.s.outbox.doc(hash('template\0'+leadId+'\0'+input.request_id)),existing=(await outRef.get()).data();
  if(existing){if(existing.draft_id!==input.draft_id)throw Error('La solicitud corresponde a otra recuperación.');return {ok:true,duplicate:true,state:existing.state,message_id:existing.message_id||null};}
  const before=await this.s.store.read(),leadBefore=before.leads.find(l=>l.id===leadId),threadBefore=(await this.s.thread(leadId).get()).data()||{};if(!leadBefore)throw Error('Lead no encontrado.');permitted(leadBefore,threadBefore);
  // Read current approval and exact content from Meta. Never trust a local APPROVED flag.
  await this.previewTemplate(leadId);
  const prepared=await this.s.store.run(async({tx,read})=>{
   const lead=read().leads.find(l=>l.id===leadId),tr=this.s.thread(leadId),t=(await tx.get(tr)).data()||{},old=(await tx.get(outRef)).data(),d=t.recovery;
   if(old){if(old.draft_id!==input.draft_id)throw Error('La solicitud ya corresponde a otra recuperación.');return {duplicate:true,state:old.state,message_id:old.message_id||null};}
   if(!lead||!d||d.id!==input.draft_id||d.source_inbound_at!==t.last_inbound_at)throw Error('El cliente o el borrador cambió. Actualiza la conversación.');permitted(lead,t);
   if(Date.parse(t.last_inbound_at)+86400000>Date.now())throw Error('El cliente ya respondió y tiene una ventana abierta. Utiliza la atención normal.');
   if(d.template_delivery)throw Error('Esta recuperación ya fue intentada. Revisa su estado; no se repetirá sin una nueva respuesta del cliente.');
   if(t.booking&&['checking','writing','cancel_check'].includes(t.booking.phase))throw Error('Espera la gestión de Calendar en curso.');
   if(input.resume_lola===true&&(lead.lola_paused||t.handoff))throw Error('Hay atención humana pendiente; conserva el modo manual.');
   this.s.gateway.assertRecipient(t.business_phone_id,d.phone,{send:true});
   const at=now(),delivery={state:'sending',request_id:input.request_id,requested_at:at,actor,template:NAME,language:LANGUAGE},draft={...d,resume_lola:input.resume_lola===true,state:'template_sending',template_delivery:delivery};
   const control=(t.control_version||0)+1;tx.set(tr,{...t,mode:'manual',control_version:control,suggestion:null,recovery:draft,mode_actor:actor,mode_reason:'Plantilla de recuperación; esperando respuesta del cliente'});
   tx.set(outRef,{state:'sending',lead_id:leadId,account:t.business_phone_id,phone:d.phone,draft_id:d.id,request_id:input.request_id,actor,created_at:at});
   return {lead,account:t.business_phone_id,phone:d.phone,draft,control_version:control,source_inbound_at:t.last_inbound_at};
  });
  if(prepared.duplicate)return {ok:true,...prepared};let messageId=null;
  try{
   const latest=(await this.s.thread(leadId).get()).data()||{};if(latest.opt_out||latest.control_version!==prepared.control_version||latest.last_inbound_at!==prepared.source_inbound_at)throw Object.assign(Error('La conversación cambió antes del envío.'),{definitive:true});
   messageId=await this.s.gateway.send(prepared.account,prepared.phone,content(prepared.lead,prepared.draft));
   await WhatsAppInbox.prototype.ingest.call(this.s,{business_phone_id:prepared.account,phone:prepared.phone,message:{id:messageId,direction:'outbound',type:'text',text:BODY.replace('{{1}}',personalized(prepared.lead))+'\n'+BUTTONS.join(' · '),sender:actor+' · plantilla Meta',at:now()}});
   await this.s.store.db.runTransaction(async tx=>{const tr=this.s.thread(leadId),t=(await tx.get(tr)).data()||{},o=(await tx.get(outRef)).data(),receipt=this.s.receipts.doc(hash(prepared.account+'\0'+messageId)),r=(await tx.get(receipt)).data();tx.set(outRef,{...o,state:'sent',message_id:messageId,sent_at:now()});tx.set(receipt,{...r,automation_processed:true});tx.set(tr,{...t,recovery:{...t.recovery,state:t.recovery?.state==='customer_replied'?'customer_replied':'template_accepted',template_delivery:{...t.recovery.template_delivery,state:'accepted',message_id:messageId,accepted_at:now()}}});});
   return {ok:true,state:'accepted',message_id:messageId,customer_replied:false};
  }catch(error){const state=messageId?'accepted_unrecorded':error.definitive?'failed':'unknown';await this.s.store.db.runTransaction(async tx=>{const tr=this.s.thread(leadId),t=(await tx.get(tr)).data()||{},old=(await tx.get(outRef)).data();tx.set(outRef,{...old,state,message_id:messageId,reason:String(error.message).slice(0,300),updated_at:now()});tx.set(tr,{...t,recovery:{...t.recovery,state,template_delivery:{...t.recovery.template_delivery,state,message_id:messageId}}});});throw Error(error.message+' No se reintentará automáticamente.');}
 };
}
module.exports={attach,permitted};
