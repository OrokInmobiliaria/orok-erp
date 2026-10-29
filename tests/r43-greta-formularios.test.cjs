'use strict';
// R43 · Formularios instantáneos editables (Meta / TikTok) y armado automático de piezas con G.R.E.T.A.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {MemoryFirestore}=require('./memory-firestore.cjs'),{FirestoreProject}=require('../firestore-project.cjs');
const {CreativeCampaigns}=require('../business/creativeCampaigns.js'),{Greta,GRETA_METHODS}=require('../business/greta.js'),{validarFormulario,paraMeta,ficha}=require('../business/leadForms.js');
const {WhatsAppService}=require('../business/whatsappService'),{SocialInbox}=require('../business/socialInbox'),{Omnichannel,metaFormAnswers}=require('../business/omnichannel');
const PNG=Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),Buffer.alloc(40)]),MP4=Buffer.concat([Buffer.alloc(4),Buffer.from('ftypisom'),Buffer.alloc(40)]);
const G={name:'Martín Montezuma',role:'Gerente'},V={name:'Vendedor',role:'Vendedor'};
const BASE=()=>({nombre:'Infinity 224 · visitas',red:'meta',tipo:'mas_volumen',intro:{titulo:'Conoce Infinity 224',texto:'Déjanos tus datos y te contamos todo.'},contacto:['nombre','telefono'],
 preguntas:[{id:'tipologia',tipo:'opciones',etiqueta:'¿Qué departamento buscas?',crm:'interes',opciones:['1 dormitorio','2 dormitorios']},{id:'cuando',tipo:'opciones',etiqueta:'¿Para cuándo?',opciones:['Este año','Más adelante']}],
 privacidad:{url:'https://orok.com.pe/privacidad',texto:'Política de privacidad'},cierre:{titulo:'¡Gracias!',texto:'Te escribimos pronto.',boton:'whatsapp',boton_texto:'Escríbenos por WhatsApp',destino:'51 987 654 321'}});
async function rig(reply=''){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'orok-r43-')),store=new FirestoreProject(new MemoryFirestore());
 await store.initialize({settings:{},leads:[],units:[],quotes:[],separations:[]});
 const config={privateDir:dir},ads={dashboard:async()=>({rows:[],totals:[]})},creative=new CreativeCampaigns(store,config,ads),calls=[];let r=reply;
 const assistant={raw:()=>({enabled:true,provider:'claude',model:'claude-test'}),key:()=>({key:'fake-lola-key',source:'servidor'}),count:async()=>{}};
 const fetcher=async(url,opts)=>{calls.push({url,opts});const h=new URL(url).hostname;if(h==='api.anthropic.com')return {ok:true,status:200,json:async()=>({content:[{type:'text',text:typeof r==='function'?r(opts):r}]})};if(h==='api.openai.com')return {ok:true,status:200,json:async()=>({data:[{b64_json:PNG.toString('base64')}]})};throw Error('host '+url);};
 const greta=new Greta(store,config,{assistant,creative,ads,fetcher});
 return {dir,store,creative,greta,calls,setReply:x=>{r=x;},call:(n,a,u=G)=>greta.rpc(n,[a],u,()=>store.read())};
}

test('validación: textos editables con límites, reglas de marca, contacto mínimo y clave «interes» que el CRM ya lee',()=>{
 const f=validarFormulario(BASE());
 assert.equal(f.preguntas[0].id,'interes');assert.equal(f.cierre.destino,'https://wa.me/51987654321');
 for(const [patch,re] of [[{intro:{titulo:'Precio especial S/ 199 000'}},/precios|descuentos/],[{contacto:['nombre']},/teléfono o correo/],[{privacidad:{url:'http://inseguro.pe'}},/https/],
   [{preguntas:Array.from({length:6},(_,i)=>({etiqueta:'P'+i,tipo:'texto'}))},/5 preguntas/],[{preguntas:[{etiqueta:'¿Cuál?',opciones:['solo una']}]},/2 y 6/],[{intro:{titulo:'x'.repeat(61)}},/60/],[{cierre:{...BASE().cierre,destino:'123'}},/WhatsApp/]])
  assert.throws(()=>validarFormulario({...BASE(),...patch}),re);
 assert.throws(()=>validarFormulario({...BASE(),intro:{titulo:'Gran lanzamiento',texto:''}},{forbidden_words:['lanzamiento']}),/prohibida/);
 const m=paraMeta({...f,version:2});assert.equal(m.name,'Infinity 224 · visitas · v2');assert.deepEqual(m.questions.slice(0,2),[{type:'FULL_NAME'},{type:'PHONE'}]);
 assert.equal(m.questions[2].key,'interes');assert.equal(m.questions[2].options[1].value,'2 dormitorios');assert.equal(m.thank_you_page.website_url,'https://wa.me/51987654321');assert.equal(m.is_optimized_for_quality,false);
 assert.match(ficha({...f,version:1}),/BIENVENIDA[\s\S]*¿Qué departamento buscas\?[\s\S]*○ 2 dormitorios[\s\S]*wa\.me/);
});
test('ciclo: editar anula la aprobación; solo una versión aprobada se encola; en Meta no se edita, se crea nueva versión y la anterior se archiva',async()=>{
 const t=await rig();
 for(const m of GRETA_METHODS.filter(x=>/Formulario|Armar/.test(x)))await assert.rejects(t.call(m,{},V),/Gerencia/,m);
 let f=await t.call('gretaFormularioGuardar',BASE());assert.equal(f.estado,'borrador');assert.equal(f.revision,1);
 await assert.rejects(t.call('gretaFormularioCrear',{id:f.id,revision:1}),/Aprueba/);
 f=await t.call('gretaFormularioAprobar',{id:f.id,revision:1});assert.equal(f.estado,'aprobado');
 f=await t.call('gretaFormularioGuardar',{...BASE(),id:f.id,revision:1,intro:{titulo:'Visita el showroom',texto:''}});
 assert.equal(f.estado,'borrador');assert.equal(f.aprobacion,null);assert.equal(f.revision,2);assert.equal(f.intro.titulo,'Visita el showroom');
 await assert.rejects(t.call('gretaFormularioGuardar',{...BASE(),id:f.id,revision:1}),/cambió/);
 f=await t.call('gretaFormularioAprobar',{id:f.id,revision:2});
 const rid=crypto.randomUUID(),q=await t.call('gretaFormularioCrear',{id:f.id,revision:2,request_id:rid});assert.ok(q.job_id);
 assert.equal((await t.call('gretaFormularioCrear',{id:f.id,revision:2,request_id:rid})).duplicate,true);
 await assert.rejects(t.call('gretaFormularioGuardar',{...BASE(),id:f.id,revision:2}),/Nueva versión/);
 const {job}=await t.greta.forms.claim();assert.equal(job.tipo,'crear');assert.equal(job.payload.context_card.title,'Visita el showroom');assert.equal(job.archivar_anterior,null);
 assert.equal((await t.greta.forms.claim()).job,null,'un trabajo tomado no se entrega dos veces');
 await assert.rejects(t.greta.forms.complete({job_id:job.id,lease_token:'mal',external_id:'123456'}),/no autorizado/);
 await t.greta.forms.complete({job_id:job.id,lease_token:job.lease_token,external_id:'99887766'});
 f=await t.call('gretaFormulario',{id:f.id});assert.equal(f.estado,'creado');assert.equal(f.externo.form_id,'99887766');
 const v2=await t.call('gretaFormularioVersion',{id:f.id});assert.equal(v2.version,2);assert.equal(v2.estado,'borrador');assert.equal(v2.origen_id,f.id);
 await t.call('gretaFormularioGuardar',{...BASE(),id:v2.id,revision:1,cierre:{...BASE().cierre,titulo:'¡Te esperamos!'}});
 await t.call('gretaFormularioAprobar',{id:v2.id,revision:2});await t.call('gretaFormularioCrear',{id:v2.id,revision:2});
 const j2=(await t.greta.forms.claim()).job;assert.equal(j2.archivar_anterior,'99887766');assert.equal(j2.payload.name,'Infinity 224 · visitas · v2');
 await t.greta.forms.complete({job_id:j2.id,lease_token:j2.lease_token,external_id:'11223344'});
 assert.equal((await t.call('gretaFormulario',{id:f.id})).estado,'reemplazado');
 const arch=await t.call('gretaFormularioArchivar',{id:v2.id});assert.equal(arch.estado,'archivado');
 const ja=(await t.greta.forms.claim()).job;assert.equal(ja.tipo,'archivar');assert.equal(ja.external_id,'11223344');
});
test('Meta rechaza: el formulario vuelve a error sin aprobación; TikTok no se encola (ficha para copiar)',async()=>{
 const t=await rig();let f=await t.call('gretaFormularioGuardar',BASE());f=await t.call('gretaFormularioAprobar',{id:f.id,revision:1});await t.call('gretaFormularioCrear',{id:f.id,revision:1});
 const {job}=await t.greta.forms.claim();await t.greta.forms.fail({job_id:job.id,lease_token:job.lease_token,error:'(#100) Invalid parameter'});
 f=await t.call('gretaFormulario',{id:f.id});assert.equal(f.estado,'error');assert.equal(f.aprobacion,null);assert.match(f.error,/Invalid parameter/);
 const tk=await t.call('gretaFormularioGuardar',{...BASE(),red:'tiktok'});await t.call('gretaFormularioAprobar',{id:tk.id,revision:1});
 await assert.rejects(t.call('gretaFormularioCrear',{id:tk.id,revision:1}),/TikTok/);
});
test('G.R.E.T.A redacta el formulario con la política y el WhatsApp configurados; si falta un dato, devuelve el borrador para completar',async()=>{
 const t=await rig(JSON.stringify({nombre:'Showroom Infinity',tipo:'mayor_intencion',intro:{titulo:'Agenda tu visita',texto:'Te mostramos el proyecto.'},contacto:['nombre','telefono'],preguntas:[{id:'tipologia',tipo:'opciones',etiqueta:'¿Qué buscas?',opciones:['1 dormitorio','2 dormitorios'],crm:'interes'}],cierre:{titulo:'¡Listo!',texto:'Te escribimos hoy.',boton_texto:'Ir a WhatsApp'}}));
 const sin=await t.call('gretaFormularioRedactar',{});assert.equal(sin.ok,false);assert.match(sin.aviso,/Política de privacidad/);assert.equal(sin.borrador.intro.titulo,'Agenda tu visita');
 await t.call('gretaConfigGuardar',{formularios:{privacidad_url:'https://orok.com.pe/privacidad',whatsapp:'51987654321'}});
 await assert.rejects(t.call('gretaConfigGuardar',{formularios:{privacidad_url:'http://x.pe'}}),/https/);
 const ok=await t.call('gretaFormularioRedactar',{});assert.equal(ok.ok,true);assert.equal(ok.formulario.tipo,'mayor_intencion');assert.equal(ok.formulario.cierre.destino,'https://wa.me/51987654321');assert.equal(ok.formulario.historial[0].accion,'redactado por G.R.E.T.A');
 assert.equal((await t.call('gretaFormularios',{})).config.whatsapp,'51987654321');
});
test('CRM: un lead de formulario guarda de qué formulario vino y sus respuestas como comentario (una vez); KPIs por formulario',async()=>{
 const db=new MemoryFirestore(),store=new FirestoreProject(db),config={privateDir:__dirname};
 await store.initialize({settings:{projectName:'Infinity 224'},leads:[],units:[],quotes:[],separations:[]});
 const whatsapp=new WhatsAppService(store,config,{gateway:{setup:()=>({environment:'test',enabled:true,phoneNumberIds:['1234567890']}),assertRecipient:()=>{},send:async()=>'x'}});
 const social=new SocialInbox(store,config,{gateway:{setup:()=>({}),assertSend:()=>{},send:async()=>'x'}}),common=new Omnichannel(store,config,whatsapp,social);
 const id='1435802445308968';common.formRequester=async()=>({status:200,data:{id,created_time:new Date().toISOString(),field_data:[{name:'full_name',values:['Cliente Meta']},{name:'phone_number',values:['+51 955 318 057']},{name:'interes',values:['2 dormitorios']},{name:'cuando',values:['Este año']}]}});
 const payload={entry:[{id:'222222',changes:[{field:'leadgen',value:{leadgen_id:id,form_id:'99887766'}}]}]},s={accountId:'222222',environment:'test',testLeadFormIds:['99887766'],apiVersion:'v21.0',accessToken:'t'};
 await common.metaForms(payload,'messenger',s);await common.metaForms(payload,'messenger',s);
 const data=await store.read(),lead=data.leads[0];assert.equal(data.leads.length,1);
 assert.equal(lead.form_meta.form_id,'99887766');assert.equal(lead.interest||lead.unit_interest||'2 dormitorios','2 dormitorios');
 const c=lead.comment_history.filter(x=>/Respuestas del formulario/.test(x.text));assert.equal(c.length,1);assert.match(c[0].text,/Cuando: Este año/);assert.doesNotMatch(c[0].text,/955|Cliente Meta/);
 assert.deepEqual(metaFormAnswers([{name:'email',values:['a@b.pe']},{name:'Interés',values:['x']}]),['Interes: x']);
 const t=await rig();let f=await t.call('gretaFormularioGuardar',BASE());await t.call('gretaFormularioAprobar',{id:f.id,revision:1});await t.call('gretaFormularioCrear',{id:f.id,revision:1});
 const {job}=await t.greta.forms.claim();await t.greta.forms.complete({job_id:job.id,lease_token:job.lease_token,external_id:'99887766'});
 const k=await t.greta.forms.kpis({leads:[{...lead,status:'Cita',received_at:new Date().toISOString()},{id:'otro',status:'Lead Inicial',received_at:new Date().toISOString()}]},30);
 assert.equal(k[0].leads,1);assert.equal(k[0].nombre,'Infinity 224 · visitas');
});
test('armado automático: asigna recursos propios a cada escena, genera las imágenes que faltan como «referencial» y deja la campaña en revisión',async()=>{
 const t=await rig(),ok=r=>({ok:true,...r});
 const c0=await t.creative.create({request_id:crypto.randomUUID(),title:'Reel showroom',objective:'Visitas',channels:['instagram'],formats:['reel','carousel'],from:'2026-10-01',to:'2026-12-01'},'G');
 const add=(b,mime,label)=>t.creative.addMedia(c0.id,{request_id:crypto.randomUUID(),approved:true,mime,label},b,'G');
 const v=(await add(MP4,'video/mp4','Clip recorrido sala')).media,p=(await add(PNG,'image/png','Foto fachada')).media;
 let c=await t.creative.get(c0.id);
 const prop={analysis:{summary:'s',observations:[],limitations:[]},strategy:{audience:'a',placements:[],test_plan:'t',budget_notes:'b'},checks:[],creatives:[
  {id:'reel-1',format:'reel',headline:'Entra',body:'b',cta:'Agenda',caption:'c',design_notes:'d',scenes:[{seconds:3,headline:'Sala',caption:'s',voiceover:'v',visual:'Recorrido por la sala',asset_id:null},{seconds:3,headline:'Terraza',caption:'s',voiceover:'v',visual:'Terraza al atardecer',asset_id:null}]},
  {id:'car-1',format:'carousel',headline:'Fachada',body:'b',cta:'Agenda',caption:'c',design_notes:'d',scenes:[{seconds:3,headline:'Fachada',caption:'s',voiceover:'',visual:'Fachada',asset_id:null},{seconds:3,headline:'Vista',caption:'s',voiceover:'',visual:'Vista nocturna del edificio',asset_id:null}]}]};
 await t.creative.edit(c.id,{revision:c.revision,proposal:prop},'G');
 t.setReply(JSON.stringify({asignaciones:[{pieza:'reel-1',escena:0,asset_id:v.id},{pieza:'reel-1',escena:1,asset_id:'inventado',imagen:null},{pieza:'car-1',escena:0,asset_id:p.id},{pieza:'car-1',escena:1,asset_id:null,imagen:'Edificio contemporáneo de noche con luces cálidas'}]}));
 const r0=await t.call('gretaArmar',{campaign_id:c.id,generar_imagenes:true});
 assert.equal(r0.asignadas,3);assert.equal(r0.generadas,0);assert.equal(r0.sin_recurso,1);assert.match(r0.aviso,/apagada/,'con la generación apagada asigna lo propio y avisa');
 await t.call('gretaConfigGuardar',{imagenes:{habilitado:true,apiKey:'sk-fake-image-secret-123456'}});
 t.setReply(JSON.stringify({asignaciones:[{pieza:'car-1',escena:1,asset_id:null,imagen:'Edificio contemporáneo de noche con luces cálidas'}]}));
 const r=await t.call('gretaArmar',{campaign_id:c.id,generar_imagenes:true});
 assert.equal(r.generadas,1);assert.equal(r.asignadas,1);assert.equal(r.sin_recurso,0);
 c=await t.creative.get(c.id);const s=c.proposal.creatives.flatMap(x=>x.scenes.map(y=>y.asset_id));
 assert.equal(s[0],v.id);assert.equal(s[2],p.id);assert.ok(s[1],'el recurso inventado se reemplaza por uno propio');
 assert.match(c.media.find(m=>m.id===s[3]).label,/referencial/);assert.equal(c.status,'review');
 assert.equal((await t.call('gretaArmar',{campaign_id:c.id})).asignadas,0,'sin escenas vacías no rehace nada');
});
test('UI: Crear › Formularios con editor y vista previa; Armar en Estudio; flujo n8n inactivo con las acciones del CRM',async()=>{
 const {navGroups,moduleOf}=await import('../src/navModel.mjs');
 assert.deepEqual(navGroups('Gerente','marketing').find(g=>g.label==='Crear').items.map(i=>i[0]),['mkTrends','campaigns','mkForms']);assert.equal(moduleOf('mkForms'),'marketing');
 assert.equal(navGroups('Vendedor').some(g=>g.items.some(i=>i[0]==='mkForms')),false);
 const ui=fs.readFileSync(path.join(__dirname,'..','src','Greta.jsx'),'utf8'),app=fs.readFileSync(path.join(__dirname,'..','src','App.jsx'),'utf8'),studio=fs.readFileSync(path.join(__dirname,'..','src','CampaignStudio.jsx'),'utf8');
 for(const x of ['export function GretaFormularios','FormPreview','Nueva versión','Descargar ficha','Crear en Meta','export function GretaArmar','Formularios instantáneos'])assert.ok(ui.includes(x),x);
 assert.match(app,/activeTab==='mkForms'&&<GretaFormularios\/>/);assert.match(studio,/<GretaArmar campaign=\{campaign\}/);
 const wf=JSON.parse(fs.readFileSync(path.join(__dirname,'..','n8n','GRETA-R43-FORMULARIOS-META-ENSAYO-INACTIVO.json'),'utf8'));
 assert.equal(wf.active,false);const body=JSON.stringify(wf);for(const a of ['lead_form_claim','lead_form_complete','lead_form_fail','leadgen_forms','ARCHIVED'])assert.ok(body.includes(a),a);
 assert.doesNotMatch(body,/EAA[A-Za-z0-9]{20}|sk-[A-Za-z0-9]{20}/);
 const appSrv=fs.readFileSync(path.join(__dirname,'..','application.cjs'),'utf8');assert.match(appSrv,/lead_form_claim'\)return greta\.forms\.claim\(\)/);
});
