'use strict';
// R42 · Módulo Marketing con G.R.E.T.A: permisos, tendencias con fuentes, ideas como propuesta validada, imágenes referenciales,
// KPIs desde la atribución del CRM, intercambio con L.O.L.A sin datos personales, borradores en la cola y menú separado del CRM.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {MemoryFirestore}=require('./memory-firestore.cjs'),{FirestoreProject}=require('../firestore-project.cjs');
const {CreativeCampaigns}=require('../business/creativeCampaigns.js'),{Pipelines}=require('../business/pipelines.js'),{Greta,GRETA_METHODS,paraLola,jsonDe}=require('../business/greta.js');
const PNG=Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),Buffer.alloc(40)]);
const G={name:'Martín Montezuma',role:'Gerente'},V={name:'Vendedor',role:'Vendedor'};
const TREND={resumen:'Los recorridos en primera persona crecen en el nicho.',tendencias:[{id:'t1',titulo:'Recorrido POV del depa',formato:'reel',redes:['instagram','tiktok'],por_que:'Muestran el espacio real.',como_aplicarlo:'Grabar el showroom.',encaje:'alto',senal:'Muchos ejemplos recientes',confianza:'media',ejemplos:[{titulo:'Ejemplo',url:'https://example.com/a'},{titulo:'malo',url:'javascript:alert(1)'}]}],hashtags:['#DepasLima','no-hashtag','#Arquitectura'],limitaciones:['Muestra pequeña']};
const PROPOSAL={analysis:{summary:'Tendencia de recorridos.',observations:['Reels cortos.'],limitations:['Sin cifras verificadas.']},strategy:{audience:'Personas en Lima interesadas en vivienda.',placements:['Reels'],test_plan:'Comparar dos ganchos.',budget_notes:'Sin cambios de inversión.'},creatives:[{id:'pieza-1',format:'reel',headline:'Recorre tu próximo hogar',body:'Conoce el showroom.',cta:'Agenda tu visita',caption:'Agenda tu visita al showroom #DepasLima #Lima #Arquitectura',design_notes:'Usar clips propios del showroom.',scenes:[{seconds:4,headline:'Entra',caption:'Entra',voiceover:'Bienvenido',visual:'Puerta',asset_id:null},{seconds:4,headline:'Sala',caption:'Sala',voiceover:'Tu sala',visual:'Sala',asset_id:null}]},{id:'pieza-2',format:'graphic',headline:'Tu hogar en Lima',body:'Visita el showroom.',cta:'Agenda tu visita',caption:'Visítanos #DepasLima #Lima #Hogar',design_notes:'Foto propia de la sala.',scenes:[]}],checks:['Revisado']};
async function rig({aiText=JSON.stringify(TREND),images=1}={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'orok-greta-')),store=new FirestoreProject(new MemoryFirestore());
 const recent=new Date(Date.now()-3*86400000).toISOString();
 await store.initialize({settings:{},leads:[{id:'l1',name:'Nombre Privado',phone:'51999999999',source:'Instagram',created_at:recent},{id:'l2',name:'Otro',source:'TikTok',created_at:recent}],units:[],quotes:[],separations:[]});
 await store.db.runTransaction(async tx=>{tx.set(store.ref.collection('lola_customer_memories').doc('m1'),{phone:'51999999999',name:'Nombre Privado',topics:[{topic:'showroom',at:recent},{topic:'acabados',at:recent}]});tx.set(store.ref.collection('lola_customer_memories').doc('m2'),{topics:[{topic:'showroom',at:recent}]});});
 const config={privateDir:dir},adsRows=[{id:'a1',ad_id:'ad1',name:'Anuncio showroom',provider:'meta',platforms:['instagram'],currency:'PEN',spend:300,impressions:20000,clicks:400,ctr:2,cpc:.75,cpm:15,platform_leads:20,crm_leads:10,cpl_crm:30,stages:{Cita:3,Venta:0},cost_per_appointment:100,lead_ids:['l1']}];
 const ads={dashboard:async()=>({rows:structuredClone(adsRows),totals:[{currency:'PEN',spend:300,impressions:20000,clicks:400,crm_leads:10,sales:0}]})};
 const creative=new CreativeCampaigns(store,config,ads),pipelines=new Pipelines(store,config,creative),calls=[];
 const assistant={raw:()=>({enabled:true,provider:'claude',model:'claude-test'}),key:()=>({key:'fake-lola-key',source:'servidor'}),count:async()=>{}};
 let reply=aiText;
 const fetcher=async(url,opts)=>{calls.push({url,opts});const u=new URL(url);
  if(u.hostname==='api.anthropic.com')return {ok:true,status:200,json:async()=>({content:[{type:'web_search_tool_result',content:[{url:'https://example.com/fuente',title:'Fuente'}]},{type:'text',text:reply}]})};
  if(u.hostname==='api.openai.com')return {ok:true,status:200,json:async()=>({data:Array.from({length:images},()=>({b64_json:PNG.toString('base64')}))})};
  throw Error('host no esperado '+url);};
 const greta=new Greta(store,config,{assistant,creative,ads,pipelines,fetcher});
 return {dir,store,creative,pipelines,greta,calls,setReply:t=>{reply=t;},read:()=>store.read()};
}
const call=(r,name,arg,user=G)=>r.greta.rpc(name,[arg],user,r.read);

test('G.R.E.T.A es solo de Gerencia y expone sus métodos al navegador',async()=>{
 const r=await rig();
 for(const m of GRETA_METHODS)await assert.rejects(call(r,m,{},V),/Gerencia/,m);
 const bridge=fs.readFileSync(path.join(__dirname,'..','src','cloudBridge.js'),'utf8'),app=fs.readFileSync(path.join(__dirname,'..','application.cjs'),'utf8');
 assert.match(bridge,/'gretaHoy','gretaAsk'/);assert.match(app,/GRETA_METHODS\.includes\(name\)/);
});
test('tendencias: JSON con fuentes reales, hashtags y ejemplos filtrados, y sin datos personales de L.O.L.A en el pedido',async()=>{
 const r=await rig();
 const doc=await call(r,'gretaTendencias',{nichos:['Departamentos en Lima','Inventado'],redes:['tiktok'],dias:30});
 assert.deepEqual(doc.filtros.nichos,['Departamentos en Lima']);assert.equal(doc.filtros.dias,30);
 assert.equal(doc.tendencias.length,1);assert.deepEqual(doc.tendencias[0].ejemplos.map(e=>e.url),['https://example.com/a']);
 assert.deepEqual(doc.hashtags,['#DepasLima','#Arquitectura']);assert.equal(doc.fuentes[0].url,'https://example.com/fuente');assert.equal(doc.web,true);
 assert.equal(doc.lola.temas[0].id,'showroom');assert.equal(doc.lola.temas[0].menciones,2);
 const body=r.calls[0].opts.body;for(const p of ['Nombre Privado','51999999999','fake-lola-key'])assert.equal(body.includes(p),false,p);
 assert.match(JSON.parse(body).tools[0].type,/web_search/);
 assert.equal((await call(r,'gretaTendenciasLista',{})).lecturas.length,1);
 await assert.rejects(call(r,'gretaTendencias',{nichos:['Inventado']}),/nicho/);
});
test('idea: crea una campaña en Estudio con la propuesta validada; si rompe las reglas de marca no se guarda la propuesta',async()=>{
 const r=await rig(),lec=await call(r,'gretaTendencias',{});
 r.setReply('```json\n'+JSON.stringify(PROPOSAL)+'\n```');
 const ok=await call(r,'gretaIdea',{lectura_id:lec.id,tendencia_id:'t1',request_id:crypto.randomUUID()});
 assert.equal(ok.propuesta,true);const c=await r.creative.get(ok.campaign_id);
 assert.equal(c.proposal.creatives.length,2);assert.match(c.brief.title,/G\.R\.E\.T\.A/);assert.notEqual(c.status,'approved');
 assert.ok(c.proposal.checks.some(x=>/G\.R\.E\.T\.A/.test(x)));
 const bad=structuredClone(PROPOSAL);bad.creatives[1].headline='Oferta: S/ 1000 de descuento';r.setReply(JSON.stringify(bad));
 const no=await call(r,'gretaIdea',{lectura_id:lec.id,tendencia_id:'t1',request_id:crypto.randomUUID()});
 assert.equal(no.propuesta,false);assert.match(no.aviso,/reglas de marca/);assert.equal((await r.creative.get(no.campaign_id)).proposal,null);
 await assert.rejects(call(r,'gretaIdea',{lectura_id:lec.id,tendencia_id:'nada'}),/no encontrada/);
});
test('imágenes: apagadas por defecto, la clave nunca vuelve al navegador, se guardan como recurso «referencial» y hay tope diario',async()=>{
 const r=await rig({images:2}),lec=await call(r,'gretaTendencias',{});r.setReply(JSON.stringify(PROPOSAL));
 const {campaign_id}=await call(r,'gretaIdea',{lectura_id:lec.id,tendencia_id:'t1',request_id:crypto.randomUUID()});
 await assert.rejects(call(r,'gretaImagen',{campaign_id,prompt:'Sala luminosa al atardecer'}),/apagada/);
 await call(r,'gretaConfigGuardar',{imagenes:{proveedor:'openai',habilitado:true,max_por_dia:3,apiKey:'sk-fake-image-secret'}});
 const pub=await call(r,'gretaConfig',{});assert.equal(JSON.stringify(pub).includes('sk-fake-image-secret'),false);assert.equal(pub.imagenes.clave,true);assert.equal(pub.imagenes.proveedor,'openai');
 const out=await call(r,'gretaImagen',{campaign_id,prompt:'Sala luminosa al atardecer',n:2,formato:'vertical'});
 assert.equal(out.imagenes.length,2);for(const m of out.imagenes)assert.match(m.label,/referencial/);
 const req=r.calls.find(c=>/images\/generations/.test(c.url));assert.equal(JSON.parse(req.opts.body).size,'1024x1536');assert.equal(req.opts.headers.Authorization,'Bearer sk-fake-image-secret');
 const c=await r.creative.get(campaign_id);assert.equal(c.media.filter(m=>/referencial/.test(m.label)).length,2);
 const base=out.imagenes[0].token;await call(r,'gretaImagen',{campaign_id,prompt:'Quitar el andamio del fondo',n:1,base_token:base}).catch(e=>assert.match(e.message,/máximo diario/));
 await assert.rejects(call(r,'gretaImagen',{campaign_id,prompt:'Otra imagen distinta',n:2}),/máximo diario/);
});
test('KPIs: salen de la atribución del CRM, con recomendación para decisión de Gerencia; la lectura no recibe identificadores de leads',async()=>{
 const r=await rig();
 const k=await call(r,'gretaKpis',{dias:30});
 assert.equal(k.periodo.dias,30);assert.equal(k.anuncios[0].leads_crm,10);assert.equal(k.anuncios[0].citas,3);assert.equal(k.anuncios[0].costo_cita,100);
 assert.equal('lead_ids' in k.anuncios[0],false);
 r.setReply('- Funciona el anuncio del showroom.\nDecisión sugerida para Gerencia: mantener.');
 const l=await call(r,'gretaKpisLectura',{dias:30});assert.match(l.lectura,/Decisión sugerida/);
 const body=r.calls.at(-1).opts.body;assert.equal(body.includes('l1'),false);
});
test('L.O.L.A: Hoy resume temas y orígenes sin datos personales y G.R.E.T.A le deja solo campañas aprobadas y vigentes',async()=>{
 const r=await rig();
 const h=await call(r,'gretaHoy',{});
 assert.equal(h.lola.leads_30d,2);assert.deepEqual(h.lola.por_origen.map(o=>o.origen).sort(),['Instagram','TikTok']);
 assert.equal(JSON.stringify(h).includes('Nombre Privado'),false);assert.equal(JSON.stringify(h).includes('51999999999'),false);
 assert.equal(paraLola(r.dir),null,'sin campañas aprobadas no hay nada que avisar');
 fs.writeFileSync(path.join(r.dir,'greta-para-lola.json'),JSON.stringify({campanas:[{titulo:'Vigente',hasta:'2999-01-01'},{titulo:'Vencida',hasta:'2000-01-01'}]}));
 assert.deepEqual(paraLola(r.dir).campanas_activas.map(c=>c.titulo),['Vigente']);
 const mem=fs.readFileSync(path.join(__dirname,'..','business','conversationMemory.js'),'utf8');assert.match(mem,/paraLola\(this\.s\.config\?\.privateDir\)/);
 assert.throws(()=>jsonDe('nada legible'),/legible/);
});
test('cola de publicación: los borradores solo los toma un flujo de n8n que los soporta; Instagram no acepta borrador',async()=>{
 const r=await rig(),id=crypto.randomUUID();
 const campaign={id,brief:{title:'Camp',channels:['instagram','tiktok','facebook'],formats:['reel'],from:'2026-10-01',to:'2999-10-14',objective:'Visitas',audience:'',notes:'',budget_notes:'',facts:[],factsVerified:false},revision:3,status:'approved',approval:{at:new Date().toISOString(),actor:'G'},proposal:{creatives:[{id:'pieza-1',format:'reel',headline:'H',caption:'Texto',scenes:[{seconds:3,voiceover:''}]}]},media:[],brand:{id:'infinity224',hashtags:['#Lima']},created_at:new Date().toISOString(),updated_at:new Date().toISOString()};
 await r.store.db.runTransaction(async tx=>{tx.set(r.creative.ref(id),campaign);});
 await r.creative.addMedia(id,{export:true,revision:3,request_id:crypto.randomUUID(),approved:true,mime:'image/png',label:'H',filename:'Proyecto-pieza-1-r3.png'},PNG,'G');
 r.pipelines.publishConfig({enabled:true,dry_run:true,channels:{instagram:true,tiktok:true,facebook:true}},'G');
 const base=ch=>({campaign_id:id,piece_id:'pieza-1',channel:ch,scheduled_at:new Date().toISOString(),request_id:crypto.randomUUID()});
 await assert.rejects(r.pipelines.requestPublication({...base('instagram'),modo:'borrador'},'G'),/Instagram/);
 await r.pipelines.requestPublication({...base('tiktok'),modo:'borrador'},'G');
 assert.equal((await r.pipelines.claimPublication()).job,null,'un flujo sin soporte de borradores no toma el borrador');
 const job=(await r.pipelines.claimPublication({soporta_borrador:true})).job;assert.equal(job.modo,'borrador');assert.equal(job.channel,'tiktok');
 await r.pipelines.requestPublication(base('facebook'),'G');assert.equal((await r.pipelines.claimPublication()).job.modo,'publicar');
 assert.equal((await call(r,'gretaHoy',{})).para_lola.campanas_activas[0].titulo,'Camp');
});
test('menú: Marketing es un módulo propio de Gerencia (Hoy, Crear, Publicar, Medir, Marca) y las pestañas antiguas llevan a su nuevo lugar',async()=>{
 const {navGroups,modulesFor,moduleOf,canonicalTab,MANAGER_ONLY}=await import('../src/navModel.mjs');
 assert.deepEqual(navGroups('Gerente','marketing').map(g=>g.label),['Hoy','Crear','Publicar','Medir','Marca']);
 assert.equal(navGroups('Gerente').some(g=>g.label==='Marketing'),false);
 assert.deepEqual(modulesFor('Vendedor').map(m=>m.id),['crm']);
 for(const t of ['mkHome','mkTrends','mkPublish','mkKpis'])assert.ok(MANAGER_ONLY.includes(t),t);
 for(const [a,b] of [['mkVariants','mkKpis'],['mkBudget','mkKpis'],['mkConnections','mkPublish'],['mkBrief','mkBrand'],['finanzas','marketing']]){assert.equal(canonicalTab(a),b);assert.equal(moduleOf(a),'marketing');}
 assert.equal(moduleOf('campaigns'),'marketing');assert.equal(moduleOf('kanban'),'crm');
 const ui=fs.readFileSync(path.join(__dirname,'..','src','Greta.jsx'),'utf8');for(const x of ['GretaHoy','GretaTendencias','GretaPublicar','GretaKpis','GretaConfig','GretaImagen','Descargar para editar','Enviar a borradores','Guardar en Business Suite'])assert.ok(ui.includes(x),x);
 const skill=fs.readFileSync(path.join(__dirname,'..','skills','greta-marketing','SKILL.md'),'utf8');assert.match(skill,/imagen referencial/);assert.match(skill,/Gerencia aprueba/);
});

test('asistente flotante: G.R.E.T.A conversa con historial y aparece solo en el módulo Marketing, como las otras IA asistenciales',async()=>{
 const r=await rig();r.setReply('- Publica un reel del showroom.');
 const out=await call(r,'gretaAsk',{mensajes:[{role:'user',text:'Hola'},{role:'assistant',text:'Hola, Martín'},{role:'user',text:'¿Qué publico hoy?'}],contexto:'Pantalla abierta: Hoy'});
 assert.match(out.respuesta,/reel/);assert.equal(out.proveedor,'claude');
 const body=JSON.parse(r.calls.at(-1).opts.body).messages[0].content;assert.match(body,/CONVERSACIÓN PREVIA/);assert.match(body,/CONSULTA:\n¿Qué publico hoy\?/);assert.match(body,/Pantalla abierta: Hoy/);
 await assert.rejects(call(r,'gretaAsk',{mensajes:[]}),/consulta/);
 const app=fs.readFileSync(path.join(__dirname,'..','src','App.jsx'),'utf8'),ui=fs.readFileSync(path.join(__dirname,'..','src','Greta.jsx'),'utf8');
 assert.match(app,/appModule==='marketing'&&<GretaAssistant/);assert.match(app,/appModule==='crm'&&<LolaAssistant/);
 assert.match(ui,/aria-label="Abrir el asistente G\.R\.E\.T\.A"/);assert.match(ui,/className="lola-panel no-print" role="dialog" aria-label="Asistente G\.R\.E\.T\.A"/);
});
