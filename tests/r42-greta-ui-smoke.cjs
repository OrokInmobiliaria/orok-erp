'use strict';
// R42 · prueba visual opcional del módulo Marketing (G.R.E.T.A). Playwright no es dependencia de producción.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {chromium}=require('playwright');
const {MemoryFirestore}=require('./memory-firestore.cjs'),{FirestoreProject}=require('../firestore-project.cjs'),{CloudAuth}=require('../cloud-auth.cjs'),{createServer}=require('../server.cjs');
const OUT=process.env.SHOTS||os.tmpdir();
(async()=>{
 const db=new MemoryFirestore(),store=new FirestoreProject(db),mail=[];
 const recent=new Date(Date.now()-2*86400000).toISOString();
 await store.initialize({settings:{projectName:'Infinity 224',brandColor:'#85442A',exchangeRate:3.8},leads:[{id:'l1',name:'Cliente',phone:'999',status:'Contactado',source:'Instagram',received_at:recent}],units:[]});
 await db.runTransaction(async tx=>{tx.set(store.ref.collection('lola_customer_memories').doc('m'),{topics:[{topic:'showroom',at:recent},{topic:'acabados',at:recent}]});
  tx.set(store.ref.collection('greta_tendencias').doc('lec1'),{id:'lec1',creado:new Date().toISOString(),por:'Gerencia',filtros:{nichos:['Departamentos en Lima'],redes:['instagram','tiktok'],dias:7},resumen:'Los recorridos POV y los antes/después de obra son lo que más se comparte en el nicho esta semana.',tendencias:[{id:'t1',titulo:'Recorrido POV del depa',formato:'reel',redes:['instagram','tiktok'],por_que:'Muestran el espacio real en 15 segundos.',como_aplicarlo:'Grabar el showroom con luz de tarde.',encaje:'alto',senal:'Muchos ejemplos recientes',confianza:'media',ejemplos:[]},{id:'t2',titulo:'Antes y después de obra',formato:'carousel',redes:['instagram'],por_que:'La transformación genera confianza.',como_aplicarlo:'Fotos de avance de obra.',encaje:'medio',senal:'Uso frecuente',confianza:'media',ejemplos:[]}],hashtags:['#DepasLima','#Arquitectura'],limitaciones:[],fuentes:[{titulo:'Fuente de ejemplo',url:'https://example.com'}],web:true,lola:{temas:[{id:'showroom',tema:'Visitas al showroom',menciones:2}]}});});
 const config={testing:true,origin:'http://127.0.0.1',privateDir:fs.mkdtempSync(path.join(os.tmpdir(),'orok-greta-ui-')),sessionSecret:'s'.repeat(64),bootstrapCode:'b'.repeat(32),cookieName:'orok_dev_session'};
 const auth=new CloudAuth(db,{...config,sendApproval:async v=>mail.push(v)}),cache=store.watch(),authCache=auth.watch(),server=createServer({config,store,auth,cache,authCache});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;config.origin=base;
 let cookie='';const call=async(m,args=[])=>{const r=await fetch(base+'/api/rpc/'+m,{method:'POST',headers:{Origin:config.origin,'X-Orok-Request':'1','Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({args})});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];const j=await r.json();assert.equal(r.status,200,JSON.stringify(j));return j.value;};
 const user=await call('auth.bootstrap',[{name:'Gerencia local',password:'LocalTesting123!',legacyPin:config.bootstrapCode}]);await call('auth.requestApproval');await call('auth.verifyApproval',[mail.at(-1).code]);
 let browser;
 try{
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  for(const [w,h,tag] of [[1440,1000,'desktop'],[390,844,'mobile']]){
   const page=await browser.newPage({viewport:{width:w,height:h}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>/OVER/.test(m.text())&&console.log(m.text()));
   await page.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());
   await page.goto(base);await page.locator('form select.orok-input').first().selectOption(user.id);await page.locator('form input[type=password]').fill('LocalTesting123!');await page.getByRole('button',{name:'Iniciar Sesión',exact:true}).click();
   await page.getByRole('group',{name:'Módulo de ÖRÖK'}).getByRole('button',{name:'Marketing',exact:true}).click();
   await page.getByText('G.R.E.T.A sugiere hoy').waitFor();await page.getByText('Visitas al showroom · 1').first().waitFor();
   await page.screenshot({path:path.join(OUT,'greta-hoy-'+tag+'.png'),fullPage:true});
   const overflow=await page.evaluate(()=>{const W=window.innerWidth,o=[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>W+1).slice(0,6).map(e=>e.tagName+'.'+e.className+' '+Math.round(e.getBoundingClientRect().right));if(o.length)console.log('OVER',o.join(' | '));return document.documentElement.scrollWidth>W+1;});assert.equal(overflow,false,'sin desborde horizontal en '+tag);
   const nav=async label=>{if(label.includes('>')){const [g,i]=label.split('>');await page.locator('.erp-navigation').getByRole('button',{name:g}).first().click();await page.getByRole('menuitem',{name:i}).or(page.locator('.erp-navigation').getByRole('button',{name:i,exact:true})).first().click();return;}const b=page.locator('.erp-navigation').getByRole('button',{name:label,exact:true}).first();if(await b.count()&&await b.isVisible())return b.click();await page.locator('.erp-navigation').getByText(label,{exact:true}).first().click();};
   await page.getByRole('button',{name:'Abrir el asistente G.R.E.T.A'}).click();await page.getByRole('dialog',{name:'Asistente G.R.E.T.A'}).waitFor();
   await page.screenshot({path:path.join(OUT,'greta-asistente-'+tag+'.png')});
   await page.getByRole('button',{name:'Cerrar G.R.E.T.A'}).click();
   assert.equal(await page.getByRole('button',{name:'Abrir el asistente L.O.L.A'}).count(),0,'en Marketing no se muestra L.O.L.A flotante');
   await page.getByRole('button',{name:'Crear algo nuevo'}).click();await page.getByText('Recorrido POV del depa').waitFor();
   await page.screenshot({path:path.join(OUT,'greta-tendencias-'+tag+'.png'),fullPage:true});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1),false,'tendencias sin desborde '+tag);
   if(tag==='desktop'){
    for(const [label,wait,file] of [['Publicar','¿Lo publicamos o lo terminas en la app?','publicar'],['Medir>Pauta y KPIs','Anuncios del periodo','kpis'],['Marca','G.R.E.T.A · imágenes y enlace con L.O.L.A','marca']]){
     await page.evaluate(()=>window.scrollTo(0,0));await nav(label);await page.getByText(wait).first().waitFor({timeout:15000});await page.screenshot({path:path.join(OUT,'greta-'+file+'-'+tag+'.png'),fullPage:true});
    }
    await page.getByRole('group',{name:'Módulo de ÖRÖK'}).getByRole('button',{name:'CRM Inmobiliario',exact:true}).click();
    const crmNav=await page.locator('.erp-navigation').innerText();assert.equal(/Tendencias|Pauta y KPIs/.test(crmNav),false,'el CRM ya no muestra Marketing');
   }
   assert.deepEqual(errors,[]);await page.close();
  }
  console.log('R42 UI ok →',OUT);
 }finally{await browser?.close();server.close();cache.close?.();authCache.close?.();}
 process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
