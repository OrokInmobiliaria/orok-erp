'use strict';
const {createHash,randomUUID}=require('node:crypto');
const {applyLolaEvent}=require('./lolaIntegration');
const {visitRequest,resolveSlot,confirmation}=require('./appointmentChoice');
const advisor=require('./advisorRouting');
const {DEFAULT_CALENDAR_ID,calendarId}=require('./calendarIdentity');
const hash=v=>createHash('sha256').update(v).digest('hex'),iso=()=>new Date().toISOString(),nonce=()=>randomUUID().replaceAll('-','').slice(0,24);
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const EMAIL=/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?)+/i;
const SHOWROOM=require('./projectLocation');
const RULES={calendar:DEFAULT_CALENDAR_ID,sales_email:'ventas@orok.com.pe',seller:'Antonio Garces',location:SHOWROOM.address,zone:'America/Lima',duration:45,buffer:15,minimum_hours:2,horizon_days:7};
const label=v=>new Intl.DateTimeFormat('es-PE',{timeZone:RULES.zone,weekday:'short',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(v));
function slotButtons(booking,page=0){const pages=Math.ceil(booking.slots.length/2),offset=page*2;return {buttons:[...booking.slots.slice(offset,offset+2).map(s=>({type:'reply',reply:{id:'orok:'+(booking.flow==='reschedule'?'reslot':'slot')+':'+booking.id+':'+Math.floor(Date.parse(s.start)/1000),title:s.label.slice(0,20)}})),...(pages>1?[{type:'reply',reply:{id:'orok:slotpage:'+booking.id+':'+((page+1)%pages),title:'Ver más horarios'}}]:[])]};}
const baseURL=(id=RULES.calendar)=> 'https://www.googleapis.com/calendar/v3/calendars/'+encodeURIComponent(id)+'/events';
function validSlot(start,clock=Date.now()){
 const ms=Date.parse(start),local=new Date(ms-5*3600000);return Number.isFinite(ms)&&ms>=clock+2*3600000&&ms<=clock+7*86400000&&local.getUTCDay()!==1&&local.getUTCHours()>=10&&local.getUTCHours()<=18&&local.getUTCMinutes()===0&&local.getUTCSeconds()===0;
}
function candidates(clock=Date.now()){
 const local=new Date(clock-5*3600000),day=Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate())+5*3600000,out=[];
 for(let d=0;d<=7;d++)for(let hour=10;hour<=18;hour++){const start=new Date(day+d*86400000+hour*3600000).toISOString();if(validSlot(start,clock))out.push({start,end:new Date(Date.parse(start)+45*60000).toISOString(),label:label(start)});}
 return out;
}
function free(slot,events,except){const a=Date.parse(slot.start),b=Date.parse(slot.end)+15*60000;return events.every(e=>{
 if(e.id===except||e.status==='cancelled'||e.transparency==='transparent')return true;
 const start=e.start?.dateTime||e.start?.date&&e.start.date+'T00:00:00-05:00',end=e.end?.dateTime||e.end?.date&&e.end.date+'T00:00:00-05:00';
 if(!start||!end||!Number.isFinite(Date.parse(start))||!Number.isFinite(Date.parse(end)))throw Error('Calendar devolvió un evento sin fechas válidas.');return b<=Date.parse(start)||a>=Date.parse(end)+15*60000;
 });}
function profileOf(lead,t){return {...{name:lead.name||'',phone:lead.phone||'',email:lead.email||'',interest:lead.unit_interest||''},...(t.booking?.profile||{})};}
function activeOf(lead,t){const rows=lead.appointments||[],a=rows.filter(a=>a.status==='scheduled'&&a.calendar_event_id).at(-1);if(a)return {id:a.calendar_event_id,calendar_id:a.calendar_id||RULES.calendar,start:a.scheduled_at,end:a.end_at||new Date(Date.parse(a.scheduled_at)+45*60000).toISOString(),status:'scheduled',modality:a.modality||'showroom',meet_url:a.meet_url||null};return !rows.some(a=>a.calendar_event_id===t.calendar_appointment?.id)&&t.calendar_appointment?.status==='scheduled'?{...t.calendar_appointment,calendar_id:t.calendar_appointment.calendar_id||RULES.calendar}:null;}
function isCurrent(t,j){return (t.control_version||0)===j.control_version&&t.generation===j.generation&&!t.opt_out;}
function audioBurstText(messages,job,transcript){
 const current=messages.find(m=>m.id===job.message_id),at=Date.parse(current?.at||job.created_at);
 const same=messages.filter(m=>(!m.business_phone_id||m.business_phone_id===job.account)&&Date.parse(m.at)<=at&&Date.parse(m.at)>=at-180000).sort((a,b)=>a.at.localeCompare(b.at));
 const lastOut=same.filter(m=>m.direction==='outbound').at(-1)?.at;
 const earlier=same.filter(m=>m.direction==='inbound'&&m.id!==job.message_id&&(!lastOut||m.at>lastOut)).slice(-5).map(m=>m.text||m.transcript||'').filter(Boolean);
 return [...earlier,transcript].join('\n');
}
class WhatsAppAgenda{
 constructor(service){this.s=service;this.offers=service.store.ref.collection(service.namespace+'_offers');this.locks=service.store.ref.collection('whatsapp_calendar_locks');}
 calendarId(){return calendarId(this.s.gateway.setup());}
 enabled(){try{return this.s.gateway.setup().agendaEnabled===true&&!!this.calendarId();}catch{return false;}}
 task(step,booking,extra={}){return {kind:'calendar',step,booking:{...structuredClone(booking),calendar_id:booking.calendar_id||booking.appointment?.calendar_id||this.calendarId()},...extra};}
 fixed(text,extra={}){return {fixed_reply:text,...extra};}
 crm(data,lead,t,action,eventId,extra={}){
  const preserve=['Venta','Separación'].includes(lead.status)?{status:lead.status,substatus:lead.substatus,stage_history:structuredClone(lead.stage_history||[])}:null;
  const result=applyLolaEvent(data,{action,lead_id:lead.id,event_id:'wa:'+hash(eventId).slice(0,60),channel:this.s.channel,chat_id:this.s.identityForThread?this.s.identityForThread(t):t.phone,profile:{name:lead.name,phone:lead.phone,email:lead.email,interest:lead.unit_interest},...extra},(t.request_actor||'Lola · '+this.s.channel));if(preserve)Object.assign(lead,preserve);return result;
 }
 plan({data,lead,t,next,m,input}){
  if(t.mode!=='auto'||t.opt_out)return null;
  const text=String(m.text||''),nt=norm(text),button=String(input.message?.button_id||''),choice=/^orok:(appointment|showroom|seller):([a-f0-9]{24})$/.exec(button);
  const slot=/^orok:(slot|reslot):([a-f0-9]{24}):(\d{10})$/.exec(button),cancel=/^orok:cancel:(yes|no):([a-f0-9]{24})$/.exec(button);
  if(choice){
   if(t.offer?.id!==choice[2]||t.offer?.state!=='pending'||Date.parse(t.offer.expires_at)<=Date.now())return {job:this.fixed('Esa opción ya fue atendida o venció. Puedes escribirme qué necesitas y te ayudo.'),changed:false};
   next.offer={...t.offer,state:'accepted',choice:choice[1],selected_at:iso()};
   if(choice[1]==='seller'){
    next.mode='manual';next.control_version=(t.control_version||0)+1;next.handoff={choice:'seller',at:iso(),status:'Solicitud registrada; aviso de ventas pendiente'};
    this.crm(data,lead,next,'seller_requested',m.id,{note:'Se solicitó hablar con un asesor desde '+this.s.channel+'.'});
    lead.advisor_alert={id:choice[2],at:iso(),reason:'Solicitud de asesor',email:'pending',whatsapp:'pending',phones:advisor.alertPhones(this.s.gateway.setup())};
    return {job:{kind:'mail',step:'mail',notice:'seller',advisor_id:choice[2],profile:profileOf(lead,t),fixed_reply:null},changed:true};
   }
   if(!this.enabled()){next.handoff={choice:choice[1],at:iso(),status:'Pendiente de coordinación humana'};return {job:this.fixed('Recibimos tu interés en visitar el showroom. El equipo de ventas debe coordinar el horario contigo; la agenda automática aún no está habilitada y todavía no hay una cita confirmada.'),changed:false};}
   if(activeOf(lead,t))return {job:this.fixed('Ya tienes una cita registrada. Puedes pedirme reprogramarla o cancelarla.'),changed:false};
   next.booking={flow:'new',intent:choice[1],id:nonce(),phase:'contact',profile:profileOf(lead,t)};
   return this.contact(next,text);
  }
  const advisorPlan=advisor.plan(this,{data,lead,t,next,m,input});if(advisorPlan)return advisorPlan;
  if(t.offer?.state==='accepted'&&/\b(hablar|contactar|comunicarme|quiero)\b.*\b(asesor|vendedor|persona real)\b/.test(nt)){
   next.mode='manual';next.control_version=(t.control_version||0)+1;next.handoff={choice:'seller',at:iso(),status:'Solicitud registrada; aviso de ventas pendiente'};this.crm(data,lead,next,'seller_requested',m.id,{note:'Solicitó atención humana después de una gestión anterior.'});return {job:{kind:'mail',step:'mail',notice:'seller',profile:profileOf(lead,t)},changed:true};
  }
  if(!this.enabled())return null;
  const acceptance=/^orok:visitconfirm:(yes|no):([a-f0-9]{24}):(\d{10})$/.exec(button);
  const answer=t.booking?.phase==='confirm'?confirmation(text):null;
  if(acceptance||answer){
   const b=t.booking,decision=acceptance?.[1]||answer;
   if(!b||b.phase!=='confirm'||!b.slot||acceptance&&(acceptance[2]!==b.confirmation_id||Number(acceptance[3])*1000!==Date.parse(b.slot.start))||Date.parse(b.expires_at)<=Date.now()||!validSlot(b.slot.start))return {job:this.fixed('La propuesta venció o cambió. Pídeme nuevos horarios antes de confirmar.'),changed:false};
   if(decision==='no'){next.booking={...b,phase:'slots',slot:null,confirmation_id:null};return {job:this.fixed('No reservamos ese horario. Puedes elegir otra fecha y hora de las propuestas.',slotButtons(next.booking)),changed:false};}
   next.booking={...b,phase:'checking',confirmed_by_message:m.id,confirmation_source:acceptance?'button':'text_or_audio'};return {job:this.task('recheck',next.booking),changed:false};
  }
  const page=/^orok:slotpage:([a-f0-9]{24}):(\d)$/.exec(button);
  if(page){const b=t.booking,p=Number(page[2]);if(!b||b.id!==page[1]||b.phase!=='slots'||Date.parse(b.expires_at)<=Date.now()||p>=Math.ceil(b.slots.length/2))return {job:this.fixed('La lista de horarios venció. Solicita nuevos horarios.'),changed:false};return {job:this.fixed('Elige un horario para confirmar tu visita.',slotButtons(b,p)),changed:false};}
  if(slot){
   const b=t.booking,match=b?.slots?.find(s=>String(Math.floor(Date.parse(s.start)/1000))===slot[3]);
   if(!b||b.id!==slot[2]||b.phase!=='slots'||!match||Date.parse(b.expires_at)<=Date.now()||!validSlot(match.start))return {job:this.fixed('El horario elegido venció o no pertenece a esta solicitud. Pídeme nuevos horarios.'),changed:false};
   next.booking={...b,slot:match,phase:'checking',confirmed_by_message:m.id,confirmation_source:'slot_button'};return {job:this.task('recheck',next.booking),changed:false};
  }
  if(cancel){
   const p=t.cancellation,a=activeOf(lead,t);
   if(!p||p.id!==cancel[2]||!a||p.event_id!==a.id||p.start&&p.start!==a.start||Date.parse(p.expires_at)<=Date.now())return {job:this.fixed('La confirmación de cancelación venció o la cita cambió. Escríbeme si deseas revisarla.'),changed:false};
   next.cancellation=null;
   if(cancel[1]==='no')return {job:this.fixed('Conservamos tu cita. Te esperamos en el showroom.'),changed:false};
   const booking={flow:'cancel',id:p.id,appointment:a,profile:profileOf(lead,t),phase:'cancel_check'};next.booking=booking;return {job:this.task('cancel_check',booking),changed:false};
  }
  const mentions=/\b(cita|visita|showroom)\b/.test(nt);
  const cancelRequest=mentions&&/\b(cancelar|cancela|cancelacion|anular|anula|no puedo asistir|no podre asistir|no puedo ir)\b/.test(nt);
  const reschedule=mentions&&/\b(reprogramar|reprograma|cambiar|cambia|mover|mueve|otro horario|otra fecha|otro dia)\b/.test(nt);
  if(cancelRequest||reschedule){
   const a=activeOf(lead,t);if(!a)return {job:this.fixed('No encuentro una cita activa registrada para este contacto. ¿Quieres que te muestre horarios para una visita?'),changed:false};
   if(a.calendar_id!==this.calendarId())return {job:this.fixed('Tu cita pertenece a otro calendario. Un asesor debe revisarla antes de cambiarla; la cita original se conserva.'),changed:false};
   if(t.booking&&['checking','writing','cancel_check'].includes(t.booking.phase))return {job:this.fixed('Hay una gestión de tu cita en curso. Primero comprobaremos su resultado para evitar cambios duplicados.'),changed:false};
   if(cancelRequest){const id=nonce();next.cancellation={id,event_id:a.id,start:a.start,expires_at:new Date(Date.now()+30*60000).toISOString()};return {job:this.fixed('Tu visita está registrada para '+label(a.start)+'. ¿Confirmas que deseas cancelarla?',{buttons:[{type:'reply',reply:{id:'orok:cancel:yes:'+id,title:'Sí, cancelar'}},{type:'reply',reply:{id:'orok:cancel:no:'+id,title:'Conservar cita'}}]}),changed:false};}
   next.booking={flow:'reschedule',modality:a.modality||'showroom',id:nonce(),appointment:a,phase:'contact',profile:profileOf(lead,t)};return this.contact(next,text);
  }
  if(/horario especial|\blunes\b|despues de las (?:7|19)/.test(nt)&&mentions){
   next.mode='manual';next.control_version=(t.control_version||0)+1;next.handoff={choice:'special_schedule',at:iso(),status:'Pendiente de coordinación'};
   this.crm(data,lead,next,'seller_requested',m.id,{note:'Solicitó horario especial: '+text.slice(0,500)});return {job:{kind:'mail',step:'mail',notice:'special_schedule',profile:profileOf(lead,t),request_text:text.slice(0,500)},changed:true};
  }
  if(['slots','confirm'].includes(t.booking?.phase)&&!button){
   const b=t.booking;if(Date.parse(b.expires_at)<=Date.now()){next.booking={...b,phase:'listing',slot:null};return {job:this.task('list',next.booking),changed:false};}
   if(/\b(?:otros|nuevos|mas) horarios\b/.test(nt)){next.booking={...b,phase:'listing',slot:null,confirmation_id:null};return {job:this.task('list',next.booking),changed:false};}
   const selected=resolveSlot(text,b.slots||[]);
   if(selected.state==='matched'){
    const id=nonce(),slot=selected.slot;next.booking={...b,slot,phase:'confirm',confirmation_id:id};
    return {job:this.fixed('Para verificar que te entendí: ¿confirmas tu visita el '+label(slot.start)+' (hora de Lima), '+(b.modality==='meet'?'por Meet':b.modality==='whatsapp'?'por WhatsApp':'en '+RULES.location)+'? Aún no está reservada.',{buttons:[{type:'reply',reply:{id:'orok:visitconfirm:yes:'+id+':'+Math.floor(Date.parse(slot.start)/1000),title:'Sí, confirmar visita'}},{type:'reply',reply:{id:'orok:visitconfirm:no:'+id+':'+Math.floor(Date.parse(slot.start)/1000),title:'Elegir otro horario'}}]}),changed:false};
   }
   if(/horario|\bhoy\b|\bmanana\b|lunes|martes|miercoles|jueves|viernes|sabado|domingo|confirm|\d|\b(?:si|no)\b/.test(nt)){next.booking={...b,phase:'slots',slot:null,confirmation_id:null};return {job:this.fixed(selected.state==='not_offered'?'Ese día y hora no están en las propuestas vigentes. Elige un horario ofrecido o pide otros horarios.':'Para no reservar una fecha equivocada, indica el día y la hora completos de una propuesta, por ejemplo 20/10 a las 16:00. También puedes pulsar el botón del horario.'),changed:false};}
  }
  if(visitRequest(text)){
   if(activeOf(lead,t))return {job:this.fixed('Ya tienes una cita registrada. Puedes pedirme reprogramarla o cancelarla.'),changed:false};
   if(t.booking){if(t.booking.phase==='contact')return this.contact(next,text);return {job:this.fixed('Ya estamos coordinando tu visita. Elige una fecha y hora de las propuestas; todavía no hay una nueva cita confirmada.'),changed:false};}
   if(t.offer?.state==='pending')next.offer={...t.offer,state:'accepted',choice:'showroom',selected_at:iso()};
   next.booking={flow:'new',intent:/showroom/.test(nt)?'showroom':'appointment',id:nonce(),phase:'contact',profile:profileOf(lead,t)};return this.contact(next,text);
  }
  if(t.booking?.phase==='contact'&&!/precio|costo|descuento|oferta|cotiza/i.test(nt)&&(EMAIL.test(text)||!/[?¿]/.test(text)&&(!t.booking.profile.name||/^\d+$/.test(t.booking.profile.name))))return this.contact(next,text);
  if(activeOf(lead,t)&&/\b(ver|recordar|cuando es|que dia es|confirmar)\b/.test(nt)&&mentions)return {job:this.fixed('Tu visita está confirmada para '+label(activeOf(lead,t).start)+', en '+RULES.location+'.'),changed:false};
  if(t.advisor_request)return {job:this.fixed('Tu solicitud de asesor sigue registrada. Puedo coordinar una cita por WhatsApp o Meet, o dejar la conversación a la espera del vendedor.',advisor.buttons(t.advisor_request.id)),changed:false};
  return null;
 }
 contact(next,text){
  const b=next.booking,p={...b.profile},email=String(text).match(EMAIL)?.[0];if(email)p.email=email.toLowerCase();
  if(!p.name||/^\+?\d+$/.test(p.name)){
   let name=String(text).replace(EMAIL,'').replace(/^(?:mi nombre es|me llamo|soy)\s+/i,'').trim().replace(/[.,;]+$/,'');
   if(name.length>=3&&name.length<=100&&/^[\p{L} .'-]+$/u.test(name)&&!/[?¿]/.test(text)&&!/(cita|visita|showroom|agendar|horario|quiero)/i.test(name))p.name=name;
  }
  next.booking={...b,profile:p};
  if(!p.name||/^\+?\d+$/.test(p.name))return {job:this.fixed('Con gusto te ayudo a coordinar la visita. ¿Cuál es tu nombre completo?'),changed:false};
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(p.email||'')))return {job:this.fixed('Gracias, '+p.name.split(' ')[0]+'. ¿Qué correo usamos para enviarte la invitación de la cita?'),changed:false};
  next.booking.phase='listing';return {job:this.task('list',next.booking),changed:false};
 }
 seed(j,extra,id){return {...j,...extra,id:id||hash(j.id+'\0'+(extra.step||extra.fixed_reply||extra.notice)),state:'queued',attempts:0,created_at:iso(),lease_token:null,lease_until:null};}
 async routeTranscript(job,transcript){
  if(!transcript)return false;
  const snapshot=await this.s.jobs.doc(job.id).get(),trusted=snapshot.data();if(trusted?.state!=='processing'||trusted.lease_token!==job.lease_token||Date.parse(trusted.lease_until)<=Date.now())return false;
  const history=await this.s.thread(job.lead_id).collection('messages').orderBy('at','desc').limit(24).get();
  const context=audioBurstText(history.docs.map(d=>d.data()),job,transcript);
  await this.s.memory.capture(job.lead_id,{id:job.message_id+'-transcript',direction:'inbound',transcript,at:job.created_at});
  return this.s.store.run(async({tx,read,write})=>{
   const ref=this.s.jobs.doc(job.id),j=(await tx.get(ref)).data(),tr=this.s.thread(job.lead_id),t=(await tx.get(tr)).data()||{},data=read(),lead=data.leads.find(l=>l.id===job.lead_id);
   if(!j||j.state!=='processing'||j.lease_token!==job.lease_token)return false;
   const mr=tr.collection('messages').doc(hash(job.account+'\0'+job.message_id)),m=await tx.get(mr);
   if(m.exists)tx.set(mr,{...m.data(),transcript:String(transcript).slice(0,10000)});
   if((t.control_version||0)!==job.control_version||t.mode!==job.mode||t.opt_out){tx.set(ref,{...j,state:'cancelled',reason:'Intervención humana o baja antes de usar la transcripción.'});return true;}
   if(t.generation!==job.generation){
    const stop=/no (?:quiero recibir|me escribas|me escriban|me contactes)|darme de baja|^\s*(?:baja|stop|unsubscribe)\s*$/i.test(transcript);
    if(stop){const next={...t,opt_out:true,mode:'manual',control_version:(t.control_version||0)+1};this.crm(data,lead,next,'opt_out',job.message_id,{note:'Baja expresada por audio.'});tx.set(tr,next);write(data);}
    tx.set(ref,{...j,state:'complete',transcript_only:true,completed_at:iso()});return true;
   }
   if(/no (?:quiero recibir|me escribas|me escriban|me contactes)|darme de baja|^\s*(?:baja|stop|unsubscribe)\s*$/i.test(transcript))return false;
   const captured=require('./whatsappService').captureExplicitProfile(lead,transcript);const next={...t},plan=this.plan({data,lead,t,next,m:{id:job.message_id,text:context},input:{message:{}}});if(!plan){if(captured)write(data);return false;}
   const follow=this.seed(job,{...plan.job,text:context,type:'text'},hash(job.id+'\0agenda-audio'));next.last_job_id=follow.id;
   tx.set(ref,{...j,state:'complete',routed_to_agenda:true,completed_at:iso()});tx.set(this.s.jobs.doc(follow.id),follow);tx.set(tr,next);if(plan.changed||captured)write(data);return true;
  });
 }
 async begin(input){
  return this.s.store.db.runTransaction(async tx=>{
   const ref=this.s.jobs.doc(String(input.job_id)),snapshot=await tx.get(ref),j=snapshot.data();if(!j||j.lease_token!==input.lease_token)throw Error('Tarea de agenda no autorizada.');
   const tr=this.s.thread(j.lead_id),ts=await tx.get(tr),t=ts.data()||{};
   if(j.state!=='processing'||Date.parse(j.lease_until)<=Date.now())return {ok:true,task:null,state:j.state};
   if(j.kind!=='mail'&&j.step!=='verify'&&((t.control_version||0)!==j.control_version||t.opt_out||t.booking?.id!==j.booking?.id)){tx.set(ref,{...j,state:'cancelled',reason:'La conversación cambió antes de contactar al proveedor.'});return {ok:true,task:null,state:'cancelled'};}
   if(j.kind==='calendar'&&!this.enabled())throw Error('La agenda de WhatsApp no está habilitada.');
   if(j.kind==='calendar'&&(j.booking?.calendar_id||RULES.calendar)!==this.calendarId()){const reason='El calendario cambió. Un asesor debe revisar la gestión antes de contactar a Calendar.';tx.set(ref,{...j,state:'failed',reason});tx.set(tr,{...t,booking:t.booking?{...t.booking,phase:'review'}:null});return {ok:true,task:null,state:'failed',reason};}
   if(j.step==='write'&&!validSlot(j.booking?.slot?.start)){
    const lockRef=this.locks.doc(hash(j.booking?.calendar_id||RULES.calendar)),lock=(await tx.get(lockRef)).data()||{},follow=this.seed(j,this.task('list',{...j.booking,phase:'listing'}));tx.set(ref,{...j,state:'failed',reason:'El horario dejó de cumplir la anticipación mínima antes de enviarlo a Calendar.'});tx.set(tr,{...t,booking:{...j.booking,phase:'listing'},last_job_id:follow.id});tx.set(this.s.jobs.doc(follow.id),follow);if(lock.owner===j.booking.id)tx.set(lockRef,{...lock,owner:null,until:0});return {ok:true,task:null,state:'failed'};
   }
   const readOnly=['list','recheck','cancel_check','verify'].includes(j.step);tx.set(ref,{...j,state:readOnly?'processing':'dispatching',dispatch_started_at:iso()});
   if(j.kind==='mail')return {ok:true,task:{kind:'mail',job_id:j.id,lease_token:j.lease_token,to:RULES.sales_email,subject:(this.s.gateway.setup().environment==='production'?'':'[ENSAYO] ')+'[LOLA '+this.s.channel+'] '+({advisor_options:'Solicitud de asesor o precios · coordinar atención',seller:'Solicitud de asesor',special_schedule:'Horario especial',scheduled:'Cita creada',rescheduled:'Cita reprogramada',cancelled:'Cita cancelada'}[j.notice]||'Seguimiento'),message:['Cliente: '+(j.profile?.name||j.phone),'Canal: '+this.s.channel+' · '+j.phone,'Correo: '+(j.profile?.email||'No registrado'),'Interés: '+(j.profile?.interest||'No registrado'),j.request_text||'',j.appointment?'Cita: '+label(j.appointment.start):'',j.appointment?.meet_url?'Meet: '+j.appointment.meet_url:'', 'Lead CRM: '+j.lead_id].filter(Boolean).join('\n')}};
   const b=j.booking,params=new URLSearchParams(),base=baseURL(b.calendar_id||RULES.calendar);let url=base,method='GET',body={};
   if(['list','recheck'].includes(j.step)){params.set('timeMin',new Date(Date.now()-86400000).toISOString());params.set('timeMax',new Date(Date.now()+8*86400000).toISOString());params.set('singleEvents','true');params.set('maxResults','2500');params.set('orderBy','startTime');url+='?'+params;}
   else if(['cancel_check','verify'].includes(j.step))url+='/'+encodeURIComponent(b.event_id||b.appointment.id);
   else if(j.step==='write'){
    const slot=b.slot;params.set('sendUpdates','all');if(b.modality==='meet')params.set('conferenceDataVersion','1');method=b.flow==='reschedule'?'PATCH':'POST';if(method==='PATCH')url+='/'+encodeURIComponent(b.appointment.id);url+='?'+params;
    body={start:{dateTime:slot.start,timeZone:RULES.zone},end:{dateTime:slot.end,timeZone:RULES.zone}};
    if(method==='PATCH')body.attendees=[...(b.existing_attendees||[]).filter(a=>a.email?.toLowerCase()!==(b.appointment.profile?.email||b.profile.email).toLowerCase()).map(a=>({email:a.email})),{email:b.profile.email}];
    if(method==='POST')body={...body,id:b.event_id,summary:(this.s.gateway.setup().environment==='production'?'':'[ENSAYO LOLA] ')+(b.modality==='meet'?'Asesoría por Meet':b.modality==='whatsapp'?'Asesoría por WhatsApp':'Visita showroom')+' Infinity 224 - '+b.profile.name,description:(b.modality==='meet'?'Asesoría por Google Meet.':b.modality==='whatsapp'?'Asesoría por WhatsApp.':'Visita al showroom de Infinity 224.')+'\nCliente: '+b.profile.name+'\nTeléfono: '+b.profile.phone+'\nInterés: '+b.profile.interest+'\nAsesor: '+RULES.seller+(!b.modality||b.modality==='showroom'?'\nCómo llegar: '+SHOWROOM.map:''),location:b.modality==='meet'?'Google Meet':b.modality==='whatsapp'?'WhatsApp de ventas +51 912 971 742':RULES.location,reminders:{useDefault:false,overrides:[{method:'email',minutes:30},{method:'popup',minutes:10}]},attendees:[{email:b.profile.email},...(b.profile.email.toLowerCase()!==RULES.sales_email?[{email:RULES.sales_email}]:[])],extendedProperties:{private:{orokLeadId:j.lead_id,orokRequestId:b.id,orokChannel:this.s.channel}},guestsCanModify:false};
    if(method==='POST'&&b.modality==='meet')body.conferenceData={createRequest:{requestId:b.event_id,conferenceSolutionKey:{type:'hangoutsMeet'}}};
   }else if(j.step==='delete'){method='DELETE';url+='/'+encodeURIComponent(b.appointment.id)+'?sendUpdates=all';}
   else throw Error('Operación de agenda no reconocida.');
   return {ok:true,task:{kind:'calendar',job_id:j.id,lease_token:j.lease_token,method,url,body,step:j.step,operation:method==='POST'?'create':method==='PATCH'?'reschedule':method==='DELETE'?'cancel':'availability',read_only:readOnly}};
  });
 }
 async repairAdvisorOptions(){
  // One bounded compatibility repair per engine start. Never resend the email.
  const rows=(await this.s.jobs.orderBy('completed_at','desc').where('notice','==','advisor_options').where('state','==','complete').limit(20).get()).docs;let repaired=0;
  for(const row of rows)repaired+=await this.s.store.run(async({tx,read})=>{
   const jr=this.s.jobs.doc(row.id),j=(await tx.get(jr)).data();if(!j||j.advisor_reply_repaired_at)return 0;
   const tr=this.s.thread(j.lead_id),t=(await tx.get(tr)).data()||{},lead=read().leads.find(l=>l.id===j.lead_id);
   if(!lead||t.mode!=='auto'||t.opt_out||lead.opt_out||lead.lola_paused||!isCurrent(t,j)||t.last_job_id!==j.id||t.last_inbound_message_id!==j.message_id||lead.advisor_alert?.id!==j.advisor_id||lead.advisor_alert.email!=='accepted'||t.advisor_request?.id!==j.advisor_id||activeOf(lead,t)||['listing','checking','writing','cancel_check','review'].includes(t.booking?.phase))return 0;
   const follow=this.seed(j,{kind:undefined,step:undefined,booking:undefined,fixed_reply:advisor.optionsReply(true),...advisor.buttons(j.advisor_id)}),ref=this.s.jobs.doc(follow.id),old=await tx.get(ref);if(old.exists)return 0;
   tx.set(ref,Object.fromEntries(Object.entries(follow).filter(([,v])=>v!==undefined)));
   tx.set(tr,{...t,booking:null,cancellation:null,...(t.offer?.state==='pending'?{offer:{...t.offer,state:'superseded'}}:{}),last_job_id:follow.id});
   tx.set(jr,{...j,advisor_reply_repaired_at:iso()});return 1;
  });return {repaired};
 }
 async complete(input){
  const completed=await this.s.store.run(async({tx,read,write})=>{
   const ref=this.s.jobs.doc(String(input.job_id)),snapshot=await tx.get(ref),j=snapshot.data();if(!j||j.lease_token!==input.lease_token)throw Error('Resultado de agenda no autorizado.');
   if(!['processing','dispatching'].includes(j.state))return {ok:true,duplicate:true,state:j.state};
   const tr=this.s.thread(j.lead_id),ts=await tx.get(tr),t=ts.data()||{},data=read(),lead=data.leads.find(l=>l.id===j.lead_id);if(!lead)throw Error('Lead no encontrado.');
   const lockRef=this.locks.doc(hash(j.booking?.calendar_id||RULES.calendar)),lockSnapshot=await tx.get(lockRef),lock=lockSnapshot.data()||{};
   let next={...t},jobs=[],state='complete',reason='',changed=false;const body=input.response?.body??input.response??{},status=Number(input.status||input.response?.statusCode||0),ok=(status>=200&&status<300||j.step==='delete'&&[404,410].includes(status))&&!input.error,current=(t.control_version||0)===j.control_version&&!t.opt_out&&(j.kind==='mail'||['write','delete','verify'].includes(j.step)||t.booking?.id===j.booking?.id);
   const reply=(text,extra={})=>{if(current)jobs.push(this.seed(j,{kind:undefined,step:undefined,booking:undefined,fixed_reply:text,...extra}));};
   const chain=(step,b,extra={})=>jobs.push(this.seed(j,this.task(step,b,extra)));
   if(j.kind==='mail'){
    const mailId=body.id||body.messageId;if(j.advisor_id&&lead.advisor_alert?.id===j.advisor_id){lead.advisor_alert.email=!input.error&&mailId?'accepted':'unknown';changed=true;}
    if(j.notice==='advisor_options'){
     const delivered=!input.error&&!!mailId;next.notification_status=delivered?'Enviado':'Pendiente de revisión';if(lead.advisor_alert?.id===j.advisor_id){lead.advisor_alert.email=delivered?'accepted':'unknown';changed=true;}next.handoff={...t.handoff,status:delivered?'Aviso enviado; coordinar atención con asesor':'Solicitud registrada; revisar aviso por email'};if(!delivered){state='unknown';reason='No se confirmó el aviso por correo.';}
     if(!next.booking)reply(advisor.optionsReply(delivered),advisor.buttons(j.advisor_id));
    }
    else if(input.error||!mailId){state='unknown';reason='No se confirmó el aviso por correo. Revisar n8n antes de repetir.';next.notification_status='Pendiente de revisión';reply('Tu solicitud quedó registrada en el CRM. El aviso por correo no pudo confirmarse; el equipo debe revisarlo.');}
    else {next.notification_status='Enviado';if(j.notice==='seller'||j.notice==='special_schedule'){next.handoff={...t.handoff,status:'Solicitud registrada y aviso enviado a ventas'};reply('Tu solicitud quedó registrada y avisamos al equipo de ventas. Lola queda pausada mientras te atiende un asesor.');}}
   }else if(!ok&&['write','delete'].includes(j.step)&&(input.error||status>=500||status===409)){
    // Never repeat a mutation blindly: read the deterministic event first.
    chain('verify',{...j.booking,verify_after:j.step,verify_attempt:0});reason='Comprobando el resultado del proveedor.';
   }else if(j.step==='verify'){
    const b=j.booking;
    if(b.verify_after==='delete'&&[404,410].includes(status)){this.crm(data,lead,next,'appointment_cancelled',j.id,{calendar_event_id:b.appointment.id,note:'Cita cancelada en Calendar desde '+this.s.channel+'.'});changed=true;next.calendar_appointment={...b.appointment,status:'cancelled'};next.booking=null;next.cancellation=null;reply('Tu cita fue cancelada. Si deseas coordinar otra visita, con gusto te ayudo.');jobs.push(this.seed(j,{kind:'mail',step:'mail',notice:'cancelled',profile:b.profile,appointment:b.appointment}));}
    else if(ok&&body.id&&(b.verify_after==='delete'?body.status==='cancelled':(!b.modality||b.modality!=='meet'||advisor.meetUrl(body))&&body.status!=='cancelled'&&body.start?.dateTime&&Date.parse(body.start.dateTime)===Date.parse(b.slot.start)&&Date.parse(body.end?.dateTime)===Date.parse(b.slot.end)&&((b.flow==='reschedule'&&body.id===b.appointment.id)||(body.extendedProperties?.private?.orokLeadId===j.lead_id&&body.extendedProperties?.private?.orokRequestId===b.id)))){
     if(b.verify_after==='delete'){this.crm(data,lead,next,'appointment_cancelled',j.id,{calendar_event_id:b.appointment.id,note:'Cita cancelada en Calendar desde '+this.s.channel+'.'});changed=true;next.calendar_appointment={...b.appointment,status:'cancelled'};next.booking=null;reply('Tu cita fue cancelada.');}
     else {const r=this.confirm(data,lead,next,j,body);changed=r;reply(advisor.confirmation(b,body,label,RULES.location));jobs.push(this.seed(j,{kind:'mail',step:'mail',notice:b.flow==='reschedule'?'rescheduled':'scheduled',profile:b.profile,appointment:next.calendar_appointment}));}
    }else {state='unknown';reason='Calendar no confirmó el resultado esperado. Revisión humana necesaria; no repetir automáticamente.';next.booking={...b,phase:'review'};reply('No pude comprobar el resultado de la gestión de tu cita. El equipo debe revisarlo antes de intentar otro cambio.');}
   }else if(!ok){state='failed';reason='Calendar rechazó la operación'+(status?' (HTTP '+status+')':'')+'.';next.booking=t.booking?{...t.booking,phase:'review'}:null;reply('No pude completar la consulta de la agenda. Tu cita anterior, si existe, se conserva hasta comprobar el cambio. El equipo puede ayudarte a coordinar.');}
   else if(['list','recheck'].includes(j.step)){
    if(!Array.isArray(body.items)||body.nextPageToken){state='failed';reason='La respuesta de Calendar está incompleta; no se ofrecen horarios.';next.booking={...j.booking,phase:'review'};reply('No pude validar todos los horarios de la agenda. El equipo debe revisar la disponibilidad.');}
    else if(!current){state='cancelled';reason='Intervención humana o consulta más reciente.';}
    else if(j.step==='list'){
     const selected=[],days={};for(const candidate of candidates()){const day=candidate.start.slice(0,10);if(free(candidate,body.items,j.booking.appointment?.id)&&(days[day]||0)<2){selected.push(candidate);days[day]=(days[day]||0)+1;if(selected.length===6)break;}}
     if(!selected.length){next.booking=null;reply('No encuentro horarios disponibles en los próximos siete días. Puedes pedir hablar con un asesor para coordinar otra alternativa.');}
     else {const booking={...j.booking,phase:'slots',slots:selected,expires_at:new Date(Date.now()+15*60000).toISOString()};next.booking=booking;reply(j.booking.flow==='reschedule'?'Elige el nuevo horario. Tu cita actual se conserva hasta confirmar el cambio.':(j.booking.modality==='meet'?'Estos son los horarios disponibles para una asesoría por Meet.':j.booking.modality==='whatsapp'?'Estos son los horarios disponibles para una asesoría por WhatsApp.':'Estos son los horarios disponibles para visitar el showroom.')+' Elige uno para confirmar tu cita.',this.s.channel==='whatsapp'?slotButtons(booking):{list:{button:'Elegir horario',sections:[{title:'Visita al showroom',rows:selected.map(s=>({id:'orok:'+(booking.flow==='reschedule'?'reslot':'slot')+':'+booking.id+':'+Math.floor(Date.parse(s.start)/1000),title:s.label.slice(0,24),description:'45 minutos · '+RULES.location}))}]}});}
    }else {
     const b=j.booking,active=b.flow==='reschedule'?body.items.find(e=>e.id===b.appointment.id):null;
     if(b.flow==='new'&&activeOf(lead,next)){next.booking=null;reply('Ya existe una cita activa para este cliente en el CRM. Puedes reprogramarla o cancelarla.');}
     else if(b.flow==='reschedule'&&(!active||active.status==='cancelled'||active.extendedProperties?.private?.orokLeadId!==j.lead_id&&!(active.attendees||[]).some(a=>a.email?.toLowerCase()===b.profile.email?.toLowerCase()))){state='failed';reason='No se pudo verificar la cita activa antes de reprogramar.';next.booking={...b,phase:'review'};reply('El equipo debe verificar tu cita actual antes de cambiar el horario.');}
     else if(!validSlot(b.slot.start)||!free(b.slot,body.items,b.appointment?.id)){next.booking={...b,phase:'listing'};chain('list',next.booking);}
     else if(lock.owner&&lock.owner!==b.id&&lock.until>Date.now()){next.booking={...b,phase:'slots'};reply('Hay otra confirmación de agenda en curso. Espera un momento y vuelve a elegir el horario.');}
     else {const booking={...b,phase:'writing',existing_attendees:active?.attendees||[],event_id:b.flow==='reschedule'?b.appointment.id:'orok'+hash(j.lead_id+b.id).slice(0,40)};next.booking=booking;tx.set(lockRef,{owner:b.id,until:Date.now()+15*60000,lead_id:j.lead_id});chain('write',booking);}
    }
   }else if(j.step==='cancel_check'){
    if(!current){state='cancelled';reason='La conversación cambió.';}
    else if(body.id!==j.booking.appointment.id||body.status==='cancelled'){next.booking=null;reply('La cita ya no figura activa en Calendar. El equipo debe revisar su estado.');}
    else if(body.extendedProperties?.private?.orokLeadId!==j.lead_id&&!(body.attendees||[]).some(a=>a.email?.toLowerCase()===j.booking.profile.email?.toLowerCase())){state='failed';reason='No se pudo comprobar la relación entre el evento y el cliente.';reply('El equipo debe verificar la cita antes de cancelarla.');}
    else chain('delete',j.booking);
   }else if(j.step==='write'){
    const b=j.booking;if(body.id!==b.event_id||!body.start?.dateTime||Date.parse(body.start.dateTime)!==Date.parse(b.slot.start)||Date.parse(body.end?.dateTime)!==Date.parse(b.slot.end)||b.modality==='meet'&&!advisor.meetUrl(body)){chain('verify',{...b,verify_after:'write'});reason='Comprobando el evento y el horario devueltos por Calendar.';}
    else {changed=this.confirm(data,lead,next,j,body);reply(advisor.confirmation(b,body,label,RULES.location));jobs.push(this.seed(j,{kind:'mail',step:'mail',notice:b.flow==='reschedule'?'rescheduled':'scheduled',profile:b.profile,appointment:next.calendar_appointment}));}
   }else if(j.step==='delete'){
    const b=j.booking;this.crm(data,lead,next,'appointment_cancelled',j.id,{calendar_event_id:b.appointment.id,note:'Cita cancelada en Calendar desde '+this.s.channel+'.'});changed=true;next.calendar_appointment={...b.appointment,status:'cancelled'};next.booking=null;reply('Tu cita fue cancelada. Si deseas coordinar otra visita, con gusto te ayudo.');jobs.push(this.seed(j,{kind:'mail',step:'mail',notice:'cancelled',profile:b.profile,appointment:b.appointment}));
   }
   if(['write','verify'].includes(j.step)&&lock.owner===j.booking?.id&&!jobs.some(v=>v.kind==='calendar'))tx.set(lockRef,{...lock,owner:null,until:0});
   // Extra documents are read before the first write by using deterministic successor IDs.
   // tx writes above are limited to the mutex and are followed only by writes.
   for(const follow of jobs){if(!current&&follow.kind!=='mail')continue;const value=Object.fromEntries(Object.entries(follow).filter(([,v])=>v!==undefined));tx.set(this.s.jobs.doc(value.id),{...value,generation:next.generation,control_version:next.control_version||0});next.last_job_id=value.id;}
   tx.set(ref,{...j,state,reason,completed_at:iso(),provider_status:status||null});tx.set(tr,next);if(changed)write(data);return {ok:true,state,queued:jobs.length,reason,...(j.advisor_id?{advisor_alert:j.advisor_id,lead_id:j.lead_id,account:j.account}:{} )};
  });
  if(completed.advisor_alert)completed.internal_alerts=await this.s.alerts.send(completed.lead_id,completed.advisor_alert,completed.account);return completed;
 }
 confirm(data,lead,next,j,event){
  const b=j.booking;this.crm(data,lead,next,b.flow==='reschedule'?'appointment_rescheduled':'appointment_scheduled',j.id,{profile:b.profile,calendar_event_id:event.id,appointment_start:b.slot.start,note:'Visita '+(b.flow==='reschedule'?'reprogramada':'confirmada')+' desde '+this.s.channel+': '+label(b.slot.start)});
  const saved=(lead.appointments||[]).find(a=>a.calendar_event_id===event.id);if(saved){saved.modality=b.modality||'showroom';saved.meet_url=advisor.meetUrl(event);saved.end_at=b.slot.end;saved.calendar_html_url=event.htmlLink||null;saved.calendar_id=b.calendar_id||RULES.calendar;}
  next.calendar_appointment={id:event.id,calendar_id:b.calendar_id||RULES.calendar,start:b.slot.start,end:b.slot.end,status:'scheduled',modality:b.modality||'showroom',meet_url:advisor.meetUrl(event),url:event.htmlLink||null,profile:b.profile};next.booking=null;next.handoff=null;next.advisor_request=null;return true;
 }
 async trackOffer(leadId){
  return this.s.store.db.runTransaction(async tx=>{const ref=this.s.thread(leadId),t=(await tx.get(ref)).data();if(!t?.offer?.sent_at||t.offer.state!=='pending')return;tx.set(this.offers.doc(hash(leadId+t.offer.id)),{lead_id:leadId,offer_id:t.offer.id,control_version:t.control_version||0,due_at:t.offer.expires_at,state:'pending'});});
 }
 async recordOptOut(job){
  return this.s.store.run(async({tx,read,write})=>{const t=(await tx.get(this.s.thread(job.lead_id))).data()||{},data=read(),lead=data.leads.find(l=>l.id===job.lead_id);if(!lead||t.generation!==job.generation||(t.control_version||0)!==job.control_version||lead.opt_out)return;this.crm(data,lead,t,'opt_out',job.id,{note:'Baja de comunicaciones registrada por Lola desde '+this.s.channel+'.'});write(data);});
 }
 async maintenance(){
  await this.recover();
  const list=await this.offers.where('state','==','pending').limit(50).get();let expired=0;
  for(const row of list.docs){if(Date.parse(row.data().due_at)>Date.now())continue;await this.s.store.run(async({tx,read,write})=>{const ref=this.offers.doc(row.id),o=(await tx.get(ref)).data(),tr=this.s.thread(o.lead_id),t=(await tx.get(tr)).data()||{},data=read(),lead=data.leads.find(l=>l.id===o.lead_id);if(o.state!=='pending'||Date.parse(o.due_at)>Date.now())return;
   const eligible=lead&&t.offer?.id===o.offer_id&&t.offer.state==='pending'&&!t.opt_out&&t.mode==='auto'&&(t.control_version||0)===o.control_version&&!['Cita','Separación','Venta','Perdido'].includes(lead.status)&&!activeOf(lead,t);
   if(eligible){this.crm(data,lead,t,'follow_up',o.offer_id,{note:'No seleccionó una opción de atención durante las 24 horas posteriores al envío efectivo.',next_action:'Retomar contacto comercial'});write(data);expired++;tx.set(tr,{...t,offer:{...t.offer,state:'expired',expired_at:iso()}});}
   tx.set(ref,{...o,state:eligible?'expired':'superseded',resolved_at:iso()});});}
  return {ok:true,expired};
 }
 async recover(){
  const rows=await this.s.jobs.where('state','==','dispatching').limit(30).get();
  for(const row of rows.docs){if(Date.parse(row.data().lease_until)>Date.now())continue;
   await this.s.store.db.runTransaction(async tx=>{
    const ref=this.s.jobs.doc(row.id),snapshot=await tx.get(ref),j=snapshot.data();if(j.state!=='dispatching'||Date.parse(j.lease_until)>Date.now())return;
    if(j.kind==='calendar'&&['write','delete'].includes(j.step)){const follow=this.seed(j,this.task('verify',{...j.booking,verify_after:j.step,verify_attempt:0}));tx.set(this.s.jobs.doc(follow.id),follow);}
    tx.set(ref,{...j,state:'unknown',reason:j.kind==='mail'?'El aviso por correo debe revisarse; no se reenvía automáticamente.':'Se interrumpió la confirmación; se comprobará el evento antes de repetir.',updated_at:iso()});
   });
  }
 }
}
module.exports={audioBurstText,WhatsAppAgenda,RULES,candidates,free,validSlot,label,slotButtons,activeOf};
