'use strict';
// R33c · Asistente L.O.L.A del equipo: configuración solo de Gerencia, claves privadas, contexto por rol,
// tres proveedores (Claude, ChatGPT, Gemini), límite diario y dictado de respaldo.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {createServer}=require('../server.cjs'),{MemoryFirestore}=require('./memory-firestore.cjs'),{FirestoreProject}=require('../firestore-project.cjs');
const USERS={manager:{id:'u-ger',name:'Gerencia',role:'Gerente'},seller:{id:'u-ven',name:'Luis',role:'Vendedor'},broker:{id:'u-bro',name:'Broker Uno',role:'Broker',brokerName:'Broker Uno'}};
async function setup(){
 const privateDir=fs.mkdtempSync(path.join(os.tmpdir(),'orok-lola-')),store=new FirestoreProject(new MemoryFirestore());
 await store.initialize({settings:{projectName:'Infinity 224',separationPct:5,globalCommissionPct:3,sellerCommissionPct:1,geminiApiKey:'AIzaFAKEgeminiKEY0123456789abcdef'},
  leads:[{id:'l1',name:'Ana Pérez',phone:'999111222',status:'Cita',sales_owner:'Luis',next_action_at:'2020-01-01T10:00:00Z'},{id:'l2',name:'Beto Ríos',phone:'988777666',status:'Contactado',sales_owner:'Carla'},{id:'l3',name:'Cira',status:'Calificado',sales_owner:'Broker Uno'}],
  units:[{id:'u1',unit_number:'101',unit_type:'Loft Garden',floor:1,covered_area:40.29,price:250000,status:'Disponible'},{id:'u2',unit_number:'201',unit_type:'Flat 3D',floor:2,covered_area:80.37,price:520000,status:'SOLD',sold_lead_id:'l9'}],quotes:[],separations:[]});
 const calls=[];let reply='Respuesta de prueba';
 const fetcher=async(url,opt)=>{calls.push({url:String(url),opt});const u=String(url);
  const body=u.includes('anthropic')?{content:[{type:'text',text:reply}]}:u.includes('openai.com/v1/audio')?{text:'¿qué unidades hay?'}:u.includes('openai')?{choices:[{message:{content:reply}}]}:{candidates:[{content:{parts:[{text:reply}]}}]};
  return {ok:true,status:200,json:async()=>body};};
 const config={privateDir,testing:true,cookieName:'sid',origin:'http://localhost'};
 const server=createServer({config,store,cache:{read:()=>store.read()},authCache:{require:async c=>{if(!USERS[c])throw Error('Inicia sesión.');return USERS[c];}},auth:{execute:async()=>{throw Error('x');}},creativeOptions:{assistantFetcher:fetcher}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;config.origin=base;
 const call=async(name,args=[],cookie='manager')=>{const r=await fetch(base+'/api/rpc/db.'+name,{method:'POST',headers:{'Content-Type':'application/json','X-Orok-Request':'1',Origin:base,Cookie:'sid='+cookie},body:JSON.stringify({args})});return {status:r.status,data:await r.json()};};
 return {privateDir,calls,call,setReply:t=>{reply=t},close:async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));fs.rmSync(privateDir,{recursive:true,force:true});}};
}
const ask=(t,cookie,text,extra={})=>t.call('askLolaAssistant',[{messages:[{role:'user',text}],...extra}],cookie);

test('L.O.L.A asistente: nace apagada, solo Gerencia la configura y la clave nunca vuelve al navegador',async()=>{
 const t=await setup();try{
  assert.match((await ask(t,'seller','hola')).data.error,/Pídeselo a Gerencia/);
  const st=(await t.call('getLolaAssistant',[],'seller')).data.value;assert.deepEqual(Object.keys(st).sort(),['enabled','provider_label','voice_server']);assert.equal(st.enabled,false);
  assert.equal((await t.call('saveLolaAssistant',[{enabled:true,provider:'claude',apiKey:'sk-ant-'.padEnd(40,'x')}],'seller')).status,400);
  assert.match((await t.call('saveLolaAssistant',[{enabled:true,provider:'claude'}])).data.error,/registra una clave/);
  const key='sk-ant-api03-'.padEnd(60,'k');
  const saved=await t.call('saveLolaAssistant',[{enabled:true,provider:'claude',apiKey:key,max_per_day:5}]);assert.equal(saved.status,200);
  assert.equal(saved.data.value.own_key,true);assert.doesNotMatch(JSON.stringify(saved.data),/sk-ant-api03/);
  assert.doesNotMatch(JSON.stringify((await t.call('getLolaAssistant')).data),/sk-ant-api03/);
  const file=path.join(t.privateDir,'lola-asistente.json');assert.equal(fs.statSync(file).mode&0o777,0o600);assert.equal(JSON.parse(fs.readFileSync(file,'utf8')).apiKey,key);
  // Gemini sin clave propia reutiliza la de Ajustes.
  const g=(await t.call('saveLolaAssistant',[{enabled:true,provider:'gemini'}])).data.value;assert.equal(g.key_source,'Ajustes (Gemini)');assert.equal(g.own_key,false);
  assert.equal((await t.call('getLolaAssistant',[],'seller')).data.value.enabled,true);
 }finally{await t.close();}
});

test('L.O.L.A asistente: contexto por rol sin datos personales ni comisiones para ventas; tres proveedores',async()=>{
 const t=await setup();try{
  await t.call('saveLolaAssistant',[{enabled:true,provider:'claude',apiKey:'sk-ant-api03-'.padEnd(60,'k')}]);
  const r=await ask(t,'seller','¿Qué unidades hay disponibles?',{voice:true});assert.equal(r.status,200);assert.equal(r.data.value.reply,'Respuesta de prueba');
  const c=t.calls.at(-1);assert.equal(c.url,'https://api.anthropic.com/v1/messages');assert.equal(c.opt.headers['x-api-key'].slice(0,13),'sk-ant-api03-');
  const body=JSON.parse(c.opt.body),sys=body.system;
  assert.match(sys,/Luis \(Vendedor\)/);assert.match(sys,/máximo 70 palabras/);assert.match(sys,/"unidad":"101"/);assert.doesNotMatch(sys,/"unidad":"201"/);
  assert.doesNotMatch(sys,/Ana Pérez|999111222|Beto|comision_|AIza/);assert.match(sys,/"total":1/);assert.match(sys,/"acciones_vencidas":1/);
  assert.doesNotMatch(sys,/Marketing|Evaluador Inmobiliario","opciones/);assert.match(sys,/Kanban de leads/);
  const ctxB=JSON.parse(JSON.parse((await ask(t,'broker','hola'),t.calls.at(-1).opt.body)).system.split('CONTEXTO (JSON):\n')[1]);assert.equal(ctxB.mis_leads.total,1);
  await ask(t,'manager','hola');const m=JSON.parse(JSON.parse(t.calls.at(-1).opt.body).system.split('CONTEXTO (JSON):\n')[1]);assert.equal(m.mis_leads.total,3);assert.equal(m.proyecto.comision_global_pct,3);
  await t.call('saveLolaAssistant',[{enabled:true,provider:'openai',apiKey:'sk-proj-'.padEnd(50,'o'),model:'gpt-5-mini'}]);
  await ask(t,'seller','hola');let o=t.calls.at(-1);assert.equal(o.url,'https://api.openai.com/v1/chat/completions');assert.match(o.opt.headers.Authorization,/^Bearer sk-proj-/);assert.equal(JSON.parse(o.opt.body).messages[0].role,'system');
  await t.call('saveLolaAssistant',[{enabled:true,provider:'gemini',clearKey:true}]);
  await ask(t,'seller','hola');o=t.calls.at(-1);assert.match(o.url,/generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-3\.8-flash:generateContent/);assert.ok(JSON.parse(o.opt.body).systemInstruction);
  assert.equal((await t.call('testLolaAssistant',[],'seller')).status,400);assert.equal((await t.call('testLolaAssistant')).data.value.ok,true);
 }finally{await t.close();}
});

test('L.O.L.A asistente: límite diario por persona y dictado de respaldo según proveedor',async()=>{
 const t=await setup();try{
  await t.call('saveLolaAssistant',[{enabled:true,provider:'claude',apiKey:'sk-ant-api03-'.padEnd(60,'k'),max_per_day:5}]);
  for(let i=0;i<5;i++)assert.equal((await ask(t,'seller','pregunta '+i)).status,200);
  assert.match((await ask(t,'seller','otra')).data.error,/límite diario/);assert.equal((await ask(t,'broker','otra')).status,200);
  const audio=Buffer.alloc(2000,1).toString('base64');
  assert.match((await t.call('transcribeLolaAssistant',[{audio,mime:'audio/webm'}],'broker')).data.error,/no está disponible/);
  await t.call('saveLolaAssistant',[{enabled:true,provider:'openai',apiKey:'sk-proj-'.padEnd(50,'o')}]);
  const tr=await t.call('transcribeLolaAssistant',[{audio,mime:'audio/webm;codecs=opus'}],'broker');assert.equal(tr.data.value.text,'¿qué unidades hay?');assert.match(t.calls.at(-1).url,/audio\/transcriptions/);
  assert.equal((await t.call('transcribeLolaAssistant',[{audio,mime:'video/mp4'}],'broker')).status,400);
  assert.equal((await t.call('askLolaAssistant',[{messages:[{role:'assistant',text:'hola'}]}],'broker')).status,400);
 }finally{await t.close();}
});
