'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {createServer}=require('../server.cjs'),{MemoryFirestore}=require('./memory-firestore.cjs'),{FirestoreProject}=require('../firestore-project.cjs');
async function setup(){const privateDir=fs.mkdtempSync(path.join(os.tmpdir(),'orok-creative-http-')),store=new FirestoreProject(new MemoryFirestore());await store.initialize({settings:{},leads:[{id:'one',name:'Prueba',status:'Cita'}],units:[{id:'u1',unit_number:'101',unit_type:'2D',covered_area:60,status:'AVAILABLE',price:300000},{id:'u2',unit_number:'102',unit_type:'2D',covered_area:72,status:'AVAILABLE'},{id:'u3',unit_number:'103',unit_type:'2D',covered_area:65,status:'SOLD'},{id:'u4',unit_number:'201',unit_type:'3D',covered_area:90,status:'AVAILABLE'}],quotes:[],separations:[]});const config={privateDir,testing:true,cookieName:'sid',origin:'http://localhost'},authCache={require:async cookie=>{if(!['manager','seller'].includes(cookie))throw Error('Inicia sesión.');return {name:cookie,role:cookie==='manager'?'Gerente':'Vendedor'};}},cache={read:()=>store.read()},server=createServer({config,store,cache,authCache,auth:{execute:async()=>{throw Error('Not used');}}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;config.origin=base;const call=async(name,args=[],cookie='manager',origin=base)=>{const r=await fetch(base+'/api/rpc/db.'+name,{method:'POST',headers:{'Content-Type':'application/json','X-Orok-Request':'1',Origin:origin,Cookie:'sid='+cookie},body:JSON.stringify({args})});return {status:r.status,data:await r.json()};};return {privateDir,store,base,call,close:async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));fs.rmSync(privateDir,{recursive:true,force:true});}};}
const brief=()=>({request_id:crypto.randomUUID(),title:'Campaña',objective:'Visitas',from:'2026-10-01',to:'2026-10-19',channels:['instagram'],formats:['graphic'],facts:[],business_line:'venta_departamentos'});
test('el prompt por defecto conserva el texto vigente y el de otra marca cambia nombre y proyecto',()=>{
 const m=require('../business/creativeCampaigns.js');
 assert.ok(m.SYSTEM.includes('ÖRÖK para Infinity 224'));
 const other=m.systemPrompt({name:'Otra',project:'Torre Sol',address:'Av. Sol 10',city:'Lima'});
 assert.ok(other.includes('Otra para Torre Sol')&&other.includes('Av. Sol 10')&&!other.includes('Apacheta'));
});
test('Gerencia guarda proyectos y la campaña nueva toma la marca elegida; el vendedor no puede',async()=>{
 const t=await setup();try{
  for(const method of ['getCreativeBrand','saveCreativeBrand','getCreativeFactCandidates'])assert.equal((await t.call(method,[],'seller')).status,400,method);
  assert.equal((await t.call('getCreativeBrand')).data.value.brands[0].id,'infinity224');
  const saved=await t.call('saveCreativeBrand',[{brands:[{name:'ÖRÖK',project:'Infinity 224',address:'Calle La Apacheta 224, San Miguel'},{name:'ÖRÖK',project:'Torre Sol',address:'Av. Sol 10',color:'#112233'}]}]);
  assert.equal(saved.status,200);
  assert.deepEqual(saved.data.value.brands.map(b=>b.id),['infinity-224','torre-sol']);
  const b=brief(),c=await t.call('createCreativeCampaign',[{...b,project_id:'torre-sol'}]);
  assert.equal(c.status,200);
  const got=await t.call('getCreativeCampaign',[b.request_id]);
  assert.equal(got.data.value.brand.project,'Torre Sol');assert.equal(got.data.value.brief.business_line,'venta_departamentos');
  assert.equal((await t.call('createCreativeCampaign',[{...brief(),project_id:'no-existe'}])).status,400);
  assert.equal((await t.call('saveCreativeBrand',[{brands:[]}])).status,400);
  assert.equal((await t.call('saveCreativeBrand',[{brands:[{name:'A',project:'X',address:'d'},{name:'A',project:'X',address:'d'}]}])).status,400);
 }finally{await t.close();}
});
test('los hechos sugeridos salen solo de unidades disponibles y no inventan precios',async()=>{
 const t=await setup();try{
  const r=await t.call('getCreativeFactCandidates');const facts=r.data.value;
  assert.equal(facts.length,2);
  assert.ok(facts[0].text.includes('2 departamento(s)')&&facts[0].text.includes('2D'));
  assert.ok(facts.every(f=>f.source&&!/S\/|\$|precio/i.test(f.text)));
 }finally{await t.close();}
});
