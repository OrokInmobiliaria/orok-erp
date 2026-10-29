const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createQueries}=require('../business/queries');
const {MemoryFirestore}=require('./memory-firestore.cjs');
const {FirestoreProject}=require('../firestore-project.cjs');
const {sheetSync,INTERVAL}=require('../sheet-sync.cjs');
const url='https://docs.google.com/spreadsheets/d/test-one/edit#gid=0';
const links=()=>({leads:[url,'',''],units:'',plansExt:'',plansInt:'',finishes:'',separationTemplate:'',separationFilesFolder:'',autoSync:true,revision:0});
function setup(){let data={settings:{projectName:'Test'},leads:[{id:'l',status:'Lead Inicial',phone:'999123456',comments:'Nota histórica'}],units:[],marketing_expenses:[]};const q=createQueries(()=>structuredClone(data),d=>{data=d;});return {q,get:()=>data};}
test('comments append author/server time without overwriting legacy notes; retries are idempotent',()=>{
 const {q,get}=setup();const before=Date.now();
 const a=q.addLeadComment('l',{text:' Primera llamada ',requestId:'one',at:'1900-01-01',author:'False'},'Ana');
 const b=q.addLeadComment('l',{text:'Cita confirmada',requestId:'two'},'Luis');
 assert.equal(a.author,'Ana');assert.ok(Date.parse(a.at)>=before);assert.equal(a.text,'Primera llamada');
 assert.deepEqual(q.addLeadComment('l',{text:'Primera llamada',requestId:'one'},'Ana'),a);
 assert.equal(get().leads[0].comments,'Nota histórica');assert.deepEqual(get().leads[0].comment_history,[a,b]);
 assert.throws(()=>q.addLeadComment('l',{text:'Replacement',requestId:'one'},'Ana'),/otro comentario/);
 assert.throws(()=>q.addLeadComment('l',{text:' ',requestId:'empty'},'Ana'),/comentario/);
 q.updateLeadAdvanced('l',{comment_history:[],budget:100});assert.equal(get().leads[0].comment_history.length,2);
 assert.throws(()=>q.updateLeadAdvanced('l',{comments:'Overwrite'},'Ana'),/historial/);
});
test('initial manual comments are timestamped and imported legacy notes are retained',()=>{
 const {q,get}=setup();const lead=q.addLead({name:'Nuevo',status:'Lead Inicial',comments:'Busca 3 dormitorios'},'Ana');
 assert.equal(lead.comments,'');assert.equal(lead.comment_history[0].text,'Busca 3 dormitorios');assert.equal(lead.comment_history[0].author,'Ana');
 q.addLeadComment('l',{text:'Nota nueva',requestId:'one'},'Ana');
 q.syncLeadsRaw({csv:'Nombre,Telefono,Comentarios\nCliente,999123456,Otra nota de la hoja',isStrict:false,sourceUrl:url});
 assert.equal(get().leads[0].comments,'Nota histórica');assert.equal(get().leads[0].comment_history.length,1);
});
test('general and advertising expenses accept optional attribution and agency; decimals and author are retained',()=>{
 const {q,get}=setup();
 for(const spend_type of ['other','campaign']){
  const expense=q.addMarketingExpense({id:'untrusted',concept:'Fotografía',amount:125.50,date:'2026-09-10',spend_type,agency:'Agencia Norte'},'Gerente');
  assert.notEqual(expense.id,'untrusted');assert.equal(expense.amount,125.5);assert.equal(expense.source,'');assert.equal(expense.campaign_name,'');assert.equal(expense.created_by,'Gerente');
  assert.equal(expense.agency,'Agencia Norte');
 }
 assert.equal(get().marketing_expenses.length,2);q.deleteMarketingExpense(get().marketing_expenses[0].id);assert.equal(get().marketing_expenses.length,1);
 for(const change of [{amount:0},{amount:-1},{amount:'NaN'},{concept:' '},{date:'2026-02-30'},{spend_type:'invalid'}])assert.throws(()=>q.addMarketingExpense({concept:'Gasto',amount:1,date:'2026-09-01',spend_type:'other',...change},'Ana'));
});
test('tool links are shared and narrowly validated with concurrent-edit protection',()=>{
 const {q,get}=setup();const saved=q.updateToolLinks({...links(),finishes:'https://docs.google.com/spreadsheets/d/finish/edit',separationFilesFolder:'https://drive.google.com/drive/folders/folder-one',geminiApiKey:'injected'},'Ana');
 assert.equal(saved.revision,1);assert.equal(saved.updated_by,'Ana');assert.equal(get().settings.geminiApiKey,undefined);assert.equal(get().settings.acabadosSheetUrl,saved.finishes);
 assert.throws(()=>q.updateToolLinks(links(),'Luis'),/Otro usuario/);
 assert.throws(()=>q.updateToolLinks({...saved,units:'https://127.0.0.1/private'},'Ana'),/HTTPS/);
 assert.throws(()=>q.updateToolLinks({...saved,separationFilesFolder:'https://docs.google.com/document/d/not-a-folder/edit'},'Ana'),/carpeta de Google Drive/);
 assert.throws(()=>q.updateToolLinks({...saved,leads:[url,'https://docs.google.com/spreadsheets/d/test-one/export?format=csv&gid=0']},'Ana'),/más de una/);
 const restored=q.updateToolLinks({...saved,leads:[''],autoSync:false},'Luis');assert.equal(restored.autoSync,false);assert.equal(restored.revision,2);
});
const csv='Nombre,Telefono,Fecha,Estado\nCliente,999123456,2026-09-10,Lead Inicial';
async function syncSetup(readSheet){
 const db=new MemoryFirestore(),store=new FirestoreProject(db);await store.initialize({settings:{projectName:'Test',toolLinks:{...links(),revision:1}},leads:[],units:[]});
 const cache=store.watch();let clock=Date.now();
 return {db,store,cache,worker:sheetSync({store,cache,readSheet,now:()=>clock}),advance:()=>{clock+=INTERVAL+1;},close:()=>cache.close()};
}
test('automatic cycles import new rows, keep stages and comments, and never delete missing rows',async()=>{
 let contents=csv,reads=0;const t=await syncSetup(async()=>{reads++;return {data:contents};});
 try{
  await t.worker.run();let d=await t.store.read();assert.equal(d.leads.length,1);
  await t.store.run(({read,write})=>{const q=createQueries(read,write);q.updateLeadStatus(d.leads[0].id,'Contactado','Ana');q.addLeadComment(d.leads[0].id,{text:'Nota',requestId:'note'},'Ana');});
  await t.worker.run();assert.equal(reads,1,'One automatic read per hour');
  contents=csv+'\nOtro,988123456,2026-09-11,Lead Inicial';t.advance();await t.worker.run();
  d=await t.store.read();assert.equal(d.leads.length,2);assert.equal(d.leads[0].status,'Contactado');assert.equal(d.leads[0].comment_history.length,1);
  contents='Nombre,Telefono,Fecha,Estado\nOtro,988123456,2026-09-11,Lead Inicial';t.advance();await t.worker.run();d=await t.store.read();assert.equal(d.leads.length,2);assert.equal(d.archived_leads.length,0);
  assert.equal(d.settings.leadSheetSync[url].error,null);
 }finally{t.close();}
});
test('unreadable or empty sheets keep prior data and expose recoverable status',async()=>{
 let fail=false,contents=csv;const t=await syncSetup(async()=>{if(fail)throw Error('HTTP 403');return {data:contents};});
 try{
  await t.worker.run();fail=true;t.advance();await t.worker.run();const d=await t.store.read();assert.equal(d.leads.length,1);assert.equal(d.settings.leadSheetSync[url].error,'HTTP 403');assert.ok(d.settings.leadSheetSync[url].success_at);
  fail=false;contents='';t.advance();await t.worker.run();const empty=await t.store.read();assert.equal(empty.leads.length,1);assert.ok(empty.settings.leadSheetSync[url].error);
  contents=csv;t.advance();await t.worker.run();assert.equal((await t.store.read()).settings.leadSheetSync[url].error,null);
 }finally{t.close();}
});
test('disabled automatic polling does not fetch; manual recovery still works',async()=>{
 let calls=0;const t=await syncSetup(async()=>{calls++;return {data:csv};});
 try{await t.store.run(({read,write})=>{const d=read();d.settings.toolLinks.autoSync=false;write(d);});assert.deepEqual(await t.worker.run(),{skipped:true});assert.equal(calls,0);await t.worker.run({force:true});assert.equal(calls,1);}finally{t.close();}
});
test('automatic lead review is limited to one pass every 30 minutes',()=>{
 assert.equal(INTERVAL,30*60*1000);
});
test('multiple server instances use one lease and do not duplicate leads',async()=>{
 let release;const gate=new Promise(resolve=>{release=resolve;});let reads=0;
 const t=await syncSetup(async()=>{reads++;await gate;return {data:csv};});
 try{const other=sheetSync({store:t.store,cache:t.cache,readSheet:async()=>{reads++;return {data:csv};}});const first=t.worker.run();await new Promise(resolve=>setImmediate(resolve));const second=await other.run();assert.equal(second.busy,true);release();await first;assert.equal(reads,1);assert.equal((await t.store.read()).leads.length,1);}finally{release();t.close();}
});
test('changing a source while a download is pending prevents stale import',async()=>{
 let release;const gate=new Promise(resolve=>{release=resolve;});const t=await syncSetup(async()=>{await gate;return {data:csv};});
 try{const pending=t.worker.run();await new Promise(resolve=>setImmediate(resolve));await t.store.run(({read,write})=>{const d=read();d.settings.toolLinks.leads=[''];d.settings.toolLinks.revision++;write(d);});release();await pending;assert.equal((await t.store.read()).leads.length,0);}finally{release();t.close();}
});

test('manual and session imports assign the commercial owner without replacing an existing portfolio',()=>{
 const {q,get}=setup();
 const manual=q.addLead({name:'Lead manual',phone:'988111222',status:'Lead Inicial'},{actor:'Gerencia',sales_owner:'Vendedor Planta'});
 assert.equal(manual.sales_owner,'Vendedor Planta');
 assert.equal(manual.events.at(-1).actor,'Gerencia');
 assert.equal(manual.events.at(-1).assigned_owner,'Vendedor Planta');
 q.syncLeadsRaw({csv:'Nombre,Telefono,Estado\nLead broker,977111222,Lead Inicial',isStrict:false,sourceUrl:url},{actor:'Broker acceso',sales_owner:'Broker Norte',broker_name:'Broker Norte'});
 const brokerLead=get().leads.find(l=>l.phone==='977111222');
 assert.equal(brokerLead.sales_owner,'Broker Norte');
 assert.ok(brokerLead.selectedBrokers.includes('Broker Norte'));
 assert.equal(brokerLead.events.at(-1).actor,'Broker acceso');
 q.syncLeadsRaw({csv:'Nombre,Telefono,Estado\nCliente,999123456,Lead Inicial',isStrict:false,sourceUrl:url},{actor:'Importador',sales_owner:'Vendedor Planta'});
 const historical=get().leads.find(l=>l.id==='l');
 assert.equal(historical.sales_owner,'Vendedor Planta');
 assert.equal(historical.events.at(-1).type,'assigned');
 q.assignUnassignedLeads('Vendedor Planta','Gerencia');
 assert.ok(get().leads.every(l=>l.sales_owner));
});
test('backfill gives legacy leads their first verifiable entry date without changing their stage or profile',()=>{
 const {q,get}=setup();
 const lead=get().leads[0];Object.assign(lead,{status:'Contactado',source:'Facebook',sales_owner:'Ana',imported_at:'2026-09-10T15:30:00.000Z',comments:'Nota histórica'});
 get().leads.push({id:'event-only',name:'Evento',status:'MQL',phone:'988111222',events:[{type:'contacted',at:'2026-09-11T13:15:00.000Z'}]});
 get().leads.push({id:'unknown',name:'Sin evidencia',status:'Lead Inicial',phone:'977111222'});
 const report=q.backfillLeadReceivedDates();
 assert.deepEqual(report,{updated:2,pending:1});
 const migrated=get().leads.find(l=>l.id==='l');
 assert.equal(migrated.received_at,'2026-09-10T15:30:00.000Z');assert.match(migrated.received_date_source,/Migración automática/);
 assert.equal(migrated.status,'Contactado');assert.equal(migrated.source,'Facebook');assert.equal(migrated.sales_owner,'Ana');assert.equal(migrated.comments,'Nota histórica');
 const eventOnly=get().leads.find(l=>l.id==='event-only');assert.equal(eventOnly.received_at,'2026-09-11T13:15:00.000Z');
 assert.equal(get().leads.find(l=>l.id==='unknown').received_at,undefined);
 assert.deepEqual(q.backfillLeadReceivedDates(),{updated:0,pending:1});
});

test('profile contact data is auditable and a manual semaphore requires a reason without moving the lead',()=>{
 const {q,get}=setup();
 q.leadAction('l',{type:'profile',payload:{phone:'988123456',email:'cliente@ejemplo.pe',address:'Av. Principal 123',source:'Instagram'}},'Ana');
 let lead=get().leads[0];
 assert.equal(lead.phone,'988123456');assert.equal(lead.email,'cliente@ejemplo.pe');assert.equal(lead.address,'Av. Principal 123');assert.equal(lead.source,'Instagram');
 assert.ok(lead.events.some(event=>event.type==='profile'&&event.fields.includes('email')));
 assert.throws(()=>q.updateLeadAdvanced('l',{sla:{severity:'Rojo',control_mode:'manual',manual_severity:'Rojo'}},'Ana'),/motivo/);
 q.updateLeadAdvanced('l',{sla:{severity:'Rojo',control_mode:'manual',manual_severity:'Rojo'},semaphore_override_reason:'Cliente solicita atención prioritaria'},'Ana');
 lead=get().leads[0];
 assert.equal(lead.status,'Lead Inicial');assert.equal(lead.sla.severity,'Rojo');
 assert.equal(lead.events.at(-1).type,'semaphore_manual');assert.equal(lead.events.at(-1).reason,'Cliente solicita atención prioritaria');
});
test('follow-up updates only the selected lead and preserves Kanban lead order',()=>{
 let data={settings:{projectName:'Test'},leads:[
  {id:'first',name:'Primero',status:'Lead Inicial',phone:'999111111'},
  {id:'target',name:'Objetivo',status:'Contactado',phone:'999222222'},
  {id:'last',name:'Último',status:'MQL',phone:'999333333'},
 ],units:[],marketing_expenses:[]};
 const q=createQueries(()=>structuredClone(data),saved=>{data=saved;});
 const beforeIds=data.leads.map(lead=>lead.id),untouched=structuredClone(data.leads[0]);
 q.leadAction('target',{type:'follow_up',payload:{substatus:'No contesta',reason:'No respondió la llamada',next_action:'Volver a llamar',next_action_at:'2026-10-20T15:00:00.000Z'}},'Ana');
 assert.deepEqual(data.leads.map(lead=>lead.id),beforeIds);
 assert.deepEqual(data.leads[0],untouched);
 const lead=data.leads[1];
 assert.equal(lead.status,'Seguimiento');assert.equal(lead.substatus,'No contesta');assert.equal(lead.next_action,'Volver a llamar');
 assert.equal(lead.events.at(-1).type,'follow_up');assert.equal(lead.events.at(-1).reason,'No respondió la llamada');
 assert.throws(()=>q.leadAction('target',{type:'follow_up',payload:{substatus:'No contesta',reason:'',next_action:'Llamar',next_action_at:'2026-10-21T15:00:00.000Z'}},'Ana'),/motivo/);
});
