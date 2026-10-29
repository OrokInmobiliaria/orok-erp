'use strict';
// R45 · L.O.L.A Operaciones: resguardo externo cifrado. La llave privada nunca queda en el servidor; el respaldo se abre solo con ella,
// trae todo lo necesario (CRM, accesos, archivos) con conteos de control; Drive recibe una copia diaria nueva y una «última hora» que se actualiza;
// la verificación detecta una copia alterada; nada se ejecuta sin que Gerencia lo active.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const {MemoryFirestore}=require('./memory-firestore.cjs'),{FirestoreProject}=require('../firestore-project.cjs');
const {Resguardo,OPS_METHODS,descifrar,conteos}=require('../business/resguardo');
const G={name:'Martín Montezuma',role:'Gerente'},V={name:'Antonio',role:'Vendedor'};
function fakeDrive(){const files=new Map(),calls=[];return {files,calls,
 async subir(file,name,id=null){const bytes=fs.readFileSync(file),fid=id||'f'+(files.size+1);calls.push({accion:id?'actualizar':'crear',name,fid});files.set(fid,{name:id?files.get(id).name:name,bytes});return {id:fid,name:files.get(fid).name};},
 async huella(id){return crypto.createHash('sha256').update(files.get(id).bytes).digest('hex');},async ping(){return 'Respaldos ERP';}};}
async function rig(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'orok-resg-')),store=new FirestoreProject(new MemoryFirestore());
 await store.initialize({settings:{projectName:'Infinity 224'},leads:[{id:'l1',name:'Cliente Secreto',phone:'51987654321',status:'Cita',comment_history:[{id:'c1',text:'Visita el sábado',at:'2026-10-20T10:00:00Z',author:'Antonio'},{id:'c2',text:'Confirmó',at:'2026-10-21T10:00:00Z',author:'Antonio'}]},{id:'l2',name:'Otra',status:'Contactado',comment_history:[]}],units:[{id:'u1'}],quotes:[],separations:[]});
 fs.mkdirSync(path.join(dir,'campaign-media'),{recursive:true});fs.writeFileSync(path.join(dir,'campaign-media','foto.png'),'PNGDATA');fs.writeFileSync(path.join(dir,'clara.json'),'{"x":1}');
 fs.mkdirSync(path.join(dir,'backups'));fs.writeFileSync(path.join(dir,'backups','viejo.json.gz'),'no-incluir');
 let t=Date.parse('2026-10-29T15:00:00Z');const drive=fakeDrive();
 const r=new Resguardo(store,{privateDir:dir},{authSnapshot:async()=>({users:[{id:'u',name:'Martín',hash:'HASH-SECRETO'}]}),drive,clock:()=>t});
 return {dir,store,r,drive,adv:h=>{t+=h*3600000;}};
}
test('nada corre sin Gerencia, sin llave ni sin activarlo',async()=>{
 const t=await rig();
 for(const m of OPS_METHODS)await assert.rejects(t.r.rpc(m,[{}],V),/Gerencia/);
 await assert.rejects(t.r.rpc('opsConfigGuardar',[{enabled:true}],G),/llave/);
 await assert.rejects(t.r.crear(),/llave/);
 const e=await t.r.estado();assert.equal(e.activo,false);assert.equal(e.atrasado,false);assert.equal(e.llave,null);
});
test('llave: la privada se entrega una vez y no queda en el servidor; el respaldo cifrado se abre solo con ella y trae todo',async()=>{
 const t=await rig(),k=await t.r.rpc('opsGenerarLlaves',[{}],G);
 assert.match(k.llave_privada,/BEGIN PRIVATE KEY/);assert.ok(k.huella);
 const enDisco=fs.readdirSync(t.dir).map(f=>{try{return fs.readFileSync(path.join(t.dir,f),'utf8');}catch{return '';}}).join('');
 assert.equal(enDisco.includes('PRIVATE KEY'),false,'la llave privada no se guarda en el servidor');
 await assert.rejects(t.r.rpc('opsGenerarLlaves',[{}],G),/Ya existe/);
 await t.r.rpc('opsConfigGuardar',[{enabled:true,drive_folder_id:'https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz12345'}],G);
 const reg=await t.r.rpc('opsResguardar',[],G);
 assert.equal(reg.estado,'externo',JSON.stringify(reg));assert.deepEqual(reg.conteos.leads,2);assert.equal(reg.conteos.comentarios,2);assert.ok(reg.conteos.kanban_firma);
 for(const p of ['crm.json.gz','accesos.json','privado.tar'])assert.ok(reg.partes.includes(p),p);
 const file=path.join(t.dir,'resguardo',reg.archivo_local),bytes=fs.readFileSync(file);
 for(const s of ['Cliente Secreto','51987654321','HASH-SECRETO','PNGDATA'])assert.equal(bytes.includes(Buffer.from(s)),false,'cifrado: '+s);
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'orok-rest-'));
 await assert.rejects(descifrar(file,path.join(out,'x'),crypto.generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}}).privateKey),'otra llave no lo abre');
 const keyFile=path.join(out,'..',path.basename(out)+'-llave.pem');fs.writeFileSync(keyFile,k.llave_privada);
 const dest=path.join(out,'abierto');execFileSync(process.execPath,[path.join(__dirname,'..','deploy','restaurar-resguardo.cjs'),'--llave',keyFile,'--archivo',file,'--salida',dest]);
 const crm=JSON.parse(require('node:zlib').gunzipSync(fs.readFileSync(path.join(dest,'crm.json.gz'))));assert.equal(crm.leads[0].name,'Cliente Secreto');assert.deepEqual(conteos(crm),reg.conteos);
 assert.match(fs.readFileSync(path.join(dest,'accesos.json'),'utf8'),/HASH-SECRETO/);
 const lista=execFileSync('tar',['-tf',path.join(dest,'privado.tar')]).toString();assert.match(lista,/campaign-media\/foto\.png/);assert.match(lista,/clara\.json/);assert.doesNotMatch(lista,/backups\/viejo/);assert.doesNotMatch(lista,/resguardo\//);
 assert.equal(reg.avisos.some(a=>/PostgreSQL/.test(a)),true,'avisa si no hay PostgreSQL configurado');
});
test('Drive: una copia nueva por día y la «última hora» que se actualiza; en Drive no se borra nada; la verificación detecta alteraciones',async()=>{
 const t=await rig();await t.r.rpc('opsGenerarLlaves',[{}],G);await t.r.rpc('opsConfigGuardar',[{enabled:true,drive_folder_id:'1AbCdEfGhIjKlMnOpQrStUvWxYz12345'}],G);
 const a=await t.r.crear();t.adv(1);const b=await t.r.crear();t.adv(1);const c=await t.r.crear();t.adv(24);const d=await t.r.crear();
 assert.deepEqual([a,b,c,d].map(x=>x.drive.tipo),['diario','ultima_hora','ultima_hora','diario']);
 assert.deepEqual(t.drive.calls.map(x=>x.accion),['crear','crear','actualizar','crear']);assert.equal(t.drive.files.size,3,'nunca se borra en Drive');
 assert.equal((await t.r.verificar()).ok,true);
 const f=t.drive.files.get(d.drive.file_id);f.bytes=Buffer.concat([f.bytes,Buffer.from('x')]);
 const v=await t.r.verificar();assert.equal(v.ok,false);assert.match(v.error,/no coincide/);
 const e=await t.r.estado();assert.equal(e.ultima_verificacion.ok,false);assert.equal(e.atrasado,false);t.adv(5);assert.equal((await t.r.estado()).atrasado,true,'avisa si pasan más de dos ciclos sin resguardo');
 assert.ok(fs.readdirSync(path.join(t.dir,'resguardo')).length<=24);
});
test('sin Drive queda «solo en el servidor» con aviso; dos resguardos a la vez no se pisan; un fallo de Drive no pierde la copia local',async()=>{
 const t=await rig();await t.r.rpc('opsGenerarLlaves',[{}],G);
 const r0=new Resguardo(t.store,{privateDir:t.dir},{});const x=await r0.crear();assert.equal(x.estado,'solo_local');assert.ok(x.avisos.some(a=>/Drive/.test(a)));
 const [p,q]=await Promise.all([t.r.crear(),t.r.crear()]);assert.equal([p,q].filter(z=>z.omitido).length,1);
 t.drive.subir=async()=>{throw Error('cuota excedida');};t.adv(2);const y=await t.r.crear();assert.equal(y.estado,'solo_local');assert.ok(fs.existsSync(path.join(t.dir,'resguardo',y.archivo_local)));assert.match(y.drive.error,/cuota/);
});
test('UI, conector de Claude, Dockerfile y restauración segura',()=>{
 const R=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
 const ui=R('src/OperacionesLola.jsx');for(const s of ['L.O.L.A Operaciones','Descargar llave privada','Resguardar ahora','Verificar copia en Drive','Historial de resguardos'])assert.ok(ui.includes(s),s);
 assert.match(R('src/App.jsx'),/<OperacionesLola\/><ConexionesIA\/>/);assert.match(R('business/mcpConnector.js'),/name: 'estado_operaciones'/);
 assert.match(R('Dockerfile'),/postgresql17-client/);assert.match(R('server.cjs'),/app\.resguardo\?\.start\(\)/);
 const rest=R('deploy/restaurar-resguardo.cjs');assert.match(rest,/debe estar vacía/);assert.match(rest,/No restaures sobre la base vigente/);
});
