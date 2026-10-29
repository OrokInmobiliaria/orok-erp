'use strict';
// R37 · Control de obra, Honorarios y cobranzas y pantalla de Equipos instalados.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {createServer}=require('../server.cjs'),{MemoryFirestore}=require('./memory-firestore.cjs'),{FirestoreProject}=require('../firestore-project.cjs');
const {parseSkill}=require('../business/claraRules');
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

const VAL={id:'BMG-VAL-1',clase:'valorizacion',empresa:'BMG',proyecto:'INFINITY 224',proyecto_id:'BMG-INFINITY-224',n:1,periodo:'2026-10',estado:'Borrador',avance:{'Estructuras':10}};
const HITO={id:'MAAS-CB-1',empresa:'MAAS',proyecto:'Obra Surco',concepto:'Adelanto de obra',monto:50000,comprobante:'Factura electrónica',igv:true,detraccion_pct:4,estado:'Programado',cobros:[]};

test('obra y cobranzas son colecciones del ERP, solo de Gerencia',async()=>{
 const t=await setup();try{
  assert.equal((await t.call('claraPut',['obra',VAL])).status,200);
  assert.equal((await t.call('claraPut',['cobranzas',HITO])).status,200);
  const l=(await t.call('claraList')).data.value.data;assert.equal(l.obra.length,1);assert.equal(l.cobranzas.length,1);
  assert.equal((await t.call('claraPut',['obra',VAL],'seller')).status,400);
 }finally{await t.close()}
});
test('valorización: el borrador se edita y se descarta; aprobada no se reescribe, solo se anula',async()=>{
 const t=await setup();try{
  await t.call('claraPut',['obra',VAL]);
  assert.equal((await t.call('claraPut',['obra',{...VAL,avance:{'Estructuras':25}}])).status,200);
  assert.equal((await t.call('claraPut',['obra',{...VAL,avance:{'Estructuras':25},estado:'Aprobada'}])).status,200);
  assert.match((await t.call('claraPut',['obra',{...VAL,avance:{'Estructuras':40},estado:'Aprobada'}])).data.error,/no se modifica/);
  assert.match((await t.call('claraPut',['obra',{...VAL,avance:{'Estructuras':25},estado:'Borrador'}])).data.error,/no se modifica/);
  assert.equal((await t.call('claraPut',['obra',{...VAL,avance:{'Estructuras':25},estado:'Aprobada',cobro:'MAAS-CB-1'}])).status,200);
  assert.match((await t.call('claraDelete',['obra',VAL.id])).data.error,/anúlalo/);
  assert.equal((await t.call('claraPut',['obra',{...VAL,avance:{'Estructuras':25},estado:'Anulada'}])).status,200);
  const B={...VAL,id:'BMG-VAL-2',n:2};await t.call('claraPut',['obra',B]);assert.equal((await t.call('claraDelete',['obra',B.id])).data.value.deleted,true);
 }finally{await t.close()}
});
test('cuaderno de obra no se edita; cobros registrados no se quitan; hito facturado no cambia de monto',async()=>{
 const t=await setup();try{
  const C={id:'BMG-CU-1',clase:'cuaderno',empresa:'BMG',proyecto:'INFINITY 224',n:1,fecha:'2026-10-28',tipo:'Ocurrencia',texto:'Vaciado de losa'};
  await t.call('claraPut',['obra',C]);assert.match((await t.call('claraPut',['obra',{...C,texto:'Otro texto'}])).data.error,/cuaderno/);
  assert.match((await t.call('claraDelete',['obra',C.id])).data.error,/anúlalo/);
  const F={...HITO,estado:'Facturado',serie:'E001-125',emision:'2026-10-28',plazo_dias:15};
  await t.call('claraPut',['cobranzas',F]);
  const c1={fecha:'2026-10-29',monto:30000,medio:'Transferencia',operacion:'123'};
  assert.equal((await t.call('claraPut',['cobranzas',{...F,cobros:[c1]}])).status,200);
  assert.match((await t.call('claraPut',['cobranzas',{...F,cobros:[]}])).data.error,/cobros registrados/);
  assert.match((await t.call('claraPut',['cobranzas',{...F,cobros:[{...c1,monto:1}]}])).data.error,/cobros registrados/);
  assert.match((await t.call('claraPut',['cobranzas',{...F,cobros:[c1],monto:10}])).data.error,/facturado/);
  assert.equal((await t.call('claraPut',['cobranzas',{...F,cobros:[c1,{...c1,monto:26640}],notas:'ok'}])).status,200);
  assert.equal((await t.call('claraPut',['cobranzas',{...F,cobros:[c1,{...c1,monto:26640}],estado:'Anulado'}])).status,200);
  assert.match((await t.call('claraDelete',['cobranzas',HITO.id])).data.error,/anúlalo/);
 }finally{await t.close()}
});
test('la skill trae los parámetros de obra y cobranzas, y Construcción activa honorarios',()=>{
 const R=parseSkill(fs.readFileSync(path.join(ROOT,'skills/erp-orok-contabilidad/SKILL.md'),'utf8')),p=R.params||R;
 assert.ok(p.tipos_proyecto['Construcción'].includes('honorarios'));
 assert.equal(p.cobranzas.detraccion_pct_por_tipo['Construcción'],4);
 for(const [k,l] of Object.entries(p.cobranzas.plantillas))assert.ok(l.reduce((a,h)=>a+h.pct,0)<=100,k);
 assert.equal(p.cobranzas.plantillas['Diseño de planos'].reduce((a,h)=>a+h.pct,0),100);
 assert.throws(()=>parseSkill(fs.readFileSync(path.join(ROOT,'skills/erp-orok-contabilidad/SKILL.md'),'utf8').replace('"Construcción": 4','"Construcción": 40')),/detraccion_pct_por_tipo/);
});
test('la app del ERP trae Control de obra, Honorarios y cobranzas y Equipos instalados',()=>{
 const js=fs.readFileSync(path.join(ROOT,'contabilidad/app.js'),'utf8');
 for(const s of ["['obra','Control de obra'","['cobranzas','Honorarios y cobranzas'","['equipos','Equipos instalados'","crmRpc('createInstallCode'","crmRpc('revokeInstallDevice'","crmRpc('cancelInstallCode'","crmRpc('getInstallDevices')","'X-Orok-Instalada'"])assert.ok(js.includes(s),s);
 assert.doesNotThrow(()=>new Function(js));
});
test('Gerencia genera, lista, anula y revoca desde el ERP; el código se muestra una vez',async()=>{
 const t=await setup();try{
  const c=(await t.call('createInstallCode',[{horas:2,usos:1,etiqueta:'Laptop prueba'}])).data.value;assert.match(c.codigo,/^ORK-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  const l=(await t.call('getInstallDevices')).data.value;assert.equal(l.codigos.length,1);assert.ok(!JSON.stringify(l).includes(c.codigo));assert.ok(!('hash' in l.codigos[0]));
  assert.equal((await t.call('createInstallCode',[{}],'seller')).status,400);
  assert.equal((await t.call('cancelInstallCode',[c.id])).data.value.ok,true);
  assert.equal((await t.call('getInstallDevices')).data.value.codigos[0].vigente,false);
 }finally{await t.close()}
});
