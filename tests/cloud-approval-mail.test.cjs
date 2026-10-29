'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createCloudApprovalMail,safeSmtpDiagnostic}=require('../cloud-approval-mail.cjs');
const {CloudAuth}=require('../cloud-auth.cjs');
const {MemoryFirestore}=require('./memory-firestore.cjs');
const SUPPORT='soportetecnologico@orok.com.pe';
function fixture(){
 const config={privateDir:fs.mkdtempSync(path.join(os.tmpdir(),'orok-smtp-')),sessionSecret:'s'.repeat(64),project:'infinity224_pruebas_955318057'};
 const transports=[],messages=[];let failure=null,accepted=[SUPPORT];
 const factory=options=>{const t={options,closed:false,verify:async()=>{if(failure)throw failure;},sendMail:async message=>{messages.push(message);if(failure)throw failure;return {accepted};},close(){this.closed=true;}};transports.push(t);return t;};
 const mail=createCloudApprovalMail(config,factory),input={host:'smtp.gmail.com',port:465,user:'mmontezuma@orok.com.pe',password:'abcd efgh ijkl mnop'};
 return {config,mail,input,messages,transports,fail:e=>failure=e,accept:a=>accepted=a,close:()=>fs.rmSync(config.privateDir,{recursive:true,force:true})};
}
test('fresh server reports mail unconfigured and cannot send a challenge',async()=>{const t=fixture();try{assert.equal(t.mail.publicSettings().configured,false);await assert.rejects(t.mail.send({}),/Configura/);assert.equal(t.transports.length,0);}finally{t.close();}});
test('Google sender is the real mailbox; only the support alias receives the code and the password stays encrypted',async()=>{
 const t=fixture();try{const settings=await t.mail.configure(t.input);assert.equal(settings.configured,true);assert.equal(settings.user,t.input.user);assert.equal(settings.recipient,SUPPORT);assert.equal('password'in settings,false);
  const filename=path.join(t.config.privateDir,'support-smtp.enc.json'),stored=fs.readFileSync(filename,'utf8');assert.ok(!stored.includes('abcdefghijklmnop'));assert.ok(!stored.includes(t.input.user));
  if(process.platform!=='win32')assert.equal(fs.statSync(filename).mode&0o777,0o600);
  await t.mail.send({name:'Gerencia\nInjected',role:'Gerente',code:'12345678',requestId:'request-1'});
  const options=t.transports.at(-1).options,m=t.messages.at(-1);assert.equal(options.auth.pass,'abcdefghijklmnop');assert.equal(options.secure,true);assert.equal(options.requireTLS,true);assert.equal(options.tls.rejectUnauthorized,true);assert.equal(options.logger,false);assert.equal(options.debug,false);assert.equal(m.from,t.input.user);assert.equal(m.to,SUPPORT);assert.ok(!/[\r\n]/.test(m.subject));assert.ok(!m.text.includes('abcdefghijklmnop'));assert.ok(t.transports.every(x=>x.closed));
  assert.throws(()=>createCloudApprovalMail({...t.config,project:'another-project'},()=>{}).publicSettings(),/conexión privada/);
  assert.throws(()=>createCloudApprovalMail({...t.config,sessionSecret:'x'.repeat(64)},()=>{}).publicSettings(),/conexión privada/);
 }finally{t.close();}
});
test('failed verification leaves prior credentials intact and no raw provider error is exposed',async()=>{const t=fixture();try{await t.mail.configure(t.input);const previous=fs.readFileSync(path.join(t.config.privateDir,'support-smtp.enc.json'),'utf8');t.fail(Object.assign(Error('secret-pass-provider-output'),{code:'EAUTH',responseCode:535,response:'535-5.7.8 secret-pass-provider-output\r\n535 5.7.8 User and password not accepted'}));await assert.rejects(t.mail.configure({...t.input,password:'replacementkeyab'}),e=>/rechazó/.test(e.message)&&e.message.includes('EAUTH / SMTP 535 / 5.7.8')&&!e.message.includes('secret-pass'));assert.equal(fs.readFileSync(path.join(t.config.privateDir,'support-smtp.enc.json'),'utf8'),previous);assert.equal(t.messages.length,0);}finally{t.close();}});
test('changing SMTP destinations cannot reuse the saved password and only secure ports are accepted',async()=>{const t=fixture();try{await t.mail.configure(t.input);await t.mail.configure({...t.input,password:''});await assert.rejects(t.mail.configure({...t.input,host:'smtp.office365.com',password:''}),/Ingresa la clave/);await assert.rejects(t.mail.configure({...t.input,port:25}),/puerto seguro/);await assert.rejects(t.mail.configure({...t.input,host:'127.0.0.1'}),/servidor de correo/);}finally{t.close();}});
test('Gmail accepts a complete grouped app key and refuses other credentials before contacting the provider',async()=>{
 const t=fixture();try{
  for(const password of ['LOLA CRM Ensayo','Testing12345!','12345678'])await assert.rejects(t.mail.configure({...t.input,password}),/clave completa de 16 caracteres/);
  assert.equal(t.transports.length,0);
  await t.mail.configure({...t.input,password:'abcd\u00A0efgh\nijkl\u200Bmnop '});
  assert.equal(t.transports.at(-1).options.auth.pass,'abcdefghijklmnop');
 }finally{t.close();}
});
test('SMTP diagnostics expose only allowlisted error codes and numeric provider status',()=>{
 assert.equal(safeSmtpDiagnostic({code:'EAUTH',responseCode:534,response:'534-5.7.9 App password required; private@example.test secret'}),'EAUTH / SMTP 534 / 5.7.9');
 assert.equal(safeSmtpDiagnostic({code:'EAUTH',response:'535 5.7.8 secret-private-key'}),'EAUTH / SMTP 535 / 5.7.8');
 assert.equal(safeSmtpDiagnostic({code:'secret-private-key',responseCode:'535',response:'private@example.test secret-private-key'}),'SMTP_ERROR');
 assert.equal(safeSmtpDiagnostic({code:'EAUTH',response:'secret 5.7.8 not an SMTP status'}),'EAUTH');
});
test('SMTP rejection keeps the account blocked; an accepted delivery still requires the real approval code',async()=>{
 const t=fixture(),db=new MemoryFirestore(),auth=new CloudAuth(db,{...t.config,bootstrapCode:'b'.repeat(32),sendApproval:t.mail.send});
 try{await t.mail.configure(t.input);let result=await auth.execute('bootstrap',[{name:'Gerencia prueba',password:'Testing12345!',legacyPin:'b'.repeat(32)}],'');let cookie=result.cookie;
  t.accept([]);await assert.rejects(auth.execute('requestApproval',[],cookie),/No se pudo entregar/);await assert.rejects(auth.require(cookie),/validación/);
  let state=(await auth.ref.get()).data();assert.equal(state.users[0].approval.sent,false);
  await db.runTransaction(async tx=>{const d=(await tx.get(auth.ref)).data();d.users[0].approval.requestedAt=0;tx.set(auth.ref,d);});
  t.accept([SUPPORT]);result=await auth.execute('requestApproval',[],cookie);cookie=result.cookie;await assert.rejects(auth.require(cookie),/validación/);
  const code=/Código de aprobación: (\d{8})/.exec(t.messages.at(-1).text)[1];await auth.execute('verifyApproval',[code],cookie);assert.equal((await auth.require(cookie)).role,'Gerente');
 }finally{t.close();}
});
test('only the authenticated manager can configure mail before approval; unauthenticated users and vendors cannot',async()=>{
 const t=fixture(),db=new MemoryFirestore(),auth=new CloudAuth(db,{...t.config,bootstrapCode:'b'.repeat(32),sendApproval:t.mail.send});
 const {FirestoreProject}=require('../firestore-project.cjs'),{application}=require('../application.cjs');
 const store=new FirestoreProject(db,{project:t.config.project});await store.initialize({settings:{},leads:[],units:[],quotes:[],separations:[]});
 const cache=store.watch(),authCache=auth.watch();
 const app=application({store,auth,cache,authCache,config:t.config,syncer:{},supportMail:t.mail});
 try{
  await assert.rejects(app.rpc('auth.mailSettings',[],''),/Inicia sesión/);
  await assert.rejects(app.rpc('auth.configureMail',[t.input],''),/Inicia sesión/);
  let r=await auth.execute('bootstrap',[{name:'Gerencia prueba',password:'Testing12345!',legacyPin:'b'.repeat(32)}],'');let cookie=r.cookie;
  assert.equal((await app.rpc('auth.mailSettings',[],cookie)).value.configured,false);
  const configured=await app.rpc('auth.configureMail',[t.input],cookie);assert.equal(configured.value.configured,true);assert.ok(configured.cookie);assert.equal('password'in configured.value,false);
  await assert.rejects(auth.require(cookie),/validación/);
  await auth.execute('requestApproval',[],cookie);const code=/Código de aprobación: (\d{8})/.exec(t.messages.at(-1).text)[1];await auth.execute('verifyApproval',[code],cookie);
  r=await auth.execute('createUser',[{name:'Vendedor prueba',role:'Vendedor',password:'Temporary123!'}],cookie);
  const login=await auth.execute('login',[{id:r.value.user.id,password:'Temporary123!'}],'');
  await assert.rejects(app.rpc('auth.mailSettings',[],login.cookie),/Gerencia/);
  await assert.rejects(app.rpc('auth.configureMail',[t.input],login.cookie),/Gerencia/);
 }finally{cache.close();authCache.close();t.close();}
});
