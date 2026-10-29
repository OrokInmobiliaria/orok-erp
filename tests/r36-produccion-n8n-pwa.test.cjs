'use strict';
// R36 · Skills de conexión final: n8n (auditar, comparar, preparar producción), actualización en el host sin pérdida
// de datos (migraciones aditivas, verificación de leads, comentarios, etapas y Kanban) y ERP instalable (PWA).
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const ROOT=path.join(__dirname,'..');
const {auditar,preparar,comparar,validarMapa}=require('../deploy/n8n-herramientas.cjs');
const {revisarSql,listar}=require('../deploy/aplicar-migraciones.cjs');
const {compararDatos}=require('../deploy/verificar-actualizacion.cjs');
const {revisarEntorno,salud}=require('../deploy/produccion.cjs');
const flow=f=>JSON.parse(fs.readFileSync(path.join(ROOT,'n8n',f),'utf8'));
const LOLA='LOLA-ENSAYO-67.6.13-r30-MARKETING-CONEXIONES-INACTIVO.json',MORA='MORA-ENSAYO-67.6.17-EVALUADOR-CONVERSACIONAL-INACTIVO.json',CLARA='CLARA-ENSAYO-67.6.18-DRIVE-CONTABLE-INACTIVO.json';
const MAPA=JSON.parse(fs.readFileSync(path.join(ROOT,'n8n/produccion-mapa.ejemplo.json'),'utf8'));

test('n8n · la auditoría revisa los tres flujos y detecta lo que falta para la conexión final',()=>{
 const l=auditar(flow(LOLA),LOLA);if(flow(LOLA).settings?.timezone!=='America/Lima')assert.ok(l.bloqueos.some(b=>/America\/Lima/.test(b)),'debe pedir la zona horaria de LOLA');else assert.ok(!l.bloqueos.some(b=>/America\/Lima/.test(b)),'R41 integral: LOLA ya trae America/Lima');
 assert.ok(l.advertencias.some(w=>/ENSAYO/.test(w)));
 for(const f of [MORA,CLARA]){const r=auditar(flow(f),f);assert.equal(r.listo,true,f+': '+r.bloqueos.join(' | '));assert.equal(r.activo,false)}
 const malo={...flow(MORA),active:true,nodes:[...flow(MORA).nodes,{name:'X',type:'n8n-nodes-base.code',parameters:{jsCode:'return [{json:{k:"sk-ant-api03-abcdefghijklmnop"}}]'}}]};
 const r=auditar(malo);assert.ok(r.bloqueos.some(b=>/ACTIVO/.test(b)));assert.ok(r.bloqueos.some(b=>/secreto/.test(b)));
});
test('n8n · preparar producción cambia hosts y credenciales, deja todo inactivo y conserva nodos y conexiones',()=>{
 for(const f of [LOLA,MORA,CLARA]){
  const a=flow(f),{flujo,cambios,auditoria}=preparar(a,MAPA);
  assert.equal(flujo.active,false);assert.equal(flujo.id,undefined);assert.deepEqual(flujo.pinData,{});assert.equal(flujo.settings.timezone,'America/Lima');assert.match(flujo.name,/PRODUCCIÓN/);
  assert.doesNotMatch(JSON.stringify(flujo),/lola-pruebas-crm\.kvrq8w\.easypanel\.host/);assert.ok(cambios.length>0);
  const c=comparar(a,flujo);assert.equal(c.conserva_todo,true);assert.deepEqual(c.quitados,[]);assert.deepEqual(c.conexiones_quitadas,[]);
  assert.equal(auditoria.listo,true,f+': '+auditoria.bloqueos.join(' | '));
 }
 assert.throws(()=>validarMapa({credenciales:{x:{nombre:'sk-ant-api03-abcdefghijklmnopqrst'}}}),/clave|secreto/);
 const a=flow(MORA),b=JSON.parse(JSON.stringify(a));b.nodes=b.nodes.filter(n=>n.name!=='Hay consulta M.O.R.A');assert.equal(comparar(a,b).conserva_todo,false);
});
test('migraciones · solo aditivas y repetibles; se rechaza cualquier borrado',()=>{
 for(const m of listar())assert.deepEqual(m.problemas,[],m.archivo);
 for(const sql of ['BEGIN; DROP TABLE x; COMMIT;','BEGIN; DELETE FROM lola_unified.documents; COMMIT;','BEGIN; TRUNCATE leads; COMMIT;','BEGIN; ALTER TABLE a DROP COLUMN b; COMMIT;','CREATE TABLE IF NOT EXISTS a(x int);','BEGIN; CREATE TABLE a(x int); COMMIT;'])assert.ok(revisarSql(sql).length>0,sql);
 assert.deepEqual(revisarSql("BEGIN;\n-- DROP TABLE en un comentario no cuenta\nCREATE TABLE IF NOT EXISTS clara.x(id int);\nSELECT jsonb_build_object('truncated',true);\nCOMMIT;"),[]);
});
const BASE=()=>({leads:[{id:'1',name:'Ana',status:'Visita',substatus:'Agendada',comments:[{text:'Llamar el lunes',at:'2026-10-01'}]},{id:'2',name:'Beto',status:'Visita',comments:[]},{id:'3',name:'Caro',status:'Minuta',comments:[{text:'Firma',at:'2026-10-02'},{text:'OK',at:'2026-10-03'}]}],archived_leads:[{id:'9',name:'Viejo'}],units:[{id:'u1'}],quotes:[{id:'q1'}],separations:[{id:'s1'}],marketing_expenses:[]});
test('actualización · conserva leads, comentarios, etapas y orden del Kanban; permite leads y comentarios nuevos',()=>{
 const a=BASE(),n=BASE();n.leads.push({id:'4',name:'Nuevo',status:'Lead Inicial'});n.leads[0].comments.push({text:'nuevo'});
 const ok=compararDatos(a,n);assert.equal(ok.ok,true,ok.bloqueos.join(' | '));assert.match(ok.info[0],/nuevo/);assert.equal(ok.resumen.comentarios_ahora,4);
 const p=BASE();p.leads.splice(1,1);assert.match(compararDatos(a,p).bloqueos[0],/Lead perdido: 2/);
 const e=BASE();e.leads[0].status='Venta';assert.ok(compararDatos(a,e).bloqueos.some(b=>/Cambió la etapa de 1/.test(b)));
 const c=BASE();c.leads[2].comments.pop();assert.ok(compararDatos(a,c).bloqueos.some(b=>/Faltan 1 comentario/.test(b)));
 const k=BASE();[k.leads[0],k.leads[1]]=[k.leads[1],k.leads[0]];assert.ok(compararDatos(a,k).bloqueos.some(b=>/orden del Kanban en la etapa «Visita»/.test(b)));
 const r=BASE();r.archived_leads=[];assert.ok(compararDatos(a,r).bloqueos.some(b=>/archivado perdido: 9/.test(b)));
 const q=BASE();q.quotes=[];assert.ok(compararDatos(a,q).bloqueos.some(b=>/quotes/.test(b)));
 const m=BASE();m.archived_leads.push(m.leads.shift());assert.equal(compararDatos(a,m).bloqueos.some(b=>/perdido: 1/.test(b)),false);// archivar no es perder
});
test('producción · bloquea si el servidor es el ensayo y espera la versión nueva en /api/health',async()=>{
 assert.match(revisarEntorno({OROK_REHEARSAL:'1'},{privateDir:'/x',origin:'https://crm.orok.com.pe'}).bloqueos[0],/ENSAYO/);
 assert.deepEqual(revisarEntorno({OROK_REHEARSAL:'0',LOLA_POSTGRES_URL_FILE:'/f',OROK_DEPLOY_HOOK_FILE:'/h'},{privateDir:'/x',origin:'https://crm.orok.com.pe'}),{bloqueos:[],advertencias:[]});
 let n=0;const fake=async()=>({ok:true,json:async()=>({ok:true,version:++n<3?'vieja':'67.6.19-r36'})});
 assert.equal((await salud('https://crm.orok.com.pe','67.6.19-r36',5,1,fake)).version,'67.6.19-r36');
 await assert.rejects(salud('https://x','nunca',2,1,async()=>{throw Error('caido')}),/no respondió/);
});
test('PWA · instalable en PC/Mac y se actualiza sola; nunca guarda en caché datos ni API',async()=>{
 const man=JSON.parse(fs.readFileSync(path.join(ROOT,'public/manifest.webmanifest'),'utf8'));assert.equal(man.display,'standalone');assert.ok(man.icons.some(i=>i.sizes==='512x512'));assert.equal(man.theme_color,'#85442A');
 const sw=fs.readFileSync(path.join(ROOT,'public/sw.js'),'utf8');assert.match(sw,/__ERP_VERSION__/);assert.match(sw,/api\|files\|campaign-media\|whatsapp-media\|evaluador\|contabilidad/);assert.match(sw,/skipWaiting/);
 const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');assert.match(html,/rel="manifest"/);
 assert.match(fs.readFileSync(path.join(ROOT,'src/main.jsx'),'utf8'),/iniciarPWA\(\)/);
 if(fs.existsSync(path.join(ROOT,'dist/sw.js'))){assert.doesNotMatch(fs.readFileSync(path.join(ROOT,'dist/sw.js'),'utf8'),/__ERP_VERSION__/);
  const {createServer}=require('../server.cjs'),{MemoryFirestore}=require('./memory-firestore.cjs'),{FirestoreProject}=require('../firestore-project.cjs');
  const privateDir=fs.mkdtempSync(path.join(os.tmpdir(),'orok-pwa-')),store=new FirestoreProject(new MemoryFirestore());await store.initialize({settings:{},leads:[],units:[],quotes:[],separations:[]});
  const server=createServer({config:{privateDir,testing:true,cookieName:'sid',origin:'http://localhost'},store,cache:{read:()=>store.read()},authCache:{require:async()=>{throw Error('Inicia sesión.')}},auth:{execute:async()=>{throw Error('x')}}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  try{const s=await fetch(base+'/sw.js');assert.equal(s.status,200);assert.equal(s.headers.get('cache-control'),'no-cache');
   const m=await fetch(base+'/manifest.webmanifest');assert.match(m.headers.get('content-type'),/manifest\+json/);
   const h=await (await fetch(base+'/api/health')).json();assert.equal(h.version,require('../package.json').version);}
  finally{server.closeAllConnections();await new Promise(r=>server.close(r));fs.rmSync(privateDir,{recursive:true,force:true});}}
});
test('instalación · el ERP instalado exige un código del servidor una vez por equipo; en la web basta la contraseña',async()=>{
 const {createServer}=require('../server.cjs'),{MemoryFirestore}=require('./memory-firestore.cjs'),{FirestoreProject}=require('../firestore-project.cjs');
 const privateDir=fs.mkdtempSync(path.join(os.tmpdir(),'orok-inst-')),store=new FirestoreProject(new MemoryFirestore());await store.initialize({settings:{},leads:[],units:[],quotes:[],separations:[]});
 const USERS={manager:{id:'u1',name:'Gerencia',role:'Gerente'},seller:{id:'u2',name:'Luis',role:'Vendedor'}};
 const config={privateDir,testing:true,cookieName:'sid',origin:'http://localhost'};
 const server=createServer({config,store,cache:{read:()=>store.read()},authCache:{require:async c=>{if(!USERS[c])throw Error('Inicia sesión.');return USERS[c]}},auth:{execute:async()=>({value:'login-ok'})}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;config.origin=base;
 const req=async(p,data,{cookie='',instalada=false}={})=>{const r=await fetch(base+p,{method:'POST',headers:{'Content-Type':'application/json','X-Orok-Request':'1',Origin:base,Cookie:cookie,...(instalada?{'X-Orok-Instalada':'1'}:{})},body:JSON.stringify(data)});return {status:r.status,data:await r.json(),set:r.headers.get('set-cookie')};};
 try{
  // web: sin instalación, el inicio de sesión funciona como siempre
  assert.equal((await req('/api/rpc/auth.login',{args:[{}]})).status,200);
  // instalada y sin registrar: bloqueada
  const b=await req('/api/rpc/auth.login',{args:[{}]},{instalada:true});assert.equal(b.status,403);assert.equal(b.data.code,'device_not_enrolled');
  assert.equal((await req('/api/instalacion/estado',{})).data.value.registrado,false);
  // solo Gerencia crea códigos
  assert.equal((await req('/api/rpc/db.createInstallCode',{args:[{}]},{cookie:'sid=seller'})).status,400);
  const c=(await req('/api/rpc/db.createInstallCode',{args:[{horas:2,usos:1,etiqueta:'Mac de prueba'}]},{cookie:'sid=manager'})).data.value;assert.match(c.codigo,/^ORK-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.doesNotMatch(fs.readFileSync(path.join(privateDir,'instalacion-equipos.json'),'utf8'),new RegExp(c.codigo.replace(/-/g,'')),'el código en claro no se guarda');
  assert.equal((await req('/api/instalacion/registrar',{codigo:'ORK-AAAA-BBBB-CCCC',equipo:'X'})).status,400);
  const ok=await req('/api/instalacion/registrar',{codigo:c.codigo.toLowerCase(),equipo:'Mac de Martín',plataforma:'macOS'});assert.equal(ok.status,200);
  const dev=ok.set.split(';')[0];assert.match(dev,/^orok_dev_device=/);assert.match(ok.set,/HttpOnly/);
  assert.equal((await req('/api/instalacion/registrar',{codigo:c.codigo,equipo:'Otro'})).status,400,'un solo uso');
  assert.equal((await req('/api/rpc/auth.login',{args:[{}]},{instalada:true,cookie:dev})).status,200);
  assert.equal((await req('/api/instalacion/estado',{},{cookie:dev})).data.value.registrado,true);
  // Gerencia revoca el equipo: deja de funcionar instalado
  const eq=(await req('/api/rpc/db.getInstallDevices',{args:[]},{cookie:'sid=manager'})).data.value.equipos[0];assert.equal(eq.nombre,'Mac de Martín');assert.equal(eq.token,undefined);
  await req('/api/rpc/db.revokeInstallDevice',{args:[eq.id]},{cookie:'sid=manager'});
  assert.equal((await req('/api/rpc/auth.login',{args:[{}]},{instalada:true,cookie:dev})).status,403);
  // límite de intentos
  for(let i=0;i<8;i++)await req('/api/instalacion/registrar',{codigo:'ORK-ZZZZ-ZZZZ-ZZZZ'});
  assert.equal((await req('/api/instalacion/registrar',{codigo:'ORK-ZZZZ-ZZZZ-ZZZZ'})).status,429);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));fs.rmSync(privateDir,{recursive:true,force:true});}
});
test('skills del ERP: cada una tiene encabezado válido y el nombre de su carpeta',()=>{
 const dir=path.join(ROOT,'skills'),names=fs.readdirSync(dir);
 assert.deepEqual(names.sort(),['erp-orok-contabilidad','erp-orok-entrega','erp-orok-instalacion','erp-orok-n8n','erp-orok-produccion','greta-marketing']);
 for(const n of names){const md=fs.readFileSync(path.join(dir,n,'SKILL.md'),'utf8'),fm=/^---\nname: ([a-z0-9-]+)\ndescription: (.+)\n---\n/.exec(md);assert.ok(fm,n);assert.equal(fm[1],n);assert.ok(fm[2].length<1024&&!/[<>]/.test(fm[2]),n);assert.doesNotMatch(md,/sk-ant-[A-Za-z0-9]{10}|AIza[0-9A-Za-z_-]{20}/,n)}
});
