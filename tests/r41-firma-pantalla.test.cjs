'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const APROB=require('../business/claraAprobaciones');
const html=fs.readFileSync(require('node:path').join(__dirname,'../contabilidad-src/clara-contabilidad.html'),'utf8');
function setup(sha=async s=>crypto.createHash('sha256').update(s).digest('hex').toUpperCase()){
 const context=vm.createContext({canonical:o=>APROB.canonical(o,.18),sha,D:{ordenes:{}},mode:'crm',schedule(){}});
 vm.runInContext(['let HASHES={},HASH_INPUTS={};',html.split('\n').find(x=>x.startsWith('async function refreshHash(')),html.split('\n').find(x=>x.startsWith('function aplicarOrden('))].join('\n'),context);
 return {context,run:s=>vm.runInContext(s,context)};
}
const order=()=>({id:'BMG-ENSAYO',empresa:'BMG',tipo:'OC',n:0,fecha:'2026-10-28',proveedor:'FICTICIO',moneda:'PEN',igv:true,items:[{descripcion:'PRUEBA',unidad:'und',cant:1,pu:1}]});
test('la respuesta del servidor renueva la huella del borrador al asignar el correlativo',async()=>{
 const {context:c,run}=setup();c.o=order();c.D.ordenes[c.o.id]=c.o;
 const draft=await run('refreshHash(o)');c.signed={...c.o,n:1};
 c.signed.firmas=[{hash:crypto.createHash('sha256').update(APROB.canonical(c.signed,.18)).digest('hex').toUpperCase()}];
 run('aplicarOrden(signed)');await new Promise(setImmediate);
 assert.notEqual(run('HASHES[o.id]'),draft);assert.equal(run('HASHES[o.id]'),c.signed.firmas[0].hash);
 c.D.ordenes[c.o.id].items[0].pu=2;
 assert.notEqual(await run('refreshHash(D.ordenes[o.id])'),c.signed.firmas[0].hash,'una modificación real sigue invalidando la firma');
});
test('un cálculo atrasado no sustituye la huella de una versión más reciente',async()=>{
 const pending=[];const {context:c,run}=setup(s=>new Promise(resolve=>pending.push({s,resolve})));
 c.o=order();c.D.ordenes[c.o.id]=c.o;const old=run('refreshHash(o)');
 c.newOrder={...c.o,n:1};c.D.ordenes[c.o.id]=c.newOrder;const recent=run('refreshHash(newOrder)');
 pending[1].resolve('NUEVA');await recent;pending[0].resolve('ANTIGUA');await old;
 assert.equal(run('HASHES[o.id]'),'NUEVA');
});
