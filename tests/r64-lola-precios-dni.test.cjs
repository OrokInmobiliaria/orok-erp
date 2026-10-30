'use strict';
// R64 · L.O.L.A: rango de precios y promociones aprobados por Gerencia; DNI antes del asesor si insiste con el precio
// o si un lead de formulario pide asesor. Nunca pide DNI al iniciar la conversación.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {MemoryFirestore}=require('./memory-firestore.cjs'),{FirestoreProject}=require('../firestore-project.cjs'),{WhatsAppService}=require('../business/whatsappService');
const P=require('../business/lolaPrecios');
const PRECIOS=P.limpiar({enabled:true,etapa:'preventa',desde:316000,hasta:620000,promociones:[{texto:'descuentos por feria',monto_max:20000,hasta_agotar_stock:true}]},'Martín');
async function setup(extra={},precios=PRECIOS){const db=new MemoryFirestore(),store=new FirestoreProject(db);
 await store.initialize({settings:{projectName:'Infinity 224',lolaPrecios:precios},leads:[{id:'a',phone:'51955318057',name:'Ensayo',status:'Seguimiento',email:'ventas@example.test',...extra}],units:[]});
 const gateway={setup:()=>({enabled:true,sendingEnabled:true,automaticEnabled:true,agendaEnabled:true,calendarId:'ensayo@group.calendar.google.com',phoneNumberIds:['12345']}),assertRecipient(){},send:async()=> 'wamid.reply'};
 const wa=new WhatsAppService(store,{}, {gateway});wa.alerts.send=async()=>({outcomes:[]});
 const incoming=(id,text)=>({business_phone_id:'12345',phone:'51955318057',message:{id,text,type:'text',direction:'inbound',at:new Date().toISOString()}});
 await wa.ingest(incoming('hello','Hola'));await wa.mode('a',{mode:'auto',version:0},'Ventas');
 const last=async()=>{const j=(await wa.claim()).job;if(j)await db.runTransaction(async tx=>tx.set(wa.jobs.doc(j.id),{...j,state:'complete'}));return j;};
 const lead=async()=>(await store.read()).leads[0],thread=async()=>(await wa.thread('a').get()).data();
 await last();return {wa,store,incoming,last,lead,thread};}
test('respuesta de precios: solo el rango y la feria aprobados, con montos en soles',()=>{
 const r=P.respuesta(PRECIOS,'Infinity 224');assert.match(r,/En preventa, los departamentos de Infinity 224 van desde S\/ 316,000 hasta S\/ 620,000\./);assert.match(r,/descuentos por feria de hasta S\/ 20,000, hasta agotar stock/);assert.ok(r.length<=450);
 assert.throws(()=>P.limpiar({enabled:true,desde:700000,hasta:600000}),/no puede ser mayor/);assert.throws(()=>P.limpiar({enabled:true,desde:1,hasta:2,promociones:[{texto:'10% de descuento'}]}),/monto en su casilla/);
 assert.equal(P.respuesta({...PRECIOS,promociones:[{texto:'descuentos por feria',monto_max:20000,vigente_hasta:'2020-01-01'}]},'X').includes('feria'),false,'promoción vencida no se menciona');
 assert.deepEqual(P.documento('mi dni es 45678912'),{tipo:'DNI',numero:'45678912'});assert.equal(P.documento('mi cel 987654321'),null);assert.deepEqual(P.documento('carné de extranjería 001234567'),{tipo:'CE',numero:'001234567'});
});
test('1ª pregunta de precio → rango aprobado; insiste → pide DNI; con el DNI → asesor',async()=>{
 const t=await setup();
 await t.wa.ingest(t.incoming('p1','¿Cuánto cuesta un departamento?'));let j=await t.last();
 assert.ok(j,'hay respuesta');assert.match(JSON.stringify(j),/desde S\/ 316,000 hasta S\/ 620,000/);assert.equal((await t.lead()).dni,undefined);assert.ok(!/DNI/.test(JSON.stringify(j)),'no pide DNI al inicio');
 await t.wa.ingest(t.incoming('p2','Pero dime el precio exacto del 302, ¿hay descuento?'));j=await t.last();
 assert.match(JSON.stringify(j),/me compartes tu número de DNI/);assert.ok((await t.thread()).dni_request);
 await t.wa.ingest(t.incoming('p3','Claro, es 45678912'));j=await t.last();
 const l=await t.lead();assert.equal(l.dni,'45678912');assert.equal(l.dni_tipo,'DNI');assert.equal(l.handoff_status,'requested');assert.equal(l.advisor_alert.reason,'Consulta de precios o condiciones comerciales');
 assert.equal(j.kind,'mail');assert.ok(!JSON.stringify(j).includes('45678912')||j.kind==='mail','el DNI no se repite al cliente');
});
test('si prefiere no dar el DNI igual pasa al asesor; si habla de otra cosa, L.O.L.A sigue',async()=>{
 const t=await setup();await t.wa.ingest(t.incoming('p1','precio?'));await t.last();await t.wa.ingest(t.incoming('p2','¿y el precio con descuento?'));await t.last();
 await t.wa.ingest(t.incoming('x','¿Tiene ascensor el edificio?'));assert.ok((await t.thread()).dni_request,'sigue pendiente mientras conversa de otra cosa');
 await t.wa.ingest(t.incoming('n','Prefiero no darlo'));const l=await t.lead();assert.equal(l.dni_status,'no_brindado');assert.equal(l.handoff_status,'requested');
});
test('lead de formulario que pide asesor: DNI antes; sin rango aprobado, el precio va directo al asesor como antes',async()=>{
 const t=await setup({source:'Meta · formulario',form_meta:{form_id:'123'}});
 await t.wa.ingest(t.incoming('f1','Quiero hablar con un asesor'));const j=await t.last();assert.match(JSON.stringify(j),/DNI/);assert.equal((await t.thread()).dni_request.reason,'Solicitud de asesor (lead de formulario)');
 const u=await setup({},null);await u.wa.ingest(u.incoming('p1','¿Cuánto cuesta?'));assert.equal((await u.lead()).handoff_status,'requested');assert.equal((await u.lead()).dni,undefined);
 const v=await setup({dni:'11112222'});await v.wa.ingest(v.incoming('p1','precio?'));await v.last();await v.wa.ingest(v.incoming('p2','dame el precio exacto'));assert.equal((await v.lead()).handoff_status,'requested','con DNI ya registrado no lo vuelve a pedir');
});
test('trabajador de producción de L.O.L.A: sin PostgreSQL, todo a erp.orok.com.pe, reglas de DNI y precios en el prompt, inactivo',()=>{
 const w=JSON.parse(require('node:fs').readFileSync(require('node:path').join(__dirname,'..','n8n','LOLA-R64-PRODUCCION.json'),'utf8'));
 assert.equal(w.active,false);assert.ok(!w.nodes.some(n=>/postgres/i.test(n.type)));assert.ok(!JSON.stringify(w.nodes.map(n=>n.parameters.url||'')).includes('lola-pruebas'));
 const sm=w.nodes.find(n=>n.parameters?.options?.systemMessage?.includes('Eres Lola')).parameters.options.systemMessage;assert.match(sm,/el servidor lo solicita solo cuando el cliente insiste/);assert.match(sm,/rango y las promociones que autorizó Gerencia/);
 assert.ok(w.nodes.find(n=>n.name==='Memoria entregada por el ERP'));assert.ok(!w.nodes.find(n=>n.name==='Aplicar memoria a la conversación').parameters.jsCode.includes("'postgresql'"));
});
test('R66 · el número de Gerencia no aparece en el código ni en el trabajador de producción; avisos a asesores registrados',()=>{
 const fs=require('node:fs'),path=require('node:path'),R=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
 for(const f of ['business/advisorRouting.js','business/whatsappService.js','n8n/LOLA-R64-PRODUCCION.json'])assert.ok(!R(f).includes('987208622'),f);
 const {alertPhones,advisorPhones}=require('../business/advisorRouting');assert.deepEqual(alertPhones({environment:'production'}),[]);assert.deepEqual(advisorPhones({advisorPhones:['51 911 111 111','51912971742']}),['51911111111']);
});
