'use strict';
// R35 · La skill erp-orok-contabilidad es la fuente única de reglas: servidor, pantalla, IA y n8n la leen.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {createServer}=require('../server.cjs'),{MemoryFirestore}=require('./memory-firestore.cjs'),{FirestoreProject}=require('../firestore-project.cjs');
const {ClaraRules,parseSkill,PACKAGE_FILE}=require('../business/claraRules');
const ROOT=path.join(__dirname,'..'),USERS={manager:{id:'u-ger',name:'Gerencia',role:'Gerente'},seller:{id:'u-ven',name:'Luis',role:'Vendedor'}};
async function setup(){
 const privateDir=fs.mkdtempSync(path.join(os.tmpdir(),'orok-skill-')),store=new FirestoreProject(new MemoryFirestore());
 await store.initialize({settings:{},leads:[],units:[],quotes:[],separations:[]});
 const config={privateDir,testing:true,cookieName:'sid',origin:'http://localhost'},calls=[];
 const assistantFetcher=async(url,opts)=>{calls.push({url,body:JSON.parse(opts.body)});return {ok:true,json:async()=>({content:[{type:'text',text:'Listo.'}]})}};
 const authCache={require:async c=>{if(!USERS[c])throw Error('Inicia sesión.');return USERS[c];}},cache={read:()=>store.read()};
 const server=createServer({config,store,cache,authCache,auth:{execute:async()=>{throw Error('x');}},creativeOptions:{assistantFetcher}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;config.origin=base;
 const call=async(name,args=[],cookie='manager')=>{const r=await fetch(base+'/api/rpc/db.'+name,{method:'POST',headers:{'Content-Type':'application/json','X-Orok-Request':'1',Origin:base,Cookie:'sid='+cookie},body:JSON.stringify({args})});return {status:r.status,data:await r.json()};};
 const secret='clara-skill-secret-'.padEnd(40,'x');fs.writeFileSync(path.join(privateDir,'integracion-ia-webhooks.json'),JSON.stringify({webhookSecret:secret}));
 const n8n=async(action)=>{const r=await fetch(base+'/api/integrations/lola',{method:'POST',headers:{'Content-Type':'application/json','X-Orok-Webhook-Secret':secret},body:JSON.stringify({action})});return {status:r.status,data:await r.json()};};
 return {privateDir,call,n8n,calls,close:async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));fs.rmSync(privateDir,{recursive:true,force:true});}};
}
const MD=fs.readFileSync(PACKAGE_FILE,'utf8');
test('la skill del paquete es válida y separa instrucciones (IA) de parámetros (ERP y n8n)',()=>{
 const {texto,params}=parseSkill(MD);
 assert.equal(params.desde,'2025-01-01');assert.equal(params.igv,0.18);assert.equal(params.retencion_4ta.tasa,0.08);assert.equal(params.retencion_4ta.desde_monto,1500);assert.equal(params.detraccion.desde_monto,700);
 assert.equal(params.empresas.MAAS.ruc,'20616628144');assert.equal(params.empresas.BMG.drive_folder,'1RqRBLFGervdPIjOHGfbA2kWUeFRHUjKY');
 assert.match(texto,/Regla de Gerencia sobre fechas/);assert.doesNotMatch(texto,/"retencion_4ta"/);
 assert.throws(()=>parseSkill(MD.replace('"igv": 0.18','"igv": 18')),/igv/);
 assert.throws(()=>parseSkill(MD.replace('name: erp-orok-contabilidad','name: otra')),/encabezado/);
 const e=fs.readFileSync(path.join(ROOT,'skills/erp-orok-entrega/SKILL.md'),'utf8');assert.match(e,/^---\nname: erp-orok-entrega\n/);
});
test('Gerencia y n8n leen las reglas; los demás roles no',async()=>{
 const t=await setup();try{
  const r=(await t.call('claraReglas')).data.value;assert.equal(r.fuente,'paquete');assert.match(r.version,/^[a-f0-9]{12}$/);assert.equal(r.params.igv,0.18);
  assert.equal((await t.call('claraReglas',[],'seller')).status,400);
  const n=(await t.n8n('clara_reglas_get')).data.value;assert.equal(n.version,r.version);assert.equal(n.params.desde,'2025-01-01');assert.match(n.texto,/Nombres estándar/);
 }finally{await t.close()}
});
test('una copia editada en el servidor cambia las reglas en un solo lugar; si tiene error se mantiene la última válida',async()=>{
 const t=await setup();try{
  const dir=path.join(t.privateDir,'skills','erp-orok-contabilidad');fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,'SKILL.md'),MD.replace('"desde_monto": 700','"desde_monto": 800'));
  const a=(await t.call('claraReglas')).data.value;assert.equal(a.fuente,'servidor');assert.equal(a.params.detraccion.desde_monto,800);assert.equal(a.aviso,null);
  await new Promise(r=>setTimeout(r,20));fs.writeFileSync(path.join(dir,'SKILL.md'),MD.replace('"igv": 0.18','"igv": "dieciocho"'));
  const b=(await t.call('claraReglas')).data.value;assert.equal(b.params.detraccion.desde_monto,800);assert.match(b.aviso,/error/);assert.equal(b.version,a.version);
 }finally{await t.close()}
});
test('C.L.A.R.A responde con las reglas de la skill como instrucciones',async()=>{
 const t=await setup();try{
  fs.writeFileSync(path.join(t.privateDir,'lola-asistente.json'),JSON.stringify({enabled:true,provider:'claude',apiKey:'sk-ant-prueba-'.padEnd(40,'x'),max_per_day:5}));
  const r=await t.call('claraAsk',[{rules:'pantalla',context:'Vencido S/ 696',messages:[{role:'user',text:'hola'}]}]);assert.equal(r.status,200,JSON.stringify(r.data));
  const sys=t.calls.find(x=>/anthropic/.test(x.url)).body.system;assert.match(sys,/skill erp-orok-contabilidad \(versión [a-f0-9]{12}\)/);assert.match(sys,/Regla de Gerencia sobre fechas/);assert.match(sys,/Vencido S\/ 696/);
 }finally{await t.close()}
});
test('la app compilada trae la misma versión de la skill que el paquete',()=>{
 const v=new ClaraRules(null).read().version;
 for(const f of ['contabilidad-src/clara-contabilidad.html','contabilidad/app.js'])assert.ok(fs.readFileSync(path.join(ROOT,f),'utf8').includes("version:'"+v+"'"),f+' no trae la versión '+v);
});
