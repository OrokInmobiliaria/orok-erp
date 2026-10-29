'use strict';
// R43 · prueba visual opcional: Crear › Formularios (editor + vista previa) y Armar en Estudio. Playwright no es dependencia de producción.
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
 const {LeadForms}=require('../business/leadForms');const lf=new LeadForms(store);
 await lf.guardar({nombre:'Infinity 224 · visitas showroom',red:'meta',tipo:'mayor_intencion',intro:{titulo:'Conoce Infinity 224',texto:'Déjanos tus datos y un asesor te cuenta todo sobre el proyecto.'},contacto:['nombre','telefono'],preguntas:[{id:'interes',tipo:'opciones',etiqueta:'¿Qué departamento buscas?',crm:'interes',opciones:['1 dormitorio','2 dormitorios','3 dormitorios']},{id:'cuando',tipo:'opciones',etiqueta:'¿Para cuándo lo buscas?',opciones:['Este año','El próximo año']}],privacidad:{url:'https://orok.com.pe/privacidad',texto:'Política de privacidad'},cierre:{titulo:'¡Gracias por escribirnos!',texto:'Un asesor te escribirá hoy.',boton:'whatsapp',boton_texto:'Escríbenos por WhatsApp',destino:'51987654321'}},{name:'Gerencia local'});
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
   await page.getByText('G.R.E.T.A sugiere hoy').waitFor();
   if(tag==='desktop'){await page.locator('.erp-navigation').getByRole('button',{name:/Crear/}).first().click();await page.getByRole('menuitem',{name:/Formularios/}).or(page.locator('.erp-navigation').getByRole('button',{name:'Formularios',exact:true})).first().click();}
   else{await page.getByRole('navigation',{name:'Navegación rápida'}).getByRole('button',{name:'Más'}).click();await page.getByRole('dialog',{name:'Todas las secciones'}).getByRole('menuitem',{name:/^Formularios/}).click();}
   await page.getByText('Formularios para tus anuncios').waitFor();
   await page.getByRole('button',{name:/Infinity 224 · visitas showroom/}).click();
   await page.getByLabel('Vista previa del formulario').getByText('Conoce Infinity 224').waitFor();
   const titulo=page.locator('fieldset').filter({hasText:'Bienvenida'}).locator('input').first();await titulo.fill('Visita nuestro showroom');
   await page.getByLabel('Vista previa del formulario').getByText('Visita nuestro showroom').waitFor();
   await page.getByLabel('Vista previa del formulario').getByRole('tab',{name:'Preguntas'}).click();await page.getByLabel('Vista previa del formulario').getByText('2 dormitorios').waitFor();
   await page.screenshot({path:path.join(OUT,'greta-formularios-'+tag+'.png'),fullPage:true});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1),false,'formularios sin desborde '+tag);
   assert.deepEqual(errors,[]);await page.close();
  }
  console.log('R43 UI ok →',OUT);
 }finally{await browser?.close();server.close();cache.close?.();authCache.close?.();}
 process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
