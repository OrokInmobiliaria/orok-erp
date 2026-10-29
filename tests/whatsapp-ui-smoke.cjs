'use strict';
// Optional local visual smoke test; Playwright is not a production dependency.
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {chromium}=require('playwright');
const {MemoryFirestore}=require('./memory-firestore.cjs');
const {FirestoreProject}=require('../firestore-project.cjs');
const {CloudAuth}=require('../cloud-auth.cjs');
const {createServer}=require('../server.cjs');
const {WhatsAppInbox}=require('../business/whatsappInbox');
(async()=>{
 const db=new MemoryFirestore(),store=new FirestoreProject(db),mail=[];
 await store.initialize({settings:{projectName:'Infinity 224',brandColor:'#85442A',exchangeRate:3.8},leads:[{id:'test-chat',lead_number:'LD-PRUEBA',name:'Cliente de prueba visual',phone:'999111222',status:'Contactado',received_at:new Date().toISOString(),comment_history:[{id:'legacy-1',at:'2026-10-01T12:00:00.000Z',author:'WhatsApp · Histórico',text:'WhatsApp · Cliente: Consulta anterior importada.'}]}],units:[]});
 const inbox=new WhatsAppInbox(store);
 for(let i=0;i<56;i++)await inbox.ingest({phone:'51999111222',business_phone_id:'local-test',message:{id:'test-'+i,direction:i%2?'outbound':'inbound',sender:'LeadCenter',type:'text',text:i===55?'Con gusto, te ayudamos a coordinar tu visita.':'Mensaje de prueba '+i,at:new Date(Date.now()-(60-i)*60000).toISOString()}});
 const config={testing:true,origin:'http://127.0.0.1',privateDir:fs.mkdtempSync(path.join(os.tmpdir(),'orok-ui-test-')),sessionSecret:'s'.repeat(64),bootstrapCode:'b'.repeat(32),cookieName:'orok_dev_session'};
 const auth=new CloudAuth(db,{...config,sendApproval:async value=>mail.push(value)}),cache=store.watch(),authCache=auth.watch(),server=createServer({config,store,auth,cache,authCache});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 let cookie='';const call=async(method,args=[])=>{const response=await fetch(base+'/api/rpc/'+method,{method:'POST',headers:{Origin:config.origin,'X-Orok-Request':'1','Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({args})});if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));return result.value;};
 const user=await call('auth.bootstrap',[{name:'Gerencia local',password:'LocalTesting123!',legacyPin:config.bootstrapCode}]);await call('auth.requestApproval');await call('auth.verifyApproval',[mail.at(-1).code]);
 let browser;
 try{
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
  await page.goto(base);await page.getByLabel('Usuario',{exact:true}).selectOption(user.id);await page.getByLabel('Contraseña',{exact:true}).fill('LocalTesting123!');await page.getByRole('button',{name:'Iniciar Sesión',exact:true}).click();
  await page.getByRole('button',{name:'Kanban Leads',exact:true}).click();
  const trigger=page.getByRole('button',{name:'WhatsApp · Cliente de prueba visual',exact:true});await trigger.click();
  const panel=page.getByRole('dialog',{name:'WhatsApp',exact:true});await panel.waitFor();await panel.getByText('Con gusto, te ayudamos a coordinar tu visita.',{exact:true}).waitFor();
  assert.equal(await panel.getByRole('button',{name:'Lola automática',exact:true}).isDisabled(),true);
  assert.equal(await panel.getByRole('button',{name:'Enviar',exact:true}).isDisabled(),true);
  await panel.getByRole('button',{name:'Ver mensajes anteriores',exact:true}).click();await panel.getByText('Mensaje de prueba 0',{exact:true}).waitFor();
  assert.equal(await panel.getByRole('button',{name:'Ver mensajes anteriores',exact:true}).count(),0);
  await panel.getByRole('button',{name:'Manual',exact:true}).click();await page.waitForTimeout(300);assert.equal(await panel.getByRole('button',{name:'Manual',exact:true}).getAttribute('aria-pressed'),'true');
  await page.screenshot({path:path.join(config.privateDir,'whatsapp-desktop.png')});
  await page.keyboard.press('Escape');await panel.waitFor({state:'detached'});assert.equal(await trigger.evaluate(element=>document.activeElement===element),true);
  await trigger.click();await panel.getByText('Con gusto, te ayudamos a coordinar tu visita.',{exact:true}).waitFor();
  await page.setViewportSize({width:390,height:844});
  const bounds=await panel.boundingBox();assert.ok(bounds.x>=0&&bounds.width<=390&&bounds.height<=844,JSON.stringify(bounds));
  await page.screenshot({path:path.join(config.privateDir,'whatsapp-mobile.png')});
  assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,checks:['panel','pagination','disabled unconfigured send and Lola','escape and focus','mobile viewport','no browser errors'],screenshots:config.privateDir}));
 }finally{if(browser)await browser.close();cache.close();authCache.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
