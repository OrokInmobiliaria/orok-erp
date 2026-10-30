'use strict';
const {createHash}=require('node:crypto'),https=require('node:https');
const {WhatsAppService}=require('./whatsappService');
const {normalize}=require('./socialInbox');
const {applyLolaEvent}=require('./lolaIntegration');
const {phoneKey}=require('./leadImport');
const {appendComment}=require('./leadComments');
const {request}=require('./socialGateway');
const hash=v=>createHash('sha256').update(v).digest('hex');
const stamp=()=>new Date().toISOString();
function choiceId(t,text){
 const s=String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 if(t.booking?.phase==='confirm'&&t.booking.slot&&Date.parse(t.booking.expires_at)>Date.now()&&/^[12]$/.test(s))return 'orok:visitconfirm:'+(s==='1'?'yes':'no')+':'+t.booking.confirmation_id+':'+Math.floor(Date.parse(t.booking.slot.start)/1000);
 if(t.advisor_request&&!t.booking&&/^[123]$/.test(s))return 'orok:advisor:'+({'1':'whatsapp','2':'meet','3':'wait'}[s])+':'+t.advisor_request.id;
 if(t.cancellation&&Date.parse(t.cancellation.expires_at)>Date.now()){
  if(/^(si|si,? cancelar|cancelar|1)$/.test(s))return 'orok:cancel:yes:'+t.cancellation.id;
  if(/^(no|conservar(?: cita)?|2)$/.test(s))return 'orok:cancel:no:'+t.cancellation.id;
 }
 if(t.booking?.phase==='slots'&&/^[1-6]$/.test(s)){
  const slot=t.booking.slots?.[Number(s)-1];
  if(slot)return 'orok:'+(t.booking.flow==='reschedule'?'reslot':'slot')+':'+t.booking.id+':'+Math.floor(Date.parse(slot.start)/1000);
 }
 if(t.offer?.state==='pending'&&Date.parse(t.offer.expires_at)>Date.now()){
  const key={'1':'appointment','agendar cita':'appointment','2':'seller','hablar con asesor':'seller','hablar con un asesor':'seller','3':'showroom','visitar showroom':'showroom','visitar el showroom':'showroom'}[s];
  if(key)return 'orok:'+key+':'+t.offer.id;
 }
 return null;
}
function plainContent(content){
 if(content.type==='text')return content.text.body;
 if(content.type!=='interactive')throw Error('Este canal requiere una respuesta de texto.');
 const i=content.interactive;
 const rows=i.type==='button'?i.action.buttons.map(b=>b.reply.title):i.action.sections.flatMap(s=>s.rows.map(r=>r.title+(r.description?' · '+r.description:'')));
 return i.body.text+'\n\n'+rows.map((r,index)=>(index+1)+'. '+r).join('\n')+'\n\nResponde con el número de tu opción.';
}
function mediaDownload(url){return new Promise((resolve,reject)=>{
 let u;try{u=new URL(url);}catch{return reject(Error('Adjunto sin URL válida.'));}
 if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443'||!['lookaside.fbsbx.com','graph.facebook.com','graph.instagram.com'].includes(u.hostname)&&!['.fbcdn.net','.cdninstagram.com'].some(s=>u.hostname.endsWith(s)))return reject(Error('Servidor de adjunto no autorizado.'));
 const req=https.get(u,{timeout:15000},res=>{const parts=[];let size=0;if(res.statusCode!==200){res.resume();return reject(Error('El proveedor no confirmó la descarga del audio.'));}const mime=String(res.headers['content-type']||'').split(';')[0];if(!/^audio\//.test(mime)&&mime!=='video/mp4'){res.resume();return reject(Error('El adjunto no tiene un formato de audio compatible.'));}res.on('data',b=>{size+=b.length;if(size>16*1024*1024)res.destroy(Error('Audio demasiado grande.'));else parts.push(b);});res.on('error',reject);res.on('end',()=>resolve({bytes:Buffer.concat(parts),mime,filename:'audio-social'}));});req.on('error',reject);req.on('timeout',()=>req.destroy(Error('Descarga de audio vencida.')));
});}
function metaFieldKey(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');}
// R43 · respuestas propias de un formulario (sin los datos de contacto) para dejarlas como comentario del lead.
const CONTACT_KEYS=new Set(['full_name','name','nombre_y_apellidos','nombres_y_apellidos','nombre_completo','first_name','nombre','last_name','apellidos','email','e_mail','correo_electronico','phone_number','phone','mobile_phone','numero_de_telefono','telefono','celular']);
function metaFormAnswers(fieldData){return (fieldData||[]).map(i=>({k:metaFieldKey(i?.name),v:String((i?.values||[]).join(', ')||'').trim().slice(0,300)})).filter(x=>x.k&&x.v&&!CONTACT_KEYS.has(x.k)).slice(0,12).map(x=>x.k.replace(/_/g,' ').replace(/^./,c=>c.toUpperCase())+': '+x.v);}
// R65 · Respuestas del formulario de Meta en estructura (pregunta → respuesta) para el Kanban.
function metaFormPairs(fieldData){return (fieldData||[]).map(i=>({key:metaFieldKey(i?.name),k:String(i?.name||'').replace(/_/g,' ').trim().slice(0,140),v:String((i?.values||[]).join(', ')||'').trim().slice(0,200)})).filter(x=>x.key&&x.v&&!CONTACT_KEYS.has(x.key)).slice(0,15).map(({k,v})=>({k:k.replace(/^./,c=>c.toUpperCase()),v}));}
function metaLeadProfile(fieldData){
 const fields={};for(const item of fieldData||[]){const key=metaFieldKey(item?.name),value=String(item?.values?.[0]||'').trim();if(key&&value&&!fields[key])fields[key]=value;}
 const first=(...keys)=>keys.map(metaFieldKey).map(key=>fields[key]).find(Boolean)||'';
 const phone=first('phone_number','phone','mobile_phone','numero_de_telefono','telefono','celular');
 return {
  name:first('full_name','name','nombre_y_apellidos','nombres_y_apellidos','nombre_completo')||[first('first_name','nombre'),first('last_name','apellidos')].filter(Boolean).join(' '),
  email:first('email','e_mail','correo_electronico'),
  phone:/^\+?[\d ()-]{7,25}$/.test(phone)?phone:'',
  interest:first('interest','interes','proyecto_de_interes')
 };
}
class Omnichannel{
 constructor(store,config,whatsapp,social,options={}){this.store=store;this.config=config;this.whatsapp=whatsapp;this.social=social;this.cache=new Map();this.cursor=0;this.formRequester=options.formRequester||request;}
 engine(channel,account){
  if(!['instagram','messenger','tiktok'].includes(channel))throw Error('Canal común no reconocido.');
  const settings=this.social.gateway.setup()[channel];if(!settings?.enabled||settings.accountId!==account)throw Error('Cuenta de canal no habilitada.');
  const id='lola_'+channel+'_'+hash(account).slice(0,16);if(this.cache.has(id))return this.cache.get(id);
  const self=this;
  const gateway={
   setup(){const s=self.social.gateway.setup()[channel]||{},shared=self.whatsapp.gateway.setup();return {enabled:s.enabled,sendingEnabled:s.sendingEnabled,automaticEnabled:s.automaticEnabled,agendaEnabled:s.agendaEnabled===true&&shared.agendaEnabled===true,calendarId:shared.calendarId,environment:s.environment==='production'&&shared.environment==='production'?'production':'test',newConversationMode:s.automaticEnabled&&s.newConversationMode==='auto'?'auto':'observer',phoneNumberIds:[account]};},
   assertRecipient(a,recipient,{send=false,automatic=false}={}){const s=self.social.gateway.setup()[channel];if(a!==account||!s?.enabled)throw Error('Cuenta social no autorizada.');if(automatic&&!s.automaticEnabled)throw Error('Atención automática del canal desactivada.');if(send)self.social.gateway.assertSend({channel,account_id:account,contact_id:recipient});return s;},
   async send(a,recipient,content,options={}){this.assertRecipient(a,recipient,{send:true,automatic:options.automatic===true});const text=plainContent(content),messageId=await self.social.gateway.send({channel,account_id:account,contact_id:recipient},text);await self.social.ingest({channel,account_id:account,contact_id:recipient,message:{id:messageId,at:stamp(),direction:'outbound',type:'text',text}});return messageId;},
   async media(a,recipient,url){this.assertRecipient(a,recipient);if(self.store.persistence==='postgresql'){const thread=(await self.social.threads.doc(hash(channel+'\0'+account+'\0'+recipient)).get()).data();if(!thread?.lead_id)throw Error('Audio sin conversación identificada.');const row=(await self.engine(channel,account).thread(thread.lead_id).collection('messages').orderBy('sort_key','desc').limit(100).get()).docs.find(d=>d.data().attachments?.some(x=>x.url===url));if(!row)throw Error('El audio no pertenece a esta conversación reciente.');return mediaDownload(url);}const row=(await self.social.threads.doc(hash(channel+'\0'+account+'\0'+recipient)).collection('messages').orderBy('sort_key','desc').limit(100).get()).docs.find(d=>d.data().attachments?.some(x=>x.url===url));if(!row)throw Error('El audio no pertenece a esta conversación reciente.');return mediaDownload(url);}
  };
  const service=new WhatsAppService(this.store,this.config,{channel,namespace:id,gateway,drive:this.whatsapp.drive,normalizer:input=>input.normalized||{...input.message,account:input.business_phone_id,phone:input.phone,at:input.message.at,status:'sent',sender:input.message.sender||'Lola',referral:null,media:input.message.media||null},resolveContact:(data,m,input)=>data.leads.find(l=>input.lead_id?l.id===input.lead_id:l.external_ids?.[channel+':'+account]===m.phone)});
  service.alerts=this.whatsapp.alerts;
  service.identityForThread=t=>account+':'+t.phone;
  this.cache.set(id,service);return service;
 }
 engines(){const settings=this.social.gateway.setup(),out=[this.whatsapp,...(this.crm?[this.crm.engine]:[])];for(const c of ['instagram','messenger','tiktok'])if(settings[c]?.enabled)out.push(this.engine(c,settings[c].accountId));return out;}
 selected(id){const service=this.engines().find(s=>s.namespace===id);if(!service)throw Error('Motor de conversación no autorizado.');return service;}
 async ensureLead({channel,account,contact,eventId,profile={},at,source}){
  return this.store.run(({read,write})=>{
   const data=read(),scoped=channel+':'+account,identity=account+':'+contact;
   const matches=data.leads.filter(l=>l.external_ids?.[scoped]===contact||l.external_ids?.[channel]===identity||(profile.phone&&phoneKey(l.phone)===phoneKey(profile.phone))||(profile.email&&l.email?.toLowerCase()===profile.email.toLowerCase()));
   if(new Set(matches.map(l=>l.id)).size>1)throw Error('Los datos identifican leads distintos; revisa el vínculo antes de continuar.');
   const old=matches[0],event='common:'+hash(channel+'\0'+account+'\0'+eventId);
   const result=applyLolaEvent(data,{action:'lead_upsert',event_id:event,channel,chat_id:identity,source:old?undefined:source||channel,profile,received_at:at,project:data.settings?.projectName},'Lola · '+channel);
   const lead=data.leads.find(l=>l.id===result.lead_id);lead.external_ids={...lead.external_ids,[scoped]:contact};if(result.created&&!profile.name)lead.name='';if(!result.duplicate)write(data);return result;
  });
 }
 async ingest(input){
  const m=normalize(input),settings=this.social.gateway.setup()[m.channel];if(!settings?.enabled||settings.accountId!==m.account_id)throw Error('Cuenta social no habilitada.');
  const observed=await this.social.ingest(input);if(observed.ignored)return observed;const threadRef=this.social.ref(observed.thread_id),thread=(await threadRef.get()).data();
  let leadId=thread.lead_id;
  if(!leadId&&m.direction==='inbound'){const email=m.text.match(/[A-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?)+/i)?.[0];leadId=(await this.ensureLead({channel:m.channel,account:m.account_id,contact:m.contact_id,eventId:m.id,profile:{...(m.name?{name:m.name}:{}),...(email?{email:email.toLowerCase()}:{})},at:m.at})).lead_id;}
  if(!leadId)return observed;
  await this.store.db.runTransaction(async tx=>{const t=(await tx.get(threadRef)).data();tx.set(threadRef,{...t,lead_id:leadId});});
  const engine=this.engine(m.channel,m.account_id),state=(await engine.thread(leadId).get()).data()||{},button=input.message?.button_id||choiceId(state,m.text),audio=m.type==='audio'?m.attachments.find(a=>a.type==='audio'&&a.url):null;
  const common={id:m.id,account:m.account_id,phone:m.contact_id,direction:m.direction,type:audio?'audio':'text',original_type:m.type,attachments:m.attachments,text:m.text||(!audio?'Recibí un adjunto. Solicita al cliente describir su consulta por texto.':''),at:m.at,media:audio?{id:audio.url}:null,sender:m.direction==='inbound'?'Cliente':'Equipo · '+m.channel,name:m.name,referral:null,status:m.direction==='inbound'?'received':'sent'};
  const result=await engine.ingest({lead_id:leadId,normalized:common,message:{button_id:button}});
  return {...result,thread_id:observed.thread_id,channel:m.channel};
 }
 async claim(){const engines=this.engines();for(let i=0;i<engines.length;i++){const index=(this.cursor+i)%engines.length,s=engines[index],r=await s.claim();if(r.job){this.cursor=(index+1)%engines.length;return {ok:true,job:{...r.job,engine:s.namespace,channel:s.channel}};}}return {ok:true,job:null};}
 async action(p){
  if(p.action==='lola_job_claim')return this.claim();
  if(p.action==='lola_maintenance'){const rows=[];for(const e of this.engines())rows.push({engine:e.namespace,...await e.agenda.maintenance()});return {ok:true,engines:rows};}
  if(p.action==='lola_form')return this.form(p);
  const e=this.selected(p.engine);
  if(p.action==='lola_job_complete')return e.complete(p);
  if(p.action==='lola_job_media')return e.jobMedia(p);
  if(p.action==='lola_task_begin')return e.agenda.begin(p);
  if(p.action==='lola_task_complete')return e.agenda.complete(p);
  if(p.action==='lola_audio_route'){const j=(await e.jobs.doc(String(p.job_id)).get()).data();if(!j||j.lease_token!==p.lease_token)throw Error('Audio no autorizado.');return {ok:true,routed:await e.agenda.routeTranscript(j,String(p.transcript||''))};}
  throw Error('Operación común no reconocida.');
 }
 async form(p){
  if(!['meta','tiktok','web','plataforma','whatsapp'].includes(p.channel)||!/^[-\w:]{1,160}$/.test(String(p.event_id||''))||!/^[-\w:]{1,100}$/.test(String(p.account_id||'')))throw Error('Formulario sin canal, cuenta o evento válido.');
  const raw=p.profile||{},profile={};for(const k of ['name','email','phone','interest'])if(typeof raw[k]==='string')profile[k]=raw[k].trim().slice(0,300);
  if(profile.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email))throw Error('Correo de formulario inválido.');
  if(profile.phone&&!/^\+?[\d ()-]{7,25}$/.test(profile.phone))throw Error('Teléfono de formulario inválido.');
  if(!profile.email&&!profile.phone)throw Error('El formulario requiere un medio de contacto válido.');
  const r=await this.ensureLead({channel:p.channel,account:p.account_id,contact:String(p.contact_id||p.event_id),eventId:p.event_id,profile,at:p.received_at,source:p.source||p.channel+' · formulario'});
  return {...r,form_registered:true,message_sent:false,next_action:'Atender desde el CRM; un formulario no abre por sí solo una conversación de mensajería.'};
 }
 async metaForms(payload,channel,settings){
  const results=[];for(const entry of payload.entry||[])for(const change of entry.changes||[])if(change.field==='leadgen'){
   if(String(entry.id)!==settings.accountId||!/^\d{3,50}$/.test(String(change.value?.leadgen_id||'')))throw Error('Cuenta o formulario Meta no autorizado.');
   if(settings.environment!=='production'&&!settings.testLeadFormIds?.includes(String(change.value.form_id||'')))continue;
   const id=String(change.value.leadgen_id),u=new URL('https://graph.facebook.com/'+settings.apiVersion+'/'+id);u.searchParams.set('fields','id,created_time,field_data');
   const r=await this.formRequester(u.href,{headers:{Authorization:'Bearer '+settings.accessToken}});if(r.status!==200||r.data.id!==id||!Array.isArray(r.data.field_data))throw Error('Meta no devolvió los datos del formulario.');
   const out=await this.form({action:'lola_form',channel:'meta',account_id:settings.accountId,event_id:'leadgen:'+id,contact_id:id,received_at:r.data.created_time,source:'Meta · formulario',profile:metaLeadProfile(r.data.field_data)});
   // R43 · deja en el lead de qué formulario vino (KPIs por formulario en G.R.E.T.A) y sus respuestas como comentario. No cambia etapa ni orden del Kanban.
   const answers=metaFormAnswers(r.data.field_data),formId=/^\d{3,40}$/.test(String(change.value.form_id||''))?String(change.value.form_id):'';
   if(out.lead_id&&(formId||answers.length))await this.store.run(({read,write})=>{const data=read(),lead=data.leads.find(l=>l.id===out.lead_id);if(!lead)return;let changed=false;if(formId&&!lead.form_meta){lead.form_meta={form_id:formId,leadgen_id:id,at:r.data.created_time||new Date().toISOString()};changed=true;}if(answers.length&&!lead.form_answers?.length){lead.form_answers=metaFormPairs(r.data.field_data);changed=true;}if(answers.length&&!(lead.comment_history||[]).some(c=>c.request_id==='meta-form-'+id)){appendComment(lead,{text:'Respuestas del formulario de Meta:\n'+answers.map(a=>'- '+a).join('\n'),requestId:'meta-form-'+id},'Formulario Meta');changed=true;}if(changed)write(data);});
   results.push(out);
  }return results;
 }
}
module.exports={Omnichannel,choiceId,plainContent,mediaDownload,metaLeadProfile,metaFormAnswers};
