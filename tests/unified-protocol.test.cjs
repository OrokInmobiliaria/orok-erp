'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{Readable}=require('node:stream'),{createHmac}=require('node:crypto');
const {createServer}=require('../server.cjs'),{FirestoreProject}=require('../firestore-project.cjs'),{MemoryFirestore}=require('./memory-firestore.cjs');
// Exercise the real HTTP handler in process: no listening socket or external provider call.
async function setup(){
 const privateDir=fs.mkdtempSync(path.join(os.tmpdir(),'lola-protocol-')),store=new FirestoreProject(new MemoryFirestore());
 await store.initialize({settings:{projectName:'Infinity 224'},leads:[],units:[],quotes:[],separations:[]});
 const secret='test-worker-secret-'.repeat(3),appSecret='test-meta-secret-'.repeat(3),sent=[];
 fs.writeFileSync(path.join(privateDir,'integracion-ia-webhooks.json'),JSON.stringify({webhookSecret:secret}));
 const s={enabled:true,accountId:'111111',apiVersion:'v26.0',accessToken:'test-token',appSecret,verifyToken:'verify'.repeat(8),automaticEnabled:true,agendaEnabled:true,sendingEnabled:true,newConversationMode:'auto',testLeadFormIds:['987654321'],testRecipients:['99999999999999999']};
 fs.writeFileSync(path.join(privateDir,'social-integrations.json'),JSON.stringify({messenger:s,instagram:{...s,accountId:'222222'}}));
 const gateway={setup:()=>({messenger:s,instagram:{...s,accountId:'222222'}}),assertSend:()=>s,send:async(t,text)=>{sent.push({t,text});return 'sent.'+sent.length;}};
 const server=createServer({config:{privateDir,testing:true,origin:'https://crm.orok.com.pe',cookieName:'test-session',publicDir:path.join(__dirname,'../dist')},store,auth:{},cache:{read:()=>store.read()},authCache:{require:async()=>{throw Error('Sesión requerida');}},socialOptions:{gateway,formRequester:async()=>({status:200,data:{id:'123456789',created_time:new Date().toISOString(),field_data:[{name:'full_name',values:['Cliente formulario']},{name:'email',values:['form@example.test']}]}})}});
 async function call(url,payload,headers={}){const req=Readable.from([Buffer.from(JSON.stringify(payload))]);req.url=url;req.method='POST';req.headers={'content-type':'application/json',...headers};Object.defineProperty(req,'socket',{value:{remoteAddress:'127.0.0.1'}});const res={headers:{},setHeader(k,v){this.headers[k]=v;},writeHead(status,h){this.status=status;Object.assign(this.headers,h);},end(bytes){this.body=bytes?.toString()||'';}};await server.listeners('request')[0](req,res);return {status:res.status,body:JSON.parse(res.body)};}
 return {store,sent,call,secret,appSecret,close(){server.emit('close');fs.rmSync(privateDir,{recursive:true,force:true});}};
}
test('unified endpoint authenticates its worker, claims scoped jobs, rejects wrong leases and completes one delivery',async()=>{
 const t=await setup();try{
 assert.equal((await t.call('/api/integrations/lola',{action:'lola_job_claim'})).status,401);
 const headers={'x-orok-webhook-secret':t.secret};const probe=await t.call('/api/integrations/lola',{action:'connection_check'},headers);assert.equal(probe.body.value.writes,0);assert.equal(probe.body.value.version,require('../package.json').version);
 const r=await t.call('/api/integrations/lola',{action:'social_message',channel:'messenger',account_id:'111111',contact_id:'99999999999999999',name:'Cliente',message:{id:'m1',direction:'inbound',at:new Date().toISOString(),text:'Hola'}},headers);assert.equal(r.status,200);
 const claimed=await t.call('/api/integrations/lola',{action:'lola_job_claim'},headers),j=claimed.body.value.job;assert.equal(j.channel,'messenger');
 const result={reply:'Con gusto.',profile:{name:null,phone:null,email:null,interest:null,purchase_method:null,initial_payment:null},handoff:false,opt_out:false,commercial_answer:false,commercial_evidence:[]};
 assert.equal((await t.call('/api/integrations/lola',{action:'lola_job_complete',engine:j.engine,job_id:j.id,lease_token:'incorrect',result},headers)).status,400);
 const completed=await t.call('/api/integrations/lola',{action:'lola_job_complete',engine:j.engine,job_id:j.id,lease_token:j.lease_token,result},headers);assert.equal(completed.body.value.state,'complete');assert.equal(t.sent.length,1);
 await t.call('/api/integrations/lola',{action:'lola_job_complete',engine:j.engine,job_id:j.id,lease_token:j.lease_token,result},headers);assert.equal(t.sent.length,1);
 }finally{t.close();}
});
test('native signed Meta leadgen retrieves and registers one form without sending a message',async()=>{
 const t=await setup();try{const payload={object:'page',entry:[{id:'111111',changes:[{field:'leadgen',value:{leadgen_id:'123456789',form_id:'987654321'}}]}]},signature='sha256='+createHmac('sha256',t.appSecret).update(JSON.stringify(payload)).digest('hex');
 assert.equal((await t.call('/api/integrations/messenger',payload,{'x-hub-signature-256':'sha256='+'0'.repeat(64)})).status,401);
 const response=await t.call('/api/integrations/messenger',payload,{'x-hub-signature-256':signature});assert.equal(response.status,200);assert.equal(response.body.forms,1);
 await t.call('/api/integrations/messenger',payload,{'x-hub-signature-256':signature});const leads=(await t.store.read()).leads;assert.equal(leads.length,1);assert.equal(leads[0].email,'form@example.test');assert.equal(t.sent.length,0);
 }finally{t.close();}
});
test('normalized forms require the private credential and duplicate delivery does not create another lead',async()=>{
 const t=await setup();try{const payload={action:'lola_form',channel:'plataforma',account_id:'crm-orok',event_id:'form:0001',profile:{email:'platform@example.test'}};
 assert.equal((await t.call('/api/integrations/lola',payload)).status,401);
 const h={'x-orok-webhook-secret':t.secret};assert.equal((await t.call('/api/integrations/lola',payload,h)).body.value.form_registered,true);assert.equal((await t.call('/api/integrations/lola',payload,h)).body.value.duplicate,true);assert.equal((await t.store.read()).leads.length,1);assert.equal(t.sent.length,0);
 }finally{t.close();}
});
