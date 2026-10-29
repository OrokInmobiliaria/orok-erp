'use strict';
// R34 · ERP ÖRÖK · Contabilidad y Finanzas (C.L.A.R.A) dentro del CRM: permisos, datos, Drive vía n8n, bandeja e IA.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{execFileSync}=require('node:child_process');
const {createServer}=require('../server.cjs'),{MemoryFirestore}=require('./memory-firestore.cjs'),{FirestoreProject}=require('../firestore-project.cjs');
const USERS={manager:{id:'u-ger',name:'Gerencia',role:'Gerente'},seller:{id:'u-ven',name:'Luis',role:'Vendedor'},broker:{id:'u-bro',name:'Broker Uno',role:'Broker'}};
const ROOT=path.join(__dirname,'..');
async function setup(){
 const privateDir=fs.mkdtempSync(path.join(os.tmpdir(),'orok-clara-')),store=new FirestoreProject(new MemoryFirestore());
 await store.initialize({settings:{},leads:[],units:[],quotes:[],separations:[]});
 const config={privateDir,testing:true,cookieName:'sid',origin:'http://localhost'};
 const calls=[];const claraFetcher=async(url,opts)=>{calls.push({url,opts,body:JSON.parse(opts.body)});return {ok:true,json:async()=>({ok:true,id:'1FileIdDrive',nombre:JSON.parse(opts.body).nombre,link:'https://drive.google.com/file/d/1FileIdDrive/view'})}};
 const assistantFetcher=async(url,opts)=>{calls.push({url,body:JSON.parse(opts.body)});return {ok:true,json:async()=>({content:[{type:'text',text:'Paga primero la detracción de TUNOPAL.'}]})}};
 const authCache={require:async cookie=>{if(!USERS[cookie])throw Error('Inicia sesión.');return USERS[cookie];}},cache={read:()=>store.read()};
 const server=createServer({config,store,cache,authCache,auth:{execute:async()=>{throw Error('Not used');}},creativeOptions:{claraFetcher,assistantFetcher}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;config.origin=base;
 const call=async(name,args=[],cookie='manager')=>{const r=await fetch(base+'/api/rpc/db.'+name,{method:'POST',headers:{'Content-Type':'application/json','X-Orok-Request':'1',Origin:base,Cookie:'sid='+cookie},body:JSON.stringify({args})});return {status:r.status,data:await r.json()};};
 const secret='clara-worker-secret-'.padEnd(40,'x');fs.writeFileSync(path.join(privateDir,'integracion-ia-webhooks.json'),JSON.stringify({webhookSecret:secret}));
 const n8n=async(action,p={},key=secret)=>{const r=await fetch(base+'/api/integrations/lola',{method:'POST',headers:{'Content-Type':'application/json','X-Orok-Webhook-Secret':key},body:JSON.stringify({action,...p})});return {status:r.status,data:await r.json()};};
 const get=async(p,cookie='manager')=>fetch(base+p,{headers:{Cookie:'sid='+cookie}});
 return {privateDir,store,call,n8n,get,calls,close:async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));fs.rmSync(privateDir,{recursive:true,force:true});}};
}
const ORDEN={id:'BMG-OS-2026-0047',empresa:'BMG',tipo:'OS',n:47,fecha:'2026-10-28',proveedor:'TUNOPAL S.A.',estado:'Borrador',items:[{descripcion:'Redes sociales noviembre',cant:1,pu:4500}],igv:true};

test('Contabilidad y Finanzas: Gerencia ve todo; quien no está habilitado no lee ni escribe (R38: las áreas habilitadas elaboran órdenes)',async()=>{
 const t=await setup();try{
  for(const who of ['seller','broker']){for(const n of ['claraList','claraPut','claraDelete']){const r=await t.call(n,['ordenes',ORDEN],who);assert.equal(r.status,400,n);assert.match(r.data.error,/habilitado/)}
   for(const n of ['claraDriveSave','claraBandeja','claraAsk']){const r=await t.call(n,['ordenes',ORDEN],who);assert.equal(r.status,400,n);assert.match(r.data.error,/Gerencia/)}
   assert.equal((await t.call('claraWhoAmI',[],who)).data.value.habilitado,false)}
  assert.equal((await t.get('/contabilidad/','seller')).status,200);
  assert.equal((await t.call('claraWhoAmI')).data.value.role,'Gerente');
 }finally{await t.close()}
});
test('guarda, lista por cambios y valida empresa, tamaño e identificador',async()=>{
 const t=await setup();try{
  const p=await t.call('claraPut',['ordenes',ORDEN]);assert.equal(p.status,200);
  const l=(await t.call('claraList')).data.value;assert.equal(l.data.ordenes.length,1);assert.equal(l.data.ordenes[0].updated_by,'Gerencia');
  assert.equal((await t.call('claraList',[l.at])).data.value.data.ordenes.length,0);
  assert.match((await t.call('claraPut',['ordenes',{...ORDEN,empresa:'OTRA'}])).data.error,/Empresa no válida/);
  assert.match((await t.call('claraPut',['ordenes',{...ORDEN,id:'../x'}])).data.error,/Identificador/);
  assert.match((await t.call('claraPut',['tablas',ORDEN])).data.error,/Colección/);
  assert.match((await t.call('claraPut',['pagos',{id:'P1',empresa:'BMG',voucher:{data:'x'.repeat(320*1024)}}])).data.error,/demasiado grande/);
  assert.equal((await t.call('claraPut',['empresas',{id:'MAAS',drive_folder:'https://drive.google.com/drive/folders/17Kb4z3EmySjkiBvBpMLkxlFrlFvj4HY6'}])).status,200);
 }finally{await t.close()}
});
test('lo registrado no se borra: se anula; los borradores se retiran con marca y quedan en la base',async()=>{
 const t=await setup();try{
  // R38 · una orden nueva no entra «Aprobada» sin su cadena; las del Excel entran como «Importada».
  assert.match((await t.call('claraPut',['ordenes',{...ORDEN,estado:'Aprobada'}])).data.error,/cadena de aprobación/);
  assert.equal((await t.call('claraPut',['ordenes',{...ORDEN,estado:'Importada',origen:{numero:'OS-047'}}])).status,200);
  assert.match((await t.call('claraDelete',['ordenes',ORDEN.id])).data.error,/anúlalo/);
  const B={...ORDEN,id:'BMG-OS-BORRADOR-1',n:0};
  await t.call('claraPut',['ordenes',B]);assert.equal((await t.call('claraDelete',['ordenes',B.id])).data.value.deleted,true);
  const doc=(await t.store.ref.collection('clara_ordenes').doc(B.id).get()).data();assert.equal(doc.eliminado,true);
 }finally{await t.close()}
});
test('Drive: el servidor entrega el archivo al webhook de n8n con su secreto y devuelve el enlace',async()=>{
 const t=await setup();try{
  const file={empresa:'BMG',nombre:'OS-BMG-2026-0047 TUNOPAL S.A.pdf',mime:'application/pdf',base64:Buffer.from('%PDF-1.4 prueba').toString('base64')};
  assert.match((await t.call('claraDriveSave',[file])).data.error,/Falta configurar/);
  fs.writeFileSync(path.join(t.privateDir,'clara.json'),JSON.stringify({drive_webhook_url:'https://n8n.ejemplo.pe/webhook/clara-drive-guardar',drive_webhook_secret:'s'.repeat(32)}));
  const r=(await t.call('claraDriveSave',[file])).data.value;assert.equal(r.link,'https://drive.google.com/file/d/1FileIdDrive/view');
  const c=t.calls.find(x=>/clara-drive-guardar/.test(x.url));assert.equal(c.opts.headers['X-Clara-Secret'],'s'.repeat(32));assert.equal(c.body.empresa,'BMG');assert.equal(c.body.por,'Gerencia');
  assert.match((await t.call('claraDriveSave',[{...file,mime:'application/x-msdownload'}])).data.error,/no permitido/);
  assert.match((await t.call('claraDriveSave',[{...file,empresa:'XX'}])).data.error,/Empresa/);
 }finally{await t.close()}
});
test('n8n deja las lecturas de 01 Entrada en la bandeja (con secreto) y la pantalla las lee',async()=>{
 const t=await setup();try{
  assert.equal((await t.n8n('clara_bandeja_put',{empresa:'BMG',entradas:[]},'mal')).status,401);
  const e={id:'1DriveFile',tipo:'factura',estado:'por_revisar',leido_en:'2026-10-28T16:00:00Z',archivo:{nombre:'F001-950.pdf'},datos:{serie:'F001-950',total:5310}};
  assert.equal((await t.n8n('clara_bandeja_put',{empresa:'BMG',entradas:[e]})).data.value.total,1);
  await t.n8n('clara_bandeja_put',{empresa:'BMG',entradas:[{...e,datos:{serie:'F001-950',total:5311}}]});
  const b=(await t.call('claraBandeja',['BMG'])).data.value;assert.equal(b.entradas.length,1);assert.equal(b.entradas[0].datos.total,5311);
  assert.equal((await t.call('claraBandeja',['MAAS'])).data.value.entradas.length,0);
 }finally{await t.close()}
});
test('C.L.A.R.A usa el proveedor y la clave del asistente L.O.L.A, con su límite diario',async()=>{
 const t=await setup();try{
  const ask=()=>t.call('claraAsk',[{rules:'Eres C.L.A.R.A',context:'Vencido S/ 696',messages:[{role:'user',text:'¿Qué pago primero?'}]}]);
  assert.match((await ask()).data.error,/apagada/);
  fs.writeFileSync(path.join(t.privateDir,'lola-asistente.json'),JSON.stringify({enabled:true,provider:'claude',apiKey:'sk-ant-prueba-'.padEnd(40,'x'),max_per_day:5}));
  const r=await ask();assert.equal(r.status,200,JSON.stringify(r.data));
  assert.match(r.data.value.reply,/detracción/);const c=t.calls.find(x=>/anthropic/.test(x.url));assert.match(c.body.system,/C\.L\.A\.R\.A/);assert.match(c.body.system,/Vencido S\/ 696/);
 }finally{await t.close()}
});
test('build: /contabilidad sirve la app sin scripts en línea y en modo CRM',async()=>{
 execFileSync(process.execPath,[path.join(ROOT,'deploy/build-contabilidad.cjs'),path.join(ROOT,'contabilidad-src/clara-contabilidad.html'),path.join(ROOT,'evaluador-src/jspdf.umd.min.js'),path.join(ROOT,'evaluador-src/exceljs.min.js')]);
 const t=await setup();try{
  const html=await (await t.get('/contabilidad/')).text();assert.match(html,/<script src="\/contabilidad\/app.js"><\/script>/);assert.doesNotMatch(html,/<script>/);
  const js=await (await t.get('/contabilidad/app.js')).text();assert.match(js,/crmRpc\('claraList'/);assert.match(js,/claraDriveSave/);assert.match(js,/'\/contabilidad\/jspdf.umd.min.js'/);
  assert.equal((await t.get('/contabilidad/otro.js')).status,404);
 }finally{await t.close()}
});
test('menú: Contabilidad y Finanzas es un módulo del ERP solo para Gerencia',async()=>{
 const {modulesFor,moduleOf,navGroups}=await import('../src/navModel.mjs');
 assert.deepEqual(modulesFor('Gerente').map(m=>m.id),['evaluador','marketing','crm','erp']);
 for(const r of ['Vendedor','Broker'])assert.deepEqual(modulesFor(r).map(m=>m.id),['crm']);
 assert.equal(moduleOf('contabilidad'),'erp');assert.equal(navGroups('Gerente','erp')[0].items[0][0],'contabilidad');
 assert.equal(navGroups('Vendedor','erp').some(g=>g.items.some(i=>i[0]==='contabilidad')),false);
});
