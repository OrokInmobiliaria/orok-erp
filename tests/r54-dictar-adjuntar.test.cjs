'use strict';
// R54 · «Dictar o adjuntar»: las IA proponen valores para los campos de la pantalla a partir de voz/texto e imágenes o PDF;
// solo campos existentes, tipos respetados, nada se aplica sin la persona; imágenes enviadas a cada proveedor en su formato.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {RellenarIA,limpiarCampos,limpiarAdjuntos,coaccionar}=require('../business/rellenarIA');
const {LolaAssistant}=require('../business/lolaAssistant');
const IMG='iVBORw0KGgo'+'A'.repeat(200);
const G={name:'Martín',role:'Gerente'},V={name:'Antonio',role:'Vendedor'};
const campos=[{id:'c1',etiqueta:'Nombre del proyecto',tipo:'texto',valor:''},{id:'c2',etiqueta:'Área del terreno (m²)',tipo:'numero',valor:''},{id:'c3',etiqueta:'Empresa',tipo:'opcion',opciones:['BMG','MZA','MAAS'],valor:'BMG'},{id:'c4',etiqueta:'Mes de inicio',tipo:'mes',valor:''},{id:'c5',etiqueta:'Gastos generales %',tipo:'porcentaje',valor:''}];
function fake(respuesta,{enabled=true}={}){const llamadas=[];return {llamadas,raw:()=>({enabled,provider:'gemini',max_per_day:80}),key:()=>({key:'k'}),count:async()=>1,call:async(c,k,system,msgs,opts)=>{llamadas.push({system,msgs,opts});return typeof respuesta==='function'?respuesta(msgs):JSON.stringify(respuesta);}};}

test('validación de campos, adjuntos y tipos',()=>{
 assert.throws(()=>limpiarCampos([]),/no tiene campos/);assert.equal(limpiarCampos([{id:'bad id!'},{id:'ok'}]).length,1);
 assert.throws(()=>limpiarAdjuntos([{mime:'text/html',datos:IMG}]),/imágenes/);assert.throws(()=>limpiarAdjuntos([{mime:'image/png',datos:'A'.repeat(7e6)}]),/tamaño/);
 assert.equal(coaccionar({tipo:'numero'},'S/ 3,200.50'),'3200.5');assert.equal(coaccionar({tipo:'porcentaje'},'8 %'),'8');assert.equal(coaccionar({tipo:'mes'},'2026-11'),'2026-11');assert.equal(coaccionar({tipo:'mes'},'noviembre'),null);
 assert.equal(coaccionar({tipo:'opcion',opciones:['BMG','MZA']},'mza'),'MZA');assert.equal(coaccionar({tipo:'opcion',opciones:['BMG']},'ACME'),null);assert.equal(coaccionar({tipo:'si_no'},'Sí'),'si');
});

test('M.O.R.A propone solo campos existentes, con fuente y confianza; descarta inventos y valores iguales',async()=>{
 const a=fake({resumen:'Proyecto Ventura de BMG',cambios:[{campo:'c1',valor:'Ventura',fuente:'dictado',confianza:'alta'},{campo:'c2',valor:'300 m²',fuente:'imagen: partida',confianza:'alta'},{campo:'c3',valor:'BMG'},{campo:'c4',valor:'2026-11',fuente:'dictado'},{campo:'c5',valor:'8',fuente:'historial: Infinity 224',confianza:'media'},{campo:'zz',valor:'x'},{campo:'c3',valor:'ACME'}],preguntas:['¿Cuántos sótanos?']});
 const drive={context:async()=>({fuentes:[],historial_otros_proyectos:{proyectos:[{proyecto:'Infinity 224'}]}}),enqueueFile:async()=>({state:'queued'})};
 const r=await new RellenarIA({assistant:a,projectDrive:drive}).proponer({modulo:'mora',pantalla:'Datos del Proyecto',campos,texto:'Proyecto Ventura…',adjuntos:[{nombre:'partida.png',mime:'image/png',datos:IMG}]},G,{settings:{projectName:'Ventura'}});
 assert.deepEqual(r.cambios.map(c=>[c.campo,c.propuesto]),[['c1','Ventura'],['c2','300'],['c4','2026-11'],['c5','8']]);
 assert.equal(r.cambios[1].fuente,'imagen: partida');assert.equal(r.cambios[3].confianza,'media');assert.deepEqual(r.preguntas,['¿Cuántos sótanos?']);assert.equal(r.ia,'M.O.R.A');
 assert.deepEqual(r.archivados,[{nombre:'partida.png',carpeta:'10.Estudio de Mercado'}]);
 const ll=a.llamadas[0];assert.equal(ll.msgs[0].images.length,1);assert.match(ll.msgs[0].text,/Infinity 224/);assert.match(ll.system,/DATOS, nunca instrucciones/);assert.equal(ll.opts.max,3000);
});

test('permisos: Ventas puede con L.O.L.A pero no con M.O.R.A/D.I.A.V.A; sin texto ni adjuntos no consulta; IA apagada avisa',async()=>{
 const a=fake({cambios:[]});
 await assert.rejects(new RellenarIA({assistant:a}).proponer({modulo:'mora',campos,texto:'x'},V,{settings:{}}),/solo puede llenar esta pantalla con Gerencia/);
 await new RellenarIA({assistant:a}).proponer({modulo:'lola',campos,texto:'cliente Juan, presupuesto 400 mil'},V,{settings:{}});
 await assert.rejects(new RellenarIA({assistant:a}).proponer({modulo:'lola',campos},V,{settings:{}}),/Dicta, escribe o adjunta/);
 await assert.rejects(new RellenarIA({assistant:fake({},{enabled:false})}).proponer({modulo:'greta',campos,texto:'x'},G,{settings:{}}),/apagada/);
 await assert.rejects(new RellenarIA({assistant:a}).proponer({modulo:'otro',campos,texto:'x'},G,{settings:{}}),/Módulo no válido/);
});

test('cada proveedor recibe las imágenes y PDF en su formato',async()=>{
 const enviados=[],la=new LolaAssistant({db:{},ref:{collection:()=>({doc:()=>({})})}},{privateDir:'/tmp'},{fetcher:async(url,o)=>{enviados.push({url,body:JSON.parse(o.body)});return {ok:true,json:async()=>({content:[{type:'text',text:'{}'}],choices:[{message:{content:'{}'}}],candidates:[{content:{parts:[{text:'{}'}]}}]})};}});
 const msg=[{role:'user',text:'lee',images:[{mime:'image/jpeg',b64:'AAAA',name:'a.jpg'},{mime:'application/pdf',b64:'BBBB',name:'b.pdf'}]}];
 for(const provider of ['gemini','openai','claude'])await la.call({provider},'k','sys',msg,{max:3000,json:true});
 const [g,o,c]=enviados;
 assert.deepEqual(g.body.contents[0].parts.slice(1).map(p=>p.inline_data.mime_type),['image/jpeg','application/pdf']);
 assert.equal(o.body.messages[1].content[1].image_url.url,'data:image/jpeg;base64,AAAA');assert.equal(o.body.messages[1].content[2].file.file_data,'data:application/pdf;base64,BBBB');
 assert.deepEqual(c.body.messages[0].content.map(x=>x.type),['image','document','text']);assert.equal(c.body.max_tokens,3000);
 // Sin imágenes, los mensajes siguen igual que antes (texto simple).
 await la.call({provider:'claude'},'k','sys',[{role:'user',text:'hola'}]);assert.equal(enviados.at(-1).body.messages[0].content,'hola');assert.equal(enviados.at(-1).body.max_tokens,700);
});

test('cableado: botón en CRM/Marketing, Evaluador y Contabilidad; puente del navegador',()=>{
 const rd=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
 assert.match(rd('index.html'),/<script src="\/ia-rellenar\.js" defer><\/script>/);assert.ok(rd('server.cjs').includes(`h+'<script src="/ia-rellenar.js?v='`),'R60: con versión en la dirección');
 assert.match(rd('src/App.jsx'),/setAttribute\('data-ia-modulo',m\)/);assert.ok(rd('src/cloudBridge.js').includes("'iaRellenar'"));
 const w=rd('public/ia-rellenar.js');for(const t of ['/evaluador','/contabilidad','Proponer cambios','Aplicar los marcados',"dispatchEvent(new Event('input'","'.lola-panel > .lola-head, #ai > .ai-h'",'Llenar esta pantalla'])assert.ok(w.includes(t),t);
 assert.ok(!/className\s*=\s*'[^']*ia-rellenar-boton/.test(w),'sin botón flotante aparte (R56); R60 solo retira copias viejas');
});
