'use strict';
const fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module'),{test}=require('node:test'),assert=require('node:assert/strict');
const file=path.join(__dirname,'omnichannel.test.cjs'),source=fs.readFileSync(file,'utf8').split("test('social ingress")[0];
const setup=new Function('require','__dirname',source+';return setup;')(createRequire(file),__dirname);
const {metaEvents}=require('../business/socialGateway');
for(const channel of ['instagram','messenger']){
 for(const claimed of [false,true])test(channel+': native human echo pauses '+(claimed?'claimed':'queued')+' work and subsequent customer messages stay manual',async()=>{
  const t=await setup(),r=await t.common.ingest(t.incoming(channel,'Hola, quiero informacion')),pending=claimed?(await t.common.claim()).job:null;
  const payload={object:channel==='messenger'?'page':'instagram',entry:[{id:t.socialSettings[channel].accountId,messaging:[{sender:{id:t.socialSettings[channel].accountId},recipient:{id:'98765432101234567'},timestamp:Date.now(),message:{mid:'human.echo.'+claimed,is_echo:true,text:'Soy el asesor, continuo con tu consulta.'}}]}]};
  for(const event of metaEvents(payload,channel,t.socialSettings[channel].accountId))await t.common.ingest(event);
  let chat=await t.social.conversation(r.thread_id);assert.equal(chat.mode,'manual');assert.equal(chat.messages.filter(m=>m.text==='Soy el asesor, continuo con tu consulta.').length,1);
  if(pending)await t.common.action({action:'lola_job_complete',engine:pending.engine,job_id:pending.id,lease_token:pending.lease_token,result:{reply:'Con gusto.',profile:{name:null,phone:null,email:null,interest:null,purchase_method:null,initial_payment:null},handoff:false,opt_out:false,commercial_answer:false,commercial_evidence:[]}});
  assert.equal((await t.common.claim()).job,null);assert.equal(t.sent.length,0);
  await t.common.ingest(t.incoming(channel,'Gracias, seguire con el asesor'));assert.equal((await t.common.claim()).job,null);assert.equal((await t.social.conversation(r.thread_id)).mode,'manual');
 });
 test(channel+': the confirmed echo of Lola does not duplicate messages or pause automation',async()=>{
  const t=await setup(),r=await t.common.ingest(t.incoming(channel,'Hola'));await t.reply();let chat=await t.social.conversation(r.thread_id);const own=chat.messages.find(m=>m.direction==='outbound');assert.ok(own);
  await t.common.ingest({channel,account_id:t.socialSettings[channel].accountId,contact_id:'98765432101234567',message:{id:own.id,direction:'outbound',at:Date.now(),text:own.text,type:'text'}});
  chat=await t.social.conversation(r.thread_id);assert.equal(chat.mode,'auto');assert.equal(chat.messages.filter(m=>m.id===own.id).length,1);assert.equal(t.sent.length,1);
 });
}
