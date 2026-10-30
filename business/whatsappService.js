'use strict';
const {createHash,randomUUID}=require('node:crypto');
const {WhatsAppInbox,normalizeMessage}=require('./whatsappInbox');
const {WhatsAppGateway,publicSetup,saveSetup}=require('./whatsappGateway');
const {WhatsAppAgenda}=require('./whatsappAgenda');
const {WhatsAppRecovery}=require('./whatsappRecovery');
const hash=v=>createHash('sha256').update(v).digest('hex'),now=()=>new Date().toISOString();
const {ECONOMIC,unauthorizedReply,validateLinks,resources}=require('./lolaPolicy');
const {buyer,eligible:careReason}=require('./customerCare');
const {LolaDrive}=require('./lolaDrive');
const {ConversationMemory,continueReply}=require('./conversationMemory');
const {AutomaticFollowup,inspect:inspectFollowup}=require('./automaticFollowup');
const {attachment:validateAttachment,AttachmentArchive}=require('./whatsappAttachment');
const {AdvisorAlerts}=require('./advisorRouting');
const {conversationGuidance}=require('./bankEvaluationService');
const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const ECONOMIC_REPLY='Esa información comercial la revisará contigo un asesor. Puedo brindarte más información general sobre el proyecto o ayudarte a continuar con una de estas opciones.';
const OPT_OUT=/\b(no (?:quiero|deseo) (?:recibir|mas)|no me (?:escribas|escriban|contactes|contacten)|darme de baja|elimina mis datos|baja de mensajes)\b|^\s*(?:baja|stop|unsubscribe)\s*$/;
function explicitResume(text){return /^(?:\/(?:ensayo_|lola_)?retomar|quiero (?:retomar (?:la conversacion|con lola)|volver a hablar con lola)|deseo retomar la conversacion)[.!\s]*$/.test(normalize(text).trim());}
function captureExplicitProfile(lead,text){
 if(!lead)return false;let changed=false;const s=String(text||'').trim(),email=s.match(/[A-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?)+/i)?.[0],name=s.match(/^(?:me llamo|mi nombre es|soy)\s+([\p{L}][\p{L} .'-]{1,99})(?:[,.!]|$)/iu)?.[1]?.trim();
 for(const [key,value] of [['email',email?.toLowerCase()],['name',name]])if(value&&lead[key]!==value){lead[key]=value;changed=true;}
 if(changed)lead.lola_profile_confirmed_at=now();return changed;
}
const CHOICES={appointment:'Agendar cita',seller:'Hablar con asesor',showroom:'Visitar showroom'};
function validateOutput(raw,job){
 let out=raw?.output??raw;if(typeof out==='string'){try{out=JSON.parse(out.replace(/^```(?:json)?\s*|\s*```$/g,''));}catch{throw Error('Lola no devolvió el objeto JSON esperado.');}}
 if(!out||typeof out.reply!=='string'||!out.reply.trim()||out.reply.length>450)throw Error('La respuesta de Lola debe ser completa y tener hasta 450 caracteres.');
 if(/\b(?:cita|visita)\b.{0,45}\b(?:confirmada|agendada|reservada|reprogramada|cancelada|anulada)\b|\b(?:agende|reserve|reprograme|cancele|anule)\b.{0,40}\b(?:cita|visita)\b/.test(normalize(out.reply)))throw Error('Una confirmación de cita requiere el resultado comprobado de Calendar; el modelo no puede emitirla.');
 if(/\b(?:gnb|banco)\b.{0,55}\b(?:aprobad[oa]|preaprobad[oa])\b|\b(?:aprobad[oa]|preaprobad[oa])\b.{0,55}\b(?:gnb|banco)\b/.test(normalize(out.reply))&&job.bank_evaluation_status!=='Aprobada')throw Error('La aprobación bancaria solo puede comunicarse cuando el CRM registra el estado Aprobada.');
 for(const k of ['handoff','opt_out','commercial_answer'])if(typeof out[k]!=='boolean')throw Error('La respuesta de Lola no cumple el esquema.');
 if(!Array.isArray(out.commercial_evidence)||!out.profile||typeof out.profile!=='object'||Array.isArray(out.profile))throw Error('Faltan perfil o evidencias de Lola.');
 const fields=['name','phone','email','interest','purchase_method','initial_payment'];for(const k of fields)if(out.profile[k]!==null&&typeof out.profile[k]!=='string')throw Error('Perfil de Lola no válido.');
 // Pricing deferral is deterministic, including when the LLM forgets the rule.
 if(OPT_OUT.test(normalize(job.text))||out.opt_out)return {...out,reply:'Entendido. No recibirás más mensajes automáticos de Lola.',opt_out:true,handoff:false,commercial_answer:false,commercial_evidence:[]};
 if(ECONOMIC.test(normalize(job.text)))return {...out,reply:ECONOMIC_REPLY,handoff:true,commercial_answer:false,commercial_evidence:[]};
 if(/(?:S\/|\$|USD|PEN)\s*\d|\d[\d.,]*\s*(?:soles|dolares|%)/i.test(normalize(out.reply)))throw Error('La respuesta contiene cifras comerciales; requiere revisión humana.');
 if(unauthorizedReply(out.reply))return {...out,reply:ECONOMIC_REPLY,handoff:true,commercial_answer:false,commercial_evidence:[]};
 if((/cumplea[nñ]os|feliz cumple|nuevo a[nñ]o de vida/i.test(out.reply)||/cumplea[nñ]os|mi cumple/i.test(job.text||'')&&/felicidades|felicitaciones/i.test(out.reply))&&job.customer_context?.birthday_greeting_allowed!==true)throw Error('No se permite felicitar cumpleaños sin comprador, fecha y permiso verificados.');
 validateLinks(out.reply,job.approved_resources||[]);
 // n8n supplies observations of tool execution separately from the model JSON.
 // A model inventing commercial_evidence cannot certify its own claims.
 const commercialClaim=/\b(?:dormitorios?|tipologias?|disponib(?:le|les|ilidad)|stock|cuarzo|cerradura|automatizadas|granita|vanitory|cocina tipo puente)\b|\d[\d.,]*\s*m(?:2|²)/i.test(out.reply);
 if(out.commercial_answer||commercialClaim){
  const observed=raw?.observed_evidence||[];
  if(!out.commercial_evidence.length||out.commercial_evidence.some(e=>!['Catalogo_comercial_Sheets','Caracteristicas_comerciales_Supabase','Carpeta_autorizada_GDrive'].includes(e.tool)||!e.data||!observed.some(o=>o.tool===e.tool&&(typeof o.data==='string'?o.data:JSON.stringify(o.data)).includes(String(e.data)))))throw Error('No se pudo verificar la evidencia comercial de esta ejecución.');
 }
 out.reply=continueReply(out.reply,job.memory);return out;
}
class WhatsAppService extends WhatsAppInbox{
 constructor(store,config={},options={}){super(store,options);this.config=config;this.attachmentArchive=new AttachmentArchive(config.privateDir);this.drive=options.drive||new LolaDrive(config);this.gateway=options.gateway||new WhatsAppGateway(config.privateDir);this.jobs=store.ref.collection(this.namespace+'_jobs');this.outbox=store.ref.collection(this.namespace+'_outbox');this.agenda=new WhatsAppAgenda(this);this.recovery=new WhatsAppRecovery(this);this.memory=new ConversationMemory(this);this.followups=new AutomaticFollowup(this);this.alerts=new AdvisorAlerts(this);}
 async ingest(input){
  const probe=this.normalizer(input),routing=require('./advisorRouting'),setup=this.gateway.setup();
  const officialAdvisor=routing.SALES.phones.includes(probe.phone),testAdvisor=setup.environment==='test'&&setup.testAdvisorPhone===probe.phone;
  if(this.channel==='whatsapp'&&probe.direction==='inbound'&&(officialAdvisor||testAdvisor)){
   if(input.message?.reply_to){const receipt=(await this.receipts.doc(hash(probe.account+'\0'+input.message.reply_to)).get()).data();if(receipt?.internal_notification&&receipt.lead_id){if(probe.text.trim()==='/asesor')return this.takeover(receipt.lead_id,'Asesor interno '+probe.phone);return {ok:true,internal_notification:true,reply_disabled:true};}}
   if(officialAdvisor)return {ok:true,internal_notification:true,unresolved_control:true,reply_disabled:true};
  }
  if(probe.direction==='outbound'&&(await this.receipts.doc(hash(probe.account+'\0'+probe.id)).get()).data()?.internal_notification)return {ok:true,internal_notification:true,reply_disabled:true};
  const result=await super.ingest(input),m=this.normalizer(input),ref=this.receipts.doc(hash(m.account+'\0'+m.id));
  await this.store.run(async({tx,read,write})=>{
   const rs=await tx.get(ref),r=rs.data();if(r.automation_processed)return;
   const tr=this.thread(result.lead_id),ts=await tx.get(tr),saved=ts.data(),t={...saved},jr=this.jobs.doc(hash('reply\0'+m.account+'\0'+m.id)),oldJob=await tx.get(jr);
   const initialMode=this.gateway.setup().newConversationMode;
   const recoveryChoice=/^orok:recovery:(continue|stop):([a-f0-9]{64})$/.exec(String(input.message?.button_id||''));
   const pendingRecovery=saved.recovery?.state==='opened_not_confirmed'||['template_sending','template_accepted','unknown','accepted_unrecorded'].includes(saved.recovery?.state);
   const recoveryStop=m.direction==='inbound'&&!!saved.recovery?.template_delivery&&(recoveryChoice?.[1]==='stop'&&saved.recovery.id===recoveryChoice[2]||pendingRecovery&&/^(?:no,? gracias|no (?:quiero|deseo) continuar)[.!\s]*$/.test(normalize(m.text).trim()));
   const recoveryStart=saved.recovery?.template_delivery?.requested_at||saved.recovery?.opened_at;
   const recoveryReply=m.direction==='inbound'&&pendingRecovery&&m.at>=new Date(Math.floor(Date.parse(recoveryStart)/1000)*1000).toISOString();
   if(recoveryReply){const lead=read().leads.find(l=>l.id===result.lead_id);t.recovery={...saved.recovery,state:recoveryStop?'declined':'customer_replied',replied_at:m.at};if(!recoveryStop&&saved.recovery.resume_lola&&!t.opt_out&&!lead?.opt_out&&!lead?.lola_paused&&!t.handoff){t.mode='auto';t.control_version=(t.control_version||0)+1;}}

   if(m.direction==='inbound'&&t.message_count===1&&initialMode==='auto'&&!t.opt_out)t.mode='auto';
   const resumed=m.direction==='inbound'&&explicitResume(m.text);
   if(resumed&&t.opt_out){t.opt_out=false;t.mode='auto';t.handoff=null;t.offer=null;t.booking=null;t.control_version=(t.control_version||0)+1;}
   const next={...t,business_phone_id:m.account,channel:this.channel};
   if(m.direction==='inbound'&&t.message_count===1&&m.referral?.source_id&&m.referral.source_type==='ad')next.first_referral={...m.referral,at:m.at};
   let job=null;
   if(m.direction==='outbound'){
    // Messages written on the phone/Mac suspend Lola, including a pending draft.
    next.mode='manual';next.control_version=(t.control_version||0)+1;next.suggestion=null;next.mode_actor=m.sender;next.mode_reason='Intervención desde WhatsApp';
   }else if(!t.last_handled_at||m.at>=t.last_handled_at){
    next.last_handled_at=m.at;next.last_inbound_message_id=m.id;next.generation=(t.generation||0)+1;next.suggestion=null;
    const selection=/^orok:(appointment|seller|showroom):([a-f0-9]{24})$/.exec(String(input.message?.button_id||''));
    const optedOut=recoveryStop||OPT_OUT.test(normalize(m.text));
    const data=read(),lead=data.leads.find(l=>l.id===result.lead_id);
    if(this.channel!=='crm'&&!resumed&&lead?.lola_paused&&lead.handoff_status==='accepted'){t.mode='manual';next.mode='manual';}
    const captured=t.mode==='auto'&&captureExplicitProfile(lead,m.text);
    if(resumed){lead.opt_out=false;lead.lola_paused=false;lead.lola_resume_at=now();next.resumed_at=now();next.resume_message_id=m.id;tx.set(tr.collection('audit').doc(hash('resume:'+m.id)),{action:'explicit_resume',at:now(),message_id:m.id,channel:this.channel});}
    const plan=optedOut?null:this.agenda.plan({data,lead,t,next,m,input});
    if(captured||resumed)write(data);
    if(plan){job=plan.job;if(plan.changed)write(data);}
    else if(selection&&t.offer?.id===selection[2]&&t.offer?.state==='pending'&&Date.parse(t.offer.expires_at)>Date.now()){
     next.offer={...t.offer,state:'accepted',choice:selection[1],selected_at:now()};next.handoff={choice:selection[1],at:now(),status:'Pendiente de coordinación humana'};next.mode=selection[1]==='seller'?'manual':t.mode;next.control_version=(t.control_version||0)+1;
     if(t.mode==='auto')job={fixed_reply:'Recibimos tu elección: '+CHOICES[selection[1]]+'. El equipo de ventas debe coordinar contigo; todavía no hay una cita confirmada.'};
    }else if(optedOut){
     next.opt_out=true;next.mode='manual';next.control_version=(t.control_version||0)+1;
     this.agenda.crm(data,lead,next,'opt_out',m.id,{note:'Solicitó no recibir más mensajes por WhatsApp.'});write(data);
     if(t.mode==='auto'&&!t.opt_out)job={fixed_reply:'Entendido. No recibirás más mensajes automáticos de Lola.',opt_out_ack:true};
    }else if(['auto','suggest'].includes(t.mode)&&!t.opt_out&&!selection){job={};}
    if(job&&!oldJob.exists){job={...job,id:jr.id,lead_id:result.lead_id,account:m.account,phone:m.phone,message_id:m.id,text:m.text,type:m.type,media:m.media,mode:t.mode,control_version:next.control_version||0,generation:next.generation,state:'queued',created_at:now(),attempts:0};}
   }
   if(job&&!oldJob.exists)next.last_job_id=jr.id;tx.set(tr,next);tx.set(ref,{...r,automation_processed:true});if(job&&!oldJob.exists)tx.set(jr,job);
  });if(!result.duplicate)await this.memory.capture(result.lead_id,m);const {reply_disabled,...ingress}=result;return {...ingress,processing_async:true};
 }
 async conversation(leadId,options,data){
  const base=await super.conversation(leadId,options,data),snap=await this.thread(leadId).get(),t=snap.exists?snap.data():{},s=this.gateway.setup(),account=t.business_phone_id||(s.phoneNumberIds?.length===1?s.phoneNumberIds[0]:null),p=(data.leads||[]).find(l=>l.id===leadId);
  let available=false;try{this.gateway.assertRecipient(account,String(t.phone||p?.phone||'').replace(/\D/g,''),{send:true});available=true;}catch{}
  const job=t.last_job_id?(await this.jobs.doc(t.last_job_id).get()).data():null,send=t.last_send_id?(await this.outbox.doc(t.last_send_id).get()).data():null;
  return {...base,followup_consent:p?.whatsapp_followup_consent||null,followup_status:inspectFollowup(data,p,t),automatic_followup:t.auto_followup||null,recovery:t.recovery||null,proposed_profile:t.proposed_profile||null,lola_status:job?{state:job.state,reason:job.reason||null}:null,last_send:send?{state:send.state,error:send.error||null}:null,mode:t.mode||'observer',control_version:t.control_version||0,send_enabled:available&&base.window_open&&!t.opt_out&&t.mode==='manual',lola_enabled:s.enabled===true&&s.automaticEnabled===true,active_responder:t.mode==='auto'?'Lola':t.mode==='observer'?'Externo / LeadCenter':'Equipo de ventas',opt_out:t.opt_out===true,suggestion:t.suggestion||null,handoff:t.handoff||null,mode_reason:t.mode_reason||null,connection:publicSetup(s),audio_conversion:!!s.ffmpegPath};
 }
 async mode(leadId,input,actor){
  if(!['observer','manual','suggest','auto'].includes(input.mode))throw Error('Modo de atención no válido.');
  return this.store.run(async({tx,read,write})=>{
   const data=read(),lead=data.leads.find(l=>l.id===leadId);if(!lead)throw Error('Lead no encontrado.');const ref=this.thread(leadId),snapshot=await tx.get(ref),t=snapshot.exists?snapshot.data():{lead_id:leadId,phone:String(lead.phone||'').replace(/\D/g,''),message_count:0};
   if(Number(input.version)!==Number(t.control_version||0))throw Error('El modo cambió en otra pantalla. Actualiza la conversación.');
   if(['auto','suggest'].includes(input.mode)){
    this.gateway.assertRecipient(t.business_phone_id||this.gateway.setup().phoneNumberIds?.[0],t.phone,{send:input.mode==='auto',automatic:input.mode==='auto'});
    if(t.opt_out)throw Error('El contacto solicitó la baja. No se puede reactivar Lola desde este control.');
    if(t.handoff&&!input.resolve_handoff||lead.lola_paused&&lead.handoff_status==='accepted'&&!input.resolve_handoff)throw Error('Hay una derivación pendiente. Confirma su atención antes de reactivar Lola.');
   }
   if(input.resolve_handoff===true){if(!String(input.reason||'').trim())throw Error('Indica cómo se atendió la derivación.');t.handoff=null;lead.lola_paused=false;lead.handoff_status='resolved';write(data);}
   const next={...t,mode:input.mode,control_version:(t.control_version||0)+1,suggestion:null,mode_actor:actor,mode_at:now(),mode_reason:String(input.reason||'Cambio manual').slice(0,300),...(input.mode==='manual'&&t.booking?{booking:{...t.booking,phase:'interrupted'}}:{})};
   tx.set(ref,next);tx.set(ref.collection('audit').doc(randomUUID()),{at:now(),actor,action:'mode',from:t.mode||'observer',to:input.mode,reason:next.mode_reason});return {ok:true,mode:next.mode,version:next.control_version};
  });
 }
 async takeover(leadId,actor){return this.store.run(async({tx,read,write})=>{const d=read(),l=d.leads.find(x=>x.id===leadId);if(!l)throw Error('Lead no encontrado.');const ref=this.thread(leadId),t=(await tx.get(ref)).data()||{};tx.set(ref,{...t,lead_id:leadId,mode:'manual',control_version:(t.control_version||0)+1,suggestion:null,mode_actor:actor,mode_reason:'Toma de control mediante /asesor',handoff:{choice:'seller',at:now(),status:'Asesor tomó el control'}});l.lola_paused=true;l.handoff_status='accepted';require('./lifecycle').event(l,'advisor_takeover',actor,{channel:this.channel});write(d);return {ok:true,control_command:true,mode:'manual',message_sent_to_customer:false};});}
 async send(leadId,input,actor,{audio=null,attachment=null,automatic=false,expected=null,followup=false}={}){
  if(audio&&attachment)throw Error('Selecciona un solo archivo.');
  if(attachment)attachment=validateAttachment(attachment);
  if(!automatic&&String(input.text||'').trim()==='/asesor')return this.takeover(leadId,actor);
  if(!/^[a-f0-9-]{36}$/.test(input.request_id||''))throw Error('Identificador de envío no válido.');
  const ref=this.outbox.doc(hash(leadId+'\0'+input.request_id)),fingerprint=hash(JSON.stringify({text:input.text||'',buttons:input.buttons||null,list:input.list||null,audio:audio?hash(audio.bytes):null,...(attachment?{attachment:{hash:hash(attachment.bytes),mime:attachment.mime,filename:attachment.filename}}:{})}));
  const prepared=await this.store.run(async({tx,read})=>{
   const lead=read().leads.find(l=>l.id===leadId);if(!lead)throw Error('Lead no encontrado.');const ts=await tx.get(this.thread(leadId)),os=await tx.get(ref),t=ts.exists?ts.data():{};
   if(os.exists){const old=os.data();if(old.fingerprint!==fingerprint)throw Error('La solicitud corresponde a otro mensaje.');if(old.state==='sent')return {...old,duplicate:true};throw Error('Este envío ya fue intentado. Revisa su estado antes de crear otro mensaje.');}
   if(this.channel!=='crm'&&(!t.last_inbound_at||Date.parse(t.last_inbound_at)+86400000<=Date.now()))throw Error('La ventana de 24 horas está cerrada. Usa Retomar con plantilla aprobada por Meta.');
   if(automatic){if(!expected||Number(t.control_version||0)!==expected.control_version||t.generation!==expected.generation||(!expected.fixed_reply&&t.mode!=='auto'))throw Error('Lola fue pausada o recibió otro mensaje; se descartó esta respuesta.');}
   else if(t.mode!=='manual')throw Error('Selecciona Manual antes de enviar.');
   if(t.opt_out&&!expected?.opt_out_ack)throw Error('El contacto solicitó no recibir mensajes.');
   const account=t.business_phone_id,phone=t.phone;this.gateway.assertRecipient(account,phone,{send:true,automatic});
   const text=String(input.text||'').trim();if((!audio&&!attachment&&!text)||text.length>(attachment?1024:4096))throw Error('Escribe un mensaje de hasta 4096 caracteres.');
   const value={state:'sending',lead_id:leadId,account,phone,text,actor,request_id:input.request_id,fingerprint,created_at:now(),control_version:t.control_version||0,generation:t.generation||0};tx.set(ref,value);tx.set(this.thread(leadId),{...t,last_send_id:ref.id});return value;
  });
  if(prepared.duplicate)return {ok:true,duplicate:true,message_id:prepared.message_id};
  let acceptedId=null;
  try{
   let content={type:'text',text:{body:prepared.text,preview_url:false}},media=null;
   if(audio){const converted=await this.gateway.convertAudio(audio.bytes,audio.mime),id=await this.gateway.uploadAudio(prepared.account,prepared.phone,converted.bytes,converted.mime);content={type:'audio',audio:{id}};media={id,mime_type:converted.mime};}
   else if(attachment){const id=await this.gateway.uploadAttachment(prepared.account,prepared.phone,attachment);content={type:attachment.type,[attachment.type]:{id,...(attachment.type==='document'?{filename:attachment.filename}:{}),...(prepared.text?{caption:prepared.text}:{})}};media={id,mime_type:attachment.mime,filename:attachment.filename,caption:prepared.text};}
   else if(input.buttons){content={type:'interactive',interactive:{type:'button',body:{text:prepared.text},action:{buttons:input.buttons}}};}
   else if(input.list){content={type:'interactive',interactive:{type:'list',body:{text:prepared.text},action:input.list}};}
   // Re-check after an upload. Never knowingly send a response generated before takeover.
   const latest=(await this.thread(leadId).get()).data()||{};
   if((latest.control_version||0)!==prepared.control_version||automatic&&latest.generation!==prepared.generation)throw Object.assign(Error('La conversación cambió antes del envío.'),{definitive:true});
   acceptedId=await this.gateway.send(prepared.account,prepared.phone,content,{automatic});
   await super.ingest({business_phone_id:prepared.account,phone:prepared.phone,message:{id:acceptedId,direction:'outbound',type:audio?'audio':attachment?attachment.type:'text',text:prepared.text,sender:actor,at:now(),media}});
   if(attachment)this.attachmentArchive.put(prepared.account,media.id,attachment);
   await this.store.db.runTransaction(async tx=>{const receipt=this.receipts.doc(hash(prepared.account+'\0'+acceptedId)),old=(await tx.get(ref)).data(),rs=await tx.get(receipt);tx.set(ref,{...old,state:'sent',message_id:acceptedId,sent_at:now()});tx.set(receipt,{...rs.data(),automation_processed:true});});await this.memory.capture(leadId,{id:acceptedId,direction:'outbound',text:prepared.text,at:now()});if(automatic&&!followup)await this.followups.arm(leadId,acceptedId,now(),prepared.text);return {ok:true,message_id:acceptedId};
  }catch(error){
   await this.store.db.runTransaction(async tx=>{const old=(await tx.get(ref)).data();tx.set(ref,{...old,state:acceptedId?'accepted_unrecorded':error.definitive?'failed':'unknown',message_id:acceptedId,error:String(error.message).slice(0,300),updated_at:now()});});
   throw Error(error.message+' No se reintentará automáticamente.');
  }
 }
 async media(leadId,messageKey,data){
  if(!/^[a-f0-9]{64}$/.test(messageKey))throw Error('Mensaje no válido.');if(!data.leads.some(l=>l.id===leadId))throw Error('Lead no encontrado.');
  const row=await this.thread(leadId).collection('messages').doc(messageKey).get();if(!row.exists||!row.data().media?.id)throw Error('El mensaje no tiene un archivo disponible.');
  const t=(await this.thread(leadId).get()).data();const r=row.data(),cached=this.attachmentArchive.get(r.business_phone_id,r.media.id);if(cached)return cached;
  const file=await this.gateway.media(r.business_phone_id,t.phone,r.media.id);if(r.media.filename)file.filename=r.media.filename;
  this.attachmentArchive.put(r.business_phone_id,r.media.id,file);return file;
 }
 async claim(){
  if(!this.advisorReplyRepairDone){await this.agenda.repairAdvisorOptions();this.advisorReplyRepairDone=true;}
  const list=await this.jobs.where('state','in',['queued','processing']).limit(50).get();
  for(const snapshot of list.docs.slice().sort((a,b)=>a.data().created_at.localeCompare(b.data().created_at))){
   const value=await this.store.run(async({tx,read})=>{
    const ref=this.jobs.doc(snapshot.id),s=await tx.get(ref),j=s.data();if(!j||!(j.state==='queued'||j.state==='processing'&&Date.parse(j.lease_until)<Date.now()))return null;
    if(j.attempts>=2){tx.set(ref,{...j,state:'failed',reason:'n8n no completó el trabajo tras dos intentos. Revisa la ejecución antes de continuar.'});return null;}
    const tr=this.thread(j.lead_id),ts=await tx.get(tr),t=ts.data()||{};
    const provider=j.kind==='calendar'||j.kind==='mail';
    const audioArchive=!provider&&j.type==='audio'&&!j.fixed_reply&&t.generation!==j.generation&&(t.control_version||0)===j.control_version&&t.mode===j.mode&&!t.opt_out&&Date.parse(t.last_inbound_at)-Date.parse(j.created_at)<=180000&&Date.parse(t.last_inbound_at)-Date.parse(j.created_at)>=-1000;
    const valid=audioArchive||(provider?(j.kind==='mail'||j.step==='verify'||((t.control_version||0)===j.control_version&&!t.opt_out&&t.booking?.id===j.booking?.id)):t.generation===j.generation&&(t.control_version||0)===j.control_version&&(j.fixed_reply||t.mode===j.mode&&!t.opt_out)&&(!j.fixed_reply||j.mode==='auto'));
    if(!valid){tx.set(ref,{...j,state:'cancelled',reason:'La conversación o el modo cambió.'});return null;}
    if(!provider){
     const prior=list.docs.filter(d=>{const p=d.data();return p.lead_id===j.lead_id&&p.type==='audio'&&!p.kind&&!p.fixed_reply&&p.generation<j.generation&&p.control_version===j.control_version&&p.mode===j.mode&&Date.parse(j.created_at)-Date.parse(p.created_at)<=180000;});
     for(const p of prior){const row=(await tx.get(this.jobs.doc(p.id))).data();if(row&&['queued','processing'].includes(row.state))return null;}
    }
    try{this.gateway.assertRecipient(j.account,j.phone,{send:j.mode==='auto',automatic:j.mode==='auto'});}catch(error){tx.set(ref,{...j,state:'blocked',reason:error.message});return null;}
    const token=randomUUID(),lease=now(),lead=read().leads.find(l=>l.id===j.lead_id);
    if(!lead){tx.set(ref,{...j,state:'cancelled',reason:'Lead eliminado.'});return null;}
    const bankFlow=['Hipotecario','Bancario','Banco GNB','GNB'].includes(lead.bank_evaluation?.financing_type||lead.purchase_method||lead.last_quote?.financing_type)||lead.status==='Evaluación GNB';
    if(this.channel!=='crm'&&j.kind!=='mail'&&j.step!=='verify'&&!j.fixed_reply&&lead.lola_paused&&lead.handoff_status==='accepted'){tx.set(ref,{...j,state:'cancelled',reason:'El lead está siendo atendido por ventas.'});return null;}
    tx.set(ref,{...j,state:'processing',attempts:j.attempts+1,lease_token:token,lease_until:new Date(Date.now()+300000).toISOString(),claimed_at:lease});
    return {...j,archive_only:audioArchive,lease_token:token,approved_resources:resources(read().settings),customer_context:{confirmed_buyer:!!buyer(read(),lead),birthday_greeting_allowed:!careReason(read(),lead,t)},bank_evaluation_status:lead.bank_evaluation?.status||null,gnb_guidance:bankFlow?conversationGuidance(lead):null,profile:{name:lead.name||null,phone:lead.phone||null,email:lead.email||null,interest:lead.unit_interest||null,purchase_method:lead.purchase_method||null,initial_payment:lead.initial_payment||null}};
   });
   if(value){
    const d=await this.store.read(),ctx=value.archive_only||value.fixed_reply||value.kind?{state:'not_needed',sources:[],resources:[]}:await this.drive.context(d.settings);
    value.approved_resources=[...resources(d.settings),...ctx.resources];value.drive_context=ctx;
    await this.store.db.runTransaction(async tx=>{const ref=this.jobs.doc(value.id),row=(await tx.get(ref)).data();if(row?.state==='processing'&&row.lease_token===value.lease_token)tx.set(ref,{...row,drive_sources:ctx.sources});});
    // R64 · La memoria y el historial viajan con el trabajo también en PostgreSQL: el trabajador de n8n de producción no lee la base de datos.
    const chat=await super.conversation(value.lead_id,{limit:24},await this.store.read()),thread=(await this.thread(value.lead_id).get()).data()||{};const memory=await this.memory.context(value.lead_id,chat.messages,thread,await this.store.read());await this.store.db.runTransaction(async tx=>{const ref=this.jobs.doc(value.id),j=(await tx.get(ref)).data();if(j?.lease_token===value.lease_token)tx.set(ref,{...j,memory});});return {ok:true,job:{...value,memory,conversation_state:{booking_phase:thread.booking?.phase||null,appointment:thread.calendar_appointment||null,offer:thread.offer?.state||null},history:chat.messages.map(m=>({direction:m.direction,text:m.text||m.transcript||'['+m.type+']',at:m.at}))}};}
  }return {ok:true,job:null};
 }
 async jobMedia(input){
  const s=await this.jobs.doc(String(input.job_id)).get(),j=s.data();if(!s.exists||j.state!=='processing'||j.lease_token!==input.lease_token||Date.parse(j.lease_until)<Date.now()||j.type!=='audio')throw Error('Trabajo de audio no autorizado o vencido.');
  const media=await this.gateway.media(j.account,j.phone,j.media?.id);return {ok:true,mime:media.mime,filename:media.filename,base64:media.bytes.toString('base64')};
 }
 async complete(input){
  const ref=this.jobs.doc(String(input.job_id)),snapshot=await ref.get(),job=snapshot.data();if(!snapshot.exists||job.lease_token!==input.lease_token)throw Error('Trabajo de Lola no autorizado.');
  if(['complete','cancelled','failed','blocked'].includes(job.state))return {ok:true,duplicate:true,state:job.state};
  if(job.state!=='processing'||Date.parse(job.lease_until)<Date.now())throw Error('El trabajo de Lola venció.');
  if(!input.error&&job.mode==='auto'&&job.type==='audio'&&input.transcript)await this.store.run(({read,write})=>{const data=read(),lead=data.leads.find(l=>l.id===job.lead_id);if(lead&&captureExplicitProfile(lead,String(input.transcript)))write(data);});
  if(!input.error&&job.type==='audio'&&input.transcript&&await this.agenda.routeTranscript(job,String(input.transcript)))return {ok:true,state:'complete',routed_to_agenda:true};
  const policyData=await this.store.read(),policyLead=policyData.leads.find(l=>l.id===job.lead_id),policyThread=(await this.thread(job.lead_id).get()).data()||{};
  const driveContext=job.fixed_reply?{sources:[],resources:[]}:await this.drive.context(policyData.settings,true);
  const verifiedDrive=(job.drive_sources||[]).filter(s=>driveContext.sources.some(f=>f.id===s.id&&f.modified_at===s.modified_at&&f.text===s.text));
  const serverResult={...(input.result||{}),output:input.result?.output??input.result,observed_evidence:[...(input.result?.observed_evidence||[]).filter(e=>e.tool!=='Carpeta_autorizada_GDrive'),...verifiedDrive.map(s=>({tool:'Carpeta_autorizada_GDrive',data:s.text}))]};
  if(!job.fixed_reply&&!job.memory){const remembered=(await this.memory.ref(job.lead_id).get()).data()||{};job.memory={continuity:{has_previous_exchange:!!remembered.last_lola_at}};}
  let output;
  try{if(input.error)throw Error('No se pudo generar la respuesta de Lola. Revisa la ejecución de n8n.');output=job.fixed_reply?{reply:require('./advisorRouting').humanizeConfirmedReply(job.fixed_reply),handoff:false,opt_out:!!job.opt_out_ack,commercial_answer:false,commercial_evidence:[],profile:job.profile||{}}:validateOutput(serverResult,{...job,text:input.transcript||job.text,approved_resources:[...resources(policyData.settings),...driveContext.resources],customer_context:{birthday_greeting_allowed:!!policyLead&&!careReason(policyData,policyLead,policyThread)}});}catch(error){await this.finishJob(ref,job,'failed',error.message);return {ok:true,state:'failed',reason:error.message};}
  const prepared=await this.store.db.runTransaction(async tx=>{
   const current=(await tx.get(ref)).data(),tr=this.thread(job.lead_id),s=await tx.get(tr),t=s.data()||{};
   if(current.state!=='processing')return null;
   if((t.control_version||0)!==job.control_version||t.generation!==job.generation||!job.fixed_reply&&t.mode!==job.mode){tx.set(ref,{...current,state:'cancelled',reason:'Intervención humana o mensaje nuevo.'});return null;}
   const next={...t},buttons=job.fixed_reply&&Array.isArray(job.buttons)?job.buttons:[];
   if(!job.fixed_reply)next.proposed_profile={id:job.id,values:Object.fromEntries(Object.entries(output.profile).filter(([key,value])=>['name','email','interest','purchase_method','initial_payment'].includes(key)&&typeof value==='string'&&value.trim()).map(([key,value])=>[key,value.trim().slice(0,300)])),at:now()};
   if(output.opt_out){next.opt_out=true;next.mode='manual';next.suggestion=null;}
   if(output.handoff&&!t.handoff&&t.offer?.state!=='accepted'){
    if(!t.offer||t.offer.state!=='pending'||Date.parse(t.offer.expires_at)<=Date.now())next.offer={id:randomUUID().replaceAll('-','').slice(0,24),state:'pending',created_at:null,expires_at:new Date(Date.now()+86400000).toISOString()};
    // Offer only once after actual successful delivery.
    if(!next.offer?.sent_at)for(const [choice,title] of Object.entries(CHOICES))buttons.push({type:'reply',reply:{id:'orok:'+choice+':'+next.offer.id,title}});
   }
   if(job.mode==='suggest'){next.suggestion={id:job.id,text:output.reply,created_at:now(),handoff:output.handoff,buttons,profile:output.profile};tx.set(ref,{...current,state:'complete',completed_at:now()});}
   else tx.set(ref,{...current,state:'sending',result:{reply:output.reply,opt_out:output.opt_out},updated_at:now()});
   tx.set(tr,next);return {buttons};
  });if(!prepared)return {ok:true,state:'cancelled'};
  if(output.opt_out)await this.agenda.recordOptOut(job);
  if(input.transcript){const mr=this.thread(job.lead_id).collection('messages').doc(hash(job.account+'\0'+job.message_id));await this.store.db.runTransaction(async tx=>{const m=await tx.get(mr);if(m.exists)tx.set(mr,{...m.data(),transcript:String(input.transcript).slice(0,10000)});});}
  if(job.mode==='suggest')return {ok:true,state:'complete',suggestion:true};
  try{
   const sent=await this.send(job.lead_id,{request_id:hash(job.id).slice(0,8)+'-'+hash(job.id).slice(8,12)+'-'+hash(job.id).slice(12,16)+'-'+hash(job.id).slice(16,20)+'-'+hash(job.id).slice(20,32),text:output.reply,...(prepared.buttons.length?{buttons:prepared.buttons}:{}),...(job.list?{list:job.list}:{})},'Lola',{automatic:true,expected:output.opt_out?{...job,fixed_reply:output.reply,opt_out_ack:true}:job});
   await this.store.db.runTransaction(async tx=>{const s=await tx.get(ref),tr=this.thread(job.lead_id),ts=await tx.get(tr),t=ts.data();tx.set(ref,{...s.data(),state:'complete',message_id:sent.message_id,completed_at:now()});if(!job.fixed_reply&&prepared.buttons.length&&t.offer)tx.set(tr,{...t,offer:{...t.offer,sent_at:now(),created_at:now(),expires_at:new Date(Date.now()+86400000).toISOString()}});});if(!job.fixed_reply&&prepared.buttons.length)await this.agenda.trackOffer(job.lead_id);return {ok:true,state:'complete',message_id:sent.message_id};
  }catch(error){await this.finishJob(ref,job,'failed',error.message);return {ok:true,state:'failed',reason:error.message};}
 }
 async finishJob(ref,job,state,reason){await this.store.db.runTransaction(async tx=>{const s=await tx.get(ref);tx.set(ref,{...s.data(),state,reason:String(reason).slice(0,500),completed_at:now()});});}
 async requestSuggestion(leadId,actor){
  return this.store.db.runTransaction(async tx=>{
   const tr=this.thread(leadId),s=await tx.get(tr),t=s.data();if(!s.exists||t.opt_out||!t.last_inbound_at)throw Error('No hay una consulta habilitada para sugerencias.');
   if(t.mode!=='suggest')throw Error('Selecciona Sugerencias primero.');
   const jobId=hash('suggestion\0'+leadId+'\0'+(t.generation||0)+'\0'+(t.control_version||0)),ref=this.jobs.doc(jobId),old=await tx.get(ref);if(old.exists)return {ok:true,duplicate:true};
   const ms=t.last_inbound_message_id?await tx.get(tr.collection('messages').doc(hash(t.business_phone_id+'\0'+t.last_inbound_message_id))):null;const m=ms?.data();if(!m)throw Error('Recibe un mensaje nuevo antes de solicitar la sugerencia.');
   tx.set(ref,{id:jobId,state:'queued',lead_id:leadId,account:t.business_phone_id,phone:t.phone,message_id:m.id,text:m.text,type:m.type,media:m.media,mode:'suggest',control_version:t.control_version||0,generation:t.generation||0,created_at:now(),attempts:0,actor});tx.set(tr,{...t,last_job_id:jobId});return {ok:true};
  });
 }
 async applyProfile(leadId,input,actor){
  return this.store.run(async({tx,read,write})=>{
   const ref=this.thread(leadId),s=await tx.get(ref),t=s.data()||{},proposal=t.proposed_profile;
   if(!proposal||proposal.id!==input.proposal_id)throw Error('Los datos propuestos cambiaron. Actualiza la conversación.');
   const fields={name:'name',email:'email',interest:'unit_interest',purchase_method:'purchase_method',initial_payment:'initial_payment'},keys=Array.isArray(input.fields)?input.fields:[];
   if(!keys.length||keys.some(k=>!fields[k]))throw Error('Selecciona los datos revisados.');
   const data=read(),lead=data.leads.find(l=>l.id===leadId);if(!lead)throw Error('Lead no encontrado.');const changes={};
   for(const key of keys){const value=proposal.values[key];if(!value)continue;if(key==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))throw Error('El correo propuesto no es válido.');if(key==='name'&&value.length<2)throw Error('El nombre propuesto está incompleto.');changes[fields[key]]={before:lead[fields[key]]||null,after:value};lead[fields[key]]=value;}
   tx.set(ref,{...t,proposed_profile:null});tx.set(ref.collection('audit').doc(randomUUID()),{at:now(),actor,action:'profile_review',changes});if(Object.keys(changes).length)write(data);return {ok:true,updated:Object.keys(changes)};
  });
 }
 setup(input,actor){return input?saveSetup(this.config.privateDir,input,actor):publicSetup(this.gateway.setup());}
}
module.exports={WhatsAppService,validateOutput,ECONOMIC_REPLY,normalize,explicitResume,captureExplicitProfile};
