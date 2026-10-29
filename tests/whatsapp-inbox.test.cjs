'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {WhatsAppInbox,normalizeMessage,metaEvents,statusUpdate}=require('../business/whatsappInbox');
const {FirestoreProject}=require('../firestore-project.cjs');
const {MemoryFirestore}=require('./memory-firestore.cjs');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {CloudAuth}=require('../cloud-auth.cjs');
const {createServer}=require('../server.cjs');
const fixture=()=>({settings:{projectName:'Infinity 224',defaultSalesOwner:'Antonio'},leads:[{id:'one',name:'Primero',phone:'911111111',status:'MQL'},{id:'target',name:'Nombre confirmado',phone:'922222222',status:'Cita',comment_history:[]},{id:'three',name:'Tercero',phone:'933333333',status:'Separación'}],units:[]});
const message=(overrides={})=>({business_phone_id:'business-1',phone:'51922222222',name:'Nombre desde WhatsApp',message:{id:'wamid.1',direction:'inbound',type:'text',text:'Quiero visitar el showroom',at:new Date(Date.now()-1000).toISOString()},...overrides});
async function setup(){const db=new MemoryFirestore(),store=new FirestoreProject(db);await store.initialize(fixture());return {db,store,inbox:new WhatsAppInbox(store)};}
test('observer stores messages separately and does not change any existing lead, state or position',async()=>{
 const {store,inbox}=await setup(),before=await store.read();
 const result=await inbox.ingest(message({referral:{source_type:'ad',source_id:'ad-123',ctwa_clid:'click-id'}}));
 assert.equal(result.lead_id,'target');assert.equal(result.created,false);assert.equal(result.reply_disabled,true);
 assert.deepEqual(await store.read(),before);
 const chat=await inbox.conversation('target',{},await store.read());
 assert.equal(chat.mode,'observer');assert.equal(chat.send_enabled,false);assert.equal(chat.lola_enabled,false);assert.equal(chat.messages.length,1);assert.equal(chat.last_referral.source_id,'ad-123');assert.equal(chat.window_open,true);
});
test('repeated webhook messages are permanently idempotent and do not duplicate leads or messages',async()=>{
 const {store,inbox}=await setup(),input=message();await inbox.ingest(input);
 const repeat=await inbox.ingest(input);assert.equal(repeat.duplicate,true);assert.equal(repeat.writes,0);
 assert.equal((await inbox.conversation('target',{},await store.read())).message_count,1);
});
test('a new inbound phone appends one Lead Inicial without changing preexisting leads',async()=>{
 const {store,inbox}=await setup(),before=await store.read();
 const result=await inbox.ingest(message({phone:'51944444444'}));assert.equal(result.created,true);
 const after=await store.read();assert.deepEqual(after.leads.slice(0,3),before.leads);assert.equal(after.leads[3].status,'Lead Inicial');assert.equal(after.leads[3].sales_owner,'Antonio');
 await inbox.ingest(message({phone:'944444444'}));assert.equal((await store.read()).leads.length,4);
});
test('ambiguous phones and archived contacts are not silently duplicated or reactivated',async()=>{
 const {store,inbox}=await setup();await store.run(({read,write})=>{const d=read();d.leads.push({id:'duplicate',phone:'51922222222',status:'Perdido'});d.archived_leads=[{id:'archived',phone:'955555555'}];write(d);});
 await assert.rejects(inbox.ingest(message()),/más de un lead/);
 await assert.rejects(inbox.ingest(message({phone:'51955555555'})),/archivado/);
 assert.equal((await store.read()).leads.length,4);
});
test('an outbound copy can be recorded but never creates a lead or sends a message',async()=>{
 const {store,inbox}=await setup();await inbox.ingest(message({message:{...message().message,id:'out-1',direction:'outbound',sender:'LeadCenter',text:'Hola'}}));
 const chat=await inbox.conversation('target',{},await store.read());assert.equal(chat.messages[0].sender,'LeadCenter');assert.equal(chat.window_open,false);
 await assert.rejects(inbox.ingest(message({phone:'51944444444',message:{...message().message,direction:'outbound'}})),/no puede crear/);
});
test('delivery callbacks before message recording and out-of-order events do not regress read status',async()=>{
 const {store,inbox}=await setup(),at=new Date(Date.now()-500).toISOString();
 await inbox.status({business_phone_id:'business-1',message_id:'out-1',status:'read',at});
 await inbox.ingest(message({message:{...message().message,id:'out-1',direction:'outbound',text:'Respuesta externa'}}));
 await inbox.status({business_phone_id:'business-1',message_id:'out-1',status:'sent',at});
 await inbox.status({business_phone_id:'business-1',message_id:'out-1',status:'failed',at});
 const chat=await inbox.conversation('target',{},await store.read());assert.equal(chat.messages[0].status,'read');assert.equal(chat.window_open,false);
});
test('same message ID from distinct business numbers does not collide and pagination is bounded',async()=>{
 const {store,inbox}=await setup(),at=message().message.at;
 for(let i=0;i<6;i++)await inbox.ingest(message({message:{...message().message,id:'m-'+i,at}}));
 await inbox.ingest(message({business_phone_id:'business-2',message:{...message().message,id:'m-0',at}}));
 const first=await inbox.conversation('target',{limit:3},await store.read()),second=await inbox.conversation('target',{limit:3,before:first.next_before},await store.read());
 assert.equal(first.message_count,7);assert.equal(first.messages.length,3);assert.equal(first.has_more,true);assert.equal(second.messages.length,3);
 assert.equal(new Set([...first.messages,...second.messages].map(row=>row.business_phone_id+row.id)).size,6);
 await assert.rejects(inbox.conversation('target',{before:'../../bad'},await store.read()),/Página/);
});
test('expired inbound windows and historical notes never imply permission to send',async()=>{
 const {store,inbox}=await setup();await inbox.ingest(message({message:{...message().message,at:new Date(Date.now()-25*3600000).toISOString()}}));
 await store.run(({read,write})=>{const d=read();d.leads[1].comment_history=[{id:'old',text:'WhatsApp · Cliente: conversación anterior',at:new Date().toISOString(),author:'WhatsApp · Histórico'}];write(d);});
 const before=await store.read(),chat=await inbox.conversation('target',{},before);assert.equal(chat.window_open,false);assert.equal(chat.send_enabled,false);assert.equal(chat.legacy.length,1);assert.deepEqual(await store.read(),before);
});
test('raw Meta events retain text, media metadata, button selection and campaign referral safely',()=>{
 const payload={object:'whatsapp_business_account',entry:[{changes:[{field:'messages',value:{metadata:{phone_number_id:'business-1'},contacts:[{wa_id:'51922222222',profile:{name:'Cliente'}}],messages:[{id:'m1',from:'51922222222',timestamp:String(Math.floor(Date.now()/1000)),type:'image',image:{id:'media-id',mime_type:'image/jpeg',caption:'Plano'},referral:{source_type:'ad',source_id:'123'}},{id:'m2',from:'51922222222',timestamp:String(Math.floor(Date.now()/1000)),type:'interactive',interactive:{button_reply:{title:'Visitar showroom'}}}],statuses:[{id:'out',status:'delivered',timestamp:String(Math.floor(Date.now()/1000))}]}}]}]};
 const events=metaEvents(payload);assert.equal(events.length,3);assert.equal(normalizeMessage(events[0]).media.id,'media-id');assert.equal(events[0].referral.source_id,'123');assert.equal(events[1].message.text,'Visitar showroom');assert.equal(events[2].kind,'status');
 assert.throws(()=>normalizeMessage(message({message:{...message().message,at:'tomorrow'}})),/Fecha/);
 assert.equal(statusUpdate({status:'delivered'},'failed',new Date().toISOString()).status,'delivered');
});
async function webSetup(){
 const t=await setup(),privateDir=fs.mkdtempSync(path.join(os.tmpdir(),'orok-inbox-test-')),mail=[];
 const config={testing:true,origin:'http://127.0.0.1',project:'infinity224',privateDir,sessionSecret:'s'.repeat(64),bootstrapCode:'b'.repeat(32),cookieName:'orok_dev_session'};
 const auth=new CloudAuth(t.db,{...config,sendApproval:async value=>mail.push(value)}),cache=t.store.watch(),authCache=auth.watch(),server=createServer({config,store:t.store,auth,cache,authCache});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;let cookie='';
 const call=async(name,args=[])=>{const response=await fetch(base+'/api/rpc/'+name,{method:'POST',headers:{Origin:config.origin,'X-Orok-Request':'1','Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({args})});if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];return {status:response.status,body:await response.json()};};
 return {...t,config,base,call,mail,close:async()=>{cache.close();authCache.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
}
test('conversation RPC requires login, stays read-only and has no send/control operations',async()=>{
 const t=await webSetup();try{
  assert.equal((await t.call('db.getWhatsAppConversation',['target'])).status,401);
  await t.call('auth.bootstrap',[{name:'Gerencia',password:'Testing12345!',legacyPin:t.config.bootstrapCode}]);await t.call('auth.requestApproval');await t.call('auth.verifyApproval',[t.mail.at(-1).code]);
  const before=await t.store.read(),response=await t.call('db.getWhatsAppConversation',['target']);assert.equal(response.status,200);assert.equal(response.body.value.send_enabled,false);assert.deepEqual(await t.store.read(),before);
  assert.equal((await t.call('db.sendWhatsAppMessage',['target',{request_id:crypto.randomUUID(),text:'Hola'}])).status,400);assert.equal((await t.call('db.setWhatsAppMode',['target',{mode:'lola'}])).status,400);
 }finally{await t.close();}
});
test('Meta endpoint is disabled by default, then checks challenge, signature and allowed phone numbers',async()=>{
 const t=await webSetup();try{
  const endpoint=t.base+'/api/integrations/whatsapp';assert.equal((await fetch(endpoint)).status,503);
  const setup={enabled:true,appSecret:'a'.repeat(32),verifyToken:'v'.repeat(32),phoneNumberIds:['business-1']};fs.writeFileSync(path.join(t.config.privateDir,'whatsapp-inbox.json'),JSON.stringify(setup));
  assert.equal((await fetch(endpoint+'?hub.mode=subscribe&hub.verify_token=bad&hub.challenge=123')).status,403);
  assert.equal(await (await fetch(endpoint+'?hub.mode=subscribe&hub.verify_token='+setup.verifyToken+'&hub.challenge=123')).text(),'123');
  const raw=JSON.stringify({object:'whatsapp_business_account',entry:[{changes:[{field:'messages',value:{metadata:{phone_number_id:'business-1'},messages:[{id:'m1',type:'text',text:{body:'Hola'},from:'51922222222',timestamp:String(Math.floor(Date.now()/1000))}]}}]}]});
  const send=(body,signature)=>fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','X-Hub-Signature-256':signature},body});
  assert.equal((await send(raw,'bad')).status,401);
  const sign=value=>'sha256='+crypto.createHmac('sha256',setup.appSecret).update(value).digest('hex');
  const before=await t.store.read();assert.equal((await send(raw,sign(raw))).status,200);assert.equal((await send(raw,sign(raw))).status,200);assert.deepEqual(await t.store.read(),before);
  const wrong=raw.replace('business-1','other');assert.equal((await send(wrong,sign(wrong))).status,403);
  assert.equal((await t.inbox.conversation('target',{},await t.store.read())).message_count,1);
 }finally{await t.close();}
});
test('n8n observer accepts message copies only with the existing private secret',async()=>{
 const t=await webSetup();try{
  const secret='test-header-secret-'.padEnd(40,'x');fs.writeFileSync(path.join(t.config.privateDir,'integracion-ia-webhooks.json'),JSON.stringify({webhookSecret:secret}));
  const send=token=>fetch(t.base+'/api/integrations/lola',{method:'POST',headers:{'Content-Type':'application/json','X-Orok-Webhook-Secret':token},body:JSON.stringify({action:'whatsapp_message',...message()})});
  assert.equal((await send('bad')).status,401);assert.equal((await send(secret)).status,200);assert.equal((await t.inbox.conversation('target',{},await t.store.read())).messages.length,1);
 }finally{await t.close();}
});

test('Meta reply context is preserved to bind an internal adviser command to its original alert',()=>{const r=metaEvents({object:'whatsapp_business_account',entry:[{changes:[{field:'messages',value:{metadata:{phone_number_id:'business-1'},messages:[{id:'r',from:'51987208622',timestamp:String(Math.floor(Date.now()/1000)),type:'text',text:{body:'/asesor'},context:{id:'alert-id'}}]}}]}]});assert.equal(r[0].message.reply_to,'alert-id');});
