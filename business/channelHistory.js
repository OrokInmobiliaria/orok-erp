'use strict';

const {createHash}=require('node:crypto');
const {appendComment}=require('./leadComments');
const {iso,event}=require('./lifecycle');

function normalizedPhone(value){
 const digits=String(value||'').replace(/\D/g,'');
 if(!digits)return '';
 return digits.startsWith('51')&&digits.length>=11?digits.slice(-9):digits.length>=9?digits.slice(-9):digits;
}
function externalId(prefix,parts){
 return `${prefix}-${createHash('sha256').update(parts.join('|')).digest('hex').slice(0,48)}`;
}
function directionLabel(message){
 const direction=String(message.direction||message.from||'').toLowerCase();
 if(['in','inbound','customer','cliente'].includes(direction))return 'Cliente';
 if(['bot','automation','automated'].includes(direction))return 'Bot';
 return 'Equipo';
}
function messagesFor(conversation){
 return Array.isArray(conversation?.messages)?conversation.messages:[];
}
function suppliedProfile(conversation){
 const source={...(conversation?.contact||{}),...(conversation?.profile||{}),...(conversation?.lead||{})};
 return {
  name:source.name,dni:source.dni,email:source.email,address:source.address,
  project:source.project,unit_interest:source.unit_interest||source.interest,
  purchase_horizon:source.purchase_horizon,budget:source.budget,
  next_action:source.next_action,next_action_at:source.next_action_at
 };
}
function mergeMissingProfile(lead,conversation){
 const source=suppliedProfile(conversation),changed=[];
 for(const key of ['name','dni','email','address','project','unit_interest','purchase_horizon','next_action','next_action_at']){
  if((lead[key]===undefined||lead[key]===null||String(lead[key]).trim()==='')&&String(source[key]||'').trim()){lead[key]=String(source[key]).trim();changed.push(key);}
 }
 if((!Number(lead.budget)||Number(lead.budget)<=0)&&Number.isFinite(Number(source.budget))&&Number(source.budget)>0){lead.budget=Number(source.budget);changed.push('budget');}
 return changed;
}
function confirmedAppointment(conversation){
 const appointment=conversation?.appointment||{};
 const status=String(conversation?.outcome||conversation?.result||appointment.status||'').trim().toLowerCase();
 const at=iso(conversation?.appointment_at||appointment.scheduled_at||appointment.at);
 return at&&['appointment_scheduled','cita_agendada','scheduled','confirmed','confirmada'].includes(status)?at:null;
}
function mayMoveToAppointment(lead){return ['Lead Inicial','Contactado','Información enviada','MQL','Calificado'].includes(lead.status);}
function applyInitialAppointment(lead,conversation,channel,conversationId,actor){
 const at=confirmedAppointment(conversation);
 if(!at||!mayMoveToAppointment(lead))return false;
 const appointmentId=externalId('channel-appointment',[channel,conversationId,at]);
 if(!(lead.appointments||[]).some(item=>item.id===appointmentId))lead.appointments=[...(lead.appointments||[]),{id:appointmentId,scheduled_at:at,status:'scheduled',source:channel}];
 const from=lead.status;lead.status='Cita';lead.substatus='Confirmada';
 lead.stage_history=[...(lead.stage_history||[]),{from,to:'Cita',at,actor:actor||`${channel} · Histórico`,observed:false}];
 event(lead,'scheduled',actor||`${channel} · Histórico`,{scheduled_at:at,source:channel,conversation_id:conversationId},at);
 return true;
}
function importChannelHistory(data,input,actor='Sistema'){
 const channel=String(input?.channel||'WhatsApp').trim()||'WhatsApp';
 if(channel!=='WhatsApp')throw Error('Por ahora solo se permite importar historial de WhatsApp.');
 const conversations=Array.isArray(input?.conversations)?input.conversations:[];
 if(!conversations.length||conversations.length>500)throw Error('Indica entre 1 y 500 conversaciones para importar.');
 const leads=data.leads||[],matches=new Map(leads.map(lead=>[normalizedPhone(lead.phone),lead]).filter(([phone])=>phone));
 const initialReconciliation=input?.initial_reconciliation===true&&!data.settings?.aiIntegration?.history_reconciled_at;
 let conversationsMatched=0,messagesAdded=0,startsAdded=0,profilesMerged=0,appointmentsScheduled=0;
 const unmatched=[];
 for(const [index,conversation] of conversations.entries()){
  const phone=normalizedPhone(conversation?.phone||conversation?.contact_phone||conversation?.contact?.phone);
  const lead=matches.get(phone);
  if(!lead){unmatched.push({index,phone:phone||'Sin teléfono'});continue;}
  conversationsMatched++;
  const conversationId=String(conversation.id||conversation.conversation_id||phone||index).slice(0,240);
  const messages=messagesFor(conversation);
  if(messages.length>1000)throw Error('Cada conversación puede contener hasta 1000 mensajes.');
  const beforeConversation=(lead.comment_history||[]).length;
  const profileFields=mergeMissingProfile(lead,conversation);
  if(profileFields.length){profilesMerged+=profileFields.length;event(lead,'channel_profile_merged',actor,{channel,conversation_id:conversationId,fields:profileFields});}
  const firstMessageAt=messages.map(message=>iso(message?.at||message?.timestamp||message?.created_at)).filter(Boolean).sort()[0];
  const startedAt=iso(conversation.started_at||conversation.startedAt||conversation.created_at)||firstMessageAt;
  if(startedAt){
   const startRequest=externalId('channel-start',[channel,conversationId,startedAt]);
   const before=(lead.comment_history||[]).length;
   appendComment(lead,{requestId:startRequest,text:`${channel} · Inicio de conversación importado.`},`${channel} · Histórico`,startedAt);
   if((lead.comment_history||[]).length>before)startsAdded++;
   if(!lead.channel_history_started_at||startedAt<lead.channel_history_started_at)lead.channel_history_started_at=startedAt;
  }
  for(const [messageIndex,message] of messages.entries()){
   const text=String(message?.text||message?.body||message?.message||'').trim();
   const at=iso(message?.at||message?.timestamp||message?.created_at);
   if(!text||!at)continue;
   const sourceId=String(message?.id||message?.message_id||messageIndex);
   const requestId=externalId('channel-message',[channel,conversationId,sourceId,at,text]);
   const speaker=directionLabel(message);
   const before=(lead.comment_history||[]).length;
   appendComment(lead,{requestId,text:`${channel} · ${speaker}: ${text}`},`${channel} · ${speaker}`,at);
   if((lead.comment_history||[]).length>before)messagesAdded++;
  }
  // This reconciliation can occur once only. Existing appointment and later
  // stages never move; a prior chat changes only the traffic-light evidence.
  if(initialReconciliation&&applyInitialAppointment(lead,conversation,channel,conversationId,actor))appointmentsScheduled++;
  if((lead.comment_history||[]).length>beforeConversation)event(lead,'channel_history_imported',actor,{channel,conversation_id:conversationId,phone,started_at:startedAt||null,message_count:messages.length});
 }
 if(initialReconciliation&&conversationsMatched){data.settings={...(data.settings||{}),aiIntegration:{...(data.settings?.aiIntegration||{}),history_reconciled_at:new Date().toISOString()}};}
 if(conversationsMatched) return {conversations:conversationsMatched,messages_added:messagesAdded,starts_added:startsAdded,profiles_merged:profilesMerged,appointments_scheduled:appointmentsScheduled,initial_reconciliation:initialReconciliation,unmatched};
 return {conversations:0,messages_added:0,starts_added:0,profiles_merged:0,appointments_scheduled:0,initial_reconciliation:false,unmatched};
}

module.exports={normalizedPhone,importChannelHistory};
