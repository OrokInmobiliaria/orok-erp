const {test,before,after}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {PGlite}=require('@electric-sql/pglite');
const {PostgresDocuments}=require('../postgres-documents.cjs'),{FirestoreProject}=require('../firestore-project.cjs');
const {CloudAuth}=require('../cloud-auth.cjs'),{MemoryFirestore}=require('./memory-firestore.cjs'),{application}=require('../application.cjs');
let pg,pool;
before(async()=>{pg=new PGlite();pool={query:(...a)=>pg.query(...a),connect:async()=>({query:(...a)=>pg.query(...a),release(){}})};await pg.exec(fs.readFileSync(path.join(__dirname,'../migrations/001-lola-postgres.sql'),'utf8'));});
after(async()=>pg.close());
async function setup(){
 await pool.query('TRUNCATE lola_unified.documents,lola_unified.firebase_outbox');
 const db=new PostgresDocuments(pool),store=new FirestoreProject(db);await store.initialize({settings:{projectName:'Ensayo'},leads:[],units:[],quotes:[]});
 const firebase=new MemoryFirestore(),mail=[],config={project:'infinity224',privateDir:fs.mkdtempSync(path.join(os.tmpdir(),'orok-sql-auth-')),sessionSecret:'s'.repeat(64),bootstrapCode:'b'.repeat(32)};
 const auth=new CloudAuth(firebase,{...config,sendApproval:async m=>mail.push(m)});
 let cookie=(await auth.execute('bootstrap',[{name:'Gerencia prueba',password:'Testing12345!',legacyPin:config.bootstrapCode}],'')).cookie;
 await auth.execute('requestApproval',[],cookie);cookie=(await auth.execute('verifyApproval',[mail.at(-1).code],cookie)).cookie;
 const authCache=auth.watch(),app=application({store,auth,cache:{read:()=>store.read()},authCache,config});
 const input={provider:'n8n',engine:'IA propia mediante n8n',webhookUrl:'https://n8n.example.test/webhook/ensayo',webhookSecret:'test-only-secret-'.repeat(3)};
 return {db,store,firebase,auth,authCache,app,config,cookie,input,close(){authCache.close();fs.rmSync(config.privateDir,{recursive:true,force:true});}};
}
test('approved Firebase manager saves private connector and SQL settings without widening SQL scope',async()=>{const t=await setup();try{
 const saved=await t.app.rpc('db.saveIntegrationCredentials',[t.input],t.cookie);assert.equal(saved.value.configured,true);
 const file=path.join(t.config.privateDir,'integracion-ia-webhooks.json');assert.equal(JSON.parse(fs.readFileSync(file)).webhookSecret,t.input.webhookSecret);
 await t.app.rpc('db.updateSettings',[{projectName:'Ensayo corregido'}],t.cookie);assert.equal((await t.store.read()).settings.projectName,'Ensayo corregido');
 await assert.rejects(t.db.get(t.auth.ref),/fuera del proyecto SQL/);
 assert.equal((await pool.query("SELECT count(*)::int n FROM lola_unified.documents WHERE path LIKE 'orok_auth/%'")).rows[0].n,0);
 }finally{t.close();}});
test('anonymous, pending approval and non-manager cannot save connector credentials',async()=>{const t=await setup();try{
 await assert.rejects(t.app.rpc('db.saveIntegrationCredentials',[t.input],''));
 await t.firebase.runTransaction(async tx=>{const v=(await tx.get(t.auth.ref)).data();v.users[0].approval.state='pending';tx.set(t.auth.ref,v);});
 await assert.rejects(t.app.rpc('db.saveIntegrationCredentials',[t.input],t.cookie));
 await t.firebase.runTransaction(async tx=>{const v=(await tx.get(t.auth.ref)).data();v.users[0].approval.state='approved';v.users[0].role='Vendedor';tx.set(t.auth.ref,v);});
 await assert.rejects(t.app.rpc('db.saveIntegrationCredentials',[t.input],t.cookie));
 assert.equal(fs.existsSync(path.join(t.config.privateDir,'integracion-ia-webhooks.json')),false);
 }finally{t.close();}});
test('failed fresh Firebase authorization aborts SQL mutation and preserves stored state',async()=>{const t=await setup();try{
 const before=await t.store.read();t.auth.ref.get=async()=>{throw Error('auth unavailable');};
 await assert.rejects(t.app.rpc('db.updateSettings',[{projectName:'Must not persist'}],t.cookie),/auth unavailable/);
 assert.deepEqual(await t.store.read(),before);
 }finally{t.close();}});
test('short n8n secret is rejected without replacing existing private credentials',async()=>{const t=await setup();try{
 await t.app.rpc('db.saveIntegrationCredentials',[t.input],t.cookie);const file=path.join(t.config.privateDir,'integracion-ia-webhooks.json'),before=fs.readFileSync(file,'utf8');
 await assert.rejects(t.app.rpc('db.saveIntegrationCredentials',[{...t.input,webhookSecret:'short'}],t.cookie),/24 caracteres/);
 assert.equal(fs.readFileSync(file,'utf8'),before);
 }finally{t.close();}});
