'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {createServer}=require('../server.cjs'),{WhatsAppGateway}=require('../business/whatsappGateway'),{WhatsAppService}=require('../business/whatsappService'),{FirestoreProject}=require('../firestore-project.cjs'),{MemoryFirestore}=require('./memory-firestore.cjs'),{CloudAuth}=require('../cloud-auth.cjs');
async function setup(){
 const db=new MemoryFirestore(),store=new FirestoreProject(db),privateDir=fs.mkdtempSync(path.join(os.tmpdir(),'orok-wa-web-')),mail=[],sent=[];
 await store.initialize({settings:{projectName:'Infinity 224'},leads:[{id:'one',name:'Cliente',phone:'922222222',status:'MQL'}],units:[]});
 const config={testing:true,origin:'http://127.0.0.1',project:'infinity224',privateDir,sessionSecret:'s'.repeat(64),bootstrapCode:'b'.repeat(32),cookieName:'orok_dev_session'},gateway=new WhatsAppGateway(privateDir);
 gateway.send=async(account,phone,content)=>{sent.push(content);return 'wamid.web.'+sent.length;};gateway.uploadAudio=async()=> 'media-out';gateway.media=async()=>({bytes:Buffer.from('fake-audio'),mime:'audio/mp4'});
 const auth=new CloudAuth(db,{...config,sendApproval:async v=>mail.push(v)}),cache=store.watch(),authCache=auth.watch(),server=createServer({config,store,auth,cache,authCache,whatsappOptions:{gateway}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;let cookie='';
 const call=async(name,args=[])=>{const response=await fetch(base+'/api/rpc/'+name,{method:'POST',headers:{Origin:config.origin,'X-Orok-Request':'1','Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({args})});if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];return {status:response.status,data:await response.json()};};
 const login=async()=>{await call('auth.bootstrap',[{name:'Gerencia',password:'Testing12345!',legacyPin:config.bootstrapCode}]);await call('auth.requestApproval');await call('auth.verifyApproval',[mail.at(-1).code]);};
 const service=new WhatsAppService(store,config,{gateway});
 return {store,privateDir,config,base,call,login,mail,sent,service,cookie:()=>cookie,close:async()=>{cache.close();authCache.close();server.closeAllConnections();await new Promise(r=>server.close(r));fs.rmSync(privateDir,{recursive:true,force:true});}};
}
const setupInput={ffmpegPath:'',enabled:true,sendingEnabled:true,automaticEnabled:true,environment:'test',apiVersion:'v26.0',phoneNumberIds:['1234567890'],testRecipients:['51922222222'],accessToken:'fake-private-access-token',appSecret:'a'.repeat(32),verifyToken:'v'.repeat(32)};
test('authenticated chat HTTP roundtrip: configure, ingest signed webhook, manual send and download audio',async()=>{
 const t=await setup();try{
 assert.equal((await t.call('db.getWhatsAppSetup')).status,401);await t.login();const config=await t.call('db.saveWhatsAppSetup',[setupInput]);assert.equal(config.status,200);assert.equal(JSON.stringify(config.data).includes(setupInput.accessToken),false);
 const raw=JSON.stringify({object:'whatsapp_business_account',entry:[{changes:[{field:'messages',value:{metadata:{phone_number_id:'1234567890'},messages:[{id:'in-1',from:'51922222222',type:'audio',audio:{id:'m1',mime_type:'audio/mp4'},timestamp:String(Math.floor(Date.now()/1000))}]}}]}]});
 const post=await fetch(t.base+'/api/integrations/whatsapp',{method:'POST',headers:{'Content-Type':'application/json','X-Hub-Signature-256':'sha256='+crypto.createHmac('sha256',setupInput.appSecret).update(raw).digest('hex')},body:raw});assert.equal(post.status,200);
 const chat=(await t.call('db.getWhatsAppConversation',['one'])).data.value;const mediaPath='/whatsapp-media/one/'+chat.messages[0].sort_key.slice(-64);assert.equal((await fetch(t.base+mediaPath)).status,401);const media=await fetch(t.base+mediaPath,{headers:{Cookie:t.cookie()}});assert.equal(media.status,200);assert.equal(media.headers.get('cache-control'),'private, no-store');assert.equal(await media.text(),'fake-audio');
 assert.equal((await t.call('db.setWhatsAppMode',['one',{mode:'manual',version:0}])).status,200);
 const before=await t.store.read();const text=await t.call('db.sendWhatsAppMessage',['one',{request_id:crypto.randomUUID(),text:'Hola desde CRM'}]);assert.equal(text.status,200,JSON.stringify(text.data));assert.equal(t.sent.length,1);
 const audio=await fetch(t.base+'/api/whatsapp-audio',{method:'POST',headers:{Origin:t.config.origin,'X-Orok-Request':'1',Cookie:t.cookie(),'X-Lead-Id':'one','X-Request-Id':crypto.randomUUID(),'Content-Type':'audio/mp4'},body:Buffer.from('fake-mp4')});assert.equal(audio.status,200,await audio.text());assert.equal(t.sent[1].type,'audio');assert.deepEqual(await t.store.read(),before);
 }finally{await t.close();}
});
test('only Gerencia can configure tokens; authenticated worker requires the separate private header secret',async()=>{
 const t=await setup();try{await t.login();await t.call('db.saveWhatsAppSetup',[setupInput]);const vendor=(await t.call('auth.createUser',[{name:'Vendedor prueba',role:'Vendedor',password:'Temporary123!'}])).data.value.user;
 await t.call('auth.login',[{id:vendor.id,password:'Temporary123!'}]);await t.call('auth.changePassword',[{currentPassword:'Temporary123!',password:'Vendor123456!'}]);await t.call('auth.requestApproval');await t.call('auth.verifyApproval',[t.mail.at(-1).code]);assert.equal((await t.call('db.getWhatsAppSetup')).status,400);assert.equal((await t.call('db.saveWhatsAppSetup',[setupInput])).status,400);
 const secret='private-worker-secret-'.padEnd(40,'x');fs.writeFileSync(path.join(t.privateDir,'integracion-ia-webhooks.json'),JSON.stringify({webhookSecret:secret}));
 const worker=token=>fetch(t.base+'/api/integrations/lola',{method:'POST',headers:{'Content-Type':'application/json','X-Orok-Webhook-Secret':token},body:JSON.stringify({action:'whatsapp_job_claim'})});assert.equal((await worker('bad')).status,401);assert.deepEqual((await (await worker(secret)).json()).value,{ok:true,job:null});
 }finally{await t.close();}
});
test('the complete n8n provider protocol authenticates begin/completion and never trusts a wrong lease',async()=>{
 const t=await setup();try{
 await t.login();await t.call('db.saveWhatsAppSetup',[{...setupInput,agendaEnabled:true}]);
 const secret='private-provider-secret-'.padEnd(40,'x');fs.writeFileSync(path.join(t.privateDir,'integracion-ia-webhooks.json'),JSON.stringify({webhookSecret:secret}));
 const job={id:'provider-test-job',lead_id:'one',kind:'mail',step:'mail',notice:'scheduled',mode:'auto',phone:'51922222222',account:'1234567890',profile:{name:'Cliente',email:'cliente@example.test'},state:'processing',lease_token:'test-lease',lease_until:new Date(Date.now()+60000).toISOString(),control_version:1,generation:1,created_at:new Date().toISOString(),attempts:1};
 await t.store.db.runTransaction(async tx=>{tx.set(t.service.jobs.doc(job.id),job);tx.set(t.service.thread('one'),{lead_id:'one',phone:job.phone,business_phone_id:job.account,mode:'manual',control_version:1,generation:1,message_count:0});});
 const api=async(payload,token=secret)=>{const r=await fetch(t.base+'/api/integrations/lola',{method:'POST',headers:{'Content-Type':'application/json','X-Orok-Webhook-Secret':token},body:JSON.stringify(payload)});return {status:r.status,data:await r.json()};};
 assert.equal((await api({action:'whatsapp_task_begin',job_id:job.id,lease_token:'wrong'})).status,400);
 const begun=await api({action:'whatsapp_task_begin',job_id:job.id,lease_token:job.lease_token});assert.equal(begun.status,200);assert.equal(begun.data.value.task.kind,'mail');assert.equal(begun.data.value.task.to,'ventas@orok.com.pe');
 const done=await api({action:'whatsapp_task_complete',job_id:job.id,lease_token:job.lease_token,status:200,response:{id:'gmail-simulated'}});assert.equal(done.status,200);assert.equal(done.data.value.state,'complete');assert.equal((await t.service.thread('one').get()).data().notification_status,'Enviado');assert.equal(t.sent.length,0);
 assert.equal((await api({action:'whatsapp_maintenance'},'bad')).status,401);assert.equal((await api({action:'whatsapp_maintenance'})).status,200);
 }finally{await t.close();}
});
