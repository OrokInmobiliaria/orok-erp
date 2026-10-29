'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {createServer}=require('../server.cjs'),{MemoryFirestore}=require('./memory-firestore.cjs'),{FirestoreProject}=require('../firestore-project.cjs');
async function setup(){const privateDir=fs.mkdtempSync(path.join(os.tmpdir(),'orok-creative-http-')),store=new FirestoreProject(new MemoryFirestore());await store.initialize({settings:{},leads:[{id:'one',name:'Ana Prueba',status:'Cita',phone:'+51999111222',dni:'12345678',sales_owner:'Luis',appointments:[{status:'scheduled',scheduled_at:new Date(Date.now()+3600000).toISOString()}],received_at:new Date(Date.now()-5*86400000).toISOString(),last_activity_at:new Date().toISOString()},{id:'two',name:'Beto Nuevo',status:'Lead Inicial',received_at:new Date(Date.now()-40*3600000).toISOString()}],units:[],quotes:[],separations:[]});const config={privateDir,testing:true,cookieName:'sid',origin:'http://localhost'},authCache={require:async cookie=>{if(!['manager','seller'].includes(cookie))throw Error('Inicia sesión.');return {name:cookie,role:cookie==='manager'?'Gerente':'Vendedor'};}},cache={read:()=>store.read()},server=createServer({config,store,cache,authCache,auth:{execute:async()=>{throw Error('Not used');}}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;config.origin=base;const call=async(name,args=[],cookie='manager',origin=base)=>{const r=await fetch(base+'/api/rpc/db.'+name,{method:'POST',headers:{'Content-Type':'application/json','X-Orok-Request':'1',Origin:origin,Cookie:'sid='+cookie},body:JSON.stringify({args})});return {status:r.status,data:await r.json()};};return {privateDir,store,base,call,close:async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));fs.rmSync(privateDir,{recursive:true,force:true});}};}
const brief=()=>({request_id:crypto.randomUUID(),title:'Campaña',objective:'Visitas',from:'2026-10-01',to:'2026-10-19',channels:['instagram'],formats:['graphic'],facts:[]});
const rows=(over={})=>[{provider:'meta',ad_id:'1001',name:'A',currency:'PEN',spend:500,crm_leads:20,stages:{Cita:4}},{provider:'meta',ad_id:'1002',name:'B',currency:'PEN',spend:500,crm_leads:30,stages:{Cita:6}},...(over.extra||[])];
function stubAds(r){return {dashboard:async()=>({from:'2026-10-01',to:'2026-10-19',rows:r,coverage:{report_rows:10,matched_leads:50}})};}
async function assistant(r=rows()){
 const {MarketingAssistant}=require('../business/marketingAssistant.js'),{CreativeCampaigns}=require('../business/creativeCampaigns.js');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'orok-asst-')),store=new FirestoreProject(new MemoryFirestore());await store.initialize({settings:{},leads:[],units:[],quotes:[],separations:[]});
 const config={privateDir:dir},ads=stubAds(r),creative=new CreativeCampaigns(store,config,ads),a=new MarketingAssistant(store,config,ads,creative);
 const id=crypto.randomUUID();await store.db.runTransaction(async tx=>{tx.set(creative.campaigns.doc(id),{id,brief:{title:'Camp'},revision:1,status:'review',proposal:{creatives:[{id:'pieza-1',format:'graphic'}]},media:[],updated_at:new Date().toISOString()});});
 return {a,creative,id,dir,store};
}
test('las variantes se vinculan por ID de anuncio, no se repiten y exigen una pieza real',async()=>{
 const {a,id}=await assistant();
 await a.linkVariant({campaign_id:id,piece_id:'pieza-1',provider:'meta',ad_id:'1001',label:'A'},'Gerencia');
 await a.linkVariant({campaign_id:id,piece_id:'pieza-1',provider:'meta',ad_id:'1002',label:'B'},'Gerencia');
 await assert.rejects(a.linkVariant({campaign_id:id,piece_id:'no-existe',provider:'meta',ad_id:'1003',label:'C'},'G'),/pieza/);
 await assert.rejects(a.linkVariant({campaign_id:id,piece_id:'pieza-1',provider:'meta',ad_id:'abc',label:'C'},'G'),/numérico/);
 await assert.rejects(a.linkVariant({campaign_id:id,piece_id:'pieza-1',provider:'meta',ad_id:'1003',label:'Z'},'G'),/etiqueta/);
 const rep=await a.variantReport({from:'2026-10-01',to:'2026-10-19'},{});
 assert.equal(rep.campaigns.length,1);assert.equal(rep.campaigns[0].winner,'B');assert.equal(rep.campaigns[0].variants.length,2);
});
test('con muestra pequeña no se declara ganador',()=>{
 const {compareVariants}=require('../business/budgetAdvisor.js');
 const r=compareVariants([{label:'A',ad_id:'1',spend:100,crm_leads:3,stages:{},currency:'PEN'},{label:'B',ad_id:'2',spend:100,crm_leads:9,stages:{},currency:'PEN'}]);
 assert.equal(r.winner,null);assert.ok(r.warnings.length>=2);assert.match(r.verdict,/Muestra pequeña/);
 assert.equal(compareVariants([{label:'A',ad_id:'1',spend:100,crm_leads:20,stages:{},currency:'PEN'},{label:'B',ad_id:'2',spend:100,crm_leads:20,stages:{},currency:'USD'}]).winner,null);
 assert.equal(compareVariants([{label:'A',ad_id:'1',spend:500,crm_leads:20,stages:{},currency:'PEN'},{label:'B',ad_id:'2',spend:500,crm_leads:22,stages:{},currency:'PEN'}]).winner,null);
});
test('las recomendaciones de presupuesto respetan mínimos, tope de 20% y requieren decisión de Gerencia',async()=>{
 const {recommendBudget}=require('../business/budgetAdvisor.js');
 const out=recommendBudget([{ad_id:'1',spend:500,crm_leads:20,stages:{Cita:3},currency:'PEN'},{ad_id:'2',spend:500,crm_leads:10,stages:{Cita:1},currency:'PEN'},{ad_id:'3',spend:500,crm_leads:4,stages:{},currency:'PEN'},{ad_id:'4',spend:300,crm_leads:0,currency:'PEN'},{ad_id:'5',spend:30,crm_leads:0,currency:'PEN'},{ad_id:'6',spend:900,crm_leads:6,stages:{},currency:'USD'}]).items;
 const by=Object.fromEntries(out.map(i=>[i.ad_id,i]));
 assert.deepEqual([by[1].action,by[2].action,by[3].action,by[4].action,by[5].action,by[6].action],['aumentar','mantener','mantener','reducir','sin_datos','mantener']);
 assert.ok(out.every(i=>Math.abs(i.change_pct)<=20));
 const {a}=await assistant();
 const rec=await a.createRecommendation({from:'2026-10-01',to:'2026-10-19'},{},'Gerencia');
 assert.equal(rec.status,'pending');assert.equal(await a.pendingCount(),1);
 await assert.rejects(a.decideRecommendation(rec.id,{decision:'applied'},'G'),/decisión/);
 assert.equal((await a.decideRecommendation(rec.id,{decision:'approved',note:'ok'},'Gerencia')).status,'approved');
 await assert.rejects(a.decideRecommendation(rec.id,{decision:'rejected'},'G'),/ya fue decidida/);
 const list=await a.listRecommendations();assert.equal(list.recommendations[0].applied,false);assert.equal(await a.pendingCount(),0);
});
test('el resumen diario no incluye datos personales sensibles y se envía una sola vez por día',async()=>{
 const {a}=await assistant();
 assert.throws(()=>a.briefConfig({enabled:true,recipients:[]},'G'),/al menos un correo/);
 assert.throws(()=>a.briefConfig({enabled:true,recipients:['no-es-correo']},'G'),/correos válidos/);
 a.briefConfig({enabled:true,recipients:['Gerencia@Ejemplo.pe']},'G');
 const data={leads:[{id:'one',name:'Ana Prueba',status:'Cita',phone:'+51999111222',dni:'12345678',email:'ana@x.pe',sales_owner:'Luis',appointments:[{status:'scheduled',scheduled_at:new Date(Date.now()+60000).toISOString()}]},{id:'two',name:'Beto Nuevo',status:'Lead Inicial',received_at:new Date(Date.now()-40*3600000).toISOString()}]};
 const first=await a.briefForDelivery(data);
 assert.equal(first.send,true);assert.equal(first.recipients,'gerencia@ejemplo.pe');
 assert.ok(first.text.includes('Beto Nuevo'));
 assert.equal(/999111222|12345678|ana@x\.pe/.test(first.text+first.html),false);
 await a.confirmBrief({date:first.date});await a.confirmBrief({date:first.date});
 const second=await a.briefForDelivery(data);assert.equal(second.send,false);assert.equal(second.already_sent,true);
 a.briefConfig({enabled:false,recipients:['gerencia@ejemplo.pe']},'G');
 assert.equal((await a.briefForDelivery(data,Date.now()+3*86400000)).send,false);
});
test('Gerencia usa las llamadas nuevas, el vendedor no, y n8n las alcanza solo con la clave de integración',async()=>{
 const t=await setup();try{
  const names=['getVariantReport','linkCreativeVariant','unlinkCreativeVariant','getBudgetRecommendations','createBudgetRecommendation','decideBudgetRecommendation','getDailyBriefConfig','saveDailyBriefConfig','previewDailyBrief'];
  for(const n of names)assert.equal((await t.call(n,[],'seller')).status,400,n);
  assert.equal((await t.call('getBudgetRecommendations')).status,200);
  assert.equal((await t.call('saveDailyBriefConfig',[{enabled:true,recipients:['gerencia@ejemplo.pe']}])).status,200);
  const pv=await t.call('previewDailyBrief');assert.equal(pv.status,200);assert.ok(pv.data.value.text.includes('Beto Nuevo'));assert.equal(/999111222|12345678/.test(pv.data.value.text),false);
  const secret='brief-worker-secret-'.padEnd(40,'x');fs.writeFileSync(path.join(t.privateDir,'integracion-ia-webhooks.json'),JSON.stringify({webhookSecret:secret}));
  const call=async(action,key=secret,p={})=>{const r=await fetch(t.base+'/api/integrations/lola',{method:'POST',headers:{'Content-Type':'application/json','X-Orok-Webhook-Secret':key},body:JSON.stringify({action,...p})});return {status:r.status,data:await r.json()};};
  assert.equal((await call('daily_brief_get','bad')).status,401);
  const got=await call('daily_brief_get');assert.equal(got.status,200);assert.equal(got.data.value.send,true);
  assert.equal((await call('daily_brief_confirm',secret,{date:'ayer'})).status,400);
  assert.equal((await call('daily_brief_confirm',secret,{date:got.data.value.date})).status,200);
  assert.equal((await call('daily_brief_get')).data.value.send,false);
 }finally{await t.close();}
});
