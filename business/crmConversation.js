'use strict';
const {WhatsAppService}=require('./whatsappService');
const {WhatsAppGateway}=require('./whatsappGateway');
const {randomUUID,createHash}=require('node:crypto');
class CrmConversation{
 constructor(store,config){
  this.store=store;
  const calendarGateway=new WhatsAppGateway(config.privateDir);
  this.engine=new WhatsAppService(store,config,{namespace:'crm',channel:'crm',gateway:{setup:()=>({...calendarGateway.setup(),enabled:true,automaticEnabled:true,agendaEnabled:true,newConversationMode:'auto',phoneNumberIds:['crm']}),assertRecipient:(a,p)=>{if(a!=='crm'||!p)throw Error('Conversación interna no válida.');},send:async()=> 'crm.'+randomUUID()},normalizer:input=>({...input.message,account:'crm',phone:input.lead_id||input.phone,sender:input.message.sender||'Usuario CRM',referral:null,media:null,status:input.message.direction==='inbound'?'received':'sent'}),resolveContact:(data,m)=>data.leads.find(l=>l.id===m.phone)});
 }
 async get(leadId){
  const data=await this.store.read(),lead=data.leads.find(l=>l.id===leadId);if(!lead)throw Error('Lead no encontrado.');
  const chat=await this.engine.conversation(leadId,{},data),t=(await this.engine.thread(leadId).get()).data()||{};
  return {...chat,lead,advisor_request:t.advisor_request||null,booking:t.booking||null,cancellation:t.cancellation||null,appointment:(lead.appointments||[]).filter(a=>a.status==='scheduled').at(-1)||null};
 }
 async request(leadId,input,actor){
  if(!/^[a-f0-9-]{36}$/.test(input.request_id||''))throw Error('Solicitud interna no válida.');
  const text=String(input.text||'').trim(),commands={new:'Quiero agendar una cita',reschedule:'Quiero reprogramar mi cita',cancel:'Cancelar mi cita',seller:'Quiero hablar con un asesor'};
  if(!commands[input.command]&&!text&&!input.button_id)throw Error('Indica una gestión o escribe a Lola.');
  if(text.length>2000)throw Error('Escribe hasta 2000 caracteres.');
  const ref=this.engine.thread(leadId);
  await this.store.run(async({tx,read})=>{
   const lead=read().leads.find(l=>l.id===leadId);if(!lead)throw Error('Lead no encontrado.');
   const t=(await tx.get(ref)).data()||{};
   if(t.booking&&['checking','writing','cancel_check','listing','review'].includes(t.booking.phase)&&input.command)throw Error('Hay una gestión pendiente. Comprueba su resultado antes de crear otra.');
   const id=createHash('sha256').update(input.request_id).digest('hex').slice(0,24);
   tx.set(ref,{...t,lead_id:leadId,phone:leadId,business_phone_id:'crm',mode:'auto',offer:t.offer||{id,state:'accepted'},request_actor:actor});
  });
  const result=await this.engine.ingest({lead_id:leadId,message:{id:input.request_id,direction:'inbound',type:'text',text:commands[input.command]||text||'Opción seleccionada',button_id:input.button_id,at:new Date().toISOString(),sender:actor}});
  await this.store.db.runTransaction(async tx=>{const jobRef=this.engine.jobs.doc(createHash('sha256').update('reply\0crm\0'+input.request_id).digest('hex')),j=(await tx.get(jobRef)).data();if(j)tx.set(jobRef,{...j,requested_by:actor});});
  return {...result,pending:true,message_sent_to_customer:false};
 }
}
module.exports={CrmConversation};
