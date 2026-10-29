'use strict';
const {createHash,randomUUID}=require('node:crypto'),{event}=require('./lifecycle'),{ECONOMIC,norm}=require('./lolaPolicy');
const SHOWROOM=require('./projectLocation');
const SALES={businessPhone:'51912971742',phones:['51987208622'],email:'ventas@orok.com.pe'};
const BODY='Equipo de ventas: LOLA recibió una solicitud de asesor. Cliente: {{1}}. Teléfono: {{2}}. Motivo: {{3}}. Revisa la conversación en el CRM para atenderla o coordinar una cita.';
const TEMPLATE={name:'orok_alerta_asesor_v1',language:'es',category:'UTILITY',components:[{type:'BODY',text:BODY,example:{body_text:[['Cliente de prueba','51900000000','Solicitud de asesor']]}}]};
const hash=s=>createHash('sha256').update(s).digest('hex');
function alertPhones(setup={}){return setup.environment==='test'&&setup.testAdvisorPhone?[setup.testAdvisorPhone]:SALES.phones;}
function optionsReply(delivered){return delivered?'Registramos tu solicitud y avisamos a Ventas. El asesor revisará contigo las condiciones comerciales. Puedes coordinar una cita por WhatsApp o Meet, o esperar su intervención.':'Tu solicitud está registrada; el aviso por correo necesita revisión. Puedes coordinar una cita por WhatsApp o Meet, o esperar al asesor.';}
function buttons(id){return {buttons:[['whatsapp','Cita por WhatsApp'],['meet','Cita por Meet'],['wait','Esperar al asesor']].map(([v,title])=>({type:'reply',reply:{id:'orok:advisor:'+v+':'+id,title}}))};}
function requested(text){return ECONOMIC.test(norm(text))||/\b(?:quiero|necesito|deseo|hablar|contactar|comunicarme|dame|pasa|pasame)\b.{0,60}\b(?:asesor|vendedor|persona real|humano)\b/.test(norm(text));}
function plan(a,{data,lead,t,next,m,input}){
 const text=String(m.text||''),button=input.message?.button_id||'',choice=/^orok:advisor:(whatsapp|meet|wait):([a-f0-9]{24})$/.exec(button);
 if(text.trim()==='/asesor')return {job:a.fixed('Ese comando es exclusivo del vendedor. Puedo registrar tu solicitud de asesor o coordinar una cita.'),changed:false};
 if(choice){const r=t.advisor_request;if(!r||r.id!==choice[2]||Date.parse(r.expires_at)<=Date.now())return {job:a.fixed('La opción de asesor venció o cambió. Escríbeme si deseas coordinar otra atención.'),changed:false};
  if(choice[1]==='wait'){next.mode='manual';next.control_version=(t.control_version||0)+1;next.handoff={choice:'seller',status:'Esperando intervención real del asesor',at:new Date().toISOString()};lead.lola_paused=true;lead.handoff_status='accepted';event(lead,'seller_wait_requested','LOLA',{channel:a.s.channel});return {job:a.fixed('Tu solicitud está registrada para el equipo de ventas. Quedamos a la espera de que un asesor tome la conversación; aún no se ha confirmado atención inmediata.'),changed:true};}
  if(!a.enabled())return {job:a.fixed('La agenda aún no está habilitada. Ventas tiene tu solicitud y debe coordinar contigo; todavía no hay una cita confirmada.'),changed:false};
  if(require('./whatsappAgenda').activeOf(lead,t))return {job:a.fixed('Ya tienes una cita registrada. Puedes pedir reprogramarla o cancelarla.'),changed:false};
  next.advisor_request={...r,choice:choice[1]};next.booking={flow:'new',intent:'advisor',modality:choice[1],id:randomUUID().replaceAll('-','').slice(0,24),phase:'contact',profile:{name:lead.name||'',email:lead.email||'',phone:lead.phone||t.phone,interest:lead.unit_interest||''}};return a.contact(next,text);
 }
 if(!requested(text)||t.booking&&['checking','writing','cancel_check','listing'].includes(t.booking.phase))return null;
 next.booking=null;next.cancellation=null;if(t.offer?.state==='pending')next.offer={...t.offer,state:'superseded'};
 if(t.advisor_request&&Date.parse(t.advisor_request.expires_at)>Date.now()){next.advisor_request={...t.advisor_request,insistence:(t.advisor_request.insistence||0)+1};if(lead.advisor_alert)lead.advisor_alert.insistence=next.advisor_request.insistence;event(lead,'advisor_insistence','LOLA',{channel:a.s.channel});return {job:a.fixed('Las condiciones comerciales las revisa un asesor. Tu solicitud ya está registrada. Puedes coordinar una cita por WhatsApp o Meet, o esperar a que el vendedor tome la conversación.',buttons(t.advisor_request.id)),changed:true};}
 const id=randomUUID().replaceAll('-','').slice(0,24),at=new Date().toISOString(),reason=ECONOMIC.test(norm(text))?'Consulta de precios o condiciones comerciales':'Solicitud de asesor';
 next.advisor_request={id,requested_at:at,expires_at:new Date(Date.now()+86400000).toISOString(),reason};next.handoff={choice:'advisor_scheduling',at,status:'Solicitud registrada; avisos de ventas pendientes'};
 lead.advisor_alert={id,at,reason,email:'pending',whatsapp:'pending',phones:alertPhones(a.s.gateway.setup())};lead.handoff_status='requested';lead.next_action='Atender solicitud de asesor; coordinar WhatsApp o Meet';lead.next_action_at=at;event(lead,'seller_requested','LOLA',{channel:a.s.channel,reason,request_id:id});
 const hasAppointment=!!require('./whatsappAgenda').activeOf(lead,t);if(hasAppointment){next.mode='manual';next.control_version=(t.control_version||0)+1;next.handoff={choice:'seller',at,status:'Solicitud registrada; esperando intervención real del asesor'};lead.lola_paused=true;lead.handoff_status='accepted';}
 return {job:{kind:'mail',step:'mail',notice:hasAppointment?'seller':'advisor_options',advisor_id:id,profile:{name:lead.name||'',email:lead.email||'',phone:lead.phone||t.phone,interest:lead.unit_interest||''},request_text:reason},changed:true};
}
function meetUrl(e){const status=e.conferenceData?.createRequest?.status?.statusCode;if(status&&status!=='success')return null;const raw=e.conferenceData?.entryPoints?.find(p=>p.entryPointType==='video')?.uri||e.hangoutLink;try{const u=new URL(raw);return u.protocol==='https:'&&u.hostname==='meet.google.com'&&!u.username&&!u.password?u.href:null;}catch{return null;}}
function visitClosing(id){return ['¡Será un gusto recibirte!','Nos encantará acompañarte en tu visita.','Te esperamos para que conozcas el proyecto.'][parseInt(hash(String(id||'visita')).slice(0,2),16)%3];}
function humanizeConfirmedReply(text){
 const original=String(text||''),m=/\. Solicitamos(?: a Calendar enviar)? la invitación a ([^\s]+)\.$/.exec(original);
 if(!m)return original;
 const base=original.slice(0,m.index)+'.',visit=/Tu visita quedó (?:confirmada|reprogramada)/.test(base);
 return base+'\nRevisa tu correo '+m[1]+' para la invitación y los detalles.\n'+(visit?visitClosing(base)+'\nAquí tienes cómo llegar: '+SHOWROOM.map:'Con gusto te acompañaremos en la asesoría.');
}
function confirmation(b,e,label,location){
 const when=new Intl.DateTimeFormat('es-PE',{timeZone:'America/Lima',weekday:'long',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(b.slot.start));
 const mail='Revisa tu correo '+b.profile.email+' para la invitación y los detalles.';
 if(b.modality==='meet')return 'Tu asesoría por Meet quedó confirmada para '+when+' (hora de Lima).\nPuedes unirte aquí: '+meetUrl(e)+'\n'+mail+'\nCon gusto te acompañaremos en la asesoría.';
 if(b.modality==='whatsapp')return 'Tu asesoría por WhatsApp quedó confirmada para '+when+' (hora de Lima). El asesor te atenderá por este canal a la hora acordada.\n'+mail;
 return 'Tu visita quedó '+(b.flow==='reschedule'?'reprogramada':'confirmada')+' para '+when+' (hora de Lima), en '+location+'.\n'+visitClosing(b.id)+'\nAquí tienes cómo llegar: '+SHOWROOM.map+'\n'+mail;
}
class AdvisorAlerts{
 constructor(s){this.s=s;this.jobs=s.store.ref.collection('lola_advisor_alerts');}
 async send(leadId,requestId,account){
  const d=await this.s.store.read(),lead=d.leads.find(l=>l.id===leadId);if(!lead||lead.advisor_alert?.id!==requestId)return {state:'superseded'};
  const outcomes=[];const accounts=this.s.gateway.setup().phoneNumberIds||[];if(!accounts.includes(account)&&accounts.length===1)account=accounts[0];
  for(const phone of alertPhones(this.s.gateway.setup())){const ref=this.jobs.doc(hash(leadId+requestId+phone));try{
   this.s.gateway.assertRecipient(account,phone,{send:true,automatic:true});if(phone===SALES.businessPhone)throw Error('El destino no puede ser el propio número de atención.');await this.s.gateway.approvedTemplate(account,TEMPLATE);
   const claimed=await this.s.store.db.runTransaction(async tx=>{if((await tx.get(ref)).exists)return false;tx.set(ref,{lead_id:leadId,request_id:requestId,phone,state:'sending',at:new Date().toISOString()});return true;});if(!claimed){outcomes.push({phone,state:'duplicate'});continue;}
   let id;try{id=await this.s.gateway.send(account,phone,{type:'template',template:{name:TEMPLATE.name,language:{code:'es'},components:[{type:'body',parameters:[lead.name||'Cliente',lead.phone||'No registrado',lead.advisor_alert.reason].map(text=>({type:'text',text:String(text).slice(0,150)}))}]}},{automatic:true});await this.s.store.db.runTransaction(async tx=>{const old=(await tx.get(ref)).data();tx.set(ref,{...old,state:'accepted',message_id:id});tx.set(this.s.receipts.doc(hash(account+'\0'+id)),{internal_notification:true,lead_id:leadId,request_id:requestId,message_recorded:false,message_id:id,business_phone_id:account});});outcomes.push({phone,state:'accepted',message_id:id});}catch(e){await this.s.store.db.runTransaction(async tx=>{const old=(await tx.get(ref)).data();tx.set(ref,{...old,state:id?'accepted_unrecorded':e.definitive?'failed':'unknown',reason:e.message});});outcomes.push({phone,state:'review',reason:e.message});}
  }catch(e){outcomes.push({phone,state:'blocked',reason:e.message});}}
  await this.s.store.run(({read,write})=>{const data=read(),l=data.leads.find(l=>l.id===leadId);if(l?.advisor_alert?.id===requestId){l.advisor_alert.whatsapp=outcomes;write(data);}});return {outcomes};
 }
}
module.exports={optionsReply,alertPhones,SALES,BODY,TEMPLATE,buttons,requested,plan,meetUrl,confirmation,humanizeConfirmedReply,AdvisorAlerts};
