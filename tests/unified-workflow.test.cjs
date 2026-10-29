'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const f=JSON.parse(fs.readFileSync(path.join(__dirname,'../n8n/00-Lola-ENSAYO-67.6.10-CONFIGURAR-INACTIVO.json'),'utf8'));
test('text and transcribed audio recover real PostgreSQL context before the single agent',()=>{const name='Recuperar memoria e historial · PostgreSQL',node=f.nodes.find(n=>n.name===name);assert.equal(node.type,'n8n-nodes-base.postgres');assert.equal(node.disabled,undefined);assert.match(node.parameters.query,/^SELECT lola_unified.context_for_job/);assert.match(node.parameters.options.queryReplacement,/lease_token/);assert.equal(f.connections['Es comando de audio'].main[1][0].node,name);assert.equal(f.connections['Restaurar contexto tras clasificar audio'].main[0][0].node,name);assert.equal(f.connections['Aplicar memoria a la conversación'].main[0][0].node,'Evaluar apoyo condicional de Claude');assert.equal(f.settings.saveDataSuccessExecution,'none');assert.equal(f.settings.timezone,'America/Lima');});
function run(name,input,others={}){const n=f.nodes.find(n=>n.name===name);return new vm.Script('(function(){'+n.parameters.jsCode+'})()').runInNewContext({$input:{first:()=>({json:input})},$:name=>({first:()=>({json:others[name]||{}})})},{timeout:1000});}
test('final workflow has one shared agent, verified tools, authenticated ingress and no installer SQL',()=>{
 assert.equal(f.active,false);assert.deepEqual(f.pinData,{});assert.equal(f.nodes.filter(n=>n.type.endsWith('.agent')).length,1);assert.equal(f.nodes.some(n=>n.type.includes('telegram')),false);for(const n of f.nodes.filter(n=>n.type.endsWith('.postgres')&&n.name.includes('origen'))){assert.equal(n.disabled,true);assert.match(n.parameters.query,/^SELECT /);assert.doesNotMatch(n.parameters.query,/CREATE|UPDATE|DELETE|INSERT/i);}
 const names=f.nodes.map(n=>n.name);assert.equal(new Set(names).size,names.length);assert.equal(new Set(f.nodes.map(n=>n.id)).size,f.nodes.length);for(const [a,ports] of Object.entries(f.connections)){assert.ok(names.includes(a));for(const lists of Object.values(ports))for(const list of lists)for(const b of list)assert.ok(names.includes(b.node));}
 for(const n of f.nodes){if(n.type==='n8n-nodes-base.code')new vm.Script('(async function(){'+n.parameters.jsCode+'})');for(const match of JSON.stringify(n.parameters).matchAll(/\$\(['"]([^'"]+)['"]\)/g))assert.ok(names.includes(match[1]),match[1]);}
 const agent=f.nodes.find(n=>n.name==='Lola Comercial');assert.equal(agent.parameters.options.systemMessage.includes('Catalogo_comercial_Sheets1'),false);assert.ok(names.includes('Catalogo_comercial_Sheets'));
 assert.equal(f.nodes.find(n=>n.type==='n8n-nodes-base.webhook').parameters.authentication,'headerAuth');assert.equal(f.nodes.find(n=>n.name==='Comprobar conexión sin escritura').parameters.jsonBody,'{"action":"connection_check"}');
});
test('final worker propagates engine and lease through responses, audio and provider results',()=>{
 const job={id:'j1',engine:'lola_instagram_abc',lease_token:'lease',type:'text',profile:{},history:[]},others={'Conservar trabajo':job,'Preparar contexto Lola':{transcript:''},'Lola Comercial':{intermediateSteps:[]}};
 const fixed=run('Completar respuesta fija',{},others)[0].json;assert.equal(fixed.engine,job.engine);assert.equal(fixed.action,'lola_job_complete');
 const result=run('Preparar resultado validable',{output:{reply:'Hola'}},others)[0].json;assert.equal(result.engine,job.engine);assert.equal(result.action,'lola_job_complete');
 const task={job_id:job.id,lease_token:'lease',kind:'calendar'},provider=run('Preparar resultado de agenda o aviso',{statusCode:200,body:{id:'event1'}},{...others,'Autorizar operación en CRM':{value:{task}}})[0].json;assert.equal(provider.engine,job.engine);assert.equal(provider.action,'lola_task_complete');assert.equal(provider.response.body.id,'event1');
 for(const n of f.nodes.filter(n=>n.type==='n8n-nodes-base.httpRequest'&&/lola_(?:task_begin|job_media|audio_route)/.test(n.parameters.jsonBody||'')))assert.match(n.parameters.jsonBody,/engine:/);
});
test('unified ingress rejects raw callbacks and accepts only explicit normalized contracts',()=>{
 assert.throws(()=>run('Validar entrada y conservar canal',{body:{object:'page',entry:[]}}),/Entrada no admitida/);
 const body={action:'lola_form',channel:'web',account_id:'sitio',event_id:'f1',profile:{email:'cliente@example.test'}};assert.equal(run('Validar entrada y conservar canal',{body})[0].json.event_id,'f1');
 assert.throws(()=>run('Validar entrada y conservar canal',{body:{action:'social_message',channel:'desconocido'}}),/Canal/);
});

test('workflow routes every Calendar method to an explicit operation, keeps recovery transport-free and analysis on demand',()=>{
 const names=['Calendar crear cita e invitar por email','Calendar reprogramar e informar cambio','Calendar cancelar y avisar invitados','Calendar consultar disponibilidad y verificar cita'];
 assert.deepEqual(names.map(name=>f.nodes.find(n=>n.name===name).parameters.method),['POST','PATCH','DELETE','GET']);
 const recovery=f.nodes.find(n=>n.name==='Preparar recuperación con plantilla Meta');assert.equal(JSON.parse(recovery.parameters.jsonBody).action,'whatsapp_recovery_maintenance');assert.doesNotMatch(JSON.stringify(recovery),/graph.facebook.com|\/messages|whatsappBusinessCloud/);
 const result=run('Preparar solicitud de análisis del período',{})[0].json;assert.equal(result.action,'publication_analysis');assert.match(result.request_id,/^[a-f0-9-]{36}$/);
 assert.equal(f.nodes.filter(n=>n.type==='n8n-nodes-base.manualTrigger').length,1);assert.equal(f.nodes.find(n=>n.name==='Preparar solicitud de análisis del período').type,'n8n-nodes-base.code');
 for(const note of f.nodes.filter(n=>n.type.endsWith('.stickyNote')))for(const node of f.nodes.filter(n=>!n.type.endsWith('.stickyNote'))){const [x,y]=node.position,[a,b]=note.position;assert.equal(x>=a-100&&x<=a+note.parameters.width+100&&y>=b-100&&y<=b+note.parameters.height+100,false,'Note overlaps '+node.name);}
});
