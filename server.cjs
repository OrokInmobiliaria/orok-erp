'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {config:readConfig}=require('./config.cjs');
const {application}=require('./application.cjs');
const {safeFetch}=require('./safe-network.cjs');
const {CloudAuth,SUPPORT}=require('./cloud-auth.cjs');
const {FirestoreProject,withoutUndefined}=require('./firestore-project.cjs');
const {sheetSync}=require('./sheet-sync.cjs');
const {backupScheduler}=require('./backup-scheduler.cjs');
const {slaScheduler}=require('./business/slaScheduler.cjs');
const {metaEvents}=require('./business/whatsappInbox');
const {metaEvents:socialMetaEvents,validSignature,readSetup:readSocialSetup}=require('./business/socialGateway');
const {ProyectosRegistro,proyectosHub,PROYECTOS_METHODS,COOKIE:PROYECTO_COOKIE}=require('./business/proyectos');
// R50 · Abre (o crea) el espacio de datos de otro proyecto en la misma base que el principal. PostgreSQL: mismas tablas, otro project_id;
// sin copia a Firestore (esa copia de respaldo sigue siendo solo del principal). Pruebas en memoria: el mismo almacén Firestore simulado.
async function abrirProyecto(principal,id,inicial){
 let store;
 if(principal.db?.pool){const {PostgresDocuments}=require('./postgres-documents.cjs'),{attachWatch}=require('./postgres-project.cjs');const db=new PostgresDocuments(principal.db.pool,{project:id,firebase:null,outbox:false});attachWatch(db);store=new FirestoreProject(db,{project:id});store.persistence='postgresql';store.close=async()=>{};}
 else store=new FirestoreProject(principal.db,{project:id});
 store.projectId=id;
 if(inicial)await store.initialize({...inicial,_postgres_migration_complete:true,_proyecto_creado:new Date().toISOString()});
 return store;
}
function whatsappConfig(config){
 try{return JSON.parse(fs.readFileSync(path.join(config.privateDir,'whatsapp-inbox.json'),'utf8'));}catch{return {};}
}
async function body(req,limit){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>limit)throw Error('La solicitud supera el tamaño permitido.');chunks.push(chunk);}return Buffer.concat(chunks);}
function lolaSecret(config){
 try{
  const file=path.join(config.privateDir,'integracion-ia-webhooks.json');
  const value=JSON.parse(fs.readFileSync(file,'utf8'));
  return String(value.webhookSecret||'');
 }catch{return '';}
}
function validSecret(expected,provided){
 if(expected.length<24||!provided)return false;
 const a=Buffer.from(expected),b=Buffer.from(String(provided));
 return a.length===b.length&&crypto.timingSafeEqual(a,b);
}
function createServer({config,store,auth,cache,authCache,supportMail,whatsappOptions={},socialOptions={},creativeOptions={}}){
 // R50 · Una aplicación por proyecto (mismos usuarios). El principal se arma como siempre; los demás al primer uso.
 const contexto=(st,ca,id)=>{
  const dir=id&&config.privateDir?path.join(config.privateDir,'proyectos',id):config.privateDir;
  const backups=dir?backupScheduler({store:st,privateDir:dir}):{run:async()=>({skipped:true}),start(){},stop(){}};
  const sla=slaScheduler({store:st});
  const syncer=sheetSync({store:st,cache:ca,onNewLeads:({added,source})=>backups.run({reason:source+' · '+added+' lead(s) nuevo(s)'})});
  const app=application({store:st,auth,cache:ca,authCache,config,syncer,historialIA:engine=>hubRef?hubRef.historial(id||config.project,engine):null,backups,sla,supportMail,whatsappOptions,socialOptions,creativeOptions});
  return {id:id||config.project,store:st,cache:ca,app,backups,sla,syncer};
 };
 let hubRef=null;
 const principal=contexto(store,cache,null),{backups,sla,syncer,app}=principal,hits=new Map();
 let escuchando=false;
 const proyectos=proyectosHub({principal,registro:new ProyectosRegistro(store,{principalId:config.project||'infinity224',principalNombre:'Infinity 224'}),abrir:(id,inicial)=>abrirProyecto(store,id,inicial),contexto,onNuevo:c=>{if(escuchando){c.syncer.start();c.sla.start();}}});
 hubRef=proyectos;
 const server=http.createServer(async(req,res)=>{
  const json=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','SAMEORIGIN');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; frame-src 'self' https://drive.google.com; connect-src 'self'; media-src 'self' blob:; object-src 'self'; base-uri 'self'; frame-ancestors 'self'");
  if(!config.testing)res.setHeader('Strict-Transport-Security','max-age=31536000');
  try{
   const url=new URL(req.url,'http://localhost'),cookie=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(config.cookieName+'='))?.slice(config.cookieName.length+1)||'';
   if(url.pathname==='/api/health'){
    const probe=withoutUndefined({events:[{reason:undefined,kept:false}]});
    return json(200,{ok:true,version:require('./package.json').version,revision:'erp-pwa-r36',persistence_guard:!('reason'in probe.events[0])&&probe.events[0].kept===false,messaging_storage:store.persistence||'test',firebase_projection_pending:!!store.db.lastProjectionError});
   }
   if(['/api/integrations/instagram','/api/integrations/messenger'].includes(url.pathname)){
    const channel=url.pathname.split('/').at(-1),setup=readSocialSetup(config.privateDir)[channel];
    if(!setup?.enabled||!setup.accountId||!setup.appSecret||!setup.verifyToken)return json(503,{error:'Canal social pendiente de configuración.'});
    if(req.method==='GET'){
     if(url.searchParams.get('hub.mode')!=='subscribe'||!validSecret(setup.verifyToken,url.searchParams.get('hub.verify_token')))return json(403,{error:'Verificación social no autorizada.'});
     const challenge=url.searchParams.get('hub.challenge')||'';if(!/^\d{1,100}$/.test(challenge))return json(400,{error:'Verificación no válida.'});res.writeHead(200,{'Content-Type':'text/plain','Cache-Control':'no-store'});return res.end(challenge);
    }
    if(req.method!=='POST')return json(405,{error:'Método no disponible.'});
    if(!String(req.headers['content-type']||'').startsWith('application/json'))return json(415,{error:'Formato no válido.'});
    const raw=await body(req,256*1024);if(!validSignature(raw,req.headers['x-hub-signature-256'],setup.appSecret))return json(401,{error:'Firma social no válida.'});
    const parsed=JSON.parse(raw.toString()),events=socialMetaEvents(parsed,channel,setup.accountId);for(const item of events)await app.ingestLola({action:'social_message',...item});const forms=await app.omnichannel.metaForms(parsed,channel,setup);return json(200,{ok:true,events:events.length,forms:forms.length});
   }
   if(url.pathname==='/api/integrations/whatsapp'){
    const setup=whatsappConfig(config);
    // Installation alone never activates a webhook or changes LeadCenter.
    if(setup.enabled!==true||!Array.isArray(setup.phoneNumberIds)||!setup.phoneNumberIds.length||String(setup.appSecret||'').length<24||String(setup.verifyToken||'').length<24)return json(503,{error:'WhatsApp observador todavía no está habilitado.'});
    if(req.method==='GET'){
     if(url.searchParams.get('hub.mode')!=='subscribe'||!validSecret(setup.verifyToken,url.searchParams.get('hub.verify_token')))return json(403,{error:'Verificación WhatsApp no autorizada.'});
     const challenge=url.searchParams.get('hub.challenge')||'';if(!/^\d{1,100}$/.test(challenge))return json(400,{error:'Verificación no válida.'});
     res.writeHead(200,{'Content-Type':'text/plain','Cache-Control':'no-store'});return res.end(challenge);
    }
    if(req.method!=='POST')return json(405,{error:'Método no disponible.'});
    if(!String(req.headers['content-type']||'').startsWith('application/json'))return json(415,{error:'Formato no válido.'});
    const raw=await body(req,256*1024),expected='sha256='+crypto.createHmac('sha256',setup.appSecret).update(raw).digest('hex');
    if(!validSecret(expected,req.headers['x-hub-signature-256']))return json(401,{error:'Firma WhatsApp no válida.'});
    const events=metaEvents(JSON.parse(raw.toString('utf8')));
    if(events.some(event=>!setup.phoneNumberIds.map(String).includes(event.business_phone_id)))return json(403,{error:'Número WhatsApp no autorizado.'});
    for(const item of events)await (item.kind==='message'?app.whatsapp.ingest(item):app.whatsapp.status(item));
    return json(200,{ok:true,events:events.length,processing_async:true});
   }
   if(url.pathname==='/api/integrations/lola'){
    if(req.method!=='POST')return json(405,{error:'Método no disponible.'});
    if(!String(req.headers['content-type']||'').startsWith('application/json'))return json(415,{error:'Formato no válido.'});
    const expected=lolaSecret(config),provided=req.headers['x-orok-webhook-secret'];
    if(!validSecret(expected,provided))return json(401,{error:'Integración no autorizada.'});
    const key=req.socket.remoteAddress+':lola',now=Date.now();let rate=hits.get(key);
    if(!rate||rate.until<now){rate={count:0,until:now+60000};hits.set(key,rate);}
    if(++rate.count>300)return json(429,{error:'Demasiadas solicitudes. Espera un minuto.'});
    const payload=JSON.parse((await body(req,req.headers['x-orok-payload']==='audio'?12*1024*1024:256*1024)).toString('utf8'));
    // Authenticated, zero-write probe for n8n. It deliberately returns before
    // opening the CRM store so a connection test cannot create, move or annotate
    // a lead and cannot be delayed by a Firestore transaction.
    // R53 · Trabajos de carpetas de Drive de todos los proyectos (no solo del principal).
    if(/^project_drive_/.test(String(payload?.action||'')))return json(200,{value:await proyectos.drive(payload)});
    if(payload?.action==='connection_check')return json(200,{value:{ok:true,connection:true,version:require('./package.json').version,writes:0}});
    return json(200,{value:await (payload?.project?(await proyectos.porNombre(payload.project)).app:app).ingestLola(payload)});
   }
   // R44 · Conector del ERP para Claude (MCP remoto + OAuth 2.1 con PKCE). Apagado hasta que Gerencia lo activa.
   if(url.pathname.startsWith('/.well-known/oauth-')||url.pathname==='/mcp'||url.pathname.startsWith('/mcp/')){
    const mcp=app.mcp,cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization, Content-Type, Mcp-Protocol-Version, Mcp-Session-Id','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Expose-Headers':'WWW-Authenticate'};
    const send=(status,value,extra={})=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...cors,...extra});res.end(value===null?'':JSON.stringify(value));};
    const oerr=e=>send(e.status||400,{error:e.code||'invalid_request',error_description:e.message});
    if(req.method==='OPTIONS')return send(204,null);
    if(url.pathname.startsWith('/.well-known/oauth-protected-resource'))return send(200,mcp.resourceMetadata());
    if(url.pathname.startsWith('/.well-known/oauth-authorization-server'))return send(200,mcp.serverMetadata());
    if(url.pathname==='/mcp/oauth/register'&&req.method==='POST'){try{return send(201,await mcp.register(JSON.parse((await body(req,16384)).toString('utf8')||'{}')));}catch(e){return oerr(e);}}
    if(url.pathname==='/mcp/oauth/token'&&req.method==='POST'){try{const raw=(await body(req,16384)).toString('utf8'),form=String(req.headers['content-type']||'').includes('json')?new URLSearchParams(JSON.parse(raw||'{}')):new URLSearchParams(raw);return send(200,await mcp.token(form));}catch(e){return oerr(e);}}
    if(url.pathname==='/mcp/oauth/revoke'&&req.method==='POST'){const raw=(await body(req,16384)).toString('utf8');await mcp.revokeToken(new URLSearchParams(raw).get('token'));return send(200,{});}
    if(url.pathname==='/mcp/oauth/autorizar.js'){res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store'});return res.end(fs.readFileSync(path.join(__dirname,'public-mcp','autorizar.js')));}
    if(url.pathname==='/mcp/oauth/authorize'&&req.method==='GET'){
     const r=await mcp.authorizeRequest(url.searchParams);if(r.redirect){res.writeHead(302,{Location:r.redirect,'Cache-Control':'no-store'});return res.end();}
     const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
     res.writeHead(r.error?400:200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
     return res.end('<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Conectar Claude · ERP ÖRÖK</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:Outfit,system-ui,sans-serif;background:radial-gradient(circle at 20% 20%,#f2c38f,transparent 40%),radial-gradient(circle at 80% 70%,#d98aa0,transparent 40%),#F3EBE5;color:#35190f}main{max-width:440px;margin:16px;padding:28px;border-radius:24px;background:linear-gradient(135deg,rgba(255,255,255,.72),rgba(255,255,255,.42));backdrop-filter:blur(26px) saturate(175%);border:1px solid rgba(255,255,255,.62);box-shadow:0 20px 60px rgba(70,35,20,.15)}h1{color:#85442A;margin:0 0 6px;font-size:30px}p{line-height:1.5}button,a.b{font:inherit;font-weight:700;border:0;border-radius:14px;padding:12px 18px;cursor:pointer;margin:6px 6px 0 0;text-decoration:none;display:inline-block}.p{background:#85442A;color:#fff}.s{background:rgba(255,255,255,.8);color:#35190f}</style></head><body><main id="mcp" data-solicitud="'+esc(r.solicitud||'')+'" data-cliente="'+esc(r.cliente||'')+'"><h1>ÖRÖK</h1><h2>Conectar '+esc(r.cliente||'Claude')+'</h2>'+(r.error?'<p role="alert">'+esc(r.error)+'</p></main></body></html>':'<p id="msg" role="status">Cargando…</p><div id="acciones" hidden><button id="permitir" class="p">Permitir</button><button id="cancelar" class="s">Cancelar</button></div><div id="login" hidden><a class="b s" href="/" target="_blank" rel="noopener">Abrir el ERP para iniciar sesión</a><button id="revisar" class="p">Ya inicié sesión</button></div></main><script src="/mcp/oauth/autorizar.js"></script></body></html>'));
    }
    if(['/mcp/oauth/sesion','/mcp/oauth/decidir'].includes(url.pathname)){
     if(req.method!=='POST'||req.headers.origin!==config.origin||req.headers['x-orok-request']!=='1')return json(403,{error:'Solicitud no autorizada.'});
     let user;try{user=await authCache.require(cookie);}catch{return json(401,{error:'No hay una sesión del ERP abierta en este navegador.'});}
     if(url.pathname==='/mcp/oauth/sesion')return json(200,{value:{name:user.name,role:user.role}});
     const p=JSON.parse((await body(req,4096)).toString('utf8')||'{}'),s=auth.issueFor?await auth.issueFor(user.id):null;
     return json(200,{value:await mcp.decide(String(p.solicitud||''),{...user,version:s?.version||null},p.permitir===true)});
    }
    if(url.pathname==='/mcp'){
     const tok=await mcp.bearer(req.headers.authorization);
     if(!tok)return send(401,{error:'invalid_token',error_description:'Conecta Claude al ERP para continuar.'},{'WWW-Authenticate':'Bearer resource_metadata="'+mcp.origin()+'/.well-known/oauth-protected-resource/mcp"'});
     if(req.method!=='POST')return send(405,{error:'Usa POST.'},{Allow:'POST'});
     let msg;try{msg=JSON.parse((await body(req,1024*1024)).toString('utf8'));}catch{return send(400,{jsonrpc:'2.0',id:null,error:{code:-32700,message:'JSON no válido.'}});}
     const out=await mcp.handle(msg,tok);if(!out){res.writeHead(202,cors);return res.end();}
     return send(200,out);
    }
    return send(404,{error:'Ruta no disponible.'});
   }
   if(url.pathname.startsWith('/api/')){
    if(req.method!=='POST'||req.headers.origin!==config.origin||req.headers['x-orok-request']!=='1')return json(403,{error:'Solicitud no autorizada.'});
    const ctx=await proyectos.resolver(req.headers.cookie),papp=ctx.app;
    const key=req.socket.remoteAddress+':'+(url.pathname.includes('auth.')?'auth':'rpc'),now=Date.now();let rate=hits.get(key);if(!rate||rate.until<now){rate={count:0,until:now+60000};hits.set(key,rate);}if(++rate.count>(key.endsWith('auth')?120:3000))return json(429,{error:'Demasiadas solicitudes. Espera un minuto.'});if(hits.size>10000)for(const [k,v]of hits)if(v.until<now)hits.delete(k);
    // R36 · Registro del ERP instalado (PC/Mac/celular): código de instalación que solo existe en el servidor.
    const deviceCookie=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(app.enrollment.cookieName()+'='))?.slice(app.enrollment.cookieName().length+1)||'';
    if(url.pathname==='/api/instalacion/estado')return json(200,{value:{registrado:!!app.enrollment.valido(deviceCookie)}});
    if(url.pathname==='/api/instalacion/registrar'){
     const k=req.socket.remoteAddress+':instalar';let rl=hits.get(k);if(!rl||rl.until<now){rl={count:0,until:now+15*60000};hits.set(k,rl);}if(++rl.count>8)return json(429,{error:'Demasiados intentos. Espera 15 minutos.'});
     const p=JSON.parse((await body(req,4096)).toString('utf8')||'{}');const r=app.enrollment.registrar(p,req.socket.remoteAddress);
     res.setHeader('Set-Cookie',app.enrollment.cookieName()+'='+r.token+'; Path=/; HttpOnly; SameSite=Strict; Max-Age='+(730*86400)+(config.testing?'':'; Secure'));
     return json(200,{value:{ok:true,equipo:r.nombre}});
    }
    if(req.headers['x-orok-instalada']==='1'&&!app.enrollment.valido(deviceCookie))return json(403,{error:'Este equipo no está registrado o fue revocado. Ingresa el código de instalación que te dé Gerencia.',code:'device_not_enrolled'});
    if(url.pathname==='/api/creative-media'){
     const user=await authCache.require(cookie);if(user.role!=='Gerente')return json(403,{error:'Requiere Gerencia.'});
     const campaign=String(req.headers['x-campaign-id']||''),input={request_id:String(req.headers['x-request-id']||''),filename:decodeURIComponent(String(req.headers['x-file-name']||'')),label:decodeURIComponent(String(req.headers['x-media-label']||'')),approved:req.headers['x-media-approved']==='1',export:req.headers['x-media-export']==='1',revision:Number(req.headers['x-campaign-revision']),mime:String(req.headers['content-type']||'').split(';')[0]};
     return json(200,{value:await papp.creative.addMedia(campaign,input,await body(req,40*1024*1024),user.name)});
    }
    if(url.pathname==='/api/whatsapp-attachment'){
     const user=await authCache.require(cookie),leadId=String(req.headers['x-lead-id']||''),requestId=String(req.headers['x-request-id']||''),mime=String(req.headers['content-type']||'').split(';')[0],filename=decodeURIComponent(String(req.headers['x-file-name']||'')),text=decodeURIComponent(String(req.headers['x-file-caption']||''));
     return json(200,{value:await papp.whatsapp.send(leadId,{request_id:requestId,text},user.name,{attachment:{bytes:await body(req,16*1024*1024),mime,filename}})});
    }
    if(url.pathname==='/api/whatsapp-audio'){
     const user=await authCache.require(cookie),leadId=String(req.headers['x-lead-id']||''),requestId=String(req.headers['x-request-id']||''),mime=require('./business/whatsappGateway').audioMime(req.headers['content-type']);
     if(!['audio/aac','audio/amr','audio/mpeg','audio/mp4','audio/ogg','audio/webm'].includes(mime))return json(415,{error:'Formato de audio no compatible.'});
     return json(200,{value:await papp.whatsapp.send(leadId,{request_id:requestId},user.name,{audio:{bytes:await body(req,16*1024*1024),mime}})});
    }
    if(url.pathname==='/api/upload'){await authCache.require(cookie,true);const name=decodeURIComponent(String(req.headers['x-file-name']||''));const value=await papp.library.add(name,await body(req,100*1024*1024));return json(200,{value});}
    if(url.pathname==='/api/separation-document'){
     const input={separationId:decodeURIComponent(String(req.headers['x-separation-id']||'')),kind:decodeURIComponent(String(req.headers['x-document-kind']||'')),fileName:decodeURIComponent(String(req.headers['x-file-name']||'')),mimeType:String(req.headers['content-type']||'').split(';')[0].trim()};
     return json(200,{value:await papp.uploadSeparationDocument(input,await body(req,15*1024*1024),cookie)});
    }
    if(!url.pathname.startsWith('/api/rpc/'))return json(404,{error:'Ruta no disponible.'});
    if(!String(req.headers['content-type']).startsWith('application/json'))return json(415,{error:'Formato no válido.'});
    const payload=JSON.parse((await body(req,8*1024*1024)).toString('utf8'));if(!Array.isArray(payload.args))throw Error('Argumentos no válidos.');
    const method=url.pathname.slice('/api/rpc/'.length),pname=method.split('.')[1];
    // R50 · Proyectos: listar, crear, elegir (cookie del navegador) y cambiar de etapa. Lo demás va a la aplicación del proyecto elegido.
    if(method.startsWith('db.')&&PROYECTOS_METHODS.includes(pname)){
     const user=await authCache.require(cookie),out=await proyectos.rpc(pname,payload.args,user,req.headers.cookie);
     if(out.usar)res.setHeader('Set-Cookie',PROYECTO_COOKIE+'='+encodeURIComponent(out.usar)+'; Path=/; HttpOnly; SameSite=Strict; Max-Age='+(365*86400)+(config.testing?'':'; Secure'));
     return json(200,{value:out.value??null});
    }
    const result=await papp.rpc(method,payload.args,cookie);
    if('cookie'in result)res.setHeader('Set-Cookie',config.cookieName+'='+result.cookie+'; Path=/; HttpOnly; SameSite=Strict; Max-Age='+(result.cookie?43200:0)+(config.testing?'':'; Secure'));
    return json(200,{value:result.value??null});
   }
   if(!['GET','HEAD'].includes(req.method))return json(405,{error:'Método no disponible.'});
   if(url.pathname.startsWith('/campaign-media/')){
    const user=await authCache.require(cookie);if(user.role!=='Gerente')return json(403,{error:'Requiere Gerencia.'});
    const token=url.pathname.slice('/campaign-media/'.length),media=await (await proyectos.resolver(req.headers.cookie)).app.creative.mediaFile(token),size=fs.statSync(media.path).size;
    const headers={'Content-Type':media.mime,'Cache-Control':'private, no-store','Accept-Ranges':'bytes','Content-Disposition':url.searchParams.has('download')?'attachment; filename="Recurso-'+token+'"':'inline'};
    if(req.headers.range){const m=/^bytes=(\d+)-(\d*)$/.exec(String(req.headers.range));const start=m?Number(m[1]):NaN,end=m&&m[2]?Math.min(Number(m[2]),size-1):size-1;if(!Number.isSafeInteger(start)||start<0||start>=size||!Number.isSafeInteger(end)||end<start){res.writeHead(416,{'Content-Range':'bytes */'+size});return res.end();}res.writeHead(206,{...headers,'Content-Length':end-start+1,'Content-Range':`bytes ${start}-${end}/${size}`});if(req.method==='HEAD')return res.end();return fs.createReadStream(media.path,{start,end}).on('error',()=>res.destroy()).pipe(res);}
    res.writeHead(200,{...headers,'Content-Length':size});if(req.method==='HEAD')return res.end();return fs.createReadStream(media.path).on('error',()=>res.destroy()).pipe(res);
   }
   if(url.pathname.startsWith('/whatsapp-media/')){
    await authCache.require(cookie);const parts=url.pathname.split('/');if(parts.length!==4)return json(400,{error:'Archivo no válido.'});
    const pctx=await proyectos.resolver(req.headers.cookie),media=await pctx.app.whatsapp.media(decodeURIComponent(parts[2]),parts[3],await pctx.cache.read());
    if(!/^(audio\/(aac|amr|mpeg|mp4|ogg)|image\/(jpeg|png|webp)|video\/mp4|application\/pdf)$/.test(media.mime))return json(415,{error:'Este adjunto no se puede abrir en el panel.'});
    res.writeHead(200,{'Content-Type':media.mime,'Content-Length':media.bytes.length,'Cache-Control':'private, no-store','Content-Disposition':media.mime.startsWith('audio/')?'inline':"attachment; filename*=UTF-8''"+encodeURIComponent(media.filename||'Archivo')});return res.end(req.method==='HEAD'?undefined:media.bytes);
   }
   let target;
   if(url.pathname==='/evaluador'||url.pathname.startsWith('/evaluador/')){
    // R33b · Evaluador Inmobiliario M.O.R.A: solo Gerencia, servido fuera de dist/ y sin caché.
    const user=await authCache.require(cookie);if(user.role!=='Gerente')return json(403,{error:'El Evaluador Inmobiliario requiere Gerencia.'});
    const files={'/evaluador':'index.html','/evaluador/':'index.html','/evaluador/app.js':'app.js','/evaluador/jspdf.umd.min.js':'jspdf.umd.min.js','/evaluador/exceljs.min.js':'exceljs.min.js'},name=files[url.pathname];
    if(!name)return json(404,{error:'Archivo no disponible.'});
    const file=path.join(__dirname,'evaluador',name),type=name.endsWith('.html')?'text/html; charset=utf-8':'text/javascript; charset=utf-8';
    res.writeHead(200,{'Content-Type':type,'Cache-Control':'private, no-store'});if(req.method==='HEAD')return res.end();return res.end(fs.readFileSync(file));
   }
   if(url.pathname==='/contabilidad'||url.pathname.startsWith('/contabilidad/')){
    // R34 · ERP · Contabilidad y Finanzas con D.I.A.V.A, servido fuera de dist/ y sin caché.
    // R38 · Cualquier usuario con sesión carga la pantalla; los datos los decide el servidor (Gerencia: todo; áreas habilitadas: sus órdenes y aprobaciones).
    await authCache.require(cookie);
    const files={'/contabilidad':'index.html','/contabilidad/':'index.html','/contabilidad/app.js':'app.js','/contabilidad/jspdf.umd.min.js':'jspdf.umd.min.js','/contabilidad/exceljs.min.js':'exceljs.min.js'},name=files[url.pathname];
    if(!name)return json(404,{error:'Archivo no disponible.'});
    const file=path.join(__dirname,'contabilidad',name),type=name.endsWith('.html')?'text/html; charset=utf-8':'text/javascript; charset=utf-8';
    res.writeHead(200,{'Content-Type':type,'Cache-Control':'private, no-store'});if(req.method==='HEAD')return res.end();return res.end(fs.readFileSync(file));
   }
   if(url.pathname.startsWith('/files/')){await authCache.require(cookie);target=(await proyectos.resolver(req.headers.cookie)).app.library.file(url.pathname.slice(7));res.setHeader('Cache-Control','private, no-store');if(url.searchParams.has('download'))res.setHeader('Content-Disposition','attachment; filename="'+(path.extname(target)==='.csv'?'Cotizaciones.csv':'Documento'+path.extname(target))+'"');}
   else {const dist=path.join(__dirname,'dist'),relative=decodeURIComponent(url.pathname);target=path.resolve(dist,'.'+relative);if(!target.startsWith(dist+path.sep)&&target!==dist)return json(403,{error:'Ruta no válida.'});if(!fs.existsSync(target)||fs.statSync(target).isDirectory()){if(path.extname(relative))return json(404,{error:'Archivo no disponible.'});target=path.join(dist,'index.html');}res.setHeader('Cache-Control',['index.html','sw.js','manifest.webmanifest','version.json'].includes(path.basename(target))?'no-cache':'public,max-age=3600');if(path.basename(target)==='sw.js')res.setHeader('Service-Worker-Allowed','/');}
   if(!fs.existsSync(target))return json(404,{error:'Archivo no disponible.'});const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.pdf':'application/pdf','.csv':'text/csv; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.webmanifest':'application/manifest+json; charset=utf-8','.json':'application/json; charset=utf-8'}[path.extname(target)]||'application/octet-stream';res.setHeader('Content-Type',mime);res.setHeader('Content-Length',fs.statSync(target).size);if(req.method==='HEAD')return res.end();fs.createReadStream(target).on('error',()=>res.destroy()).pipe(res);
  }catch(error){if(res.headersSent)return res.destroy();const message=String(error.message||'No se pudo completar la solicitud.');const safe=/credential|private.?key|service.?account|invalid_grant|ENOENT|PERMISSION_DENIED|GOOGLE_APPLICATION/i.test(message)?'No se pudo completar la operación del servidor.':message;json(/Inicia sesión|validación de|contraseña temporal/.test(safe)?401:400,{error:safe});}
 });
 if(!config.testing&&(!config.rehearsal||config.rehearsalAutomation))server.on('listening',()=>{
  // Background work is delayed and lease-protected.  A web-server restart must
  // make the login available immediately, never trigger a full CRM migration.
  escuchando=true;for(const c of proyectos.ctxs.values()){c.syncer.start();c.sla.start();}app.resguardo?.start(); // R45 · resguardo externo (solo si Gerencia lo activó)
 });
 server.on('close',()=>{for(const c of proyectos.ctxs.values()){c.syncer.stop();c.sla.stop();c.backups.stop();}app.resguardo?.stop();proyectos.cerrar();});
 server.proyectos=proyectos; // R52 · acceso de pruebas y diagnóstico
 return server;
}
async function start(){
 const config=readConfig();if(!config.credential)throw Error('Configura GOOGLE_APPLICATION_CREDENTIALS fuera del sitio público.');
 const key=JSON.parse(fs.readFileSync(config.credential,'utf8'));if(key.project_id!=='crm-infinity224'||key.type!=='service_account')throw Error('Credencial de proyecto incorrecta.');
 const {initializeApp,cert}=require('firebase-admin/app'),{getFirestore}=require('firebase-admin/firestore');
 const firebase=initializeApp({credential:cert(key),projectId:key.project_id}),db=getFirestore(firebase);
 // Optional audit fields must not cause an entire CRM action to fail when an
 // older client or lifecycle path omits one of them.  Firestore drops only
 // `undefined` values; explicit values such as false, 0, an empty string or
 // null are preserved.  This is a final server-side guard in addition to the
 // normalisation performed by the business layer before every write.
 db.settings({ignoreUndefinedProperties:true});
 global.fetch=safeFetch(global.fetch);
 const supportMail=require('./cloud-approval-mail.cjs').createCloudApprovalMail(config);
 const store=await require('./postgres-project.cjs').createPostgresProject(config,db),auth=new CloudAuth(db,{...config,project:authProject(config),sendApproval:supportMail.send});
 const cache=store.watch(),authCache=auth.watch(),server=createServer({config,store,auth,cache,authCache,supportMail});
 server.once('close',()=>{cache.close();store.close().catch(()=>{});});
 server.listen(config.port,config.host||'127.0.0.1',()=>console.log('CRM web iniciado.'));
 return {server,store,auth};
}
if(require.main===module)start().catch(()=>{console.error('No se pudo iniciar el CRM. Revisa la configuración privada del servidor.');process.exitCode=1;});
function authProject(config){return config.isolatedR41?'infinity224_r41_ensayo_20261028':config.project;}
module.exports={createServer,start,body,authProject,abrirProyecto};
