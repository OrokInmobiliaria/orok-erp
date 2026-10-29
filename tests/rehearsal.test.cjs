'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {PROJECT,PREPRODUCTION_PROJECT,TEMPLATE,assertRehearsal,prepareWorkflow,initializeRehearsal}=require('../deploy/rehearsal.cjs');
const template=JSON.parse(fs.readFileSync(path.join(__dirname,'../n8n',TEMPLATE),'utf8'));
function code(name,input,others={},enable=false){let js=template.nodes.find(n=>n.name===name).parameters.jsCode;if(enable)js=js.replace('const HABILITAR_CLAUDE=false;','const HABILITAR_CLAUDE=true;');return JSON.parse(JSON.stringify(new vm.Script('(function(){'+js+'})()').runInNewContext({$input:{first:()=>({json:input})},$:key=>({first:()=>({json:others[key]})})},{timeout:1000})));}
const complex='Me preocupa elegir entre las opciones de departamentos porque mi familia necesita espacios para trabajar y convivir con nuestra mascota. ¿Me ayudas a comparar y decidir qué revisar antes de visitar?';
test('rehearsal scope rejects production origins, credentialed URLs, invalid placeholders and the commercial project',()=>{
 for(const origin of ['http://ensayo.example.test','https://crm.orok.com.pe','https://user:pass@ensayo.example.test','https://crm-ensayo.invalid','https://ensayo.example.test/?secret=1','https://ensayo.example.test/path'])assert.throws(()=>assertRehearsal(origin,PROJECT));
 assert.throws(()=>assertRehearsal('https://ensayo.example.test','infinity224'));
 assert.equal(assertRehearsal('https://ensayo.example.test',PROJECT).project,PROJECT);
 assert.equal(assertRehearsal('https://preproduccion.example.test',PREPRODUCTION_PROJECT).project,PREPRODUCTION_PROJECT);
});
test('prepared workflow is inactive, uses only rehearsal CRM endpoints and requires selecting credentials',()=>{
 const f=prepareWorkflow(template,{origin:'https://ensayo.example.test',project:PROJECT});assert.equal(f.active,false);assert.deepEqual(f.pinData,{});
 for(const n of f.nodes){assert.equal(n.credentials,undefined);if(n.type==='n8n-nodes-base.httpRequest'&&!String(n.parameters.url).startsWith('='))assert.equal(new URL(n.parameters.url).origin,'https://ensayo.example.test');}
 const memory=f.nodes.find(n=>n.name==='Recuperar memoria e historial · PostgreSQL');assert.match(memory.parameters.options.queryReplacement,new RegExp(PROJECT));assert.equal(f.nodes.some(n=>n.name.includes('Postgres origen')),false);
});
test('Claude cannot be enabled without choosing a model, then receives a valid model locator',()=>{
 assert.throws(()=>prepareWorkflow(template,{origin:'https://ensayo.example.test',project:PROJECT,enableClaude:true}));
 const f=prepareWorkflow(template,{origin:'https://ensayo.example.test',project:PROJECT,enableClaude:true,claudeModel:'claude-test-model'});
 assert.match(f.nodes.find(n=>n.name==='Evaluar apoyo condicional de Claude').parameters.jsCode,/HABILITAR_CLAUDE=true/);
 assert.equal(f.nodes.find(n=>n.type.endsWith('.lmChatAnthropic')).parameters.model.value,'claude-test-model');
});
test('Claude support is off by default and skips greetings, direct handoffs and deterministic tasks',()=>{
 assert.equal(code('Evaluar apoyo condicional de Claude',{text:complex})[0].json.claude_consult,false);
 for(const input of [{text:'Hola'},{text:complex+' Quiero un asesor.'},{text:complex+' No me escribas.'},{text:complex+' ¿Qué precio tiene?'},{text:complex,kind:'calendar'}])assert.equal(code('Evaluar apoyo condicional de Claude',input,{},true)[0].json.claude_consult,false);
});
test('complex contextual input invokes bounded advisory support without exposing raw profile, IDs, email, phone or links',()=>{
 const j={id:'private-job',text:complex+' Mi correo es ana@example.test, mi celular 955318057. https://example.test/private',profile:{name:'private-person'},history:Array.from({length:8},()=>({direction:'inbound',text:'ana@example.test 955318057 '.repeat(80)}))};
 const r=code('Evaluar apoyo condicional de Claude',j,{},true)[0].json;assert.equal(r.claude_consult,true);assert.equal(r.claude_context.recent_context.length,4);assert.ok(r.claude_context.current_message.length<=1200);assert.ok(r.claude_context.recent_context.every(m=>m.text.length<=180));assert.doesNotMatch(JSON.stringify(r.claude_context),/ana@example|955318057|private-job|private-person|https:/);assert.equal(r.id,j.id);
});
test('advisory output is an enum-only hint, keeps the reserved job and never supplies customer-facing text or evidence',()=>{
 const j={id:'j1',lease_token:'lease',memory:{storage:'postgresql'},profile:{name:'Ana'},text:complex};
 const good={text:JSON.stringify({intents:['concern','comparison'],tone:'empathetic',strategy:'clarify_ambiguity'})};
 const r=code('Validar apoyo de Claude y conservar contexto',good,{'Evaluar apoyo condicional de Claude':j})[0].json;assert.equal(r.id,'j1');assert.equal(r.lease_token,'lease');assert.deepEqual(r.memory,j.memory);assert.equal(r.claude_advice.tone,'empathetic');assert.equal(r.claude_context,null);
 for(const value of [{error:'timeout'},{text:'not json'},{text:JSON.stringify({intents:['concern'],tone:'empathetic',strategy:'clarify_ambiguity',reply:'Precio S/ 100'})},{text:JSON.stringify({intents:['book_now'],tone:'empathetic',strategy:'clarify_ambiguity'})}]){const bad=code('Validar apoyo de Claude y conservar contexto',value,{'Evaluar apoyo condicional de Claude':j})[0].json;assert.equal(bad.claude_advice,null);assert.equal(bad.id,j.id);assert.equal(bad.text,complex);}
});
test('native Anthropic node is connected through the bounded chain to the same commercial agent',()=>{
 const native=template.nodes.find(n=>n.type.endsWith('.lmChatAnthropic'));assert.equal(native.parameters.options.maxTokensToSample,350);assert.equal(template.connections[native.name].ai_languageModel[0][0].node,'Claude · interpretar consulta compleja');assert.equal(template.connections['Validar apoyo de Claude y conservar contexto'].main[0][0].node,'Lola Comercial');assert.match(template.nodes.find(n=>n.name==='Lola Comercial').parameters.text,/claude_advice/);assert.equal(template.nodes.filter(n=>n.type.endsWith('.agent')).length,1);
});
test('creative runner preserves server lease and is reachable from its schedule',()=>{
 const r=code('Preparar ejecución creativa autorizada',{value:{job:{id:'creative1',lease_token:'lease1'}}})[0].json;assert.deepEqual(r,{action:'creative_job_run',job_id:'creative1',lease_token:'lease1'});assert.throws(()=>code('Preparar ejecución creativa autorizada',{value:{job:{id:'creative1'}}}));assert.equal(template.connections['Hay propuesta creativa reservada'].main[0][0].node,'Preparar ejecución creativa autorizada');
});
test('paid media sync restores both providers and uses seven complete days in Lima',()=>{
 const rows=code('Preparar siete días completos de pauta · Lima',{}).map(r=>r.json);assert.deepEqual(rows.map(r=>r.provider),['meta','tiktok']);for(const r of rows){assert.equal(r.action,'ads_sync');assert.equal(Date.parse(r.to)-Date.parse(r.from),6*86400000);const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima'}).format(new Date());assert.ok(r.to<today);}assert.equal(template.connections['Actualizar pauta Meta y TikTok cada día'].main[0][0].node,'Preparar siete días completos de pauta · Lima');
});
test('blank SQL rehearsal initializes no commercial clients and cannot overwrite an existing project',async()=>{
 const {PGlite}=require('@electric-sql/pglite'),raw=new PGlite();const pool={query:async(sql,values)=>{if(sql.startsWith('BEGIN')||sql==='COMMIT'||sql==='ROLLBACK'||sql.startsWith('SET LOCAL'))return raw.exec(sql);if(sql.includes('CREATE SCHEMA')){await raw.exec(sql);return {rows:[]};}return raw.query(sql,values);},connect:async()=>({query:(sql,values)=>pool.query(sql,values),release:()=>{}})};
 try{const preview=await initializeRehearsal(pool,{origin:'https://ensayo.example.test',project:PROJECT});assert.equal(preview.ready,false);await initializeRehearsal(pool,{origin:'https://ensayo.example.test',project:PROJECT,apply:true,installSchema:true});const rows=await raw.query('SELECT project_id,body FROM lola_unified.documents');assert.equal(rows.rows.length,1);assert.equal(rows.rows[0].project_id,PROJECT);assert.equal(rows.rows[0].body._rehearsal,true);await assert.rejects(initializeRehearsal(pool,{origin:'https://ensayo.example.test',project:PROJECT,apply:true}),/ya tiene datos/);}
 finally{await raw.close();}
});
test('container binding is explicit and startup rejects a rehearsal using the commercial project',()=>{
 const {config}=require('../config.cjs');const env={APP_ORIGIN:'https://ensayo.example.test',OROK_PRIVATE_DIR:path.join(__dirname,'private-test'),SESSION_SECRET:'x'.repeat(64),OROK_REHEARSAL:'1',OROK_PROJECT:PROJECT};assert.equal(config(env).host,'127.0.0.1');assert.equal(config({...env,OROK_LISTEN_HOST:'0.0.0.0'}).host,'0.0.0.0');assert.throws(()=>config({...env,OROK_PROJECT:'infinity224'}));assert.throws(()=>config({...env,OROK_LISTEN_HOST:'example.test'}));
});
