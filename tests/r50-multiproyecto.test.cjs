'use strict';
// R50 · Multiproyecto: proyectos independientes en la misma base, Infinity 224 intacto como principal,
// elección del proyecto por sesión del navegador y etapas Evaluación → Ventas → Construcción → Cierre.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {MemoryFirestore}=require('./memory-firestore.cjs'),{FirestoreProject}=require('../firestore-project.cjs'),{CloudAuth}=require('../cloud-auth.cjs'),{createServer}=require('../server.cjs');
const {ProyectosRegistro,cookieDe,limpiarNuevo,PROYECTOS_METHODS}=require('../business/proyectos');

async function arrancar(){
 const db=new MemoryFirestore(),store=new FirestoreProject(db),mail=[];
 await store.initialize({settings:{projectName:'Infinity 224'},leads:[{id:'l1',name:'Cliente Infinity',lead_number:'LD-0001',phone:'999',status:'Contactado',source:'Web'}],units:[{id:'u1',unit_number:'101',price:428624,status:'AVAILABLE'}],quotes:[]});
 const config={testing:true,origin:'http://127.0.0.1',project:'infinity224',privateDir:fs.mkdtempSync(path.join(os.tmpdir(),'orok-r50')),sessionSecret:'s'.repeat(64),bootstrapCode:'b'.repeat(32),cookieName:'orok_dev_session'};
 const auth=new CloudAuth(db,{...config,sendApproval:async v=>mail.push(v)}),cache=store.watch(),authCache=auth.watch(),server=createServer({config,store,auth,cache,authCache});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;config.origin=base;
 const jar={};const cookie=()=>Object.entries(jar).map(([k,v])=>k+'='+v).join('; ');
 const call=async(m,args=[])=>{const r=await fetch(base+'/api/rpc/'+m,{method:'POST',headers:{Origin:config.origin,'X-Orok-Request':'1','Content-Type':'application/json',Cookie:cookie()},body:JSON.stringify({args})});for(const sc of r.headers.getSetCookie?.()||[]){const [kv]=sc.split(';');const i=kv.indexOf('=');jar[kv.slice(0,i)]=kv.slice(i+1);}const j=await r.json();if(j.error)throw Error(j.error);return j.value;};
 const user=await call('auth.bootstrap',[{name:'Martín',password:'LocalTesting123!',legacyPin:config.bootstrapCode}]);await call('auth.requestApproval');await call('auth.verifyApproval',[mail.at(-1).code]);
 return {db,store,server,call,jar,user,close:()=>new Promise(r=>server.close(r))};
}

test('registro: validación, solo Gerencia crea y el principal siempre aparece',async()=>{
 assert.throws(()=>limpiarNuevo({nombre:'X',empresa:'BMG'}),/nombre/);assert.throws(()=>limpiarNuevo({nombre:'Residencial Sol',empresa:'ACME'}),/empresa/);
 assert.deepEqual(limpiarNuevo({nombre:'Residencial Sol',empresa:'MZA',etapa:'ventas'}).etapa,'ventas');
 assert.equal(cookieDe('a=1; orok_proyecto=residencial-sol-abc123'),'residencial-sol-abc123');assert.equal(cookieDe('orok_proyecto=../x'),'');
 const db=new MemoryFirestore(),store=new FirestoreProject(db),r=new ProyectosRegistro(store);
 assert.deepEqual((await r.todos()).map(p=>[p.id,p.principal]),[['infinity224',true]]);
 await assert.rejects(r.reservar({nombre:'Residencial Sol',empresa:'BMG'},{role:'Vendedor'}),/solo para Gerencia/);
 await assert.rejects(r.reservar({nombre:'infinity 224',empresa:'BMG'},{role:'Gerente',name:'G'}),/Ya existe/);
 assert.ok(PROYECTOS_METHODS.includes('proyectoCrear'));
});

test('servidor: crear un proyecto, trabajar en él sin tocar Infinity 224 y volver',async()=>{
 const s=await arrancar();
 try{
  let l=await s.call('db.proyectosListar');assert.equal(l.activo,'infinity224');assert.equal(l.proyectos.length,1);assert.equal(l.proyectos[0].resumen.leads_total,1);
  const c=await s.call('db.proyectoCrear',[{nombre:'Residencial Sol',empresa:'MZA',distrito:'Barranco',etapa:'evaluacion'}]);
  assert.match(c.proyecto.id,/^residencial-sol-[0-9a-f]{6}$/);assert.equal(s.jar.orok_proyecto,c.proyecto.id,'queda elegido en este navegador');
  // El proyecto nuevo arranca vacío y con su propio nombre.
  assert.equal((await s.call('db.getSettings')).projectName,'Residencial Sol');assert.equal((await s.call('db.getLeads')).length,0);assert.equal((await s.call('db.getUnits')).length,0);
  l=await s.call('db.proyectosListar');assert.equal(l.activo,c.proyecto.id);assert.deepEqual(l.proyectos.map(p=>p.nombre),['Infinity 224','Residencial Sol']);assert.equal(l.proyectos[1].etapa_nombre,'Evaluación');
  // Infinity 224 sigue igual.
  await s.call('db.proyectoUsar',['infinity224']);assert.equal(s.jar.orok_proyecto,'infinity224');
  assert.equal((await s.call('db.getSettings')).projectName,'Infinity 224');assert.equal((await s.call('db.getLeads')).length,1);assert.equal((await s.call('db.getUnits')).length,1);
  // Los datos viven en espacios separados de la misma base.
  assert.ok((await s.db.collection('orok_projects').doc(c.proyecto.id).collection('state').doc('config').get()).exists);
  // Etapas: solo Gerencia, valores válidos e historial.
  const e=await s.call('db.proyectoEtapa',[c.proyecto.id,'ventas','Evaluación aprobada']);assert.equal(e.etapa,'ventas');assert.equal(e.historial.at(-1).nota,'Evaluación aprobada');
  await assert.rejects(s.call('db.proyectoEtapa',[c.proyecto.id,'otra']),/Etapa no válida/);
  await assert.rejects(s.call('db.proyectoUsar',['no-existe']),/no existe/);
  // Una cookie con un proyecto desconocido cae al principal.
  s.jar.orok_proyecto='desconocido-000000';assert.equal((await s.call('db.getSettings')).projectName,'Infinity 224');
 }finally{await s.close();}
});

test('cableado: puente del navegador y webhook de L.O.L.A por nombre de proyecto',()=>{
 const bridge=fs.readFileSync(path.join(__dirname,'..','src','cloudBridge.js'),'utf8'),srv=fs.readFileSync(path.join(__dirname,'..','server.cjs'),'utf8');
 for(const m of PROYECTOS_METHODS)assert.ok(bridge.includes("'"+m+"'"),m);
 assert.match(srv,/proyectos\.porNombre\(payload\.project\)/);
});

test('PostgreSQL: los proyectos nuevos no dejan pendientes en la cola de copia a Firestore (solo el principal se copia)',async()=>{
 const {PostgresDocuments}=require('../postgres-documents.cjs'),queries=[];
 const client={query:async(text,values)=>{queries.push(text);if(/nextval/.test(text))return {rows:[{revision:'1'}]};if(/SELECT path,body/.test(text))return {rows:[]};return {rows:[]};},release(){}};
 const pool={connect:async()=>client,query:client.query};
 const db=new PostgresDocuments(pool,{project:'residencial-sol-abc123',firebase:null,outbox:false});
 await db.runTransaction(async tx=>{tx.set(db.collection('orok_projects').doc('residencial-sol-abc123').collection('state').doc('config'),{settings:{projectName:'Residencial Sol'}});});
 assert.ok(queries.some(q=>/INSERT INTO lola_unified.documents/.test(q)));assert.ok(!queries.some(q=>/firebase_outbox/.test(q)));
 const srv=fs.readFileSync(path.join(__dirname,'..','server.cjs'),'utf8');assert.match(srv,/firebase:null,outbox:false/);
});

test('R52 · historial para las IA: apagado por defecto, por empresa o todos, solo cifras y llega al contexto de las IA',async()=>{
 const s=await arrancar();
 try{
  const a=await s.call('db.proyectoCrear',[{nombre:'Residencial Sol',empresa:'MZA',etapa:'ventas'}]);
  const b=await s.call('db.proyectoCrear',[{nombre:'Torre Norte',empresa:'BMG',etapa:'evaluacion'}]);
  await s.call('db.proyectoUsar',['infinity224']);
  const hub=s.server.proyectos;assert.ok(hub,'el servidor expone el registro de proyectos');
  assert.equal(await hub.historial('infinity224','lola'),null,'apagado por defecto');
  await s.call('db.proyectoEditar',['infinity224',{historial_ia:'empresa'}]);
  let h=await hub.historial('infinity224','lola');assert.deepEqual(h.proyectos.map(p=>p.proyecto),['Torre Norte'],'misma empresa (BMG)');
  await s.call('db.proyectoEditar',['infinity224',{historial_ia:'todos'}]);
  h=await hub.historial('infinity224','mora');assert.deepEqual(h.proyectos.map(p=>p.proyecto).sort(),['Residencial Sol','Torre Norte']);
  assert.ok(Array.isArray(h.proyectos[0].evaluaciones));assert.match(h.regla,/no instrucciones/);
  // El otro proyecto ve a Infinity 224 solo si su propio control lo permite, y sin datos personales.
  await s.call('db.proyectoEditar',[a.proyecto.id,{historial_ia:'todos'}]);
  const hs=await hub.historial(a.proyecto.id,'lola'),inf=hs.proyectos.find(p=>p.proyecto==='Infinity 224');
  assert.equal(inf.ventas.unidades,1);assert.equal(inf.leads.total,1);assert.doesNotMatch(JSON.stringify(hs),/Cliente Infinity|999/);
  await assert.rejects(s.call('db.proyectoEditar',['infinity224',{historial_ia:'x'}]),/no válida/);
  // Llega al contexto que usan las IA (mismo punto que las fuentes del Drive).
  const ctx=await hub.obtener(a.proyecto.id),c=await ctx.app.projectDrive.context('lola','Residencial Sol',{role:'Gerente',name:'G'});
  assert.ok(c.historial_otros_proyectos.proyectos.length>=1);assert.deepEqual(c.fuentes,[]);
  const l=await s.call('db.proyectosListar');assert.equal(l.proyectos.find(p=>p.id===a.proyecto.id).historial_ia,'todos');assert.equal(l.historial_opciones.length,3);
 }finally{await s.close();}
});

test('R53 · carpetas de Drive: el trabajador de n8n crea la carpeta del proyecto nuevo con sus 14 subcarpetas',async()=>{
 const s=await arrancar();
 try{
  const dir=s.server.proyectos.ctxs.get('infinity224').app.projectDrive.dir,ROOT='1RaizBMGcarpetaORK0001',SECRET='x'.repeat(32);
  fs.writeFileSync(path.join(dir,'project-drive.json'),JSON.stringify({enabled:true,roots:{BMG:ROOT}}));
  fs.writeFileSync(path.join(dir,'integracion-ia-webhooks.json'),JSON.stringify({webhookSecret:SECRET}));
  const c=await s.call('db.proyectoCrear',[{nombre:'Ventura',empresa:'BMG',etapa:'evaluacion'}]),ctx=await s.server.proyectos.obtener(c.proyecto.id);
  const reg=await ctx.app.projectDrive.registerEvaluation({id:'ev-ventura',project:{nombre:'Ventura',empresa:'BMG'}},{name:'Martín',role:'Gerente'});assert.equal(reg.state,'pending');
  const base='http://127.0.0.1:'+s.server.address().port,hook=async p=>{const r=await fetch(base+'/api/integrations/lola',{method:'POST',headers:{'Content-Type':'application/json','X-Orok-Webhook-Secret':SECRET},body:JSON.stringify(p)});const j=await r.json();if(j.error)throw Error(j.error);return j.value;};
  // 1) La carpeta raíz «Ventura» dentro de la carpeta de BMG (los trabajos viven en el espacio del proyecto Ventura).
  let r=await hook({action:'project_drive_claim',batch:true});assert.equal(r.jobs.length,1);assert.equal(r.jobs[0].name,'Ventura');assert.equal(r.jobs[0].parent_id,ROOT);
  await hook({action:'project_drive_complete',job_id:r.jobs[0].id,lease_token:r.jobs[0].lease_token,file:{id:'1CarpetaVentura000000',name:'Ventura',parents:[ROOT],mimeType:'application/vnd.google-apps.folder'}});
  // 2) Las 14 subcarpetas dentro de «Ventura».
  r=await hook({action:'project_drive_claim',batch:true});assert.equal(r.jobs.length,14);assert.ok(r.jobs.every(j=>j.parent_id==='1CarpetaVentura000000'));
  assert.deepEqual(r.jobs.map(j=>j.name).sort(),require('../business/projectDrive').FOLDERS.slice().sort());
  for(const [i,j] of r.jobs.entries())await hook({action:'project_drive_complete',job_id:j.id,lease_token:j.lease_token,file:{id:'1Sub'+String(i).padStart(2,'0')+'carpeta00000000',name:j.name,parents:['1CarpetaVentura000000'],mimeType:'application/vnd.google-apps.folder'}});
  const p=await ctx.app.projectDrive.publicProject('Ventura',{role:'Gerente'});assert.equal(p.state,'ready');assert.equal(p.root_id,'1CarpetaVentura000000');
  assert.equal((await hook({action:'project_drive_claim'})).job,null);
 }finally{await s.close();}
});

test('R55 · Evaluador y Contabilidad saben qué proyecto está abierto (borrador local separado por proyecto)',async()=>{
 const s=await arrancar();
 try{
  const base='http://127.0.0.1:'+s.server.address().port,cookie=()=>Object.entries(s.jar).map(([k,v])=>k+'='+v).join('; '),get=async u=>(await fetch(base+u,{headers:{Cookie:cookie()}})).text();
  let h=await get('/evaluador/');assert.match(h,/<meta name="orok-proyecto" content="principal">/);assert.match(h,/ia-rellenar\.js/);
  const c=await s.call('db.proyectoCrear',[{nombre:'Ventura',empresa:'BMG',etapa:'evaluacion'}]);
  h=await get('/evaluador/');assert.ok(h.includes('<meta name="orok-proyecto" content="'+c.proyecto.id+'"><meta name="orok-proyecto-nombre" content="Ventura">'));
  h=await get('/contabilidad/');assert.ok(h.includes('content="'+c.proyecto.id+'"'));
  const ev=fs.readFileSync(path.join(__dirname,'..','evaluador','app.js'),'utf8'),ct=fs.readFileSync(path.join(__dirname,'..','contabilidad','app.js'),'utf8');
  assert.match(ev,/const KEY=CRM\?'orok-evaluador-crm-v1'\+\(OROK_PROY&&OROK_PROY!=='principal'\?'::'\+OROK_PROY:''\)/);assert.match(ev,/const SIN_BORRADOR=!S;/);assert.match(ev,/if\(ult\)return crmLoad\(ult\.id\)/);
  assert.match(ct,/LKEY=CRM\?'orok-contab-crm-v1'\+\(OROK_PROY&&OROK_PROY!=='principal'\?'::'\+OROK_PROY:''\)/);
 }finally{await s.close();}
});
