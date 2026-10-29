'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{createHash}=require('node:crypto');
const {WhatsAppService}=require('../business/whatsappService'),{WhatsAppGateway}=require('../business/whatsappGateway'),{RULES,candidates,free,validSlot}=require('../business/whatsappAgenda'),{MemoryFirestore}=require('./memory-firestore.cjs'),{FirestoreProject}=require('../firestore-project.cjs');
const slotsOf=x=>x.interactive.action.buttons.filter(b=>/^orok:(?:slot|reslot):/.test(b.reply.id)).map(b=>b.reply);
const lastSlots=sent=>slotsOf(sent.findLast(x=>x.interactive?.action?.buttons?.some(b=>/^orok:(?:slot|reslot):/.test(b.reply.id))));
const profile={name:null,phone:null,email:null,interest:null,purchase_method:null,initial_payment:null};
const output=(reply='Con gusto.',extra={})=>({reply,profile,handoff:false,opt_out:false,commercial_answer:false,commercial_evidence:[],...extra});
async function setup({email='cliente@example.test',name='Cliente de prueba'}={}){
 const db=new MemoryFirestore(),store=new FirestoreProject(db),privateDir=fs.mkdtempSync(path.join(os.tmpdir(),'wa-agenda-')),sent=[],calls=[],events=new Map();
 await store.initialize({settings:{projectName:'Infinity 224'},leads:[{id:'lead-1',name,email,phone:'922222222',status:'MQL',source:'Facebook',campaign_name:'Campaña original'},{id:'lead-2',name:'Otro cliente',phone:'933333333',status:'Seguimiento'}],units:[],quotes:[],separations:[]});
 const gateway=new WhatsAppGateway(privateDir);fs.writeFileSync(path.join(privateDir,'whatsapp-inbox.json'),JSON.stringify({enabled:true,sendingEnabled:true,automaticEnabled:true,agendaEnabled:true,environment:'test',calendarId:'lola_fixture@group.calendar.google.com',phoneNumberIds:['1234567890'],testRecipients:['51922222222'],apiVersion:'v26.0',accessToken:'fake-token'}));
 gateway.send=async(account,phone,content)=>{sent.push(content);return 'wamid.sent.'+sent.length;};
 const service=new WhatsAppService(store,{privateDir},{gateway});let seq=0;
 const incoming=(text,button_id=null,id=null,type='text')=>({business_phone_id:'1234567890',phone:'51922222222',message:{id:id||'in-'+(++seq),at:new Date().toISOString(),direction:'inbound',type,text,button_id,...(type==='audio'?{media:{id:'audio-1',mime_type:'audio/mp4'}}:{})}});
 const ingest=async(text,button,id)=>{const i=incoming(text,button,id);await service.ingest(i);return i;};
 await ingest('Hola');await service.mode('lead-1',{mode:'auto',version:0},'Ventas');
 const response=async(j,task)=>{
  calls.push({step:j.step,task});
  if(j.kind==='mail')return {status:200,response:{id:'gmail-'+calls.length}};
  if(['list','recheck'].includes(j.step))return {status:200,response:{items:[...events.values()]}};
  if(j.step==='write'){
   const id=task.body.id||j.booking.appointment.id,value={...(events.get(id)||{}),...task.body,id,status:'confirmed',htmlLink:'https://calendar.google.com/event?eid=test'};events.set(id,value);return {status:200,response:value};
  }
  if(['cancel_check','verify'].includes(j.step)){const id=j.booking.event_id||j.booking.appointment.id;return events.has(id)?{status:200,response:events.get(id)}:{status:404,response:{error:{code:404}}};}
  if(j.step==='delete'){events.delete(j.booking.appointment.id);return {status:204,response:{}};}
  throw Error('Unknown fake step '+j.step);
 };
 async function drain(override){
  for(let i=0;i<30;i++){
   const {job}=await service.claim();if(!job)return;
   if(['calendar','mail'].includes(job.kind)){const b=await service.agenda.begin({job_id:job.id,lease_token:job.lease_token});if(!b.task)continue;const r=override?await override(job,b.task,response):await response(job,b.task);await service.agenda.complete({job_id:job.id,lease_token:job.lease_token,...r});}
   else await service.complete({job_id:job.id,lease_token:job.lease_token,result:output()});
  }throw Error('Queue did not finish');
 }
 async function offer(){await ingest('Quiero conocer las opciones de atención');const {job}=await service.claim();await service.complete({job_id:job.id,lease_token:job.lease_token,result:output('Elige cómo continuar.',{handoff:true})});return sent.at(-1).interactive.action.buttons;}
 async function list(){const buttons=await offer();await ingest('Agendar cita',buttons[0].reply.id);await drain();return lastSlots(sent);}
 async function book(){const slots=await list();const input=await ingest(slots[0].title,slots[0].id);await drain();return input;}
 return {db,store,service,gateway,privateDir,sent,calls,events,ingest,incoming,drain,response,offer,list,book,close:()=>fs.rmSync(privateDir,{recursive:true,force:true})};
}
test('preserves Telegram schedule rules and rejects past, Monday, outside hours and insufficient lead time',()=>{
 const clock=Date.parse('2026-10-19T16:00:00-05:00'),slots=candidates(clock);assert.equal(RULES.calendar,'ventas@orok.com.pe');assert.equal(RULES.duration,45);assert.equal(RULES.buffer,15);assert.ok(slots.length>6);assert.equal(slots[0].start,'2026-10-20T15:00:00.000Z');
 assert.equal(validSlot('2026-10-19T18:00:00-05:00',clock),false);assert.equal(validSlot('2026-10-20T09:00:00-05:00',clock),false);assert.equal(validSlot('2026-10-20T19:00:00-05:00',clock),false);
 const event={id:'busy',start:{dateTime:'2026-10-20T10:00:00-05:00'},end:{dateTime:'2026-10-20T10:45:00-05:00'}};assert.equal(free(slots[0],[event]),false);assert.equal(free(slots[1],[event]),true);assert.equal(free(slots[0],[event],'busy'),true);
});
test('full booking: verified paged WhatsApp buttons, recheck, one Calendar event, CRM appointment and sales notification',async()=>{
 const t=await setup();try{const before=await t.store.read();const original=await t.book();assert.equal(t.events.size,1);const create=t.calls.find(c=>c.step==='write').task;assert.equal(create.method,'POST');assert.match(create.url,/sendUpdates=all/);assert.equal(create.body.attendees[0].email,'cliente@example.test');assert.equal(create.body.start.timeZone,'America/Lima');
 const d=await t.store.read();assert.equal(d.leads[0].status,'Cita');assert.equal(d.leads[0].appointments.length,1);assert.equal(d.leads[0].source,'Facebook');assert.equal(d.leads[0].campaign_name,'Campaña original');assert.deepEqual(d.leads.map(l=>l.id),before.leads.map(l=>l.id));assert.deepEqual(d.leads[1],before.leads[1]);
 assert.equal(t.calls.filter(c=>c.step==='mail').length,1);assert.match(t.sent.find(x=>x.text?.body.includes('confirmada')).text.body,/confirmada/);await t.service.ingest(original);await t.drain();assert.equal(t.calls.filter(c=>c.step==='write').length,1);
 }finally{t.close();}
});
test('collects a missing email before reading Calendar and uses the explicit address in the invitation',async()=>{
 const t=await setup({email:''});try{const b=await t.offer();await t.ingest('Agendar cita',b[0].reply.id);await t.drain();assert.equal(t.calls.length,0);assert.match(t.sent.at(-1).text.body,/correo/);await t.ingest('Mi correo es otro@example.test');await t.drain();assert.equal(t.calls[0].step,'list');const s=lastSlots(t.sent);await t.ingest(s[0].title,s[0].id);await t.drain();assert.equal(t.calls.find(c=>c.step==='write').task.body.attendees[0].email,'otro@example.test');assert.equal((await t.store.read()).leads[0].email,'otro@example.test');
 }finally{t.close();}
});
test('slot forged, old or belonging to another request cannot create a Calendar event',async()=>{
 const t=await setup();try{await t.list();await t.ingest('Horario','orok:slot:'+'f'.repeat(24)+':1792580400');await t.drain();assert.equal(t.events.size,0);assert.equal(t.calls.some(c=>c.step==='write'),false);assert.match(t.sent.at(-1).text.body,/no pertenece/);
 }finally{t.close();}
});
test('a newly occupied slot is checked again and replaced with options without creating a conflicting appointment',async()=>{
 const t=await setup();try{const slots=await t.list(),token=Number(slots[0].id.split(':').at(-1))*1000;t.events.set('external',{id:'external',start:{dateTime:new Date(token).toISOString()},end:{dateTime:new Date(token+45*60000).toISOString()}});await t.ingest(slots[0].title,slots[0].id);await t.drain();assert.equal(t.calls.some(c=>c.step==='write'),false);assert.equal(t.events.size,1);assert.equal(t.sent.at(-1).interactive.type,'button');
 }finally{t.close();}
});
test('reprogramming updates the same Calendar event and CRM appointment instead of creating a second one',async()=>{
 const t=await setup();try{await t.book();const id=[...t.events.keys()][0];await t.ingest('Quiero reprogramar mi cita');await t.drain();const slots=slotsOf(t.sent.at(-1));await t.ingest(slots[1].title,slots[1].id);await t.drain();assert.equal(t.events.size,1);assert.ok(t.events.has(id));const patch=t.calls.filter(c=>c.step==='write').at(-1).task;assert.equal(patch.method,'PATCH');assert.match(patch.url,new RegExp(id));assert.equal((await t.store.read()).leads[0].appointments.length,1);assert.match(t.sent.findLast(x=>x.text?.body.includes('reprogramada')).text.body,/reprogramada/);
 }finally{t.close();}
});
test('cancel requires explicit bound confirmation; No preserves event and Yes deletes it and records Seguimiento',async()=>{
 const t=await setup();try{await t.book();await t.ingest('Cancelar mi cita');await t.drain();let buttons=t.sent.at(-1).interactive.action.buttons;await t.ingest('Conservar',buttons[1].reply.id);await t.drain();assert.equal(t.events.size,1);assert.equal(t.calls.some(c=>c.step==='delete'),false);
 await t.ingest('Cancelar mi cita');await t.drain();buttons=t.sent.at(-1).interactive.action.buttons;const input=await t.ingest('Sí, cancelar',buttons[0].reply.id);await t.drain();assert.equal(t.events.size,0);const d=await t.store.read();assert.equal(d.leads[0].status,'Seguimiento');assert.equal(d.leads[0].appointments[0].status,'cancelled');assert.equal(d.leads[1].status,'Seguimiento');await t.service.ingest(input);await t.drain();assert.equal(t.calls.filter(c=>c.step==='delete').length,1);
 }finally{t.close();}
});
test('seller selection registers the real handoff, notifies sales and pauses Lola',async()=>{
 const t=await setup();try{const b=await t.offer();await t.ingest('Hablar con asesor',b[1].reply.id);await t.drain();assert.equal(t.calls[0].step,'mail');assert.equal(t.calls[0].task.to,'ventas@orok.com.pe');const d=await t.store.read();assert.equal(d.leads[0].lola_paused,true);assert.equal(d.leads[0].handoff_status,'accepted');assert.equal((await t.service.thread('lead-1').get()).data().mode,'manual');assert.match(t.sent.at(-1).text.body,/avisamos/);
 }finally{t.close();}
});
test('mail failure does not claim notification success and is not retried automatically',async()=>{
 const t=await setup();try{const b=await t.offer();await t.ingest('Hablar con asesor',b[1].reply.id);let count=0;await t.drain(async(j,task,normal)=>{if(j.kind==='mail'){count++;return {status:0,error:'timeout',response:{}};}return normal(j,task);});assert.equal(count,1);assert.match(t.sent.at(-1).text.body,/no pudo confirmarse/);await t.drain();assert.equal(count,1);
 }finally{t.close();}
});
test('Calendar write timeout reconciles by deterministic ID and records only the event actually returned',async()=>{
 const t=await setup();try{const slots=await t.list();await t.ingest(slots[0].title,slots[0].id);let writes=0;await t.drain(async(j,task,normal)=>{if(j.step==='write'){writes++;await normal(j,task);return {status:0,error:'timeout',response:{}};}return normal(j,task);});assert.equal(writes,1);assert.equal(t.events.size,1);assert.ok(t.calls.some(c=>c.step==='verify'));assert.equal((await t.store.read()).leads[0].status,'Cita');
 }finally{t.close();}
});
test('manual takeover before dispatch cancels a queued appointment operation with no Calendar write',async()=>{
 const t=await setup();try{const slots=await t.list();await t.ingest(slots[0].title,slots[0].id);await t.service.mode('lead-1',{mode:'manual',version:1},'Ventas');await t.drain();assert.equal(t.events.size,0);assert.equal(t.calls.some(c=>c.step==='write'),false);assert.equal((await t.store.read()).leads[0].status,'MQL');
 }finally{t.close();}
});
test('an already dispatched successful booking is reconciled into CRM after takeover without a bot confirmation',async()=>{
 const t=await setup();try{const slots=await t.list();await t.ingest(slots[0].title,slots[0].id);const r=(await t.service.claim()).job;let task=(await t.service.agenda.begin({job_id:r.id,lease_token:r.lease_token})).task;await t.service.agenda.complete({job_id:r.id,lease_token:r.lease_token,...await t.response(r,task)});
 const j=(await t.service.claim()).job;task=(await t.service.agenda.begin({job_id:j.id,lease_token:j.lease_token})).task;const reply=await t.response(j,task),sent=t.sent.length;await t.service.mode('lead-1',{mode:'manual',version:1},'Ventas');await t.service.agenda.complete({job_id:j.id,lease_token:j.lease_token,...reply});assert.equal((await t.store.read()).leads[0].status,'Cita');await t.drain();assert.equal(t.sent.length,sent);
 }finally{t.close();}
});
test('no selection after 24 hours moves only the eligible lead to Seguimiento and never Perdido',async()=>{
 const t=await setup();try{await t.offer();const thread=t.service.thread('lead-1');await t.db.runTransaction(async tx=>{const d=(await tx.get(thread)).data();tx.set(thread,{...d,offer:{...d.offer,expires_at:new Date(Date.now()-1000).toISOString()}});});
 const offers=await t.service.agenda.offers.where('state','==','pending').get();await t.db.runTransaction(async tx=>{for(const o of offers.docs)tx.set(o.ref,{...o.data(),due_at:new Date(Date.now()-1000).toISOString()});});
 const first=await t.service.agenda.maintenance();assert.equal(first.expired,1);const d=await t.store.read();assert.equal(d.leads[0].status,'Seguimiento');assert.equal(d.leads[1].status,'Seguimiento');assert.equal(d.leads.some(l=>l.status==='Perdido'),false);assert.equal((await t.service.agenda.maintenance()).expired,0);
 }finally{t.close();}
});
test('manual control or an appointment prevents expiry from demoting a lead',async()=>{
 const t=await setup();try{await t.offer();await t.service.mode('lead-1',{mode:'manual',version:1},'Ventas');const rows=await t.service.agenda.offers.where('state','==','pending').get();await t.db.runTransaction(async tx=>{for(const row of rows.docs)tx.set(row.ref,{...row.data(),due_at:new Date(Date.now()-1000).toISOString()});});await t.service.agenda.maintenance();assert.equal((await t.store.read()).leads[0].status,'MQL');
 }finally{t.close();}
});
test('audio cancellation intent goes through the same confirmation flow without letting the language model delete an event',async()=>{
 const t=await setup();try{await t.book();await t.service.ingest(t.incoming('',null,'audio-command','audio'));const {job}=await t.service.claim();assert.equal(await t.service.agenda.routeTranscript(job,'Quiero cancelar mi cita'),true);await t.drain();assert.equal(t.events.size,1);assert.equal(t.sent.at(-1).interactive.action.buttons.length,2);assert.equal(t.calls.some(c=>c.step==='delete'),false);
 }finally{t.close();}
});
test('unconfirmed write outcome never claims a booking or moves the CRM lead to Cita',async()=>{
 const t=await setup();try{const slots=await t.list();await t.ingest(slots[0].title,slots[0].id);await t.drain(async(j,task,normal)=>j.step==='write'?{status:0,error:'timeout',response:{}}:normal(j,task));assert.equal(t.events.size,0);assert.equal((await t.store.read()).leads[0].status,'MQL');assert.equal(t.sent.some(m=>m.text?.body.includes('visita quedó confirmada')),false);assert.match(t.sent.at(-1).text.body,/No pude comprobar/);
 }finally{t.close();}
});
test('incomplete or unauthorized Calendar list cannot be turned into available slots',async()=>{
 const t=await setup();try{const b=await t.offer();await t.ingest('Agendar cita',b[0].reply.id);await t.drain(async(j,task,normal)=>j.step==='list'?{status:200,response:{items:[],nextPageToken:'unread-page'}}:normal(j,task));assert.equal(t.sent.some(m=>m.interactive?.type==='list'),false);assert.equal(t.events.size,0);assert.equal((await t.store.read()).leads[0].status,'MQL');assert.match(t.sent.at(-1).text.body,/validar todos/);
 }finally{t.close();}
});
test('new conversational text while a selected appointment is checking does not discard the booking request',async()=>{
 const t=await setup();try{const slots=await t.list();await t.ingest(slots[0].title,slots[0].id);await t.ingest('Gracias');await t.drain();assert.equal(t.events.size,1);assert.equal((await t.store.read()).leads[0].status,'Cita');assert.ok(t.sent.some(m=>m.text?.body.includes('visita quedó confirmada')));
 }finally{t.close();}
});
test('interrupted mail dispatch is marked unknown after lease expiry and never sent again automatically',async()=>{
 const t=await setup();try{const b=await t.offer();await t.ingest('Hablar con asesor',b[1].reply.id);const {job}=await t.service.claim();await t.service.agenda.begin({job_id:job.id,lease_token:job.lease_token});const ref=t.service.jobs.doc(job.id);await t.db.runTransaction(async tx=>{const j=(await tx.get(ref)).data();tx.set(ref,{...j,lease_until:new Date(Date.now()-1000).toISOString()});});await t.service.agenda.maintenance();assert.equal((await ref.get()).data().state,'unknown');assert.equal((await t.service.claim()).job,null);assert.equal(t.calls.length,0);
 }finally{t.close();}
});
test('WhatsApp opt-out is reflected in the CRM record and does not change the stage or neighboring leads',async()=>{
 const t=await setup();try{const before=await t.store.read();await t.ingest('STOP');await t.drain();const d=await t.store.read();assert.equal(d.leads[0].opt_out,true);assert.equal(d.leads[0].status,before.leads[0].status);assert.deepEqual(d.leads[1],before.leads[1]);assert.equal(t.calls.length,0);assert.equal(t.sent.length,1);
 }finally{t.close();}
});
test('a client can explicitly request an adviser after booking without being trapped by the already-accepted offer',async()=>{
 const t=await setup();try{await t.book();await t.ingest('Quiero hablar con un asesor');await t.drain();assert.equal((await t.service.thread('lead-1').get()).data().mode,'manual');assert.equal((await t.store.read()).leads[0].handoff_status,'accepted');assert.equal(t.calls.filter(c=>c.step==='mail').length,2);assert.equal(t.events.size,1);
 }finally{t.close();}
});
test('a queued write that becomes too late is not sent to Calendar and returns to availability lookup',async()=>{
 const t=await setup();try{const slots=await t.list();await t.ingest(slots[0].title,slots[0].id);const check=(await t.service.claim()).job;const task=(await t.service.agenda.begin({job_id:check.id,lease_token:check.lease_token})).task;await t.service.agenda.complete({job_id:check.id,lease_token:check.lease_token,...await t.response(check,task)});
 const write=(await t.service.claim()).job;const ref=t.service.jobs.doc(write.id);await t.db.runTransaction(async tx=>{const j=(await tx.get(ref)).data();tx.set(ref,{...j,booking:{...j.booking,slot:{...j.booking.slot,start:new Date(Date.now()+3600000).toISOString()}}});});const auth=await t.service.agenda.begin({job_id:write.id,lease_token:write.lease_token});assert.equal(auth.task,null);assert.equal(t.events.size,0);assert.equal((await ref.get()).data().state,'failed');assert.equal((await t.service.claim()).job.step,'list');
 }finally{t.close();}
});

test('WhatsApp Ver más rotates all six real slots and rejects a forged page without a Calendar write',async()=>{
 const t=await setup();try{await t.list();const seen=new Set();for(let page=0;page<3;page++){const buttons=t.sent.at(-1).interactive.action.buttons;assert.equal(buttons.length,3);for(const b of buttons.slice(0,2))seen.add(b.reply.id);await t.ingest('Ver más horarios',buttons[2].reply.id);await t.drain();}assert.equal(seen.size,6);const booking=(await t.service.thread('lead-1').get()).data().booking;await t.ingest('Ver más','orok:slotpage:'+booking.id+':9');await t.drain();assert.match(t.sent.at(-1).text.body,/venció/);assert.equal(t.events.size,0);}finally{t.close();}
});

const spokenSlot=slot=>{const d=new Date(Date.parse(slot.start)-5*3600000);return `El ${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}/${d.getUTCFullYear()} a las ${d.getUTCHours()}:00`;};
async function audio(t,id,transcript){await t.service.ingest(t.incoming('',null,id,'audio'));const {job}=await t.service.claim();assert.equal(job.type,'audio');const r=await t.service.complete({job_id:job.id,lease_token:job.lease_token,transcript,result:output()});assert.equal(r.routed_to_agenda,true);await t.drain();}

test('a first WhatsApp showroom text request reaches Calendar without an email-origin trigger; written day/time needs explicit confirmation',async()=>{const t=await setup();try{await t.ingest('Quiero visitar el showroom');await t.drain();assert.equal(t.calls[0].step,'list');assert.equal(t.events.size,0);const b=(await t.service.thread('lead-1').get()).data().booking;await t.ingest(spokenSlot(b.slots[0]));await t.drain();assert.equal(t.events.size,0);assert.equal((await t.service.thread('lead-1').get()).data().booking.phase,'confirm');assert.match(t.sent.at(-1).interactive.body.text,/hora de Lima/);assert.equal(t.calls.some(c=>c.step==='write'),false);await t.ingest('Sí, confirmo');await t.drain();assert.equal(t.events.size,1);const create=t.calls.find(c=>c.step==='write').task;assert.equal(create.body.start.dateTime,b.slots[0].start);assert.ok(t.sent.some(c=>c.text?.body.includes('Tu visita quedó confirmada')));assert.equal((await t.store.read()).leads[0].appointments.length,1);}finally{t.close();}});

test('WhatsApp audio initiates a visit, selects an offered day/time and confirms by audio in the same thread',async()=>{const t=await setup();try{await audio(t,'audio-request','Quisiera visitar el showroom');assert.equal(t.events.size,0);const b=(await t.service.thread('lead-1').get()).data().booking;await audio(t,'audio-time',spokenSlot(b.slots[0]));assert.equal(t.events.size,0);assert.equal((await t.service.thread('lead-1').get()).data().booking.phase,'confirm');await audio(t,'audio-yes','Sí, confirmo ese día y hora');assert.equal(t.events.size,1);assert.equal(t.calls.find(c=>c.step==='write').task.body.start.dateTime,b.slots[0].start);const chat=await t.service.conversation('lead-1',{},await t.store.read());assert.equal(chat.messages.filter(m=>m.type==='audio'&&m.transcript).length,3);assert.ok(chat.messages.some(m=>m.text?.includes('Tu visita quedó confirmada')));}finally{t.close();}});

test('email is requested for the invitation after a WhatsApp-origin visit request, never as the initiating channel',async()=>{const t=await setup({email:''});try{await t.ingest('Quiero visitar el showroom');await t.drain();assert.match(t.sent.at(-1).text.body,/correo.*invitación/);assert.equal(t.calls.length,0);await audio(t,'audio-email','Mi correo es visita@example.test');assert.equal(t.calls[0].step,'list');const b=(await t.service.thread('lead-1').get()).data().booking;assert.equal(b.profile.email,'visita@example.test');assert.equal(t.events.size,0);}finally{t.close();}});

test('an ambiguous day/time or a bare yes without a valid pending confirmation cannot reserve',async()=>{const t=await setup();try{await t.ingest('Quiero visitar el showroom');await t.drain();await t.ingest('Mañana a las cuatro');await t.drain();await t.ingest('Sí');await t.drain();assert.equal(t.events.size,0);assert.equal(t.calls.some(c=>c.step==='write'),false);assert.equal((await t.service.thread('lead-1').get()).data().booking.phase,'slots');}finally{t.close();}});

test('the customer can reject the interpreted time and an old confirmation button cannot reserve it later',async()=>{const t=await setup();try{await t.ingest('Quiero visitar el showroom');await t.drain();const b=(await t.service.thread('lead-1').get()).data().booking;await t.ingest(spokenSlot(b.slots[0]));await t.drain();const old=t.sent.at(-1).interactive.action.buttons[0].reply.id;await t.ingest('No confirmo');await t.drain();assert.equal(t.events.size,0);await t.ingest('Confirmar',old);await t.drain();assert.equal(t.events.size,0);assert.match(t.sent.at(-1).text.body,/venció o cambió/);}finally{t.close();}});

test('Calendar is rechecked after text confirmation; a slot occupied meanwhile is not booked',async()=>{const t=await setup();try{await t.ingest('Quiero visitar el showroom');await t.drain();const b=(await t.service.thread('lead-1').get()).data().booking,s=b.slots[0];await t.ingest(spokenSlot(s));await t.drain();t.events.set('busy',{id:'busy',start:{dateTime:s.start},end:{dateTime:s.end}});await t.ingest('Sí, confirmo');await t.drain();assert.equal(t.calls.some(c=>c.step==='recheck'),true);assert.equal(t.calls.some(c=>c.step==='write'),false);assert.equal(t.events.size,1);assert.equal((await t.store.read()).leads[0].appointments,undefined);}finally{t.close();}});

async function internalAlerts(t){const f=path.join(t.privateDir,'whatsapp-inbox.json'),setup=JSON.parse(fs.readFileSync(f,'utf8'));setup.testRecipients.push('51987208622','51951532021');fs.writeFileSync(f,JSON.stringify(setup));t.gateway.approvedTemplate=async(a,d)=>{assert.equal(d.name,'orok_alerta_asesor_v1');return {status:'APPROVED'};};const recipients=[],send=t.gateway.send;t.gateway.send=async(a,p,c)=>{recipients.push({a,p,c});return send(a,p,c);};return recipients;}
test('price or adviser intent alerts only the confirmed organization phone and email; retired external phone is never notified',async()=>{const t=await setup();try{const recipients=await internalAlerts(t);await t.ingest('Dame precios');await t.drain();assert.deepEqual(recipients.filter(r=>r.c.type==='template').map(r=>r.p),['51987208622']);assert.equal(recipients.some(r=>r.p==='51912971742'||r.p==='51951532021'),false);assert.equal(t.calls.find(c=>c.step==='mail').task.to,'ventas@orok.com.pe');let lead=(await t.store.read()).leads[0];assert.equal(lead.advisor_alert.email,'accepted');assert.equal(lead.advisor_alert.whatsapp.filter(x=>x.state==='accepted').length,1);const chat=await t.service.conversation('lead-1',{},await t.store.read());assert.equal(chat.messages.some(m=>m.type==='template'),false);await t.ingest('Quiero un asesor y necesito precios');await t.drain();assert.equal(t.calls.filter(c=>c.step==='mail').length,1);assert.equal(recipients.filter(r=>r.c.type==='template').length,1);assert.equal((await t.store.read()).leads[0].advisor_alert.insistence,1);}finally{t.close();}});
test('an adviser Meet appointment uses future Calendar slots, a real returned link and organizer reminders',async()=>{const t=await setup();try{await t.ingest('Quiero un asesor');await t.drain();const options=t.sent.at(-1).interactive.action.buttons;await t.ingest('Cita por Meet',options[1].reply.id);await t.drain();const b=(await t.service.thread('lead-1').get()).data().booking;assert.equal(b.modality,'meet');assert.ok(b.slots.every(s=>Date.parse(s.start)>=Date.now()+2*3600000-1000));const slots=lastSlots(t.sent);await t.ingest(slots[0].title,slots[0].id);await t.drain(async(j,task,normal)=>{const r=await normal(j,task);if(j.step==='write'){r.response.conferenceData={createRequest:{status:{statusCode:'success'}},entryPoints:[{entryPointType:'video',uri:'https://meet.google.com/abc-defg-hij'}]};t.events.set(r.response.id,r.response);}return r;});const task=t.calls.find(c=>c.step==='write').task;assert.match(task.url,/conferenceDataVersion=1/);assert.equal(task.body.conferenceData.createRequest.conferenceSolutionKey.type,'hangoutsMeet');assert.ok(task.body.attendees.some(a=>a.email==='ventas@orok.com.pe'));assert.deepEqual(task.body.reminders.overrides,[{method:'email',minutes:30},{method:'popup',minutes:10}]);const a=(await t.store.read()).leads[0].appointments[0];assert.equal(a.modality,'meet');assert.equal(a.meet_url,'https://meet.google.com/abc-defg-hij');assert.ok(t.sent.some(m=>m.text?.body.includes('https://meet.google.com/abc-defg-hij')));}finally{t.close();}});
test('a pending or missing Meet link is verified and never invented or announced as a ready Meet appointment',async()=>{const t=await setup();try{await t.ingest('Quiero un asesor');await t.drain();await t.ingest('Meet',t.sent.at(-1).interactive.action.buttons[1].reply.id);await t.drain();const s=lastSlots(t.sent)[0];await t.ingest(s.title,s.id);await t.drain();assert.equal(t.events.size,1);assert.equal(t.calls.filter(c=>c.step==='write').length,1);assert.ok(t.calls.some(c=>c.step==='verify'));assert.equal(t.sent.some(m=>m.text?.body.includes('asesoría por Meet quedó confirmada')),false);assert.equal((await t.service.thread('lead-1').get()).data().booking.phase,'review');}finally{t.close();}});
test('the WhatsApp advisory option creates one scheduled event without Meet and never a meeting in thirty minutes',async()=>{const t=await setup();try{await t.ingest('Quiero un asesor');await t.drain();await t.ingest('WhatsApp',t.sent.at(-1).interactive.action.buttons[0].reply.id);await t.drain();let b=(await t.service.thread('lead-1').get()).data().booking;await t.ingest('Ahora en treinta minutos','orok:slot:'+b.id+':'+Math.floor((Date.now()+30*60000)/1000));await t.drain();assert.equal(t.events.size,0);const s=b.slots[0];await t.ingest(s.label,'orok:slot:'+b.id+':'+Math.floor(Date.parse(s.start)/1000));await t.drain();const task=t.calls.find(c=>c.step==='write').task;assert.equal(task.body.conferenceData,undefined);assert.match(task.body.summary,/WhatsApp/);assert.equal((await t.store.read()).leads[0].appointments[0].modality,'whatsapp');assert.ok(t.sent.some(m=>m.text?.body.includes('asesoría por WhatsApp quedó confirmada')));}finally{t.close();}});
test('a customer cannot activate /asesor, while the authenticated operator command takes control without sending the command',async()=>{const t=await setup();try{await t.ingest('/asesor');await t.drain();assert.equal((await t.service.thread('lead-1').get()).data().mode,'auto');const count=t.sent.length;const r=await t.service.send('lead-1',{text:'/asesor'},'Vendedor autorizado');assert.equal(r.control_command,true);assert.equal(r.message_sent_to_customer,false);assert.equal(t.sent.length,count);assert.equal((await t.service.thread('lead-1').get()).data().mode,'manual');assert.equal((await t.store.read()).leads[0].lola_paused,true);}finally{t.close();}});
test('an authorized internal salesperson replies /asesor to the alert for the exact client, without creating a new lead',async()=>{const t=await setup();try{const recipients=await internalAlerts(t);await t.ingest('Quiero un asesor');await t.drain();const internal=recipients.find(r=>r.c.type==='template'),receipt=[...t.db.values.values()].find(v=>v.internal_notification&&v.lead_id==='lead-1');assert.ok(receipt);const before=(await t.store.read()).leads.length;await t.service.ingest({business_phone_id:'1234567890',phone:internal.p,message:{id:'advisor-reply',direction:'inbound',type:'text',text:'/asesor',reply_to:receipt.message_id,at:new Date().toISOString()}});assert.equal((await t.service.thread('lead-1').get()).data().mode,'manual');assert.equal((await t.store.read()).leads.length,before);const echo=await t.service.ingest({business_phone_id:'1234567890',phone:internal.p,message:{id:receipt.message_id,direction:'outbound',type:'text',text:'aviso',at:new Date().toISOString()}});assert.equal(echo.internal_notification,true);}finally{t.close();}});


test('rehearsal Calendar create, reschedule and cancel stay bound to their dedicated calendar',async()=>{
 const t=await setup();try{
  await t.book();let d=await t.store.read();assert.equal(d.leads[0].appointments[0].calendar_id,'lola_fixture@group.calendar.google.com');assert.equal((await t.service.thread('lead-1').get()).data().calendar_appointment.calendar_id,'lola_fixture@group.calendar.google.com');
  await t.ingest('Quiero reprogramar mi cita');await t.drain();const slots=lastSlots(t.sent);await t.ingest(slots[1].title,slots[1].id);await t.drain();
  await t.ingest('Cancelar mi cita');await t.drain();await t.ingest('Sí cancelar',t.sent.at(-1).interactive.action.buttons[0].reply.id);await t.drain();
  assert.equal(t.events.size,0);for(const c of t.calls.filter(c=>c.task.kind==='calendar'))assert.ok(c.task.url.startsWith('https://www.googleapis.com/calendar/v3/calendars/lola_fixture%40group.calendar.google.com/events'));
  assert.match(t.calls.find(c=>c.step==='write').task.body.summary,/ENSAYO LOLA/);
 }finally{t.close();}
});
test('changing calendar after a time offer blocks provider dispatch and preserves the original calendar',async()=>{
 const t=await setup();try{
  const slots=await t.list();await t.ingest(slots[0].title,slots[0].id);const {job}=await t.service.claim();assert.equal(job.kind,'calendar');
  const file=path.join(t.privateDir,'whatsapp-inbox.json'),c=JSON.parse(fs.readFileSync(file,'utf8'));c.calendarId='different_test@group.calendar.google.com';fs.writeFileSync(file,JSON.stringify(c));
  const before=t.calls.length,r=await t.service.agenda.begin({job_id:job.id,lease_token:job.lease_token});assert.equal(r.task,null);assert.equal(r.state,'failed');assert.match(r.reason,/calendario cambió/);assert.equal(t.calls.length,before);assert.equal(t.events.size,0);assert.equal((await t.service.thread('lead-1').get()).data().booking.phase,'review');
 }finally{t.close();}
});
test('an existing appointment is not cancelled through a different selected calendar',async()=>{
 const t=await setup();try{
  await t.book();const file=path.join(t.privateDir,'whatsapp-inbox.json'),c=JSON.parse(fs.readFileSync(file,'utf8'));c.calendarId='different_test@group.calendar.google.com';fs.writeFileSync(file,JSON.stringify(c));
  const before=t.calls.length;await t.ingest('Cancelar mi cita');await t.drain();assert.equal(t.events.size,1);assert.equal(t.calls.length,before);assert.match(t.sent.at(-1).text.body,/otro calendario/);
 }finally{t.close();}
});


test('consecutive audio parts are both transcribed; only the latest routes their combined visit request',async()=>{
 const t=await setup({email:''});try{
  await t.service.ingest(t.incoming('',null,'burst-visit','audio'));await t.service.ingest(t.incoming('',null,'burst-email','audio'));
  const a=(await t.service.claim()).job;assert.equal(a.message_id,'burst-visit');assert.equal(a.archive_only,true);assert.equal((await t.service.claim()).job,null,'another worker waits for the earlier audio transcription');
  assert.equal(await t.service.agenda.routeTranscript(a,'Quiero visitar el showroom'),true);assert.equal((await t.service.jobs.doc(a.id).get()).data().transcript_only,true);assert.equal(t.sent.length,0);
  const b=(await t.service.claim()).job;assert.equal(b.message_id,'burst-email');assert.equal(await t.service.agenda.routeTranscript(b,'Mi correo es ana@example.test'),true);
  await t.drain();assert.equal(t.events.size,0);assert.equal(t.calls.filter(c=>c.step==='list').length,1);assert.equal(lastSlots(t.sent).length,2);assert.equal((await t.store.read()).leads[0].email,'ana@example.test');
 }finally{t.close();}
});
test('a later negative audio does not revive an earlier visit request',async()=>{
 const t=await setup();try{await t.service.ingest(t.incoming('',null,'old-visit','audio'));await t.service.ingest(t.incoming('',null,'negative','audio'));const a=(await t.service.claim()).job;await t.service.agenda.routeTranscript(a,'Quiero visitar el showroom');const b=(await t.service.claim()).job;assert.equal(await t.service.agenda.routeTranscript(b,'No quiero visitar el showroom'),false);assert.equal((await t.service.thread('lead-1').get()).data().booking,undefined);assert.equal(t.calls.length,0);}finally{t.close();}
});
test('an opt-out in an earlier audio stops pending replies instead of being discarded by a newer audio',async()=>{
 const t=await setup();try{await t.service.ingest(t.incoming('',null,'audio-stop','audio'));await t.service.ingest(t.incoming('',null,'after-stop','audio'));const a=(await t.service.claim()).job;assert.equal(await t.service.agenda.routeTranscript(a,'No me escribas'),true);assert.equal((await t.store.read()).leads[0].opt_out,true);assert.equal((await t.service.claim()).job,null);assert.equal(t.sent.length,0);}finally{t.close();}
});
test('human takeover after audio claim archives its transcription without booking or replying',async()=>{
 const t=await setup();try{await t.service.ingest(t.incoming('',null,'claimed-audio','audio'));const a=(await t.service.claim()).job;await t.service.mode('lead-1',{mode:'manual',version:1},'Ventas');assert.equal(await t.service.agenda.routeTranscript(a,'Quiero visitar el showroom'),true);assert.equal((await t.service.jobs.doc(a.id).get()).data().state,'cancelled');assert.equal(t.calls.length,0);assert.equal(t.sent.length,0);}finally{t.close();}
});
test('audio burst context excludes other accounts, old statements and turns answered already',()=>{
 const {audioBurstText}=require('../business/whatsappAgenda'),at='2026-10-23T20:00:00Z',job={message_id:'now',account:'123',created_at:at};
 const rows=[{id:'old',direction:'inbound',text:'Antiguo',at:'2026-10-23T19:50:00Z'},{id:'answered',direction:'inbound',text:'Atendido',at:'2026-10-23T19:58:00Z'},{id:'out',direction:'outbound',text:'Respuesta',at:'2026-10-23T19:59:00Z'},{id:'other',business_phone_id:'999',direction:'inbound',transcript:'Otra cuenta',at:'2026-10-23T19:59:10Z'},{id:'first',business_phone_id:'123',direction:'inbound',transcript:'Quiero visitar el showroom',at:'2026-10-23T19:59:20Z'},{id:'now',direction:'inbound',at}];
 assert.equal(audioBurstText(rows,job,'Mi correo es ana@example.test'),'Quiero visitar el showroom\nMi correo es ana@example.test');
});


test('test adviser override receives internal alert without swallowing normal client messages; takeover needs a reply to the bound alert',async()=>{
 const t=await setup();try{const recipients=await internalAlerts(t),file=path.join(t.privateDir,'whatsapp-inbox.json'),c=JSON.parse(fs.readFileSync(file,'utf8'));c.testAdvisorPhone='51922222222';fs.writeFileSync(file,JSON.stringify(c));
  await t.ingest('Dame precios');await t.drain();assert.deepEqual(recipients.filter(r=>r.c.type==='template').map(r=>r.p),['51922222222']);let lead=(await t.store.read()).leads[0];const alert=lead.advisor_alert.whatsapp[0].message_id;
  const normal=await t.service.ingest(t.incoming('Hola, sigo consultando'));assert.equal(normal.internal_notification,undefined);const before=(await t.service.conversation('lead-1',{},await t.store.read())).messages.length;
  const input=t.incoming('/asesor');input.message.reply_to=alert;const response=await t.service.ingest(input);assert.equal(response.control_command,true);assert.equal(response.message_sent_to_customer,false);assert.equal((await t.service.thread('lead-1').get()).data().mode,'manual');const chat=await t.service.conversation('lead-1',{},await t.store.read());assert.equal(chat.messages.length,before);assert.equal(chat.messages.some(m=>m.type==='template'),false);assert.equal((await t.store.read()).leads.length,2);
 }finally{t.close();}
});
test('production ignores a rehearsal adviser override and retains only the approved organization destination',()=>{const {alertPhones}=require('../business/advisorRouting');assert.deepEqual(alertPhones({environment:'test',testAdvisorPhone:'51955318057'}),['51955318057']);assert.deepEqual(alertPhones({environment:'production',testAdvisorPhone:'51955318057'}),['51987208622']);assert.deepEqual(alertPhones(),['51987208622']);});
