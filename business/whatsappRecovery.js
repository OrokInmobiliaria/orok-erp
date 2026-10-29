'use strict';
const {createHash}=require('node:crypto');
const hash=v=>createHash('sha256').update(v).digest('hex');
const {BODY,NAME,LANGUAGE,personalized}=require('./recoveryTemplate');
function draftFor(lead){return BODY.replace('{{1}}',personalized(lead));}
class WhatsAppRecovery{
 constructor(service){this.s=service;}
 async prepare(leadId,actor='Sistema'){
  return this.s.store.run(async({tx,read})=>{
   const data=read(),lead=data.leads.find(l=>l.id===leadId);if(!lead)throw Error('Lead no encontrado.');
   const ref=this.s.thread(leadId),t=(await tx.get(ref)).data()||{};
   if(lead.opt_out||t.opt_out)throw Error('El contacto solicitó la baja. No se prepara una recuperación comercial.');
   if(!t.last_inbound_at||Date.parse(t.last_inbound_at)+86400000>Date.now())throw Error('Esta opción requiere una conversación previa con la ventana de 24 horas cerrada.');
   const phone=String(t.phone||lead.phone||'').replace(/\D/g,'');if(!/^\d{7,15}$/.test(phone))throw Error('Falta el teléfono internacional del cliente.');
   const id=hash(leadId+'\0'+t.last_inbound_at),old=t.recovery;
   if(old?.id===id)return {ok:true,draft:old,duplicate:true};
   const draft={id,source_inbound_at:t.last_inbound_at,phone,text:draftFor(lead,data.settings?.projectName),state:'prepared',prepared_at:new Date().toISOString(),actor,resume_lola:false,api_message_sent:false,template_name:NAME,language:LANGUAGE,template_approval:'NOT_CHECKED'};
   tx.set(ref,{...t,recovery:draft});tx.set(ref.collection('audit').doc('recovery-'+id),{action:'recovery_prepared',actor,at:draft.prepared_at,draft_id:id});
   return {ok:true,draft};
  });
 }
 async open(leadId,input,actor){
  return this.s.store.run(async({tx,read})=>{
   const data=read(),lead=data.leads.find(l=>l.id===leadId),ref=this.s.thread(leadId),t=(await tx.get(ref)).data()||{},d=t.recovery;
   if(!lead||!d||d.id!==input.draft_id)throw Error('El borrador cambió. Actualiza la conversación.');
   if(lead.opt_out||t.opt_out)throw Error('El contacto solicitó la baja.');
   if(t.last_inbound_at!==d.source_inbound_at||Date.parse(t.last_inbound_at)+86400000>Date.now())throw Error('El cliente ya respondió. Actualiza la conversación antes de continuar.');
   if(t.booking&&['checking','writing','cancel_check'].includes(t.booking.phase))throw Error('Espera la gestión de Calendar en curso antes de cambiar la atención.');
   const text=String(input.text||d.text).trim();if(!text||text.length>1000)throw Error('El mensaje debe tener de 1 a 1000 caracteres.');
   const resume=input.resume_lola===true;if(resume&&(lead.lola_paused||t.handoff))throw Error('Hay una atención humana pendiente. Conserva el control manual hasta resolverla.');
   const draft={...d,text,state:'opened_not_confirmed',resume_lola:resume,opened_at:new Date().toISOString(),opened_by:actor};
   tx.set(ref,{...t,mode:'manual',control_version:(t.control_version||0)+1,suggestion:null,recovery:draft,mode_actor:actor,mode_reason:'Recuperación manual; esperando respuesta del cliente'});
   tx.set(ref.collection('audit').doc('recovery-open-'+d.id),{action:'recovery_opened_not_sent',actor,at:draft.opened_at,draft_id:d.id,resume_lola:resume});
   return {ok:true,draft,url:'https://wa.me/'+d.phone+'?text='+encodeURIComponent(text),message_sent:false,note:'Selecciona la cuenta de WhatsApp Business del negocio y confirma el envío en la aplicación. El enlace no elige la cuenta remitente.'};
  });
 }
 async maintenance(){
  let query=this.s.threads.orderBy('last_inbound_at','asc');if(this.cursor)query=query.startAfter(this.cursor);const docs=(await query.limit(100).get()).docs;this.cursor=docs.length===100?docs.at(-1):null;let prepared=0,skipped=0;
  for(const doc of docs){const t=doc.data();if(!t.last_inbound_at||Date.parse(t.last_inbound_at)+86400000>Date.now()||t.opt_out||t.recovery?.source_inbound_at===t.last_inbound_at)continue;try{await this.prepare(t.lead_id);prepared++;}catch{skipped++;}}
  return {prepared,skipped,scanned:docs.length,message_sent:false};
 }
}
require('./approvedRecovery').attach(WhatsAppRecovery);
module.exports={WhatsAppRecovery,draftFor};
