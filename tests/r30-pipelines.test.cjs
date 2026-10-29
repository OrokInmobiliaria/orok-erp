'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {createServer}=require('../server.cjs'),{MemoryFirestore}=require('./memory-firestore.cjs'),{FirestoreProject}=require('../firestore-project.cjs');
async function setup(){const privateDir=fs.mkdtempSync(path.join(os.tmpdir(),'orok-creative-http-')),store=new FirestoreProject(new MemoryFirestore());await store.initialize({settings:{},leads:[{id:'one',name:'Prueba',status:'Cita'}],units:[],quotes:[],separations:[]});const config={privateDir,testing:true,cookieName:'sid',origin:'http://localhost'},authCache={require:async cookie=>{if(!['manager','seller'].includes(cookie))throw Error('Inicia sesión.');return {name:cookie,role:cookie==='manager'?'Gerente':'Vendedor'};}},cache={read:()=>store.read()},server=createServer({config,store,cache,authCache,auth:{execute:async()=>{throw Error('Not used');}}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;config.origin=base;const call=async(name,args=[],cookie='manager',origin=base)=>{const r=await fetch(base+'/api/rpc/db.'+name,{method:'POST',headers:{'Content-Type':'application/json','X-Orok-Request':'1',Origin:origin,Cookie:'sid='+cookie},body:JSON.stringify({args})});return {status:r.status,data:await r.json()};};return {privateDir,store,base,call,close:async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));fs.rmSync(privateDir,{recursive:true,force:true});}};}
const {CreativeCampaigns}=require('../business/creativeCampaigns.js'),{Pipelines}=require('../business/pipelines.js');
const PNG=Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),Buffer.alloc(40)]),MP3=Buffer.concat([Buffer.from('ID3'),Buffer.alloc(200,1)]);
async function rig(status='approved'){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'orok-pipe-')),store=new FirestoreProject(new MemoryFirestore());await store.initialize({settings:{},leads:[],units:[],quotes:[],separations:[]});
 const config={privateDir:dir},ads={dashboard:async()=>({rows:[]})},creative=new CreativeCampaigns(store,config,ads),p=new Pipelines(store,config,creative),id=crypto.randomUUID();
 const campaign={id,brief:{title:'Camp',channels:['instagram','facebook'],formats:['reel'],from:'2026-10-01',to:'2026-10-14',objective:'Visitas',audience:'',notes:'',budget_notes:'',facts:[],factsVerified:false},revision:3,status,approval:status==='approved'?{at:new Date().toISOString(),actor:'G'}:null,proposal:{creatives:[{id:'pieza-1',format:'reel',headline:'H',caption:'Texto de publicación',scenes:[{seconds:3,voiceover:'Hola, conoce el proyecto.'},{seconds:3,voiceover:''}]}]},media:[],brand:{id:'infinity224',hashtags:['#Lima']},created_at:new Date().toISOString(),updated_at:new Date().toISOString()};
 await store.db.runTransaction(async tx=>{tx.set(creative.ref(id),campaign);});
 return {dir,store,creative,p,id,campaign};
}
const exportPiece=(r)=>r.creative.addMedia(r.id,{export:true,revision:3,request_id:crypto.randomUUID(),approved:true,mime:'image/png',label:'H',filename:'Proyecto-pieza-1-r3.png'},PNG,'G');

test('todo nace apagado: ni voz, ni publicación, ni ciclo hacen nada sin activarlos',async()=>{
 const r=await rig();
 assert.equal(r.p.voiceConfig().enabled,false);assert.equal(r.p.publishConfig().enabled,false);assert.equal(r.p.publishConfig().dry_run,true);assert.equal(r.p.cycleConfig().enabled,false);
 await assert.rejects(r.p.requestVoice({campaign_id:r.id,piece_id:'pieza-1',request_id:crypto.randomUUID()},'G'),/desactivada/);
 await assert.rejects(r.p.requestPublication({campaign_id:r.id,piece_id:'pieza-1',channel:'instagram',scheduled_at:new Date().toISOString(),request_id:crypto.randomUUID()},'G'),/desactivada/);
 assert.equal((await r.p.claimVoice()).job,null);assert.equal((await r.p.claimPublication()).job,null);
 assert.equal((await r.p.cycleTick()).skipped,'desactivado');
});
test('voz: solo campañas aprobadas, con permiso de trabajo y el audio queda marcado como voz IA',async()=>{
 const r=await rig();
 r.p.voiceConfig({enabled:true,provider:'elevenlabs',voice_label:'Voz LOLA'},'G');
 const rid=crypto.randomUUID(),req=await r.p.requestVoice({campaign_id:r.id,piece_id:'pieza-1',request_id:rid},'G');
 assert.equal((await r.p.requestVoice({campaign_id:r.id,piece_id:'pieza-1',request_id:rid},'G')).duplicate,true);
 const job=(await r.p.claimVoice()).job;assert.equal(job.script,'Hola, conoce el proyecto.');assert.equal(JSON.stringify(job).includes('apiKey'),false);
 assert.equal((await r.p.claimVoice()).job,null);
 await assert.rejects(r.p.completeVoice({job_id:job.id,lease_token:'x',data_base64:MP3.toString('base64')}),/no autorizado/);
 await assert.rejects(r.p.completeVoice({job_id:job.id,lease_token:job.lease_token,data_base64:Buffer.from('no es audio').toString('base64')}),/formato/);
 const done=await r.p.completeVoice({job_id:job.id,lease_token:job.lease_token,data_base64:MP3.toString('base64')});assert.ok(done.media_id);
 const c=(await r.creative.ref(r.id).get()).data();assert.ok(c.media.some(m=>m.kind==='audio'&&/Voz IA/.test(m.label)));
 await assert.rejects(r.p.completeVoice({job_id:job.id,lease_token:job.lease_token,data_base64:MP3.toString('base64')}),/no autorizado/);
 const draft=await rig('review');draft.p.voiceConfig({enabled:true,provider:'x'},'G');
 await assert.rejects(draft.p.requestVoice({campaign_id:draft.id,piece_id:'pieza-1',request_id:crypto.randomUUID()},'G'),/aprobada/);
});
test('publicación: exige campaña aprobada, pieza exportada, canal habilitado y respeta fecha y modo de ensayo',async()=>{
 const r=await rig();
 r.p.publishConfig({enabled:true,dry_run:true,channels:{instagram:true}},'G');
 const base=()=>({campaign_id:r.id,piece_id:'pieza-1',channel:'instagram',scheduled_at:new Date().toISOString(),request_id:crypto.randomUUID()});
 await assert.rejects(r.p.requestPublication(base(),'G'),/Exporta primero/);
 await exportPiece(r);
 await assert.rejects(r.p.requestPublication({...base(),channel:'tiktok'},'G'),/no está habilitado/);
 await assert.rejects(r.p.requestPublication({...base(),channel:'facebook'},'G'),/no está habilitado/);
 await assert.rejects(r.p.requestPublication({...base(),scheduled_at:'2020-01-01T00:00:00Z'},'G'),/futura/);
 const future=await r.p.requestPublication({...base(),scheduled_at:new Date(Date.now()+3600000).toISOString(),variant_label:'B'},'G');
 assert.equal((await r.p.claimPublication()).job,null,'una publicación programada a futuro no se entrega antes de hora');
 await r.p.cancel(r.p.pubJobs,future.id,'G');
 await r.p.requestPublication({...base(),variant_label:'A'},'G');
 const job=(await r.p.claimPublication()).job;
 assert.equal(job.dry_run,true);assert.equal(job.variant_label,'A');assert.ok(job.caption.includes('#Lima'));assert.equal(job.media_count,1);
 const media=await r.p.publicationMedia({job_id:job.id,lease_token:job.lease_token,index:0});assert.equal(Buffer.from(media.data_base64,'base64').subarray(0,4).toString('hex'),'89504e47');
 await assert.rejects(r.p.publicationMedia({job_id:job.id,lease_token:'mal',index:0}),/no autorizado/);
 await r.p.completePublication({job_id:job.id,lease_token:job.lease_token,external_id:'post-1',permalink:'javascript:alert(1)'});
 const stored=(await r.p.pubJobs.doc(job.id).get()).data();assert.equal(stored.state,'dry_run_done');assert.equal(stored.permalink,'');
 const nonApproved=await rig('review');nonApproved.p.publishConfig({enabled:true,channels:{instagram:true}},'G');
 await assert.rejects(nonApproved.p.requestPublication({campaign_id:nonApproved.id,piece_id:'pieza-1',channel:'instagram',scheduled_at:new Date().toISOString(),request_id:crypto.randomUUID()},'G'),/aprobada/);
});
test('el límite diario de publicaciones y la cancelación funcionan',async()=>{
 const r=await rig();r.p.publishConfig({enabled:true,channels:{instagram:true},max_per_day:1},'G');await exportPiece(r);
 const mk=()=>({campaign_id:r.id,piece_id:'pieza-1',channel:'instagram',scheduled_at:new Date().toISOString(),request_id:crypto.randomUUID()});
 const first=await r.p.requestPublication(mk(),'G');await assert.rejects(r.p.requestPublication(mk(),'G'),/límite diario/);
 assert.equal((await r.p.cancel(r.p.pubJobs,first.id,'G')).ok,true);await assert.rejects(r.p.cancel(r.p.pubJobs,first.id,'G'),/aún no empezaron/);
});
test('ciclo automático: crea solo borradores nuevos, no repite en la misma ventana y no toca la campaña base',async()=>{
 const r=await rig();let queued=0;r.creative.enqueue=async()=>{queued++;return {ok:true};};
 assert.throws(()=>r.p.cycleConfig({enabled:true,campaign_ids:[]},'G'),/al menos una/);
 r.p.cycleConfig({enabled:true,campaign_ids:[r.id],every_days:7,window_days:14},'G');
 const before=JSON.stringify((await r.creative.ref(r.id).get()).data());
 const t=await r.p.cycleTick();assert.equal(t.created.length,1);assert.equal(queued,1);
 const child=(await r.creative.ref(t.created[0].campaign_id).get()).data();
 assert.equal(child.status,'draft');assert.equal(child.proposal,null);assert.equal(child.approval??null,null);assert.match(child.brief.title,/^Ciclo /);assert.equal(child.brief.channels.join(),'instagram,facebook');
 assert.equal((await r.p.cycleTick()).created.length,0);assert.equal(queued,1);
 assert.equal(JSON.stringify((await r.creative.ref(r.id).get()).data()),before);
});
test('permisos y clave de integración de las llamadas nuevas',async()=>{
 const t=await setup();try{
  const names=['getVoiceConfig','saveVoiceConfig','getPublishConfig','savePublishConfig','getCycleConfig','saveCycleConfig','requestVoice','requestPublication','getPipelineJobs','cancelPipelineJob'];
  for(const n of names)assert.equal((await t.call(n,[],'seller')).status,400,n);
  assert.equal((await t.call('getPublishConfig')).data.value.enabled,false);
  assert.equal((await t.call('getPipelineJobs')).status,200);
  const secret='pipe-worker-secret-'.padEnd(40,'x');fs.writeFileSync(path.join(t.privateDir,'integracion-ia-webhooks.json'),JSON.stringify({webhookSecret:secret}));
  const call=async(action,key=secret,p={})=>{const r=await fetch(t.base+'/api/integrations/lola',{method:'POST',headers:{'Content-Type':'application/json','X-Orok-Webhook-Secret':key},body:JSON.stringify({action,...p})});return {status:r.status,data:await r.json()};};
  for(const a of ['voice_job_claim','publication_job_claim','creative_cycle_tick'])assert.equal((await call(a,'bad')).status,401,a);
  assert.equal((await call('voice_job_claim')).data.value.job,null);assert.equal((await call('publication_job_claim')).data.value.job,null);
  assert.equal((await call('creative_cycle_tick')).data.value.skipped,'desactivado');
  assert.equal((await call('publication_job_complete',secret,{job_id:'x',lease_token:'y'})).status,400);
 }finally{await t.close();}
});
