'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {createServer}=require('../server.cjs'),{MemoryFirestore}=require('./memory-firestore.cjs'),{FirestoreProject}=require('../firestore-project.cjs');
async function setup(){const privateDir=fs.mkdtempSync(path.join(os.tmpdir(),'orok-creative-http-')),store=new FirestoreProject(new MemoryFirestore());await store.initialize({settings:{},leads:[{id:'one',name:'Prueba',status:'Cita'}],units:[],quotes:[],separations:[]});const config={privateDir,testing:true,cookieName:'sid',origin:'http://localhost'},authCache={require:async cookie=>{if(!['manager','seller'].includes(cookie))throw Error('Inicia sesión.');return {name:cookie,role:cookie==='manager'?'Gerente':'Vendedor'};}},cache={read:()=>store.read()},server=createServer({config,store,cache,authCache,auth:{execute:async()=>{throw Error('Not used');}}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;config.origin=base;const call=async(name,args=[],cookie='manager',origin=base)=>{const r=await fetch(base+'/api/rpc/db.'+name,{method:'POST',headers:{'Content-Type':'application/json','X-Orok-Request':'1',Origin:origin,Cookie:'sid='+cookie},body:JSON.stringify({args})});return {status:r.status,data:await r.json()};};return {privateDir,store,base,call,close:async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));fs.rmSync(privateDir,{recursive:true,force:true});}};}
const {createQueries}=require('../business/queries');
test('abrir un chat deja evento y comentario visible, sin repetir el comentario en 30 minutos',()=>{
 let data={settings:{},leads:[{id:'one',status:'Contactado',phone:'51911111111'}],units:[]};const q=createQueries(()=>structuredClone(data),d=>{data=d;});
 const r1=q.logChatAccess('one',{channel:'instagram',origin:'kanban',action:'open',thread_id:'th1'},'seller');assert.equal(r1.commented,true);
 const r2=q.logChatAccess('one',{channel:'instagram',origin:'kanban',action:'open'},'seller');assert.deepEqual([r2.commented,r2.throttled],[false,true]);
 assert.equal(q.logChatAccess('one',{channel:'instagram',origin:'kanban'},'otra persona').commented,true);
 q.logChatAccess('one',{channel:'whatsapp',origin:'bandeja',action:'open'},'seller');
 assert.equal(q.logChatAccess('one',{channel:'whatsapp',origin:'bandeja',action:'reply'},'seller').commented,false);
 assert.throws(()=>q.logChatAccess('one',{channel:'telegram',origin:'kanban'},'s'),/no válido/);
 assert.throws(()=>q.logChatAccess('one',{channel:'whatsapp',origin:'otro'},'s'),/no válido/);
 assert.throws(()=>q.logChatAccess('one',{channel:'whatsapp',origin:'kanban',action:'borrar'},'s'),/no válido/);
 assert.throws(()=>q.logChatAccess('nadie',{channel:'whatsapp',origin:'kanban'},'s'),/no encontrado/);
 const lead=data.leads[0],ev=lead.events.filter(e=>e.type.startsWith('chat_'));
 assert.deepEqual(ev.map(e=>e.type),['chat_open','chat_open','chat_open','chat_open','chat_reply']);
 assert.equal(ev[0].result,'Instagram · desde el Kanban');assert.equal(ev[0].actor,'seller');assert.equal(ev[0].thread_id,'th1');
 const comments=(lead.comment_history||[]).filter(c=>/Abrió el chat/.test(c.text));assert.equal(comments.length,3);
 assert.ok(comments.some(c=>c.text.includes('WhatsApp desde la Bandeja social')));
 assert.equal(lead.status,'Contactado','no cambia la etapa');
 assert.ok(q.logChatAccess('one',{channel:'messenger',origin:'busqueda'},'seller').commented);assert.ok(data.leads[0].comment_history.some(c=>c.text.includes('Messenger desde el buscador')));
});
test('el botón Llamar deja evento y comentario en cada intento, sin duplicar por doble clic',()=>{
 let data={settings:{},leads:[{id:'one',status:'Contactado',phone:'51911111111'}],units:[]};const q=createQueries(()=>structuredClone(data),d=>{data=d;});
 assert.equal(q.logChatAccess('one',{channel:'phone',origin:'kanban',action:'call'},'Ana').commented,true);
 assert.equal(q.logChatAccess('one',{channel:'phone',origin:'kanban',action:'call'},'Ana').throttled,true);
 assert.equal(q.logChatAccess('one',{channel:'phone',origin:'kanban',action:'call'},'Luis').commented,true);
 assert.throws(()=>q.logChatAccess('one',{channel:'phone',origin:'kanban',action:'open'},'Ana'),/no válido/);
 assert.throws(()=>q.logChatAccess('one',{channel:'whatsapp',origin:'kanban',action:'call'},'Ana'),/no válido/);
 const lead=data.leads[0];assert.equal(lead.events.filter(e=>e.type==='phone_call').length,2);
 assert.equal(lead.events[0].result,'Teléfono · desde el Kanban');
 assert.ok(lead.comment_history.some(c=>c.text==='📞 Llamó por teléfono al 51911111111 desde el Kanban.'));
 assert.equal(lead.status,'Contactado');assert.equal(lead.milestones?.contacted,undefined,'una llamada iniciada no marca contacto efectivo');
});
test('la llamada de trazabilidad exige sesión',async()=>{const t=await setup();try{assert.equal((await t.call('logChatAccess',['one',{channel:'instagram',origin:'kanban'}],'')).status,401);}finally{await t.close();}});
test('el índice de chats requiere sesión y devuelve WhatsApp y redes sociales',async()=>{const t=await setup();try{
 assert.equal((await t.call('getChatIndex',[],'')).status,401);
 const r=await t.call('getChatIndex',[],'seller');assert.equal(r.status,200);assert.ok(Array.isArray(r.data.value.threads));
}finally{await t.close();}});
