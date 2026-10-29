'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{randomUUID,createHash}=require('node:crypto');
const {WhatsAppService,validateOutput,ECONOMIC_REPLY}=require('../business/whatsappService');
const {WhatsAppGateway,saveSetup,request}=require('../business/whatsappGateway');
const {metaEvents}=require('../business/whatsappInbox');
const {MemoryFirestore}=require('./memory-firestore.cjs'),{FirestoreProject}=require('../firestore-project.cjs');
const hash=v=>createHash('sha256').update(v).digest('hex');
const profile={name:null,phone:null,email:null,interest:null,purchase_method:null,initial_payment:null};
const result=(reply='¿Qué día te vendría mejor?',extra={})=>({reply,profile,handoff:false,opt_out:false,commercial_answer:false,commercial_evidence:[],...extra});
async function setup(){
 const db=new MemoryFirestore(),store=new FirestoreProject(db),privateDir=fs.mkdtempSync(path.join(os.tmpdir(),'orok-wa-')),sent=[];
 await store.initialize({settings:{projectName:'Infinity 224'},leads:[{id:'lead-1',name:'Confirmado',phone:'922222222',email:'cliente@example.test',status:'Cita',comment_history:[]},{id:'lead-2',phone:'933333333',status:'MQL'}],units:[{id:'unit-1',status:'available'}],quotes:[],separations:[]});
 const config={privateDir},gateway=new WhatsAppGateway(privateDir),s={ffmpegPath:'',enabled:true,sendingEnabled:true,automaticEnabled:true,environment:'test',phoneNumberIds:['1234567890'],testRecipients:['51922222222'],apiVersion:'v26.0',accessToken:'only-fake-token',appSecret:'s'.repeat(32),verifyToken:'v'.repeat(32)};
 fs.writeFileSync(path.join(privateDir,'whatsapp-inbox.json'),JSON.stringify(s));
 gateway.send=async(account,phone,content)=>{gateway.assertRecipient(account,phone,{send:true});sent.push({account,phone,content});return 'wamid.sent.'+sent.length;};
 gateway.media=async()=>({bytes:Buffer.from('fake-media'),mime:'audio/mp4',filename:'test.m4a'});
 gateway.uploadAudio=async()=> 'fake-media-upload';
 const service=new WhatsAppService(store,config,{gateway});
 const input=(id='m1',text='Hola',extra={})=>({business_phone_id:s.phoneNumberIds[0],phone:s.testRecipients[0],message:{id,type:'text',direction:'inbound',at:new Date().toISOString(),text,...extra}});
 await service.ingest(input());
 const mode=async value=>{const t=(await service.thread('lead-1').get()).data();return service.mode('lead-1',{mode:value,version:t.control_version||0},'Vendedor');};
 return {db,store,privateDir,gateway,service,sent,s,input,mode,close:()=>fs.rmSync(privateDir,{recursive:true,force:true})};
}
test('manual send is idempotent, maintains leads/positions/units and observes own echo without pausing automatic',async()=>{
 const t=await setup();try{const before=await t.store.read();await t.mode('manual');const input={request_id:randomUUID(),text:'Te ayudo a coordinarlo'};
 const one=await t.service.send('lead-1',input,'Ventas'),two=await t.service.send('lead-1',input,'Ventas');assert.equal(two.duplicate,true);assert.equal(t.sent.length,1);assert.deepEqual(await t.store.read(),before);
 await t.mode('auto');await t.service.ingest(t.input(one.message_id,'Te ayudo a coordinarlo',{direction:'outbound',sender:'WhatsApp/Mac'}));assert.equal((await t.service.thread('lead-1').get()).data().mode,'auto');
 }finally{t.close();}
});
test('sends require Manual, allowed test recipient, enabled connection and open 24-hour window',async()=>{
 const t=await setup();try{const input={request_id:randomUUID(),text:'Hola'};await assert.rejects(t.service.send('lead-1',input,'Ventas'),/Manual/);await t.mode('manual');
 const ref=t.service.thread('lead-1');await t.db.runTransaction(async tx=>{const data=(await tx.get(ref)).data();tx.set(ref,{...data,last_inbound_at:new Date(Date.now()-25*3600000).toISOString()});});
 await assert.rejects(t.service.send('lead-1',input,'Ventas'),/24 horas/);assert.equal(t.sent.length,0);
 assert.throws(()=>t.gateway.assertRecipient(t.s.phoneNumberIds[0],'51933333333',{send:true}),/autorizado/);
 fs.writeFileSync(path.join(t.privateDir,'whatsapp-inbox.json'),JSON.stringify({...t.s,sendingEnabled:false}));assert.throws(()=>t.gateway.assertRecipient(t.s.phoneNumberIds[0],t.s.testRecipients[0],{send:true}),/desactivado/);
 }finally{t.close();}
});
test('timeout is persisted as unknown and does not automatically retry an uncertain send',async()=>{
 const t=await setup();try{await t.mode('manual');let calls=0;t.gateway.send=async()=>{calls++;throw Error('Tiempo de espera de Meta');};const input={request_id:randomUUID(),text:'Hola'};
 await assert.rejects(t.service.send('lead-1',input,'Ventas'),/No se reintentará/);await assert.rejects(t.service.send('lead-1',input,'Ventas'),/ya fue intentado/);assert.equal(calls,1);assert.equal([...t.db.values.values()].some(v=>v.state==='unknown'),true);
 }finally{t.close();}
});
test('manual takeover and a phone/Mac echo cancel a generated response before sending',async()=>{
 const t=await setup();try{await t.mode('auto');await t.service.ingest(t.input('m2'));const claim=await t.service.claim();assert.ok(claim.job);await t.mode('manual');
 assert.equal((await t.service.complete({job_id:claim.job.id,lease_token:claim.job.lease_token,result:result()})).state,'cancelled');assert.equal(t.sent.length,0);
 await t.mode('auto');await t.service.ingest(t.input('m3'));const second=await t.service.claim();await t.service.ingest(t.input('phone-reply','Hola desde el celular',{direction:'outbound',sender:'Equipo'}));
 assert.equal((await t.service.complete({job_id:second.job.id,lease_token:second.job.lease_token,result:result()})).state,'cancelled');assert.equal((await t.service.thread('lead-1').get()).data().mode,'manual');assert.equal(t.sent.length,0);
 }finally{t.close();}
});
test('new inbound supersedes the old generation, duplicate webhooks never queue twice, and job leases are exclusive',async()=>{
 const t=await setup();try{await t.mode('auto');await t.service.ingest(t.input('m2'));const a=await t.service.claim();await t.service.ingest(t.input('m2'));assert.equal((await t.service.claim()).job,null);
 await t.service.ingest(t.input('m3'));assert.equal((await t.service.complete({job_id:a.job.id,lease_token:a.job.lease_token,result:result()})).state,'cancelled');const claims=await Promise.all([t.service.claim(),t.service.claim()]);assert.equal(claims.filter(c=>c.job).length,1);assert.equal(t.sent.length,0);
 }finally{t.close();}
});
async function deliverAdvisor(t){const j=(await t.service.claim()).job;assert.equal(j.kind,'mail');const auth={job_id:j.id,lease_token:j.lease_token};await t.service.agenda.begin(auth);await t.service.agenda.complete({...auth,status:200,response:{id:'gmail-alert'}});const fixed=(await t.service.claim()).job;await t.service.complete({job_id:fixed.id,lease_token:fixed.lease_token});return auth;}
test('economic requests alert sales and offer WhatsApp, Meet or waiting, without disclosing prices or changing the CRM stage',async()=>{const t=await setup();try{const before=await t.store.read();await t.mode('auto');await t.service.ingest(t.input('m2','¿Cuál es el precio?'));await deliverAdvisor(t);assert.equal(t.sent.length,1);assert.doesNotMatch(t.sent[0].content.interactive.body.text,/500000|S\//);assert.equal(t.sent[0].content.interactive.action.buttons.length,3);const d=await t.store.read();assert.equal(d.leads[0].status,before.leads[0].status);assert.equal(d.leads[0].name,before.leads[0].name);assert.ok(d.leads[0].advisor_alert);await t.service.ingest(t.input('m3','¿Tiene descuentos?'));const next=(await t.service.claim()).job;assert.ok(next.fixed_reply);await t.service.complete({job_id:next.id,lease_token:next.lease_token});assert.equal((await t.store.read()).leads[0].advisor_alert.insistence,1);}finally{t.close();}});
test('appointment selection is accepted once, keeps coordination open and never claims a booked appointment',async()=>{
 const t=await setup();try{await t.mode('auto');await t.service.ingest(t.input('m2','Quiero conocer mis opciones'));let {job}=await t.service.claim();await t.service.complete({job_id:job.id,lease_token:job.lease_token,result:result('Elige cómo continuar.',{handoff:true})});
 const id=t.sent[0].content.interactive.action.buttons[0].reply.id;await t.service.ingest(t.input('choice','Agendar cita',{type:'interactive',button_id:id}));job=(await t.service.claim()).job;assert.ok(job.fixed_reply);await t.service.complete({job_id:job.id,lease_token:job.lease_token});const tr=(await t.service.thread('lead-1').get()).data();assert.equal(tr.mode,'auto');assert.equal(tr.offer.state,'accepted');assert.equal(tr.handoff.choice,'appointment');assert.match(t.sent[1].content.text.body,/no hay una cita confirmada/);await assert.rejects(t.mode('auto'),/derivación/);
 await t.service.ingest(t.input('stale-button','Agendar cita',{type:'interactive',button_id:id}));const stale=(await t.service.claim()).job;assert.match(stale.fixed_reply,/ya fue atendida/);await t.service.complete({job_id:stale.id,lease_token:stale.lease_token});await t.service.ingest(t.input('fresh-question','¿Dónde queda el proyecto?'));assert.equal((await t.service.claim()).job.fixed_reply,undefined);
 }finally{t.close();}
});
test('suggestions require explicit request for old messages, never send, and remain editable',async()=>{
 const t=await setup();try{await t.mode('suggest');await t.service.requestSuggestion('lead-1','Ventas');const {job}=await t.service.claim();assert.ok(job);await t.service.complete({job_id:job.id,lease_token:job.lease_token,result:result()});const chat=await t.service.conversation('lead-1',{},await t.store.read());assert.equal(chat.suggestion.text,'¿Qué día te vendría mejor?');assert.equal(t.sent.length,0);assert.equal(chat.send_enabled,false);
 }finally{t.close();}
});
test('opt-out stops automatic messages and cannot be overridden by switching modes',async()=>{
 const t=await setup();try{await t.mode('auto');await t.service.ingest(t.input('m2','No me escriban más'));const {job}=await t.service.claim();assert.ok(job.opt_out_ack);const completed=await t.service.complete({job_id:job.id,lease_token:job.lease_token});assert.equal(completed.state,'complete');assert.equal(t.sent.length,1);await assert.rejects(t.mode('auto'),/baja/);await assert.rejects(t.service.send('lead-1',{request_id:randomUUID(),text:'Hola'},'Ventas'),/no recibir/);
 }finally{t.close();}
});
test('audio transcription gates pricing and can be downloaded only for an authorized claimed job',async()=>{
 const t=await setup();try{await t.mode('auto');await t.service.ingest(t.input('audio','',{type:'audio',media:{id:'1234',mime_type:'audio/mp4'}}));const {job}=await t.service.claim();
 await assert.rejects(t.service.jobMedia({job_id:job.id,lease_token:'wrong'}),/autorizado/);const bytes=await t.service.jobMedia({job_id:job.id,lease_token:job.lease_token});assert.equal(Buffer.from(bytes.base64,'base64').toString(),'fake-media');
 await t.service.complete({job_id:job.id,lease_token:job.lease_token,transcript:'cuál es el precio',result:result()});await deliverAdvisor(t);assert.match(t.sent[0].content.interactive.body.text,/asesor|Ventas/);assert.doesNotMatch(t.sent[0].content.interactive.body.text,/S\//);
 const chat=await t.service.conversation('lead-1',{},await t.store.read());assert.equal(chat.messages.find(m=>m.id==='audio').transcript,'cuál es el precio');
 }finally{t.close();}
});
test('unsupported audio recording reports conversion requirement; audio upload sends only after validation',async()=>{
 const t=await setup();try{await t.mode('manual');await assert.rejects(t.gateway.convertAudio(Buffer.from('abc'),'audio/webm'),/FFmpeg/);await t.service.send('lead-1',{request_id:randomUUID()},'Ventas',{audio:{bytes:Buffer.from('mp4'),mime:'audio/mp4'}});assert.equal(t.sent[0].content.type,'audio');
 }finally{t.close();}
});
test('coexistence echo parser identifies the recipient and button ID without inventing inbound messages',()=>{
 const payload={object:'whatsapp_business_account',entry:[{changes:[{field:'smb_message_echoes',value:{metadata:{phone_number_id:'1234567890'},message_echoes:[{id:'echo',from:'51911111111',to:'51922222222',timestamp:String(Math.floor(Date.now()/1000)),type:'text',text:{body:'Respuesta celular'}}]}}]}]};const events=metaEvents(payload);assert.equal(events[0].phone,'51922222222');assert.equal(events[0].message.direction,'outbound');
});
test('commercial evidence must come from observed tool output, not the model declaration alone',()=>{
 const out=result('Tiene dos dormitorios.',{commercial_answer:true,commercial_evidence:[{tool:'Catalogo_comercial_Sheets',data:'2D'}]});assert.throws(()=>validateOutput(out,{text:'área'}),/evidencia/);assert.equal(validateOutput({output:out,observed_evidence:[{tool:'Catalogo_comercial_Sheets',data:['2D']}]},{text:'área'}).commercial_answer,true);
 assert.throws(()=>validateOutput(result('Tiene dos dormitorios.'),{text:'hola'}),/evidencia/);assert.throws(()=>validateOutput(result('Oferta: 20%'),{text:'hola'}),/cifras/);
});
test('configuration never returns secrets, preserves blank keys and rejects invalid test recipients',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'orok-wa-settings-'));try{const input={enabled:true,sendingEnabled:false,automaticEnabled:false,environment:'test',apiVersion:'v26.0',phoneNumberIds:['123456789'],testRecipients:['51922222222'],accessToken:'fake-private-token',appSecret:'s'.repeat(32),verifyToken:'v'.repeat(32)};
 const publicConfig=saveSetup(dir,input,'Gerencia');assert.equal(publicConfig.configured,true);assert.equal(JSON.stringify(publicConfig).includes('fake-private-token'),false);saveSetup(dir,{...input,accessToken:''},'Gerencia');assert.equal(new WhatsAppGateway(dir).setup().accessToken,input.accessToken);assert.throws(()=>saveSetup(dir,{...input,testRecipients:[]},'Gerencia'),/pruebas/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('Meta HTTP transport rejects redirects, arbitrary hosts and embedded credentials before connecting',async()=>{
 for(const url of ['http://graph.facebook.com','https://evil.test','https://user:pass@graph.facebook.com','https://127.0.0.1'])await assert.rejects(request(url),/autorizado/);
});
test('captured profile is a reviewable proposal; explicit approval changes only selected fields without moving leads',async()=>{
 const t=await setup();try{const before=await t.store.read();await t.mode('suggest');await t.service.ingest(t.input('m2','Mi correo es nuevo@example.test'));const {job}=await t.service.claim();await t.service.complete({job_id:job.id,lease_token:job.lease_token,result:result('Gracias por compartirlo.',{profile:{...profile,email:'nuevo@example.test'}})});
 assert.deepEqual(await t.store.read(),before);const chat=await t.service.conversation('lead-1',{},await t.store.read());assert.equal(chat.proposed_profile.values.email,'nuevo@example.test');await t.service.applyProfile('lead-1',{proposal_id:chat.proposed_profile.id,fields:['email']},'Ventas');const after=await t.store.read();assert.equal(after.leads[0].email,'nuevo@example.test');assert.equal(after.leads[0].name,before.leads[0].name);assert.deepEqual(after.leads.map(l=>[l.id,l.status]),before.leads.map(l=>[l.id,l.status]));assert.deepEqual(after.units,before.units);
 }finally{t.close();}
});
test('expired worker lease has a bounded retry and becomes a visible failed job',async()=>{
 const t=await setup();try{await t.mode('auto');await t.service.ingest(t.input('m2'));let {job}=await t.service.claim();const ref=t.service.jobs.doc(job.id);await t.db.runTransaction(async tx=>{const j=(await tx.get(ref)).data();tx.set(ref,{...j,attempts:2,lease_until:new Date(Date.now()-1000).toISOString()});});assert.equal((await t.service.claim()).job,null);const chat=await t.service.conversation('lead-1',{},await t.store.read());assert.equal(chat.lola_status.state,'failed');assert.match(chat.lola_status.reason,/dos intentos/);assert.equal(t.sent.length,0);
 }finally{t.close();}
});
