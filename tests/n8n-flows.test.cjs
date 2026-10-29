'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const dir=path.join(__dirname,'../referencias/n8n-anteriores'),files=fs.readdirSync(dir).filter(f=>f.endsWith('.json')),flows=Object.fromEntries(files.map(f=>[f,JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'))]));
const run=(flow,name,input,others={})=>{
 const n=flow.nodes.find(n=>n.name===name),get=name=>({first:()=>({json:others[name]||{}})});
 return new vm.Script('(function(){'+n.parameters.jsCode+'})()').runInNewContext({$input:{first:()=>({json:input}),all:()=>[{json:input}]},$:get,console},{timeout:1000});
};
for(const [name,d] of Object.entries(flows))test('n8n structure and executable code: '+name,()=>{
 assert.equal(d.active,false);assert.deepEqual(d.pinData,{});const names=d.nodes.map(n=>n.name);assert.equal(new Set(names).size,names.length);
 for(const [from,ports] of Object.entries(d.connections)){assert.ok(names.includes(from),from);for(const list of Object.values(ports))for(const branch of list)for(const to of branch)assert.ok(names.includes(to.node),to.node);}
 for(const n of d.nodes){if(n.type==='n8n-nodes-base.code')new vm.Script('(async function(){'+n.parameters.jsCode+'})');
  // Publication reads and model calls allow up to 90 seconds; mutations retain their shorter transport limits.
  if(n.type==='n8n-nodes-base.httpRequest')assert.ok(n.parameters.options.timeout>=10000&&n.parameters.options.timeout<=90000);
  const raw=JSON.stringify(n.parameters);for(const match of raw.matchAll(/\$\(['"]([^'"]+)['"]\)/g))assert.ok(names.includes(match[1]),'Missing expression source '+match[1]);
 }
 assert.ok(d.settings.executionTimeout<=240);
});
test('Telegram corrected copy retains exactly one enabled Telegram trigger and early callback acknowledgment',()=>{
 const d=flows[files.find(f=>f.startsWith('01-'))];assert.equal(d.nodes.filter(n=>n.type==='n8n-nodes-base.telegramTrigger'&&!n.disabled).length,1);
 assert.equal(d.connections['Telegram ENSAYO1'].main[0][0].node,'Es callback recibido 07');assert.equal(d.nodes.find(n=>n.name==='Confirmar pulsacion inmediata 07').onError,'continueRegularOutput');
 const base={update_id:843137860,message:{message_id:1,from:{id:123,is_bot:false},chat:{id:123,type:'private'},text:'¿cuál es el precio?'}};
 const ingress=run(d,'Identificar evento ENSAYO1',base);assert.equal(ingress[0].json.kind,'ingress');assert.equal(ingress[0].json.text,base.message.text);
 const cancel=run(d,'Identificar evento ENSAYO1',{...base,message:{...base.message,text:'Quiero cancelar mi cita'}});assert.equal(cancel[0].json.kind,'appointment_cancel_request');
 const validated=run(d,'Validar ficha ENSAYO1',{output:{reply:'Con gusto',profile:{},handoff:true,opt_out:false,commercial_answer:false,commercial_evidence:[]}},{'Normalizar Telegram ENSAYO1':{text:'¿Cuál es el precio?',chat_id:'123',update_id:1,previous_profile:{}},'Lola Telegram ENSAYO1':{intermediateSteps:[]}});
 assert.match(validated[0].json.reply,/Esa información comercial/);assert.equal(validated[0].json.handoff,true);
});
test('observer converts text/media/status/echo and connection probe without stale lead_upsert actions',()=>{
 const d=flows[files.find(f=>f.startsWith('02-'))],n='Normalizar mensaje Meta';assert.equal(run(d,n,{body:{action:'connection_check'}})[0].json.action,'connection_check');
 const payload={object:'whatsapp_business_account',entry:[{changes:[{field:'messages',value:{metadata:{phone_number_id:'1234567890'},messages:[{id:'m',from:'51922222222',timestamp:String(Math.floor(Date.now()/1000)),type:'audio',audio:{id:'a',mime_type:'audio/mp4'}}],statuses:[{id:'out',status:'delivered',timestamp:String(Math.floor(Date.now()/1000))}]}},{field:'smb_message_echoes',value:{metadata:{phone_number_id:'1234567890'},message_echoes:[{id:'echo',to:'51922222222',from:'51911111111',timestamp:String(Math.floor(Date.now()/1000)),type:'text',text:{body:'Equipo'}}]}}]}]};
 const out=run(d,n,{body:payload});assert.equal(out.length,3);assert.equal(out[0].json.action,'whatsapp_message');assert.equal(out[0].json.message.media.id,'a');assert.equal(out[1].json.action,'whatsapp_status');assert.equal(out[2].json.message.direction,'outbound');assert.equal(out[2].json.phone,'51922222222');
 const entry=d.nodes.find(n=>n.type==='n8n-nodes-base.webhook');assert.equal(entry.parameters.authentication,'headerAuth');
});
test('worker routes empty queue, fixed replies and transcripts without Meta credentials or send calls',()=>{
 const d=flows[files.find(f=>f.startsWith('04-'))];assert.equal(d.nodes.some(n=>n.type==='n8n-nodes-base.telegram'),false);assert.equal(d.nodes.some(n=>n.type==='n8n-nodes-base.postgres'),false);
 for(const n of d.nodes.filter(n=>n.type==='n8n-nodes-base.httpRequest'&&n.parameters.authentication!=='predefinedCredentialType'))assert.match(n.parameters.url,/api\/integrations\/lola/);assert.ok(d.nodes.some(n=>n.name==='Calendar consultar crear reprogramar cancelar'));assert.ok(d.nodes.some(n=>n.name==='Avisar ventas por correo WhatsApp'));assert.ok(d.nodes.some(n=>n.name==='Seguimiento 24 horas y conciliación'));
 const j={id:'job-1',lease_token:'lease-1',type:'audio',text:'',profile:{},history:[]},context=run(d,'Preparar contexto Lola',{text:'¿cuál es el precio?'},{'Conservar trabajo':j});assert.equal(context[0].json.transcript,'¿cuál es el precio?');
 const complete=run(d,'Preparar resultado validable',{output:{reply:'Hola'}},{'Conservar trabajo':j,'Preparar contexto Lola':context[0].json,'Lola WhatsApp':{intermediateSteps:[{action:{tool:'Catalogo_comercial_Sheets'},observation:[{type:'2D'}]}]}});assert.equal(complete[0].json.job_id,'job-1');assert.equal(complete[0].json.result.observed_evidence[0].tool,'Catalogo_comercial_Sheets');
 const failure=run(d,'Preparar resultado validable',{error:{message:'Model failed'}},{'Conservar trabajo':j});assert.equal(failure[0].json.error,'generation_failed');
});
test('complete WhatsApp workflow carries Calendar/Gmail credentials and provider results through the CRM ledger',()=>{
 const d=flows[files.find(f=>f.startsWith('04-'))],cal=d.nodes.find(n=>n.name==='Calendar consultar crear reprogramar cancelar');
 assert.equal(cal.parameters.authentication,'predefinedCredentialType');assert.equal(cal.parameters.nodeCredentialType,'googleCalendarOAuth2Api');assert.ok(cal.credentials.googleCalendarOAuth2Api);assert.equal(cal.parameters.options.response.response.fullResponse,true);assert.equal(cal.parameters.options.response.response.neverError,true);assert.equal(cal.retryOnFail,undefined);
 const task={kind:'calendar',job_id:'j1',lease_token:'lease1',method:'PATCH',url:'https://www.googleapis.com/calendar/v3/calendars/ventas%40orok.com.pe/events/e1',body:{start:{dateTime:'2026-10-22T10:00:00-05:00'}}};
 const lookup=name=>({first:()=>({json:{value:{task}}})});const evaluate=expression=>new vm.Script(expression.slice(3,-2)).runInNewContext({$:lookup,JSON},{timeout:1000});assert.equal(evaluate(cal.parameters.url),task.url);assert.equal(evaluate(cal.parameters.method),'PATCH');assert.equal(evaluate(cal.parameters.sendBody),true);
 const result=run(d,'Preparar resultado de agenda o aviso',{statusCode:200,body:{id:'e1'}},{'Autorizar operación en CRM':{value:{task}}});assert.equal(result[0].json.action,'whatsapp_task_complete');assert.equal(result[0].json.status,200);assert.equal(result[0].json.response.body.id,'e1');
 assert.equal(d.nodes.filter(n=>n.type==='n8n-nodes-base.telegramTrigger').length,0);for(const n of d.nodes.filter(n=>n.parameters?.url&&n.parameters.authentication!=='predefinedCredentialType'))assert.equal(n.parameters.url.includes('$vars'),false);
});
test('social worker only drafts and retains verified commercial observations; no Calendar/Meta send calls are present',()=>{const d=flows[files.find(f=>f.startsWith('05-'))];assert.equal(d.nodes.some(n=>n.type==='n8n-nodes-base.gmail'),false);for(const n of d.nodes.filter(n=>n.type==='n8n-nodes-base.httpRequest'))assert.match(n.parameters.url,/crm\.orok\.com\.pe\/api\/integrations\/lola/);const j={id:'social-job',lease_token:'token'},r=run(d,'Preparar resultado validable',{output:{reply:'Hola'}},{'Conservar trabajo':j,'Lola Social':{intermediateSteps:[{action:{tool:'Catalogo_comercial_Sheets'},observation:'dos dormitorios'}]}})[0].json;assert.equal(r.action,'social_job_complete');assert.equal(r.job_id,j.id);assert.equal(r.result.observed_evidence[0].data,'dos dormitorios');});
test('TikTok relay is explicitly internal, authenticated and rejects raw unverified callbacks',()=>{const d=flows[files.find(f=>f.startsWith('07-'))],web=d.nodes.find(n=>n.type==='n8n-nodes-base.webhook');assert.equal(web.parameters.authentication,'headerAuth');assert.throws(()=>run(d,'Validar contrato normalizado',{body:{event:'message'}}),/normalizado/);const p={action:'social_message',channel:'tiktok',account_id:'999999',contact_id:'777777',message:{id:'tt1'}};assert.equal(run(d,'Validar contrato normalizado',{body:p})[0].json.channel,'tiktok');});
test('Claude campaign workflow complements other workers and never embeds the Anthropic key or calls ad publishing APIs',()=>{const d=flows[files.find(f=>f.startsWith('08-'))];assert.equal(d.active,false);const nodes=d.nodes.filter(n=>n.type==='n8n-nodes-base.httpRequest');assert.equal(nodes.length,2);for(const n of nodes){assert.equal(n.parameters.url,'https://crm.orok.com.pe/api/integrations/lola');assert.equal(n.retryOnFail,undefined);assert.equal(JSON.stringify(n).includes('x-api-key'),false);}const run=nodes.find(n=>n.name==='Generar propuesta Claude en servidor'),job={id:'j1',lease_token:'lease'};const result=new vm.Script(run.parameters.jsonBody.slice(3,-2)).runInNewContext({$json:{value:{job}},JSON});assert.deepEqual(JSON.parse(result),{action:'creative_job_run',job_id:'j1',lease_token:'lease'});});
