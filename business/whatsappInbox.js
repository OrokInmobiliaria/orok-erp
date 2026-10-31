'use strict';

// Observer-only inbox. There is intentionally no HTTP client or send operation
// in this module. Conversation messages live outside the Kanban snapshot.
const {createHash}=require('node:crypto');
const {leadDefaults,phoneKey}=require('./leadImport');
const {event}=require('./lifecycle');
const clean=(value,max=300)=>String(value??'').trim().slice(0,max);
const key=value=>createHash('sha256').update(value).digest('hex');
const STATES=['sent','delivered','read','failed'];
const MEDIA=['image','audio','video','document','sticker'];
function phone(value){const digits=clean(value,30).replace(/\D/g,'');return /^\d{7,15}$/.test(digits)?digits:'';}
function timestamp(value){
 const date=typeof value==='number'||/^\d{10,13}$/.test(String(value))?new Date(Number(value)*(String(value).length===10?1000:1)):new Date(value);
 if(!value||!Number.isFinite(date.getTime())||date.getTime()<Date.UTC(2000,0,1)||date.getTime()>Date.now()+5*60000)throw Error('Fecha del mensaje WhatsApp no válida.');
 return new Date(Math.min(date.getTime(),Date.now())).toISOString();
}
function normalizeMessage(input){
 const message=input?.message||input||{},id=clean(message.id||message.message_id,300),account=clean(input.business_phone_id,100),contact=phone(input.phone||input.chat_id),direction=clean(message.direction,20);
 if(!id||!account||!contact)throw Error('Falta el identificador de mensaje, número de negocio o teléfono WhatsApp.');
 if(!['inbound','outbound'].includes(direction))throw Error('Dirección WhatsApp no válida.');
 const type=clean(message.type||'text',30),at=timestamp(message.at||message.timestamp);
 const text=clean(message.text,10000),media=MEDIA.includes(type)?{id:clean(message.media?.id,300),mime_type:clean(message.media?.mime_type,100),filename:clean(message.media?.filename,200),caption:clean(message.media?.caption,2000)}:null;
 if(type==='text'&&!text)throw Error('El mensaje de texto está vacío.');
 return {id,account,phone:contact,direction,type,at,text,media,sender:direction==='inbound'?'Cliente':clean(message.sender,100)||'Equipo externo',name:clean(input.name,200),referral:referral(input.referral),status:direction==='inbound'?'received':STATES.includes(message.status)?message.status:'sent'};
}
function referral(value){
 if(!value||typeof value!=='object')return null;
 const result={};for(const field of ['source_id','source_type','source_url','headline','body','ctwa_clid','campaign_name','adset_name','ad_name'])if(value[field])result[field]=clean(value[field],field==='body'?1000:400);
 return Object.keys(result).length?result:null;
}
function statusUpdate(previous,incoming,at){
 const next={...(previous||{})},rank={sent:1,failed:1,delivered:2,read:3};
 if(!STATES.includes(incoming))throw Error('Estado WhatsApp no válido.');
 // An out-of-order sent/failed callback must never erase a delivered/read state.
 if(!next.status||rank[incoming]>rank[next.status]||(rank[incoming]===rank[next.status]&&at>String(next.status_at||''))){next.status=incoming;next.status_at=at;}
 next.status_times={...(next.status_times||{}),[incoming]:[next.status_times?.[incoming],at].filter(Boolean).sort()[0]};
 return next;
}
function findContact(data,contact){
 const matches=(data.leads||[]).filter(lead=>phoneKey(lead.phone)===phoneKey(contact)||phoneKey(lead.external_ids?.whatsapp)===phoneKey(contact));
 if(matches.length>1)throw Error('Hay más de un lead con este WhatsApp. Revisa el duplicado antes de asociar mensajes.');
 if(matches.length)return matches[0];
 if((data.archived_leads||[]).some(lead=>phoneKey(lead.phone)===phoneKey(contact)))throw Error('Este WhatsApp pertenece a un lead archivado; requiere revisión manual.');
 return null;
}
function legacyMessages(lead){
 return (lead.comment_history||[]).filter(item=>/^WhatsApp\s*·/i.test(String(item.text||''))).map(item=>({id:'legacy-'+item.id,at:item.at,text:item.text,sender:item.author||'Histórico importado',direction:'historical',type:'text',status:'imported',historical:true}));
}
class WhatsAppInbox{
 constructor(store,options={}){this.store=store;this.namespace=options.namespace||'whatsapp';this.channel=options.channel||'whatsapp';this.normalizer=options.normalizer||normalizeMessage;this.resolveContact=options.resolveContact||((data,m)=>findContact(data,m.phone));this.threads=store.ref.collection(this.namespace+'_threads');this.receipts=store.ref.collection(this.namespace+'_receipts');}
 thread(leadId){return this.threads.doc(key(String(leadId)));}
 async ingest(input){
  const message=this.normalizer(input),receiptRef=this.receipts.doc(key(message.account+'\0'+message.id));
  return this.store.run(async({tx,read,write})=>{
   const data=read(),receipt=await tx.get(receiptRef),previous=receipt.exists?receipt.data():{};
   if(previous.message_recorded)return {ok:true,duplicate:true,lead_id:previous.lead_id,writes:0,reply_disabled:true};
   let lead=this.resolveContact(data,message,input),created=false;
   if(!lead&&input.historical)return {ok:true,skipped:'historial_sin_lead',writes:0,reply_disabled:true};
   if(!lead){
    if(message.direction!=='inbound')throw Error('Un mensaje saliente no puede crear un lead sin identificar.');
    lead=leadDefaults({name:message.name||message.phone,phone:message.phone,status:'Lead Inicial',source:message.referral?.source_type==='ad'?'Meta · WhatsApp':'WhatsApp',project:data.settings?.projectName||'Infinity 224',received_at:message.at,received_date_source:'WhatsApp · observador',sales_owner:data.settings?.defaultSalesOwner||data.settings?.agentName||'',events:[],milestones:{},external_ids:{whatsapp:message.phone},history_complete:true},data.leads||[]);
    event(lead,'received','WhatsApp · observador',{ingress_source:'WhatsApp · solo registro'},message.at);
    data.leads=[...(data.leads||[]),lead];created=true;
   }
   const threadRef=this.thread(lead.id),snapshot=await tx.get(threadRef),thread=snapshot.exists?snapshot.data():{lead_id:lead.id,phone:message.phone,mode:'observer',message_count:0};
   const receiptStatus=message.direction==='outbound'?statusUpdate(previous,message.status,message.at):{};
   const row={id:message.id,at:message.at,sort_key:message.at+'_'+receiptRef.id,business_phone_id:message.account,direction:message.direction,type:message.type,text:message.text,sender:message.sender,media:message.media,...(message.attachments?{attachments:message.attachments,original_type:message.original_type||message.type}:{}),referral:message.referral,status:message.status,...receiptStatus};
   const lastAt=String(thread.last_message_at||'');
   const next={...thread,mode:thread.mode||'observer',message_count:Number(thread.message_count||0)+1,updated_at:new Date().toISOString()};
   if(message.at>=lastAt){next.last_message_at=message.at;next.last_preview=(message.text||message.media?.caption||'['+message.type+']').slice(0,160);}
   if(message.direction==='inbound'&&message.at>String(thread.last_inbound_at||''))next.last_inbound_at=message.at;
   if(message.referral)next.last_referral=message.referral;
   // All reads precede writes. Existing leads are deliberately left byte-for-byte unchanged.
   tx.set(threadRef,next);tx.set(threadRef.collection('messages').doc(receiptRef.id),row);
   tx.set(receiptRef,{...previous,...receiptStatus,message_recorded:true,lead_id:lead.id,thread_id:threadRef.id,message_id:message.id,business_phone_id:message.account});
   if(created)write(data);
   return {ok:true,duplicate:false,created,lead_id:lead.id,reply_disabled:true};
  });
 }
 async status(input){
  const id=clean(input.message_id,300),account=clean(input.business_phone_id,100),at=timestamp(input.at||input.timestamp),status=clean(input.status,20);
  if(!id||!account||!STATES.includes(status))throw Error('Actualización de estado WhatsApp no válida.');
  const ref=this.receipts.doc(key(account+'\0'+id));
  return this.store.db.runTransaction(async tx=>{
   const receipt=await tx.get(ref),old=receipt.exists?receipt.data():{},updated=statusUpdate(old,status,at);
   let messageRef,snapshot;
   if(old.message_recorded){messageRef=this.threads.doc(old.thread_id).collection('messages').doc(ref.id);snapshot=await tx.get(messageRef);}
   if(JSON.stringify(updated)===JSON.stringify(old))return {ok:true,duplicate:true,reply_disabled:true};
   tx.set(ref,{...updated,message_id:id,business_phone_id:account});
   if(snapshot?.exists)tx.set(messageRef,{...snapshot.data(),status:updated.status,status_at:updated.status_at,status_times:updated.status_times});
   return {ok:true,duplicate:false,reply_disabled:true};
  });
 }
 async conversation(leadId,options={},data){
  const lead=(data.leads||[]).find(item=>item.id===leadId);if(!lead)throw Error('Lead no encontrado.');
  const limit=Math.min(50,Math.max(1,Number(options.limit)||50));
  const before=clean(options.before,100);
  if(before&&!/^\d{4}-\d{2}-\d{2}T[\d:.]+Z_[a-f0-9]{64}$/.test(before))throw Error('Página de conversación no válida.');
  const threadRef=this.thread(leadId),thread=await threadRef.get();
  let query=threadRef.collection('messages').orderBy('sort_key','desc');if(before)query=query.startAfter(before);
  const result=await query.limit(limit+1).get(),rows=result.docs.map(doc=>doc.data()),hasMore=rows.length>limit,messages=rows.slice(0,limit);
  const saved=thread.exists?thread.data():{},last=saved.last_inbound_at,expires=last?new Date(Date.parse(last)+24*3600000).toISOString():null;
  return {lead_id:leadId,mode:'observer',send_enabled:false,lola_enabled:false,active_responder:'Externo / LeadCenter',message_count:saved.message_count||0,last_inbound_at:last||null,window_expires_at:expires,window_open:!!expires&&Date.parse(expires)>Date.now(),last_referral:saved.last_referral||null,messages:messages.reverse(),has_more:hasMore,next_before:hasMore?rows[limit-1].sort_key:null,legacy:before?[]:legacyMessages(lead)};
 }
}
function metaEvents(payload){
 if(payload?.object!=='whatsapp_business_account')throw Error('Evento Meta no válido.');
 const output=[];
 for(const entry of payload.entry||[])for(const change of entry.changes||[]){
  if(change.field==='history'){const value=change.value||{},account=clean(value.metadata?.phone_number_id,100),own=String(value.metadata?.display_phone_number||'').replace(/\D/g,'');
   for(const h of value.history||[])for(const th of h.threads||[])for(const message of th.messages||[]){const contactId=String(th.id||'').replace(/\D/g,''),from=String(message.from||'').replace(/\D/g,''),outbound=from!==contactId||(own&&from===own),type=message.type;
    output.push({kind:'message',historical:true,business_phone_id:account,phone:contactId,message:{id:message.id,at:message.timestamp,direction:outbound?'outbound':'inbound',sender:outbound?'Equipo · historial del celular':undefined,type,text:message.text?.body||(type&&type!=='text'?'['+type+']':''),media:message[type],historical:true}});}
   continue;}
  if(!['messages','smb_message_echoes'].includes(change.field))continue;const value=change.value||{},account=clean(value.metadata?.phone_number_id,100);
  for(const message of (change.field==='smb_message_echoes'?value.message_echoes:value.messages)||[]){
   const outbound=change.field==='smb_message_echoes';
   const contact=(value.contacts||[]).find(contact=>contact.wa_id===message.from),type=message.type;
   let text=message.text?.body||message.button?.text||message.interactive?.button_reply?.title||message.interactive?.list_reply?.title||'';
   if(type==='interactive'&&message.interactive?.nfm_reply?.response_json){let fields;try{fields=JSON.parse(message.interactive.nfm_reply.response_json);}catch{throw Error('Formulario WhatsApp inválido.');}if(!fields||typeof fields!=='object'||Array.isArray(fields))throw Error('Formulario WhatsApp inválido.');text=Object.entries(fields).filter(([k,v])=>k!=='flow_token'&&typeof v==='string').map(([k,v])=>k+': '+v.slice(0,1000)).join('\n').slice(0,10000)||'Formulario recibido';}
   if(type==='location')text='Ubicación compartida: '+clean(message.location?.name||message.location?.address||'',400);
   output.push({kind:'message',business_phone_id:account,phone:outbound?message.to:message.from,name:contact?.profile?.name,referral:message.referral,message:{id:message.id,at:message.timestamp,direction:outbound?'outbound':'inbound',sender:outbound?'Equipo · WhatsApp/Mac':undefined,reply_to:message.context?.id||null,type,text,media:message[type],button_id:message.interactive?.button_reply?.id||message.button?.payload||message.interactive?.list_reply?.id||null}});
  }
  for(const status of value.statuses||[])if(STATES.includes(status.status))output.push({kind:'status',business_phone_id:account,message_id:status.id,status:status.status,at:status.timestamp});
 }
 if(output.filter(e=>!e.historical).length>100)throw Error('El lote WhatsApp supera 100 eventos.');return output.slice(0,5000);
}
module.exports={WhatsAppInbox,normalizeMessage,metaEvents,statusUpdate,legacyMessages};
