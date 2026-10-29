'use strict';
// R44 · Conector del ERP para Claude: OAuth 2.1 con PKCE de punta a punta, herramientas con los permisos de la persona,
// rotación y robo de tokens de renovación, corte inmediato al apagar y redirecciones solo hacia Claude o equipos locales.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {MemoryFirestore}=require('./memory-firestore.cjs'),{FirestoreProject}=require('../firestore-project.cjs'),{CloudAuth}=require('../cloud-auth.cjs'),{createServer}=require('../server.cjs');
const {redirectOk,pkceOk,TOOLS}=require('../business/mcpConnector');
const REDIRECT='https://claude.ai/api/mcp/auth_callback';
async function setup(){
 const db=new MemoryFirestore(),store=new FirestoreProject(db),mail=[];
 await store.initialize({settings:{projectName:'Infinity 224'},leads:[{id:'l1',lead_number:'LD-1',name:'Ana Prueba',phone:'51987654321',status:'Contactado',source:'Meta · formulario',received_at:new Date().toISOString(),comment_history:[]},{id:'l2',name:'Luis Antiguo',phone:'51911111111',status:'Cita',received_at:'2025-01-01T00:00:00Z',comment_history:[]}],units:[]});
 const config={testing:true,origin:'http://127.0.0.1',privateDir:fs.mkdtempSync(path.join(os.tmpdir(),'orok-mcp-')),sessionSecret:'s'.repeat(64),bootstrapCode:'b'.repeat(32),cookieName:'orok_dev_session'};
 const auth=new CloudAuth(db,{...config,sendApproval:async v=>mail.push(v)}),cache=store.watch(),authCache=auth.watch(),server=createServer({config,store,auth,cache,authCache});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;config.origin=base;
 let cookie='';const call=async(m,args=[],ck=cookie)=>{const r=await fetch(base+'/api/rpc/'+m,{method:'POST',headers:{Origin:base,'X-Orok-Request':'1','Content-Type':'application/json',Cookie:ck}, body:JSON.stringify({args})});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];const j=await r.json();if(r.status!==200)throw Error(j.error);return j.value;};
 const gerente=await call('auth.bootstrap',[{name:'Martín Montezuma',password:'LocalTesting123!',legacyPin:config.bootstrapCode}]);await call('auth.requestApproval');await call('auth.verifyApproval',[mail.at(-1).code]);
 const gcookie=cookie;
 const post=(p,body,headers={})=>fetch(base+p,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:typeof body==='string'?body:JSON.stringify(body)});
 const same=(p,body,ck=gcookie)=>post(p,body,{Origin:base,'X-Orok-Request':'1',Cookie:ck});
 const close=()=>{server.close();cache.close?.();authCache.close?.();};
 return {base,config,call,gcookie,gerente,post,same,close,store};
}
const verifier=()=>crypto.randomBytes(40).toString('base64url'),challenge=v=>crypto.createHash('sha256').update(v).digest('base64url');
async function conectar(t,ck=t.gcookie){
 const reg=await (await t.post('/mcp/oauth/register',{client_name:'Claude',redirect_uris:[REDIRECT]})).json();
 const v=verifier(),q=new URLSearchParams({response_type:'code',client_id:reg.client_id,redirect_uri:REDIRECT,code_challenge:challenge(v),code_challenge_method:'S256',state:'xyz',resource:t.base+'/mcp'});
 const page=await fetch(t.base+'/mcp/oauth/authorize?'+q);const html=await page.text();assert.equal(page.status,200,html);
 const sol=/data-solicitud="([^"]+)"/.exec(html)[1];assert.match(html,/autorizar\.js/);assert.doesNotMatch(html,/<script>[^<]/,'sin script en línea (CSP)');
 const who=await t.same('/mcp/oauth/sesion',{},ck);const w=await who.json();if(who.status!==200)return {error:w.error};
 const dec=await (await t.same('/mcp/oauth/decidir',{solicitud:sol,permitir:true},ck)).json();if(dec.error)return {error:dec.error};
 const u=new URL(dec.value.redirect);assert.equal(u.origin+u.pathname,REDIRECT);assert.equal(u.searchParams.get('state'),'xyz');
 const tok=await (await t.post('/mcp/oauth/token',new URLSearchParams({grant_type:'authorization_code',code:u.searchParams.get('code'),redirect_uri:REDIRECT,client_id:reg.client_id,code_verifier:v}).toString(),{'Content-Type':'application/x-www-form-urlencoded'})).json();
 return {reg,tok,code:u.searchParams.get('code'),v,who:w.value};
}
const rpc=(t,token,method,params={},id=1)=>t.post('/mcp',{jsonrpc:'2.0',id,method,params},{Authorization:'Bearer '+token,Accept:'application/json, text/event-stream'}).then(async r=>({status:r.status,headers:r.headers,body:r.status===202?null:await r.json()}));

test('apagado por defecto: sin token responde 401 con metadatos; el registro se rechaza hasta que Gerencia lo activa',async()=>{
 const t=await setup();try{
  const r=await fetch(t.base+'/mcp',{method:'POST',body:'{}'});assert.equal(r.status,401);assert.match(r.headers.get('www-authenticate'),/resource_metadata="http:\/\/127\.0\.0\.1:\d+\/\.well-known\/oauth-protected-resource\/mcp"/);
  const pr=await (await fetch(t.base+'/.well-known/oauth-protected-resource/mcp')).json();assert.equal(pr.resource,t.base+'/mcp');assert.deepEqual(pr.authorization_servers,[t.base]);
  const as=await (await fetch(t.base+'/.well-known/oauth-authorization-server')).json();assert.deepEqual(as.code_challenge_methods_supported,['S256']);assert.equal(as.registration_endpoint,t.base+'/mcp/oauth/register');
  const reg=await t.post('/mcp/oauth/register',{redirect_uris:[REDIRECT]});assert.equal(reg.status,403);
 }finally{t.close();}
});
test('flujo completo: Gerencia autoriza, Claude usa las herramientas con sus permisos y el comentario queda firmado',async()=>{
 const t=await setup();try{
  const cfg=await t.call('db.mcpConfigGuardar',[{enabled:true}],t.gcookie);assert.equal(cfg.activo,true);assert.ok(cfg.url.endsWith('/mcp'));
  const c=await conectar(t);assert.equal(c.who.name,'Martín Montezuma');assert.ok(c.tok.access_token&&c.tok.refresh_token);assert.equal(c.tok.token_type,'Bearer');
  const reuse=await t.post('/mcp/oauth/token',new URLSearchParams({grant_type:'authorization_code',code:c.code,redirect_uri:REDIRECT,client_id:c.reg.client_id,code_verifier:c.v}).toString(),{'Content-Type':'application/x-www-form-urlencoded'});assert.equal(reuse.status,400,'un código no se usa dos veces');
  const init=await rpc(t,c.tok.access_token,'initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'test',version:'1'}});
  assert.equal(init.body.result.protocolVersion,'2025-06-18');assert.equal(init.body.result.serverInfo.name,'erp-orok');assert.match(init.body.result.instructions,/Martín Montezuma/);
  assert.equal((await t.post('/mcp',{jsonrpc:'2.0',method:'notifications/initialized'},{Authorization:'Bearer '+c.tok.access_token})).status,202);
  const list=await rpc(t,c.tok.access_token,'tools/list');const names=list.body.result.tools.map(x=>x.name);
  for(const n of ['resumen_del_dia','buscar_leads','ver_lead','agregar_comentario_lead','ordenes_por_aprobar','marketing_hoy','marketing_formularios'])assert.ok(names.includes(n),n);
  assert.equal(names.some(n=>/aprobar_orden|borrar|pagar/.test(n)),false,'no hay herramientas para aprobar, borrar ni pagar');
  for(const x of list.body.result.tools){assert.equal(x.inputSchema.type,'object');assert.equal(x.annotations.destructiveHint,false);}
  const b=await rpc(t,c.tok.access_token,'tools/call',{name:'buscar_leads',arguments:{texto:'ana'}});
  assert.equal(b.body.result.isError,false);assert.equal(b.body.result.structuredContent.total,1);assert.equal(b.body.result.structuredContent.leads[0].nombre,'Ana Prueba');
  const rec=await rpc(t,c.tok.access_token,'tools/call',{name:'buscar_leads',arguments:{ultimos_dias:30}});assert.equal(rec.body.result.structuredContent.total,1);
  const com=await rpc(t,c.tok.access_token,'tools/call',{name:'agregar_comentario_lead',arguments:{id:'l1',texto:'Llamar mañana a las 10.'}});assert.equal(com.body.result.isError,false);
  const lead=(await t.store.read()).leads.find(l=>l.id==='l1'),last=lead.comment_history.at(-1);assert.equal(last.author,'Martín Montezuma');assert.match(last.text,/Llamar mañana[\s\S]*vía Claude/);assert.equal(lead.status,'Contactado','no cambia la etapa');
  const res=await rpc(t,c.tok.access_token,'tools/call',{name:'resumen_del_dia',arguments:{}});assert.equal(res.body.result.structuredContent.crm.leads_total,2);
  const bad=await rpc(t,c.tok.access_token,'tools/call',{name:'ver_lead',arguments:{id:'no-existe'}});assert.equal(bad.body.result.isError,true);assert.match(bad.body.result.content[0].text,/no encontrado/);
  assert.equal((await rpc(t,c.tok.access_token,'metodo/raro')).body.error.code,-32601);
  const con=await t.call('db.mcpConexiones',[],t.gcookie);assert.equal(con.conexiones.length,1);assert.ok(con.actividad.some(a=>a.accion==='agregar_comentario_lead'&&a.ok));
  assert.equal(JSON.stringify(con).includes(c.tok.access_token),false,'los tokens nunca vuelven a la pantalla');
 }finally{t.close();}
});
test('tokens: la renovación rota; reutilizar uno viejo corta toda la conexión; cortar desde el ERP o apagar invalida al instante',async()=>{
 const t=await setup();try{
  await t.call('db.mcpConfigGuardar',[{enabled:true}],t.gcookie);const c=await conectar(t);
  const ref=async rt=>t.post('/mcp/oauth/token',new URLSearchParams({grant_type:'refresh_token',refresh_token:rt,client_id:c.reg.client_id}).toString(),{'Content-Type':'application/x-www-form-urlencoded'});
  const r1=await (await ref(c.tok.refresh_token)).json();assert.ok(r1.access_token);assert.notEqual(r1.refresh_token,c.tok.refresh_token);
  assert.equal((await rpc(t,r1.access_token,'ping')).status,200);
  assert.equal((await ref(c.tok.refresh_token)).status,400,'el token viejo ya no sirve');
  assert.equal((await rpc(t,r1.access_token,'ping')).status,401,'y su reutilización corta toda la conexión');
  const c2=await conectar(t);const con=await t.call('db.mcpConexiones',[],t.gcookie);await t.call('db.mcpRevocar',[con.conexiones[0].id],t.gcookie);
  assert.equal((await rpc(t,c2.tok.access_token,'ping')).status,401);
  const c3=await conectar(t);assert.equal((await rpc(t,c3.tok.access_token,'ping')).status,200);
  await t.call('db.mcpConfigGuardar',[{enabled:false}],t.gcookie);assert.equal((await rpc(t,c3.tok.access_token,'ping')).status,401,'apagar corta todo');
 }finally{t.close();}
});
test('seguridad de la autorización: redirecciones solo a Claude o equipos locales, PKCE obligatorio, sin sesión no hay código, otro origen no decide',async()=>{
 const t=await setup();try{
  await t.call('db.mcpConfigGuardar',[{enabled:true}],t.gcookie);
  for(const u of ['https://evil.example/cb','https://claude.ai.evil.com/cb','javascript:alert(1)','http://192.168.1.5/cb'])assert.equal((await t.post('/mcp/oauth/register',{redirect_uris:[u]})).status,400,u);
  for(const u of [REDIRECT,'https://claude.com/api/mcp/auth_callback','http://localhost:33418/callback','http://127.0.0.1:5000/cb'])assert.equal(redirectOk(u,{}),true,u);
  const reg=await (await t.post('/mcp/oauth/register',{redirect_uris:[REDIRECT]})).json();
  const sinPkce=await fetch(t.base+'/mcp/oauth/authorize?'+new URLSearchParams({response_type:'code',client_id:reg.client_id,redirect_uri:REDIRECT,state:'s'}),{redirect:'manual'});
  assert.equal(sinPkce.status,302);assert.match(sinPkce.headers.get('location'),/error=invalid_request/);
  const otro=await fetch(t.base+'/mcp/oauth/authorize?'+new URLSearchParams({response_type:'code',client_id:reg.client_id,redirect_uri:'https://claude.ai/otra',code_challenge:challenge(verifier()),code_challenge_method:'S256'}));assert.equal(otro.status,400);
  const page=await (await fetch(t.base+'/mcp/oauth/authorize?'+new URLSearchParams({response_type:'code',client_id:reg.client_id,redirect_uri:REDIRECT,code_challenge:challenge(verifier()),code_challenge_method:'S256'}))).text(),sol=/data-solicitud="([^"]+)"/.exec(page)[1];
  assert.equal((await t.same('/mcp/oauth/decidir',{solicitud:sol,permitir:true},'')).status,401,'sin sesión del ERP no hay código');
  assert.equal((await t.post('/mcp/oauth/decidir',{solicitud:sol,permitir:true},{Origin:'https://evil.example','X-Orok-Request':'1',Cookie:t.gcookie})).status,403,'otro sitio no puede decidir');
  const no=await (await t.same('/mcp/oauth/decidir',{solicitud:sol,permitir:false})).json();assert.match(no.value.redirect,/error=access_denied/);
  assert.equal(pkceOk('a'.repeat(43),challenge('b'.repeat(43))),false);
 }finally{t.close();}
});
test('roles: un vendedor no puede conectar mientras Gerencia no lo habilite y no hay herramientas para aprobar, borrar ni pagar',async()=>{
 const {McpConnector}=require('../business/mcpConnector');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'orok-mcp-r-'));fs.writeFileSync(path.join(dir,'mcp.json'),JSON.stringify({enabled:true,roles:['Gerente']}));
 const store=new FirestoreProject(new MemoryFirestore());await store.initialize({settings:{},leads:[],units:[]});
 const m=new McpConnector(store,{privateDir:dir,origin:'https://erp.test'},{rpc:async()=>({value:[]}),issueSession:async()=>({cookie:'c',user:{name:'V',role:'Vendedor'}})});
 const reg=await m.register({redirect_uris:[REDIRECT]}),q=new URLSearchParams({response_type:'code',client_id:reg.client_id,redirect_uri:REDIRECT,code_challenge:challenge(verifier()),code_challenge_method:'S256'}),r=await m.authorizeRequest(q);
 await assert.rejects(m.decide(r.solicitud,{id:'v1',name:'Antonio',role:'Vendedor'},true),/rol \(Vendedor\)/);
 assert.equal(TOOLS.filter(x=>!x.ro).every(x=>!/aprobar|borrar|pagar/.test(x.name)),true);
});
test('UI: Configuración › Conexiones de IA para activar, ver conectados, cortar y ver la actividad',()=>{
 const ui=fs.readFileSync(path.join(__dirname,'..','src','ConexionesIA.jsx'),'utf8'),app=fs.readFileSync(path.join(__dirname,'..','src','App.jsx'),'utf8'),br=fs.readFileSync(path.join(__dirname,'..','src','cloudBridge.js'),'utf8');
 for(const x of ['Conexiones de IA','Agregar conector personalizado','Cortar conexión','Actividad reciente','mcpConfigGuardar'])assert.ok(ui.includes(x),x);
 assert.match(app,/activeTab==='settings'&&currentUser\.role==='Gerente'&&<ConexionesIA\/>/);assert.match(br,/'mcpConexiones','mcpRevocar','mcpConfigGuardar'/);
});
