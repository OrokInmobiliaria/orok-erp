const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {MemoryFirestore}=require('./memory-firestore.cjs');
const {CloudAuth,signer}=require('../cloud-auth.cjs');
const {FirestoreProject}=require('../firestore-project.cjs');
const {createServer}=require('../server.cjs');
const {allowedURL,safeFetch}=require('../safe-network.cjs');
const {PDFDocument}=require('pdf-lib');
const fixture=()=>({settings:{projectName:'Infinity 224',brandColor:'#85442A'},quote_sequence:1481,leads:[{id:'lead-1',name:'Cliente de prueba',phone:'999123456',status:'Contactado',received_at:'2026-09-01T12:00:00Z'}],units:[{id:'unit-1',unit_number:'101',price:400000,unit_type:'Flat',status:'AVAILABLE',covered_area:70,free_area:0}],quotes:[],deleted_quotes:[]});
async function setup(){const db=new MemoryFirestore(),store=new FirestoreProject(db),mail=[];await store.initialize(fixture());const config={testing:true,origin:'http://127.0.0.1',project:'infinity224',privateDir:fs.mkdtempSync(path.join(os.tmpdir(),'orok-web-test-')),sessionSecret:'s'.repeat(64),bootstrapCode:'b'.repeat(32),cookieName:'orok_dev_session'};const auth=new CloudAuth(db,{...config,sendApproval:async m=>mail.push(m)}),cache=store.watch(),authCache=auth.watch();const server=createServer({config,auth,store,cache,authCache});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;let cookie='';const call=async(method,args=[],options={})=>{const response=await fetch(base+'/api/rpc/'+method,{method:'POST',headers:{Origin:options.origin||config.origin,'X-Orok-Request':'1','Content-Type':'application/json',Cookie:options.cookie??cookie},body:JSON.stringify({args})});const set=response.headers.get('set-cookie');if(set)cookie=set.split(';')[0];return {status:response.status,body:await response.json()};};return {db,store,auth,mail,config,base,call,getCookie:()=>cookie,close:async()=>{cache.close();authCache.close();server.closeAllConnections();await new Promise(r=>server.close(r));}};}
async function manager(t){await t.call('auth.bootstrap',[{name:'Gerencia prueba',password:'Testing12345!',legacyPin:t.config.bootstrapCode}]);await t.call('auth.requestApproval');await t.call('auth.verifyApproval',[t.mail.at(-1).code]);}
async function vendor(t){const created=await t.call('auth.createUser',[{name:'Asesor herramientas',role:'Vendedor',password:'Temporary123!'}]);await t.call('auth.login',[{id:created.body.value.user.id,password:'Temporary123!'}]);await t.call('auth.changePassword',[{currentPassword:'Temporary123!',password:'Vendor123456!'}]);await t.call('auth.requestApproval');await t.call('auth.verifyApproval',[t.mail.at(-1).code]);}
test('signed sessions reject tampering, expiry and password replacement',()=>{const s=signer('x'.repeat(64)),users=[{id:'a',hash:'secret-hash'}],cookie=s.issue(users[0]);assert.equal(s.verify(cookie,users).id,'a');assert.equal(s.verify(cookie+'x',users),null);assert.equal(s.verify(cookie,[{id:'a',hash:'new'}]),null);assert.ok(!cookie.includes('secret-hash'));});
test('web access requires support approval, enforces origin and role, invalidates changed credentials',async()=>{const t=await setup();try{assert.equal((await t.call('db.getLeads')).status,401);assert.equal((await t.call('auth.info',[],{origin:'https://evil.example'})).status,403);await t.call('auth.bootstrap',[{name:'Gerencia prueba',password:'Testing12345!',legacyPin:t.config.bootstrapCode}]);assert.equal((await t.call('db.getLeads')).status,401);await t.call('auth.requestApproval');for(let i=0;i<5;i++)assert.equal((await t.call('auth.verifyApproval',['wrong'])).status,400);assert.equal((await t.call('auth.verifyApproval',[t.mail[0].code])).status,400);await t.db.runTransaction(async tx=>{const s=await tx.get(t.auth.ref),d=s.data();d.users[0].approval.requestedAt=0;tx.set(t.auth.ref,d);});await t.call('auth.requestApproval');assert.equal((await t.call('auth.verifyApproval',[t.mail.at(-1).code])).status,200);assert.equal((await t.call('db.getLeads')).body.value.length,1);const old=t.getCookie();await t.call('auth.changePassword',[{currentPassword:'Testing12345!',password:'Replacement123!'}]);assert.equal((await t.call('db.getLeads',[],{cookie:old})).status,401);assert.equal((await t.call('db.getLeads')).status,401);}finally{await t.close();}});

test('entering the CRM refreshes configured sources and creates a rolling backup',async()=>{const t=await setup();try{await manager(t);const response=await t.call('db.refreshOnLogin');assert.equal(response.status,200,JSON.stringify(response.body));assert.equal(response.body.value.sync.skipped,true);assert.match(response.body.value.backup.file,/^crm-.+\.json\.gz$/);const files=await fs.promises.readdir(path.join(t.config.privateDir,'backups'));assert.equal(files.filter(name=>name.endsWith('.json.gz')).length,1);}finally{await t.close();}});

test('loading Kanban is read-only and does not normalize existing leads',async()=>{
 const t=await setup();
 try{
  await manager(t);
  await t.store.run(({read,write})=>{
   const data=read();
   data.leads.push(
    {id:'legacy-no-answer',name:'Sin respuesta',status:'No contesta',events:[],stage_history:[]},
    {id:'expired-appointment',name:'Cita vencida',status:'Cita',substatus:'Confirmada',events:[],stage_history:[],appointments:[{id:'appointment-1',status:'scheduled',scheduled_at:new Date(Date.now()-3*3600000).toISOString()}]}
   );
   write(data);
  });
  const response=await t.call('db.getLeads');
  assert.equal(response.status,200);
  assert.equal(response.body.value.find(l=>l.id==='legacy-no-answer').status,'No contesta');
  const data=await t.store.read();
  assert.equal(data.leads.find(l=>l.id==='legacy-no-answer').status,'No contesta');
  assert.equal(data.leads.find(l=>l.id==='expired-appointment').appointments[0].status,'scheduled');
 }finally{await t.close();}
});
test('creates PDF and quote atomically, synchronizes the client profile, and keeps retries idempotent',async()=>{const t=await setup();try{await manager(t);const input={requestId:crypto.randomUUID(),unitId:'unit-1',leadId:'lead-1',dni:'12345678',leadProfile:{name:'Cliente actualizado',phone:'988777666',email:'cliente@ejemplo.pe',address:'Av. Lima 123',unit_interest:'Dúplex',budget:510000},financingType:'Directo',directCreditMonths:24,discountPct:5,customInitialPct:10,parking:'Ninguno'};const first=await t.call('pdf.generateQuote',[input]);assert.equal(first.status,200,JSON.stringify(first.body));const again=await t.call('pdf.generateQuote',[input]);assert.equal(again.body.value.quote_code,first.body.value.quote_code);const d=await t.store.read();assert.equal(d.quotes.length,1);assert.equal(d.quote_sequence,1482);assert.equal(d.leads[0].dpto1,'101');assert.equal(d.leads[0].dni,'12345678');assert.equal(d.leads[0].email,'cliente@ejemplo.pe');assert.equal(d.quotes[0].client_snapshot.unit_interest,'Dúplex');assert.equal(d.quotes[0].client_snapshot.budget,510000);const response=await fetch(t.base+first.body.value.filePath,{headers:{Cookie:t.getCookie()}});assert.equal(response.status,200);const pdf=await PDFDocument.load(await response.arrayBuffer());assert.equal(pdf.getPageCount(),3);await t.call('db.deleteQuotes',[[d.quotes[0].id]]);const deleted=await t.store.read();assert.equal(deleted.quotes.length,0);assert.equal(deleted.deleted_quotes.length,1);}finally{await t.close();}});
test('blocks vendors from manager mutations and protects server credentials and files',async()=>{const t=await setup();try{await manager(t);const created=await t.call('auth.createUser',[{name:'Vendedor prueba',role:'Vendedor',password:'Temporary123!'}]);assert.equal(created.status,200);await t.call('auth.login',[{id:created.body.value.user.id,password:'Temporary123!'}]);await t.call('auth.changePassword',[{currentPassword:'Temporary123!',password:'Vendor123456!'}]);await t.call('auth.requestApproval');await t.call('auth.verifyApproval',[t.mail.at(-1).code]);assert.equal((await t.call('db.updateSettings',[{}])).status,400);assert.equal((await t.call('db.clearUnits')).status,400);assert.equal((await t.call('db.deleteLostLead',['lead-1'])).status,400);assert.equal((await t.call('db.getLeads')).status,200);const file=await fetch(t.base+'/files/../../config.cjs',{headers:{Cookie:t.getCookie()}});assert.notEqual(file.status,200);assert.equal((await t.call('db.incrementQuoteSequence')).status,400);}finally{await t.close();}});

test('Gerencia can remove only lost or discarded test leads and their linked quote records',async()=>{
 const t=await setup();
 try{
  await manager(t);
  await t.store.run(async({read,write})=>{
   const data=read();
   data.leads.push({id:'lost-test',name:'Lead de prueba',status:'Perdido',lost_at:'2026-09-27T12:00:00Z'});
   data.quotes.push({id:'quote-lost-test',lead_id:'lost-test',quote_code:'COT-PRUEBA'});
   write(data);
  });
  const active=await t.call('db.deleteLostLead',['lead-1']);
  assert.equal(active.status,400);
  const removed=await t.call('db.deleteLostLead',['lost-test']);
  assert.equal(removed.status,200,JSON.stringify(removed.body));
  assert.equal(removed.body.value.removed_quotes,1);
  const data=await t.store.read();
  assert.equal(data.leads.some(lead=>lead.id==='lost-test'),false);
  assert.equal(data.quotes.some(quote=>quote.id==='quote-lost-test'),false);
  assert.ok(fs.readdirSync(path.join(t.config.privateDir,'backups')).some(file=>file.endsWith('.json.gz')));
 }finally{await t.close();}
});
test('refuses unsafe outbound URLs and redirects',async()=>{for(const u of ['http://docs.google.com/x','https://127.0.0.1/x','https://docs.google.com.evil.test/x','file:///key.json','https://user:pass@docs.google.com/'])assert.throws(()=>allowedURL(u));const f=safeFetch(async()=>({status:302,headers:new Headers({location:'http://169.254.169.254/'}),body:{cancel:async()=>{}}}));await assert.rejects(f('https://docs.google.com/'),/HTTPS/);});

test('analytics RPC and PDF retain the received base after a lead changes stage',async()=>{
 const t=await setup();
 try{
  await manager(t);
  const filters={from:'2026-09-01',to:'2026-09-12',mode:'activity'};
  const initial=await t.call('db.getAnalytics',[filters]);
  assert.equal(initial.status,200);
  assert.equal(initial.body.value.funnels.marketing[0].count,1);
  assert.equal((await t.call('db.updateLeadStatus',['lead-1','Información enviada'])).status,200);
  const report=(await t.call('db.getAnalytics',[filters])).body.value;
  assert.deepEqual(report.funnels.marketing.map(r=>r.count),[1,1,1,0,0]);
  assert.equal(report.stateDistribution.marketing[0].count,0);
  const exported=await t.call('pdf.generateAnalytics',[filters]);
  assert.equal(exported.status,200,JSON.stringify(exported.body));
  const response=await fetch(t.base+exported.body.value.filePath,{headers:{Cookie:t.getCookie()}});
  assert.equal(response.status,200);
  const pdf=await PDFDocument.load(await response.arrayBuffer());
  assert.ok(pdf.getPageCount()>=6);
 }finally{await t.close();}
});

test('vendors can edit shared links and import tools but cannot change settings, clear leads or manage expenses',async()=>{
 const t=await setup();try{
  await manager(t);await vendor(t);
  const links={leads:['https://docs.google.com/spreadsheets/d/test/edit'],units:'',plansExt:'',plansInt:'',finishes:'https://docs.google.com/spreadsheets/d/finishes/edit',autoSync:true,revision:0};
  const saved=await t.call('db.updateToolLinks',[links]);assert.equal(saved.status,200,JSON.stringify(saved.body));
  const settings=(await t.call('db.getSettings')).body.value;
  assert.equal(settings.toolLinks.leads[0],links.leads[0]);assert.equal(settings.acabadosSheetUrl,links.finishes);
  assert.equal((await t.call('db.updateToolLinks',[links])).status,400,'Reject stale saves');
  const csv='Nombre,Telefono,Fecha\nHerramientas,987654321,2026-09-10';
  assert.equal((await t.call('db.syncLeadsRaw',[{csv,isStrict:false,sourceUrl:links.leads[0]}])).status,200);
  assert.equal((await t.call('db.syncLeadsRaw',[{csv,isStrict:true,sourceUrl:links.leads[0]}])).status,400);
  assert.equal((await t.call('db.syncUnits',['Dpto,Precio,Piso\n202,420000,2'])).status,200);
  for(const [method,args] of [['db.updateSettings',[{managerPin:'x'}]],['db.clearLeads',[]],['db.clearUnits',[]],['db.addMarketingExpense',[{concept:'No autorizado',amount:10,date:'2026-09-10',spend_type:'other'}]],['db.deleteMarketingExpense',['x']],['db.getMarketingExpenses',[]]])assert.equal((await t.call(method,args)).status,400,method);
 }finally{await t.close();}
});

test('comment RPC preserves concurrent notes, ignores forged authors/times, and protects history',async()=>{
 const t=await setup();try{
  await manager(t);await vendor(t);
  const payload={text:'Primera nota',requestId:'one',at:'1900-01-01',author:'Falso'};
  const [a,b]=await Promise.all([t.call('db.addLeadComment',['lead-1',payload]),t.call('db.addLeadComment',['lead-1',{text:'Segunda nota',requestId:'two'}])]);
  assert.equal(a.status,200);assert.equal(b.status,200);assert.equal(a.body.value.author,'Asesor herramientas');assert.notEqual(a.body.value.at,'1900-01-01');
  assert.equal((await t.call('db.addLeadComment',['lead-1',payload])).status,200);
  assert.equal((await t.store.read()).leads[0].comment_history.length,2);
  assert.equal((await t.call('db.updateLeadAdvanced',['lead-1',{comment_history:[]}])).status,200);
  assert.equal((await t.store.read()).leads[0].comment_history.length,2);
  assert.equal((await t.call('db.updateLeadAdvanced',['lead-1',{comments:'Overwrite'}])).status,400);
 }finally{await t.close();}
});

test('manager can create and delete expenses without a source or campaign',async()=>{
 const t=await setup();try{
  await manager(t);
  const saved=await t.call('db.addMarketingExpense',[{concept:'Fotografía general',amount:500.25,date:'2026-09-10',spend_type:'other'}]);
  assert.equal(saved.status,200,JSON.stringify(saved.body));assert.equal(saved.body.value.created_by,'Gerencia prueba');
  assert.equal((await t.call('db.getMarketingExpenses')).body.value.length,1);
  assert.equal((await t.call('db.deleteMarketingExpense',[saved.body.value.id])).status,200);
  assert.equal((await t.call('db.getMarketingExpenses')).body.value.length,0);
 }finally{await t.close();}
});
