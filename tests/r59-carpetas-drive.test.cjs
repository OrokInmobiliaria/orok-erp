'use strict';
// R59 · Carpetas en Drive sin depender de un archivo en el servidor: carpetas predeterminadas por empresa (ÖRÖK),
// configurables por Gerencia desde el ERP, y botón «Crear carpetas en Drive» en el Evaluador.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {MemoryFirestore}=require('./memory-firestore.cjs'),{FirestoreProject}=require('../firestore-project.cjs'),{ProjectDrive}=require('../business/projectDrive');
const G={name:'Martín',role:'Gerente'},V={name:'V',role:'Vendedor'},OROK='1o9icm7jGl9wA6sTfPljLwr3ZBAx8wejz';
async function rig(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'r59-')),store=new FirestoreProject(new MemoryFirestore());await store.initialize({settings:{},leads:[],units:[],quotes:[]});return {dir,store,pd:new ProjectDrive(store,{privateDir:dir})};}
test('sin project-drive.json: Drive activo con la carpeta ÖRÖK para BMG; un proyecto nuevo encola su carpeta y las 14',async()=>{
 const {pd}=await rig();const c=pd.publicConfig(G);assert.equal(c.enabled,true);assert.equal(c.roots.BMG,OROK);assert.equal(c.origen,'predeterminado');
 const r=await pd.registerEvaluation({id:'ventura-20261026',project:{nombre:'Ventura',empresa:'BMG'}},G);assert.equal(r.state,'pending');
 const jobs=(await pd.jobs.get()).docs.map(d=>d.data());assert.equal(jobs.length,15);const root=jobs.find(j=>j.slot==='root');assert.equal(root.parent_id,OROK);assert.equal(root.name,'Ventura');
 const claim=await pd.action({action:'project_drive_claim',batch:true});assert.equal(claim.jobs[0].name,'Ventura');assert.equal(claim.jobs[0].parent_id,OROK);
});
test('Gerencia cambia las carpetas desde el ERP (enlace o id), apaga y vuelve a prender; respeta lo guardado',async()=>{
 const {pd,dir}=await rig();assert.throws(()=>pd.publicConfig(V),/Gerencia/);assert.throws(()=>pd.saveConfig({},V),/Gerencia/);
 assert.throws(()=>pd.saveConfig({roots:{MZA:'no-es-drive'}},G),/MZA/);
 const c=pd.saveConfig({enabled:true,roots:{MZA:'https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUv?usp=sharing'}},G);
 assert.equal(c.roots.MZA,'1AbCdEfGhIjKlMnOpQrStUv');assert.equal(c.roots.BMG,OROK);assert.equal(c.origen,'guardado');
 fs.writeFileSync(path.join(dir,'project-drive.json'),JSON.stringify({...JSON.parse(fs.readFileSync(path.join(dir,'project-drive.json'),'utf8')),otro:'se conserva'}));
 pd.saveConfig({enabled:false,roots:{}},G);assert.equal(pd.config().enabled,false);assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'project-drive.json'),'utf8')).otro,'se conserva');
 assert.equal((await pd.registerEvaluation({id:'x',project:{nombre:'Otro',empresa:'BMG'}},G)).state,'not_configured');
});
test('cableado: RPC, tarjeta en Herramientas, botón del Evaluador y flujo de producción de n8n',()=>{
 const R=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
 assert.match(R('application.cjs'),/getProjectDriveConfig[\s\S]*saveProjectDriveConfig/);assert.ok(R('src/cloudBridge.js').includes("'saveProjectDriveConfig'"));
 assert.ok(R('src/App.jsx').includes('<CarpetasDrive/>'));assert.ok(R('evaluador/app.js').includes('data-act="project-drive-crear"'));
 const w=JSON.parse(R('n8n/PROYECTOS-R59-DRIVE-PRODUCCION.json'));const http=w.nodes.filter(n=>n.parameters.url==='https://erp.orok.com.pe/api/integrations/lola');
 assert.equal(http.length,8,'los 8 pasos del ERP van a producción');assert.ok(!JSON.stringify(w).includes('lola-pruebas'));assert.equal(w.active,false);
});
