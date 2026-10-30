'use strict';
// R33 · Integración M.O.R.A (Evaluador Inmobiliario) con el CRM: cola n8n, permisos por rol,
// control de salida en el servidor, propuestas con aprobación de Gerencia, ventas reales y lectura semanal.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {createServer}=require('../server.cjs'),{MemoryFirestore}=require('./memory-firestore.cjs'),{FirestoreProject}=require('../firestore-project.cjs');
const EVAL=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/mora-evaluacion-infinity224.json'),'utf8'));
const USERS={manager:{id:'u-ger',name:'Gerencia',role:'Gerente'},seller:{id:'u-ven',name:'Luis',role:'Vendedor'},broker:{id:'u-bro',name:'Broker Uno',role:'Broker'}};
async function setup(options={}){
 const privateDir=fs.mkdtempSync(path.join(os.tmpdir(),'orok-mora-')),store=new FirestoreProject(new MemoryFirestore());
 const units=EVAL.inputs.units.map((u,i)=>({id:'unit-'+u.id,unit_number:u.id,status:i===0?'SOLD':'Disponible',sold_lead_id:i===0?'lead-1':undefined,sold_at:i===0?'2026-03-10T15:00:00.000Z':undefined,sold_amount:i===0?407193:undefined}));
 await store.initialize({settings:{},leads:[{id:'lead-1',name:'Ana',status:'Venta'},{id:'lead-2',name:'Beto',status:'Minuta',source:'Meta · Infinity oct'}],units,quotes:[],
  separations:[{id:'sep-1',unit_id:'unit-101',lead_id:'lead-1',status:'SOLD',final_price:407193,sold_at:'2026-03-10T15:00:00.000Z'},{id:'sep-2',unit_id:'unit-201',lead_id:'lead-2',status:'CONFIRMED',final_price:558442,confirmed_at:'2026-09-02T15:00:00.000Z'}]});
 const config={privateDir,testing:true,cookieName:'sid',origin:'http://localhost',moraGeocoder:options.geocoder};
 const authCache={require:async cookie=>{if(!USERS[cookie])throw Error('Inicia sesión.');return USERS[cookie];}},cache={read:()=>store.read()};
 const server=createServer({config,store,cache,authCache,auth:{execute:async()=>{throw Error('Not used');}}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;config.origin=base;
 const call=async(name,args=[],cookie='manager')=>{const r=await fetch(base+'/api/rpc/db.'+name,{method:'POST',headers:{'Content-Type':'application/json','X-Orok-Request':'1',Origin:base,Cookie:'sid='+cookie},body:JSON.stringify({args})});return {status:r.status,data:await r.json()};};
 const secret='mora-worker-secret-'.padEnd(40,'x');fs.writeFileSync(path.join(privateDir,'integracion-ia-webhooks.json'),JSON.stringify({webhookSecret:secret}));
 const n8n=async(action,p={},key=secret)=>{const r=await fetch(base+'/api/integrations/lola',{method:'POST',headers:{'Content-Type':'application/json','X-Orok-Webhook-Secret':key},body:JSON.stringify({action,...p})});return {status:r.status,data:await r.json()};};
 return {privateDir,store,call,n8n,base,close:async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));fs.rmSync(privateDir,{recursive:true,force:true});}};
}
const ask=(t,cookie,question)=>t.call('askMora',[{evaluation_id:EVAL.id,question,request_id:crypto.randomUUID()}],cookie);

test('M.O.R.A nace apagada y la administración es solo de Gerencia',async()=>{
 const t=await setup();try{
  for(const n of ['getMoraConfig','saveMoraConfig','saveMoraEvaluation','getMoraProposals','decideMoraProposal','setMoraEditor','getMoraWeekly'])assert.equal((await t.call(n,[{}],'seller')).status,400,n);
  assert.equal((await t.call('getMoraConfig')).data.value.enabled,false);
  assert.equal((await t.n8n('mora_job_claim',{},'bad')).status,401);
  assert.equal((await t.n8n('mora_job_claim')).data.value.job,null);
  assert.equal((await t.call('saveMoraEvaluation',[EVAL])).status,200);
  const r=await ask(t,'manager','¿Cómo vamos?');assert.equal(r.status,400);assert.match(r.data.error,/desactivada/);
  assert.match((await ask(t,'seller','¿Cómo vamos?')).data.error,/Gerencia/);
 }finally{await t.close();}
});

test('R33b: M.O.R.A es solo de Gerencia; el control de salida del servidor sigue protegiendo un trabajo de alcance resumen',async()=>{
 const t=await setup();try{
  await t.call('saveMoraConfig',[{enabled:true}]);await t.call('saveMoraEvaluation',[EVAL]);
  for(const who of ['seller','broker'])for(const n of ['getMoraEvaluations','getMoraEvaluation','askMora','getMoraThread','getMoraSalesFeed'])assert.equal((await t.call(n,[EVAL.id],who)).status,400,who+' '+n);
  const list=(await t.call('getMoraEvaluations')).data.value;
  assert.equal(list[0].scope,'completo');assert.ok(list[0].kpis);
  assert.deepEqual([list[0].summary.vendidas,list[0].summary.separadas,list[0].summary.disponibles],[1,1,9]);
  const q=await ask(t,'manager','¿Cuál es el margen del proyecto?');assert.equal(q.status,200);
  // Defensa en profundidad: si un trabajo quedara con rol de ventas (datos anteriores a R33b), el servidor igual quita las cifras.
  const jobs=t.store.ref.collection('mora_jobs'),jid=(await t.n8n('mora_job_claim')).data.value.job.id;
  await t.store.db.runTransaction(async tx=>{const ref=jobs.doc(jid),j=(await tx.get(ref)).data();tx.set(ref,{...j,actor_role:'Vendedor',state:'queued',lease_until:null,lease_token:null});});
  const job=(await t.n8n('mora_job_claim')).data.value.job;assert.equal(job.id,jid);assert.equal(job.actor_role,'Vendedor');
  const done=await t.n8n('mora_job_complete',{job_id:job.id,lease_token:job.lease_token,result:{reply:'El margen es 13.7% y la utilidad S/ 485,547.',proposals:[{ruta:'p.precioM2',valor:7000}]}});
  assert.equal(done.data.value.scope,'resumen');assert.equal(done.data.value.proposals,0);
  const th=(await t.call('getMoraThread',[{thread_id:q.data.value.thread_id}])).data.value;
  assert.equal(th.messages.length,2);assert.match(th.messages[1].text,/requiere permiso de Gerencia/);
 }finally{await t.close();}
});

test('Gerencia recibe propuestas filtradas y al aprobarlas la evaluación sube de revisión',async()=>{
 const t=await setup();try{
  await t.call('saveMoraConfig',[{enabled:true}]);await t.call('saveMoraEvaluation',[EVAL]);
  await ask(t,'manager','¿Qué precio necesito para 18% de margen?');
  const job=(await t.n8n('mora_job_claim')).data.value.job;assert.equal(job.actor_role,'Gerente');
  const done=await t.n8n('mora_job_complete',{job_id:job.id,lease_token:job.lease_token,result:{reply:'Con S/ 7,400 por m² llegas al margen meta.',
   proposals:[{ruta:'p.precioM2',valor:7400,motivo:'margen meta'},{ruta:'base.snap.p.precioM2',valor:1},{ruta:'estr.estado',valor:'aprobada'},{ruta:'p.ir',valor:0}],follow_ups:['¿Y si baja la velocidad?']}});
  assert.equal(done.data.value.proposals,1);
  const props=(await t.call('getMoraProposals')).data.value;assert.equal(props.length,1);assert.equal(props[0].estado,'pendiente_gerencia');
  assert.equal((await t.call('decideMoraProposal',[props[0].id,{decision:'aprobar'}],'seller')).status,400);
  assert.equal((await t.call('decideMoraProposal',[props[0].id,{decision:'aprobar'}])).status,200);
  const ev=(await t.store.ref.collection('mora_evaluations').doc(EVAL.id).get()).data();
  assert.equal(ev.inputs.p.precioM2,7400);assert.equal(ev.revision,2);assert.equal(ev.history.at(-1).change.ruta,'p.precioM2');
  assert.equal((await t.call('decideMoraProposal',[props[0].id,{decision:'rechazar'}])).status,400);
  const feed=(await t.call('getMoraSalesFeed',[EVAL.id])).data.value;
  assert.equal(feed.schema,'crm.ventas@1');assert.deepEqual(feed.ventas.map(v=>[v.unidad,v.etapa,v.fecha]).sort(),[['101','Venta','2026-03'],['201','Minuta','2026-09']]);
 }finally{await t.close();}
});

test('R33b: el Evaluador guarda su copia de trabajo en el CRM y una propuesta aprobada también la actualiza',async()=>{
 const t=await setup();try{
  await t.call('saveMoraConfig',[{enabled:true}]);
  const ws={p:{...EVAL.inputs.p},estr:{desc:2,estado:'aprobada'},units:EVAL.inputs.units,ventas:[]};
  const saved=await t.call('saveMoraEvaluation',[{...EVAL,workspace:ws}]);assert.equal(saved.status,200);assert.equal(saved.data.value.revision,1);
  const ev=(await t.call('getMoraEvaluation',[EVAL.id])).data.value;assert.deepEqual(ev.workspace.estr,ws.estr);assert.equal(ev.summary.vendidas,1);
  assert.equal((await t.call('saveMoraEvaluation',[{...EVAL}])).data.value.revision,2);
  assert.ok((await t.call('getMoraEvaluation',[EVAL.id])).data.value.workspace,'guardar sin copia de trabajo conserva la anterior');
  await ask(t,'manager','Sube el precio');const job=(await t.n8n('mora_job_claim')).data.value.job;
  await t.n8n('mora_job_complete',{job_id:job.id,lease_token:job.lease_token,result:{reply:'Propongo S/ 7,250 por m².',proposals:[{ruta:'p.precioM2',valor:7250,motivo:'margen'}]}});
  const prop=(await t.call('getMoraProposals')).data.value[0];
  assert.equal((await t.call('decideMoraProposal',[prop.id,{decision:'aprobar'}])).status,200);
  const after=(await t.call('getMoraEvaluation',[EVAL.id])).data.value;
  assert.equal(after.revision,3);assert.equal(after.inputs.p.precioM2,7250);assert.equal(after.workspace.p.precioM2,7250);
 }finally{await t.close();}
});

test('R33b: /evaluador solo abre con sesión de Gerencia y cumple la política de seguridad de contenido',async()=>{
 const t=await setup();try{
  const get=(p,cookie)=>fetch(t.base+p,{headers:cookie?{Cookie:'sid='+cookie}:{}});
  for(const who of ['seller','broker']){const r=await get('/evaluador/',who);assert.equal(r.status,403,who);await r.text();}
  const anon=await get('/evaluador/');assert.notEqual(anon.status,200);await anon.text();
  const page=await get('/evaluador/','manager');assert.equal(page.status,200);assert.match(page.headers.get('cache-control'),/no-store/);
  const html=await page.text();assert.match(html,/<script src="\/evaluador\/app\.js"><\/script>/);assert.doesNotMatch(html,/<script>(?!<\/script>)/);
  assert.match(page.headers.get('content-security-policy')||'',/script-src 'self'/);
  const js=await get('/evaluador/app.js','manager');assert.equal(js.status,200);const code=await js.text();
  assert.match(code,/const CRM=/);assert.match(code,/'\/api\/rpc\/db\.'\+name/);assert.match(code,/\/evaluador\/jspdf\.umd\.min\.js/);
  assert.match(code,/geocodeMoraMarket/);assert.match(code,/alturaFiltro/);assert.match(code,/scope-sep/);
  const pdf=await get('/evaluador/jspdf.umd.min.js','manager');assert.equal(pdf.status,200);await pdf.text();
  const xls=await get('/evaluador/exceljs.min.js','manager');assert.equal(xls.status,200);assert.match(await xls.text(),/ExcelJS/);
  assert.match(code,/'\/evaluador\/exceljs\.min\.js'/);assert.match(code,/function exportXLSX/);
  assert.equal((await get('/evaluador/exceljs.min.js','seller')).status,403);
  const other=await get('/evaluador/../server.cjs','manager');assert.notEqual(other.status,200);await other.text();
  const nf=await get('/evaluador/otro.js','manager');assert.equal(nf.status,404);await nf.text();
 }finally{await t.close();}
});

test('las consultas vencidas vuelven a la cola y fallan tras tres intentos; un error de n8n no deja texto',async()=>{
 const t=await setup();try{
  await t.call('saveMoraConfig',[{enabled:true}]);await t.call('saveMoraEvaluation',[EVAL]);
  const q=await ask(t,'manager','Hola');const jobs=t.store.ref.collection('mora_jobs');
  for(let i=1;i<=3;i++){
   const job=(await t.n8n('mora_job_claim')).data.value.job;assert.ok(job,'intento '+i);
   await t.store.db.runTransaction(async tx=>{const ref=jobs.doc(job.id),j=(await tx.get(ref)).data();tx.set(ref,{...j,lease_until:new Date(Date.now()-1000).toISOString()});});
  }
  assert.equal((await t.n8n('mora_job_claim')).data.value.job,null);
  const failed=(await jobs.doc((await t.call('getMoraThread',[{thread_id:q.data.value.thread_id}])).data.value.pending[0].id).get()).data();assert.equal(failed.state,'failed');
  await ask(t,'manager','Otra');const j2=(await t.n8n('mora_job_claim')).data.value.job;
  assert.equal((await t.n8n('mora_job_complete',{job_id:j2.id,lease_token:j2.lease_token,error:'model_unavailable'})).data.value.requeued,true);
 }finally{await t.close();}
});

test('lectura semanal: una por semana, con ventas reales frente a las metas',async()=>{
 const t=await setup();try{
  await t.call('saveMoraEvaluation',[{...EVAL,analysis:{...EVAL.analysis,plan_comercial:{metas_mensuales:[{fecha:'2025-12',unidades:0.8},{fecha:'2026-01',unidades:0.8},{fecha:'2099-01',unidades:5}]}}}]);
  assert.equal((await t.n8n('mora_weekly_get')).data.value.job,null);
  await t.call('saveMoraConfig',[{enabled:false,weekly_enabled:true,thresholds:{utilidad_pct:5,unidades:1,meses:2}}]);
  const job=(await t.n8n('mora_weekly_get')).data.value.job;
  assert.equal(job.projects.length,1);assert.equal(job.projects[0].sales.planned_to_date,1.6);assert.equal(job.projects[0].sales.sold_to_date,2);
  assert.equal((await t.n8n('mora_weekly_get')).data.value.job,null);
  assert.equal((await t.n8n('mora_weekly_complete',{job_id:job.id,lease_token:job.lease_token,result:{summary:'- Infinity 224 en línea.',alerts:[{project_id:EVAL.id,level:'media',kind:'estrategia',text:'Estrategia sin aprobar'}],actions:[]}})).status,200);
  const list=(await t.call('getMoraWeekly')).data.value;assert.equal(list.length,1);assert.equal(list[0].lease_token,undefined);assert.equal(list[0].alerts.length,1);
  assert.equal((await t.n8n('mora_weekly_get')).data.value.job,null);
 }finally{await t.close();}
});

test('R33b: Vendedor y Broker solo ven el CRM (Inicio, Ventas, Configuración; R38: más Órdenes OC/OS, que el servidor filtra); Gerencia cambia de módulo',async()=>{
 const {navGroups,MANAGER_ONLY,modulesFor,moduleOf}=await import('../src/navModel.mjs');
 const ids=(role,m)=>navGroups(role,m).flatMap(g=>g.items.map(i=>i[0]));
 for(const r of ['Vendedor','Broker']){
  assert.deepEqual(navGroups(r).map(g=>g.label),['Inicio','Ventas','Órdenes OC/OS','Configuración'],r);
  assert.deepEqual(navGroups(r,'evaluador').map(g=>g.label),['Inicio','Ventas','Órdenes OC/OS','Configuración'],r+' no entra al Evaluador');
  assert.equal(ids(r).includes('contabilidad'),false,r+' no entra a Contabilidad');
  for(const id of ['mora','moraAdmin','evaluador'])assert.equal(ids(r).includes(id),false,r+' '+id);
  assert.deepEqual(modulesFor(r).map(m=>m.id),['crm']);
 }
 assert.deepEqual(navGroups('Gerente').map(g=>g.label),['Inicio','Ventas','Configuración']); // R42 · Marketing salió del CRM
 assert.deepEqual(navGroups('Gerente','marketing').map(g=>g.label),['Hoy','Crear','Publicar','Medir','Marca']);
 assert.deepEqual(ids('Gerente','evaluador'),['evaluador','mora','moraAdmin']);
 assert.deepEqual(modulesFor('Gerente').map(m=>m.id),['evaluador','marketing','crm','erp']);
 assert.equal(moduleOf('mora'),'evaluador');assert.equal(moduleOf('kanban'),'crm');
 for(const id of ['mora','moraAdmin','evaluador'])assert.ok(MANAGER_ONLY.includes(id),id);
 const app=fs.readFileSync(require.resolve('../src/App.jsx'),'utf8');
 assert.match(app,/currentUser\.role==='Gerente'&&\(activeTab==='mora'\|\|activeTab==='moraAdmin'\)/);
 assert.match(app,/currentUser\.role==='Gerente'&&activeTab==='evaluador'/);
 assert.match(app,/className="module-switch/);
});

test('tablero semanal: semanas lunes a domingo, flujos de separación y venta, absorción y comparación con la semana anterior',async()=>{
 const {weeklyModel,weekLabel}=await import('../src/weeklyBiModel.mjs');
 const now=Date.parse('2026-10-26T17:00:00Z');// lunes 26 oct (Lima)
 const leads=[
  {id:'a',received_at:'2026-10-19T15:00:00Z',status:'Cita',source:'Meta',sales_owner:'Luis'},
  {id:'b',received_at:'2026-10-20T15:00:00Z',status:'Lead Inicial',source:'Meta',sales_owner:'Luis'},
  {id:'c',received_at:'2026-10-14T15:00:00Z',status:'Separación',source:'TikTok',sales_owner:'Ana'},
  {id:'d',received_at:'2026-10-26T15:00:00Z',status:'Contactado',source:'Web',sales_owner:'Ana'}];
 const units=[{id:'u1',unit_number:'101',status:'SOLD',sold_at:'2026-10-21T15:00:00Z',sold_amount:400000},{id:'u2',unit_number:'201',status:'Disponible'}];
 const seps=[{id:'s1',lead_id:'c',unit_id:'u1',status:'SOLD',confirmed_at:'2026-10-15T15:00:00Z',sold_at:'2026-10-21T15:00:00Z',final_price:400000}];
 const expenses=[{date:'2026-10-20',amount:500,source:'Meta'}];
 const m=weeklyModel({leads,units,expenses,separations:seps},{weeks:8,now});
 assert.equal(m.weeks.length,8);assert.equal(m.weeks.at(-1).week,'2026-10-26');assert.equal(m.weeks.at(-1).partial,true);
 const w=m.weeks.find(x=>x.week==='2026-10-19');assert.deepEqual([w.leads,w.appointments,w.sales,w.sales_value,w.spend,w.cpl],[2,1,1,400000,500,250]);
 assert.equal(m.weeks.find(x=>x.week==='2026-10-12').separations,1);
 assert.equal(m.weeks.at(-1).units_sold_acc,1);assert.equal(m.totalUnits,2);
 const sel=weeklyModel({leads,units,expenses,separations:seps},{weeks:8,now,selected:6});
 assert.equal(sel.kpis.leads.value,2);assert.equal(sel.kpis.leads.delta,1);assert.ok(sel.insights.some(i=>/sin contacto/.test(i.text)));
 assert.equal(sel.owners[0].name,'Luis');
 const meta=weeklyModel({leads,units,expenses,separations:seps},{weeks:8,now,filters:{source:'TikTok'}});assert.equal(meta.weeks.find(x=>x.week==='2026-10-19').leads,0);
 assert.match(weekLabel('2026-10-26'),/26 oct–1 nov/);
});

test('R33c: estudio de mercado · cola de lecturas solo para Gerencia, dominios permitidos y avisos validados en el servidor',async()=>{
 const t=await setup();try{
  assert.match((await t.call('requestMoraMarket',[{text:'x'.repeat(100)}])).data.error,/desactivada/);
  await t.call('saveMoraConfig',[{enabled:true}]);
  for(const who of ['seller','broker'])assert.equal((await t.call('requestMoraMarket',[{text:'x'.repeat(100)}],who)).status,400,who);
  for(const bad of ['http://urbania.pe/x','https://evil.example/x','https://u:p@urbania.pe/x','https://urbania.pe:8443/x'])assert.equal((await t.call('requestMoraMarket',[{url:bad}])).status,400,bad);
  assert.match((await t.call('requestMoraMarket',[{text:'corto'}])).data.error,/Pega el contenido/);
  const r=await t.call('requestMoraMarket',[{url:'https://urbania.pe/buscar/venta-de-departamentos-en-san-miguel--lima--lima',distrito:'San Miguel'}]);assert.equal(r.status,200);
  const id=r.data.value.job_id;
  assert.equal((await t.call('getMoraMarket',[id])).data.value.state,'queued');
  assert.equal((await t.n8n('mora_market_claim',{},'bad')).status,401);
  const job=(await t.n8n('mora_market_claim')).data.value.job;assert.equal(job.engine,'mora_market');assert.equal(job.distrito,'San Miguel');
  assert.equal((await t.n8n('mora_market_claim')).data.value.job,null);
  assert.equal((await t.n8n('mora_market_complete',{job_id:id,lease_token:'mal',result:{avisos:[]}})).status,400);
  const done=await t.n8n('mora_market_complete',{job_id:id,lease_token:job.lease_token,result:{avisos:[
   {nombre:'Livan',precio:278133,area_min:43,area_max:74,tipo:'proyecto',estado:'lanzamiento',desde:true,amenidades:['piscina','parrilla'],url:'javascript:alert(1)',pisos:9},
   {nombre:'Sin área',precio:300000},{nombre:'<b>x</b>'.repeat(100),precio:400000,area_min:60,estado:'otro'}]}});
  assert.equal(done.data.value.avisos,2);
  const got=(await t.call('getMoraMarket',[id])).data.value;assert.equal(got.state,'done');
  assert.equal(got.result.avisos[0].url,'');assert.equal(got.result.avisos[0].pisos,9);assert.equal(got.result.avisos[1].estado,null);assert.ok(got.result.avisos[1].nombre.length<=120);
  const stored=(await t.store.ref.collection('mora_market_jobs').doc(id).get()).data();assert.equal(stored.text,'');assert.equal(stored.lease_token,null);
  // Un portal que bloquea la descarga: falla con instrucción de pegar el contenido, sin reintentos inútiles.
  const r2=(await t.call('requestMoraMarket',[{url:'https://www.adondevivir.com/departamentos-en-venta-en-san-miguel.html'}])).data.value.job_id;
  const j2=(await t.n8n('mora_market_claim')).data.value.job;assert.equal(j2.id,r2);
  assert.equal((await t.n8n('mora_market_complete',{job_id:r2,lease_token:j2.lease_token,error:'blocked'})).data.value.requeued,false);
  assert.match((await t.call('getMoraMarket',[r2])).data.value.error,/pégala/);
  // Cada persona solo ve sus lecturas.
  assert.equal((await t.call('getMoraMarket',[r2],'seller')).status,400);
 }finally{await t.close();}
});

test('R33c: el estudio parte de la dirección del proyecto y calcula distancias sin consultas continuas',async()=>{
 const points={
  'Calle La Apacheta 224, San Miguel, Lima':{lat:-12.0770,lon:-77.0900,label:'Infinity 224'},
  'Calle Puquina 180, San Miguel, Lima, Perú':{lat:-12.0780,lon:-77.0890,label:'Livan'},
  'Av. La Marina 3420, San Miguel, Lima, Perú':{lat:-12.0700,lon:-77.1020,label:'La Marina 3420'}
 },calls=[];
 const t=await setup({geocoder:async q=>{calls.push(q);return points[q]||null}});try{
  assert.equal((await t.call('geocodeMoraMarket',[{origin:'Calle La Apacheta 224, San Miguel, Lima',items:[]}])).status,400);
  assert.equal((await t.call('geocodeMoraMarket',[{origin:'Calle La Apacheta 224, San Miguel, Lima',items:[{index:0,address:'Calle Puquina 180, San Miguel, Lima, Perú'}]}],'seller')).status,400);
  const r=await t.call('geocodeMoraMarket',[{origin:'Calle La Apacheta 224, San Miguel, Lima',items:[{index:0,address:'Calle Puquina 180, San Miguel, Lima, Perú'},{index:1,address:'Av. La Marina 3420, San Miguel, Lima, Perú'}]}]);
  assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.value.items.length,2);assert.ok(r.data.value.items[0].distance_m>0);assert.ok(r.data.value.items[1].distance_m>r.data.value.items[0].distance_m);assert.equal(calls.length,3);
  assert.ok(fs.existsSync(path.join(t.privateDir,'mora-geocode-cache.json')));
 }finally{await t.close();}
});

test('R63 · el trabajo de M.O.R.A trae su contexto (evaluación, alcance e historial) y el trabajador de producción no usa PostgreSQL',async()=>{
 const t=await setup();try{
  await t.call('saveMoraConfig',[{enabled:true}]);await t.call('saveMoraEvaluation',[EVAL]);
  await ask(t,'manager','¿Cuál es el margen?');
  const job=(await t.n8n('mora_job_claim')).data.value.job,c=job.context;
  assert.equal(c.ok,true);assert.equal(c.job_id,job.id);assert.equal(c.scope,'completo');assert.ok(c.evaluation.inputs&&c.evaluation.inputs.p);assert.ok(Array.isArray(c.evaluation.inputs.units));
  assert.equal(c.history.length,1);assert.equal(c.history[0].role,'user');assert.match(c.history[0].text,/margen/);
  const w=JSON.parse(require('node:fs').readFileSync(require('node:path').join(__dirname,'..','n8n','MORA-R63-PRODUCCION.json'),'utf8'));
  assert.equal(w.active,false);assert.ok(!w.nodes.some(n=>/postgres/i.test(n.type)));assert.equal(w.nodes.filter(n=>n.parameters.url==='https://erp.orok.com.pe/api/integrations/lola').length,6);
  assert.ok(w.nodes.find(n=>n.name==='Conservar consulta M.O.R.A').parameters.jsCode.includes('context: job.context'));
  assert.ok(w.connections['Conservar consulta M.O.R.A'].main[0].some(d=>d.node==='Contexto entregado por el ERP'));
 }finally{await t.close();}
});
