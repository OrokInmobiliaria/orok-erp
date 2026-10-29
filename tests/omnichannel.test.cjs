'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {MemoryFirestore}=require('./memory-firestore.cjs'),{FirestoreProject}=require('../firestore-project.cjs');
const {WhatsAppService,explicitResume}=require('../business/whatsappService');
const {SocialInbox}=require('../business/socialInbox'),{Omnichannel,choiceId,plainContent,mediaDownload,metaLeadProfile}=require('../business/omnichannel');
const profile={name:null,phone:null,email:null,interest:null,purchase_method:null,initial_payment:null};
const output=(extra={})=>({reply:'Con gusto.',profile,handoff:false,opt_out:false,commercial_answer:false,commercial_evidence:[],...extra});
async function setup(){
 const db=new MemoryFirestore(),store=new FirestoreProject(db),sent=[],config={privateDir:__dirname};
 await store.initialize({settings:{projectName:'Infinity 224'},leads:[],units:[],quotes:[],separations:[]});
 const waSettings={environment:'test',calendarId:'shared_fixture@group.calendar.google.com',enabled:true,automaticEnabled:true,agendaEnabled:true,newConversationMode:'auto',phoneNumberIds:['1234567890']};
 const whatsapp=new WhatsAppService(store,config,{gateway:{setup:()=>waSettings,assertRecipient:()=>{},send:async(a,p,c)=>{sent.push({channel:'whatsapp',content:c});return 'wa.sent.'+sent.length;}}});
 const socialSettings={instagram:{enabled:true,accountId:'111111',environment:'test',testRecipients:['98765432101234567'],automaticEnabled:true,agendaEnabled:true,newConversationMode:'auto',sendingEnabled:true},messenger:{enabled:true,accountId:'222222',environment:'test',testRecipients:['98765432101234567'],automaticEnabled:true,agendaEnabled:true,newConversationMode:'auto',sendingEnabled:true}};
 const social=new SocialInbox(store,config,{gateway:{setup:()=>socialSettings,assertSend:t=>{if(!socialSettings[t.channel]?.sendingEnabled)throw Error('Envío desactivado');return socialSettings[t.channel];},send:async(t,text)=>{sent.push({channel:t.channel,text});return 'social.sent.'+sent.length;}}});
 const common=new Omnichannel(store,config,whatsapp,social);social.common=common;let sequence=0;
 const incoming=(channel,text,extra={})=>({channel,account_id:socialSettings[channel].accountId,contact_id:'98765432101234567',name:'Cliente de prueba',message:{id:'in.'+(++sequence),direction:'inbound',at:new Date().toISOString(),text,type:'text'},...extra});
 const reply=async extra=>{const {job}=await common.claim();assert.ok(job);return common.action({action:'lola_job_complete',engine:job.engine,job_id:job.id,lease_token:job.lease_token,result:output(extra)});};
 return {db,store,whatsapp,social,common,sent,incoming,reply,socialSettings,waSettings};
}
test('social ingress creates exactly one CRM lead, handles first message automatically and keeps scoped identity',async()=>{
 const t=await setup(),input=t.incoming('instagram','Hola'),first=await t.common.ingest(input);await t.common.ingest(input);
 assert.equal((await t.store.read()).leads.length,1);const job=(await t.common.claim()).job;assert.equal(job.channel,'instagram');assert.equal(job.lead_id,first.lead_id);assert.match(job.engine,/^lola_instagram_/);
 await t.common.action({action:'lola_job_complete',engine:job.engine,job_id:job.id,lease_token:job.lease_token,result:output()});assert.equal(t.sent.length,1);assert.equal(t.sent[0].channel,'instagram');assert.equal((await t.common.claim()).job,null);
 const chat=await t.social.conversation(first.thread_id);assert.equal(chat.mode,'auto');assert.equal(chat.lead_id,first.lead_id);assert.equal(chat.messages.length,2);
});
test('Instagram and Messenger use one agenda implementation and preserve separate conversation identities',async()=>{
 const t=await setup();const a=await t.common.ingest(t.incoming('instagram','Hola'));const b=await t.common.ingest(t.incoming('messenger','Hola'));
 assert.notEqual(a.lead_id,b.lead_id);assert.notEqual(t.common.engine('instagram','111111').namespace,t.common.engine('messenger','222222').namespace);assert.equal(t.common.engine('instagram','111111').agenda.constructor,t.whatsapp.agenda.constructor);
 const jobs=[(await t.common.claim()).job,(await t.common.claim()).job];assert.deepEqual(new Set(jobs.map(j=>j.channel)),new Set(['instagram','messenger']));
});
test('explicit email persists in automatic mode; model-only profile remains a proposal',async()=>{
 const t=await setup(),r=await t.common.ingest(t.incoming('instagram','Mi correo es cliente@example.test'));await t.reply({profile:{...profile,email:'inventado@example.test'}});
 const lead=(await t.store.read()).leads.find(l=>l.id===r.lead_id);assert.equal(lead.email,'cliente@example.test');const chat=await t.social.conversation(r.thread_id);assert.equal(chat.proposed_profile,undefined);
 const e=t.common.engine('instagram','111111');assert.equal((await e.thread(r.lead_id).get()).data().proposed_profile.values.email,'inventado@example.test');
});
test('expired offers get a new identity, three new options and a tracked deadline after delivery',async()=>{
 const t=await setup(),r=await t.common.ingest(t.incoming('instagram','Quiero conocer las opciones de atención'));await t.reply({handoff:true});const e=t.common.engine('instagram','111111'),ref=e.thread(r.lead_id),old=(await ref.get()).data().offer;
 await t.db.runTransaction(async tx=>{const s=(await tx.get(ref)).data();tx.set(ref,{...s,offer:{...s.offer,state:'expired',expires_at:new Date(Date.now()-1000).toISOString()}});});
 await t.common.ingest(t.incoming('instagram','Quiero agendar otra vez'));await t.reply({handoff:true});const renewed=(await ref.get()).data().offer;
 assert.notEqual(renewed.id,old.id);assert.ok(renewed.sent_at);assert.match(t.sent.at(-1).text,/1\. Agendar cita/);assert.match(t.sent.at(-1).text,/3\. Visitar showroom/);assert.equal((await e.agenda.offers.where('state','==','pending').get()).docs.length,2);
});
test('optout stops automation; only an explicit customer resume restores it with an audit event',async()=>{
 const t=await setup(),r=await t.common.ingest(t.incoming('instagram','Hola'));await t.reply();await t.common.ingest(t.incoming('instagram','No me escribas'));await t.reply();
 await t.common.ingest(t.incoming('instagram','Gracias'));assert.equal((await t.common.claim()).job,null);
 await t.common.ingest(t.incoming('instagram','Quiero retomar la conversación'));const job=(await t.common.claim()).job;assert.ok(job);const e=t.common.engine('instagram','111111'),state=(await e.thread(r.lead_id).get()).data();assert.equal(state.opt_out,false);assert.equal(state.mode,'auto');assert.equal((await e.thread(r.lead_id).collection('audit').get()).docs.length,1);
 assert.equal(explicitResume('El cliente preguntó si podría retomar luego'),false);
});
test('a normalized form is idempotent, links by confirmed email and never starts an unsolicited message',async()=>{
 const t=await setup(),p={action:'lola_form',channel:'web',account_id:'sitio-orok',event_id:'form:123',profile:{name:'Cliente',email:'cliente@example.test'}};
 const a=await t.common.action(p),b=await t.common.action(p);assert.equal(a.lead_id,b.lead_id);assert.equal(b.duplicate,true);assert.equal(t.sent.length,0);assert.equal((await t.store.read()).leads.length,1);
 await assert.rejects(t.common.action({...p,event_id:'otro',profile:{email:'invalido'}}),/Correo/);
});
test('ambiguous phone/email matches never silently merge different CRM leads',async()=>{
 const t=await setup();await t.common.form({channel:'web',account_id:'sitio',event_id:'f1',profile:{email:'uno@example.test',phone:'51911111111'}});await t.common.form({channel:'web',account_id:'sitio',event_id:'f2',profile:{email:'dos@example.test',phone:'51922222222'}});
 await assert.rejects(t.common.form({channel:'web',account_id:'sitio',event_id:'f3',profile:{email:'uno@example.test',phone:'51922222222'}}),/leads distintos/);assert.equal((await t.store.read()).leads.length,2);
});
test('text choices bind to current request and calendar slot instead of inventing new actions',()=>{
 const t={offer:{id:'a'.repeat(24),state:'pending',expires_at:new Date(Date.now()+60000).toISOString()}};assert.equal(choiceId(t,'2'),'orok:seller:'+t.offer.id);
 t.booking={id:'b'.repeat(24),flow:'reschedule',phase:'slots',slots:[{start:'2026-10-27T15:00:00Z'}]};assert.match(choiceId(t,'1'),/^orok:reslot:/);assert.equal(choiceId(t,'quiero 100 departamentos'),null);
});
test('social manual takeover cancels queued bot work and manual sending uses the same ledger',async()=>{
 const t=await setup(),r=await t.common.ingest(t.incoming('instagram','Hola'));let chat=await t.social.conversation(r.thread_id);await t.social.control(r.thread_id,{mode:'manual',version:chat.control_version},'Ventas');assert.equal((await t.common.claim()).job,null);
 await t.social.send(r.thread_id,{request_id:'11111111-1111-1111-1111-111111111111',text:'Atención humana'},'Ventas');assert.equal(t.sent.length,1);assert.equal(t.sent[0].text,'Atención humana');
});
test('all channels share the same calendar mutex and audio downloads reject unsafe hosts',async()=>{
 const t=await setup();assert.equal(t.common.engine('instagram','111111').agenda.locks.path,t.whatsapp.agenda.locks.path);for(const u of ['http://lookaside.fbsbx.com/a','https://127.0.0.1/a','https://evil.test/a','https://user:pass@lookaside.fbsbx.com/a'])await assert.rejects(mediaDownload(u),/autorizado/);
 assert.equal(plainContent({type:'text',text:{body:'Hola'}}),'Hola');
});
for(const channel of ['instagram','messenger'])test(channel+': book, reschedule and cancel one Calendar event through the shared engine',async()=>{
 const t=await setup(),r=await t.common.ingest(t.incoming(channel,'Mi correo es cliente@example.test'));await t.reply();const e=t.common.engine(channel,t.socialSettings[channel].accountId),events=new Map();
 async function drain(){for(let count=0;count<30;count++){const {job}=await t.common.claim();if(!job)return;if(!['calendar','mail'].includes(job.kind)){await t.common.action({action:'lola_job_complete',engine:job.engine,job_id:job.id,lease_token:job.lease_token,result:output()});continue;}
  const p={engine:job.engine,job_id:job.id,lease_token:job.lease_token},begin=await t.common.action({action:'lola_task_begin',...p});if(!begin.task)continue;const task=begin.task;let response={},status=200;
  if(job.kind==='mail')response={id:'mail.1'};
  else if(['list','recheck'].includes(job.step))response={items:[...events.values()]};
  else if(job.step==='write'){const id=task.body.id||job.booking.appointment.id;response={...(events.get(id)||{}),...task.body,id,status:'confirmed'};events.set(id,response);}
  else if(['cancel_check','verify'].includes(job.step)){response=events.get(job.booking.event_id||job.booking.appointment.id)||{};if(!response.id)status=404;}
  else if(job.step==='delete'){events.delete(job.booking.appointment.id);status=204;}
  await t.common.action({action:'lola_task_complete',...p,status,response});
 }throw Error('La cola no finalizó');}
 await t.common.ingest(t.incoming(channel,'Quiero conocer las opciones de atención'));await t.reply({handoff:true});await t.common.ingest(t.incoming(channel,'1'));await drain();assert.match(t.sent.at(-1).text,/1\./);
 await t.common.ingest(t.incoming(channel,'1'));await drain();assert.equal(events.size,1);const original=[...events.keys()][0];assert.equal([...events.values()][0].extendedProperties.private.orokChannel,channel);assert.equal((await t.store.read()).leads.find(l=>l.id===r.lead_id).status,'Cita');
 await t.common.ingest(t.incoming(channel,'Quiero reprogramar mi cita'));await drain();await t.common.ingest(t.incoming(channel,'2'));await drain();assert.equal(events.size,1);assert.equal([...events.keys()][0],original);
 await t.common.ingest(t.incoming(channel,'Cancelar mi cita'));await drain();assert.match(t.sent.at(-1).text,/cancelarla/);await t.common.ingest(t.incoming(channel,'1'));await drain();assert.equal(events.size,0);const lead=(await t.store.read()).leads.find(l=>l.id===r.lead_id);assert.equal(lead.status,'Seguimiento');assert.equal(lead.appointments.length,1);assert.equal(lead.appointments[0].status,'cancelled');
});
test('a form and a later social message with the same confirmed email resolve to one lead',async()=>{
 const t=await setup(),form=await t.common.form({channel:'web',account_id:'sitio',event_id:'f1',profile:{name:'Cliente',email:'cliente@example.test'}}),message=await t.common.ingest(t.incoming('instagram','Mi correo es cliente@example.test'));
 assert.equal(form.lead_id,message.lead_id);assert.equal((await t.store.read()).leads.length,1);
});

test('social engines inherit the same calendar and keep the stricter rehearsal guard',async()=>{const t=await setup();for(const c of ['instagram','messenger']){const e=t.common.engine(c,t.socialSettings[c].accountId);assert.equal(e.agenda.calendarId(),t.waSettings.calendarId);assert.equal(e.agenda.enabled(),true);t.socialSettings[c].environment='production';assert.equal(e.gateway.setup().environment,'test');}t.waSettings.agendaEnabled=false;assert.equal(t.common.engine('instagram','111111').agenda.enabled(),false);});

test('Meta lead forms accept Spanish field names and ignore an invalid test-phone placeholder',async()=>{
 const profile=metaLeadProfile([
  {name:'nombre_y_apellidos',values:['<test lead: dummy data for nombre_y_apellidos>']},
  {name:'número_de_teléfono',values:['<test lead: dummy data for número_de_teléfono>']},
  {name:'correo_electrónico',values:['test@meta.com']}
 ]);
 assert.equal(profile.name,'<test lead: dummy data for nombre_y_apellidos>');assert.equal(profile.email,'test@meta.com');assert.equal(profile.phone,'');
 const t=await setup(),id='1435802445308968';t.common.formRequester=async()=>({status:200,data:{id,created_time:'2026-10-24T19:22:47+0000',field_data:[{name:'nombre_y_apellidos',values:['Cliente Meta']},{name:'número_de_teléfono',values:['+51 955 318 057']},{name:'correo_electrónico',values:['cliente@meta.test']}]}});
 const result=await t.common.metaForms({entry:[{id:'222222',changes:[{field:'leadgen',value:{leadgen_id:id,form_id:'1093205949870688'}}]}]},'messenger',{accountId:'222222',environment:'test',testLeadFormIds:['1093205949870688'],apiVersion:'v26.0',accessToken:'page-token'});
 assert.equal(result.length,1);const lead=(await t.store.read()).leads[0];assert.equal(lead.name,'Cliente Meta');assert.equal(lead.phone,'51955318057');assert.equal(lead.email,'cliente@meta.test');assert.equal(lead.source,'Meta · formulario');
});