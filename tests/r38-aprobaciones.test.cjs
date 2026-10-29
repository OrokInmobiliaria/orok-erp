'use strict';
// R38 · Órdenes por cualquier área habilitada, cadenas de aprobación obligatorias por empresa y tipo de proyecto, y avisos por correo.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {createServer}=require('../server.cjs'),{MemoryFirestore}=require('./memory-firestore.cjs'),{FirestoreProject}=require('../firestore-project.cjs');
const APROB=require('../business/claraAprobaciones');
const USERS={manager:{id:'u-ger',name:'Martín',role:'Gerente'},seller:{id:'u-ven',name:'Luis',role:'Vendedor'},broker:{id:'u-bro',name:'Broker Uno',role:'Broker'},legal:{id:'u-leg',name:'Ana Legal',role:'Vendedor'},cesar:{id:'u-cd',name:'Cesar Davalos',role:'Vendedor'},fernando:{id:'u-fa',name:'Fernando Amiquero',role:'Vendedor'},carla:{id:'u-cg',name:'Carla',role:'Vendedor'},jefe:{id:'u-jo',name:'Juan Residente',role:'Vendedor'},oper:{id:'u-op',name:'Rosa Operaciones',role:'Vendedor'}};
const ROOT=path.join(__dirname,'..');
async function setup(){
 const privateDir=fs.mkdtempSync(path.join(os.tmpdir(),'orok-clara-')),store=new FirestoreProject(new MemoryFirestore());
 await store.initialize({settings:{},leads:[],units:[],quotes:[],separations:[]});
 const config={privateDir,testing:true,cookieName:'sid',origin:'http://localhost'};
 const calls=[],mails=[];const claraFetcher=async(url,opts)=>{calls.push({url,opts,body:JSON.parse(opts.body)});return {ok:true,json:async()=>({ok:true,id:'1FileIdDrive',nombre:JSON.parse(opts.body).nombre,link:'https://drive.google.com/file/d/1FileIdDrive/view'})}};
 const assistantFetcher=async(url,opts)=>{calls.push({url,body:JSON.parse(opts.body)});return {ok:true,json:async()=>({content:[{type:'text',text:'Paga primero la detracción de TUNOPAL.'}]})}};
 const authCache={require:async cookie=>{if(!USERS[cookie])throw Error('Inicia sesión.');return USERS[cookie];}},cache={read:()=>store.read()};
 const server=createServer({config,store,cache,authCache,auth:{execute:async m=>{if(m==='info')return {value:{users:Object.values(USERS)}};throw Error('Not used');}},creativeOptions:{claraFetcher,assistantFetcher,claraMailer:{notify:async m=>{if(/falla/.test(m.to))throw Error('SMTP caído');mails.push(m);return {sent:true}}}}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;config.origin=base;
 const call=async(name,args=[],cookie='manager')=>{const r=await fetch(base+'/api/rpc/db.'+name,{method:'POST',headers:{'Content-Type':'application/json','X-Orok-Request':'1',Origin:base,Cookie:'sid='+cookie},body:JSON.stringify({args})});return {status:r.status,data:await r.json()};};
 const secret='clara-worker-secret-'.padEnd(40,'x');fs.writeFileSync(path.join(privateDir,'integracion-ia-webhooks.json'),JSON.stringify({webhookSecret:secret}));
 const n8n=async(action,p={},key=secret)=>{const r=await fetch(base+'/api/integrations/lola',{method:'POST',headers:{'Content-Type':'application/json','X-Orok-Webhook-Secret':key},body:JSON.stringify({action,...p})});return {status:r.status,data:await r.json()};};
 const get=async(p,cookie='manager')=>fetch(base+p,{headers:{Cookie:'sid='+cookie}});
 return {mails,privateDir,store,call,n8n,get,calls,close:async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));fs.rmSync(privateDir,{recursive:true,force:true});}};
}


const DIR=[
 {id:'AP-u-ger',user_id:'u-ger',nombre:'Martín',area:'Gerencia',email:'mmontezuma@orok.com.pe',cargos:{'Gerencia General':['BMG','MZA','MAAS']},activo:true},
 {id:'AP-u-op',user_id:'u-op',nombre:'Rosa Operaciones',area:'Obra',email:'operaciones@maas.pe',cargos:{'Gerencia de Operaciones':['MAAS']},activo:true},
 {id:'AP-u-jo',user_id:'u-jo',nombre:'Juan Residente',area:'Obra',email:'residente@maas.pe',cargos:{},activo:true},
 {id:'AP-u-leg',user_id:'u-leg',nombre:'Ana Legal',area:'Legal',email:'legal@orok.com.pe',cargos:{},activo:true}];
const PROY=[{id:'MAAS-OBRA-SURCO',empresa:'MAAS',nombre:'Obra Surco',tipo:'Construcción',fase:'En ejecución',modulos:['logistica','obra','honorarios'],jefe_obra:'u-jo'},
 {id:'MAAS-ASESORIA-X',empresa:'MAAS',nombre:'Asesoría X',tipo:'Asesoría',fase:'En ejecución',modulos:['tesoreria','honorarios']}];
const OC=(x={})=>({id:'MAAS-OC-2026-'+Math.random().toString(36).slice(2,8).toUpperCase(),empresa:'MAAS',tipo:'OC',n:0,fecha:'2026-10-28',proveedor:'ACEROS AREQUIPA',proyecto:'Obra Surco',comprobante:'Factura electrónica',moneda:'PEN',igv:true,detraccion_pct:0,estado:'Borrador',items:[{descripcion:'Fierro 1/2',unidad:'und',cant:100,pu:45}],condiciones:{pago:'',plazo_dias:15},destino:{},obs:'',firmas:[],hist:[],...x});
async function base(t){for(const d of DIR)assert.equal((await t.call('claraPut',['aprobadores',d])).status,200);for(const p of PROY)assert.equal((await t.call('claraPut',['proyectos',p])).status,200);}

test('un área habilitada elabora su orden; ve solo lo suyo; un usuario no habilitado no entra',async()=>{
 const t=await setup();try{await base(t);
  assert.equal((await t.call('claraWhoAmI',[],'legal')).data.value.habilitado,true);
  const o=OC();const r=await t.call('claraPut',['ordenes',o],'legal');assert.equal(r.status,200,JSON.stringify(r.data));
  const otra=OC({solicitante:{user_id:'u-ger'}});await t.call('claraPut',['ordenes',otra]);
  const l=(await t.call('claraList',[],'legal')).data.value.data;
  assert.deepEqual(l.ordenes.map(x=>x.id),[o.id]);assert.equal(l.ordenes[0].solicitante.user_id,'u-leg');
  assert.equal(l.cxp.length,0);assert.ok(l.proveedores.every(p=>!('cuenta' in p)));assert.ok(l.aprobadores.every(d=>!('email' in d)));
  assert.match((await t.call('claraPut',['ordenes',{...otra,proveedor:'X'}],'legal')).data.error,/elaboraste/);
  assert.match((await t.call('claraPut',['proveedores',{id:'MAAS-X',empresa:'MAAS',nombre:'X'}],'legal')).data.error,/elaborar órdenes/);
  assert.match((await t.call('claraList',[],'seller')).data.error,/habilitado/);
  assert.match((await t.call('claraUsuarios',[],'legal')).data.error,/Gerencia/);
  assert.equal((await t.call('claraUsuarios')).data.value.length,9);
 }finally{await t.close()}
});
test('MAAS construcción: Jefe de Obra → G. Operaciones → Gerencia General, en orden, con correo a cada uno cuando le toca',async()=>{
 const t=await setup();try{await base(t);
  const o=OC();await t.call('claraPut',['ordenes',o],'legal');
  const e=(await t.call('claraOcEnviar',[o.id],'legal')).data.value.orden;
  assert.equal(e.estado,'En aprobación');assert.equal(e.n,1);assert.deepEqual(e.aprobacion.pasos.map(p=>p.cargo+':'+p.user_id),['Jefe de Obra:u-jo','Gerencia de Operaciones:u-op','Gerencia General:u-ger']);
  assert.equal(t.mails.length,1);assert.equal(t.mails[0].to,'residente@maas.pe');assert.match(t.mails[0].subject,/Solicitud de aprobación OC-MAAS-2026-0001/);assert.match(t.mails[0].text,/\/contabilidad\/#orden\//);
  // nadie se salta el turno, ni Gerencia
  assert.match((await t.call('claraOcAprobar',[o.id,''])).data.error,/espera la aprobación de Jefe de Obra/);
  assert.match((await t.call('claraOcAprobar',[o.id,''],'oper')).data.error,/No te toca/);
  // no se emite ni se escribe la aprobación por fuera
  const cur=(await t.call('claraList')).data.value.data.ordenes.find(x=>x.id===o.id);
  assert.match((await t.call('claraPut',['ordenes',{...cur,estado:'Aprobada'}])).data.error,/cadena de aprobación/);
  assert.match((await t.call('claraPut',['ordenes',{...cur,estado:'Enviada'}])).data.error,/faltan aprobaciones/);
  // las aprobaciones que mande la pantalla se ignoran: el servidor conserva las suyas
  await t.call('claraPut',['ordenes',{...cur,aprobacion:{...cur.aprobacion,pasos:cur.aprobacion.pasos.map(p=>({...p,estado:'aprobado'}))},solicitante:{user_id:'u-ger'}}]);
  const cur2=(await t.call('claraList')).data.value.data.ordenes.find(x=>x.id===o.id);assert.ok(cur2.aprobacion.pasos.every(p=>p.estado==='pendiente'));assert.equal(cur2.solicitante.user_id,'u-leg');
  assert.match((await t.call('claraPut',['ordenes',{...cur,estado:'Aprobada',aprobacion:{...cur.aprobacion,pasos:cur.aprobacion.pasos.map(p=>({...p,estado:'aprobado'}))}}])).data.error,/cadena de aprobación/);
  assert.match((await t.call('claraPut',['ordenes',{...cur,items:[{descripcion:'Fierro',cant:1000,pu:45}]}])).data.error,/reábrela/);
  let r=(await t.call('claraOcAprobar',[o.id,'Conforme con metrado'],'jefe')).data.value.orden;assert.equal(r.estado,'En aprobación');
  assert.equal(t.mails.at(-1).to,'operaciones@maas.pe');
  r=(await t.call('claraOcAprobar',[o.id,''],'oper')).data.value.orden;assert.equal(t.mails.at(-1).to,'mmontezuma@orok.com.pe');
  r=(await t.call('claraOcAprobar',[o.id,''])).data.value.orden;assert.equal(r.estado,'Aprobada');
  assert.deepEqual(r.firmas.map(f=>f.rol),['Elaboró','Jefe de Obra','Gerencia de Operaciones','Gerencia General']);
  assert.ok(r.firmas.every(f=>f.hash===r.aprobacion.huella));
  assert.equal(t.mails.at(-1).to,'legal@orok.com.pe');assert.match(t.mails.at(-1).subject,/Orden aprobada/);
  // ya aprobada: se emite
  assert.equal((await t.call('claraPut',['ordenes',{...r,estado:'Enviada'}])).status,200);
  // la huella del servidor es la misma que usa la pantalla para validar firmas
  assert.equal(r.aprobacion.huella,require('node:crypto').createHash('sha256').update(APROB.canonical(r,0.18)).digest('hex').toUpperCase());
 }finally{await t.close()}
});
test('consultorías de MAAS: G. Operaciones → Gerencia General; BMG y MZA: Gerencia General',async()=>{
 const t=await setup();try{await base(t);
  const a=OC({proyecto:'Asesoría X'});await t.call('claraPut',['ordenes',a],'legal');
  assert.deepEqual((await t.call('claraOcEnviar',[a.id],'legal')).data.value.orden.aprobacion.pasos.map(p=>p.cargo),['Gerencia de Operaciones','Gerencia General']);
  for(const emp of ['BMG','MZA']){const b=OC({id:emp+'-OS-X'+Math.random().toString(36).slice(2,6),empresa:emp,tipo:'OS',proyecto:''});await t.call('claraPut',['ordenes',b],'legal');
   const e=(await t.call('claraOcEnviar',[b.id],'legal')).data.value.orden;assert.deepEqual(e.aprobacion.pasos.map(p=>p.cargo),['Gerencia General']);
   assert.equal((await t.call('claraOcAprobar',[b.id,''])).data.value.orden.estado,'Aprobada')}
  // MAAS sin proyecto o sin Jefe de Obra asignado: no se envía
  const c=OC({proyecto:''});await t.call('claraPut',['ordenes',c],'legal');assert.match((await t.call('claraOcEnviar',[c.id],'legal')).data.error,/proyecto registrado/);
  await t.call('claraPut',['proyectos',{...PROY[0],id:'MAAS-OBRA-2',nombre:'Obra 2',jefe_obra:''}]);
  const d=OC({proyecto:'Obra 2'});await t.call('claraPut',['ordenes',d],'legal');assert.match((await t.call('claraOcEnviar',[d.id],'legal')).data.error,/Falta asignar: Jefe de Obra del proyecto Obra 2/);
  // la numeración es correlativa por empresa y tipo
  const f=OC();await t.call('claraPut',['ordenes',f],'legal');assert.equal((await t.call('claraOcEnviar',[f.id],'legal')).data.value.orden.n,2);
 }finally{await t.close()}
});
test('observar devuelve a borrador y avisa; se corrige y la cadena empieza de nuevo; retirar y reabrir',async()=>{
 const t=await setup();try{await base(t);
  const o=OC();await t.call('claraPut',['ordenes',o],'legal');await t.call('claraOcEnviar',[o.id],'legal');
  assert.match((await t.call('claraOcObservar',[o.id,''],'jefe')).data.error,/motivo/);
  const r=(await t.call('claraOcObservar',[o.id,'Falta segunda cotización'],'jefe')).data.value.orden;
  assert.equal(r.estado,'Borrador');assert.equal(r.aprobacion,undefined);assert.equal(r.aprobacion_previas.at(-1).observada.motivo,'Falta segunda cotización');
  assert.equal(t.mails.at(-1).to,'legal@orok.com.pe');assert.match(t.mails.at(-1).text,/Falta segunda cotización/);
  assert.equal((await t.call('claraPut',['ordenes',{...r,proforma:'COT-2'}],'legal')).status,200);
  const e=(await t.call('claraOcEnviar',[o.id],'legal')).data.value.orden;assert.equal(e.aprobacion.ronda,2);assert.ok(e.aprobacion.pasos.every(p=>p.estado==='pendiente'));assert.equal(e.n,1);
  assert.match((await t.call('claraOcRecordar',[o.id],'legal')).data.error,/última hora/);
  const w=(await t.call('claraOcReabrir',[o.id,'Cambio de proveedor'],'legal')).data.value.orden;assert.equal(w.estado,'Borrador');assert.equal(w.revision,1);
  assert.match((await t.call('claraOcReabrir',[o.id,''],'oper')).data.error,/no se puede reabrir/);
 }finally{await t.close()}
});
test('si el correo falla, la aprobación sigue y queda anotado para avisar a mano',async()=>{
 const t=await setup();try{await base(t);
  await t.call('claraPut',['aprobadores',{...DIR[2],email:'falla@maas.pe'}]);
  const o=OC();await t.call('claraPut',['ordenes',o],'legal');const e=(await t.call('claraOcEnviar',[o.id],'legal')).data.value.orden;
  assert.equal(e.estado,'En aprobación');const a=e.aprobacion.avisos.at(-1);assert.equal(a.ok,false);assert.match(a.error,/SMTP caído/);
  assert.match((await t.call('claraPut',['aprobadores',{...DIR[2],email:'no-es-correo'}])).data.error,/Correo no válido/);
  assert.match((await t.call('claraPut',['aprobadores',{...DIR[2],cargos:{'Rey':['MAAS']}}])).data.error,/Cargo no válido/);
 }finally{await t.close()}
});
test('la skill define las reglas y la pantalla usa la misma lógica (campanita incluida)',()=>{
 const {parseSkill}=require('../business/claraRules');const p=parseSkill(fs.readFileSync(path.join(ROOT,'skills/erp-orok-contabilidad/SKILL.md'),'utf8')).params;
 const C=APROB.cadena({empresa:'MAAS',proyecto:'Obra Surco'},PROY,DIR,p.aprobaciones);assert.deepEqual(C.pasos.map(x=>x.nombre),['Juan Residente','Rosa Operaciones','Martín']);
 assert.throws(()=>parseSkill(fs.readFileSync(path.join(ROOT,'skills/erp-orok-contabilidad/SKILL.md'),'utf8').replace('"pasos": ["Gerencia General"] }','"pasos": ["Presidente"] }')),/aprobaciones.reglas/);
 const js=fs.readFileSync(path.join(ROOT,'contabilidad/app.js'),'utf8');
 for(const s of ["root.APROB = API","crmRpc('claraOcEnviar'","crmRpc('claraOcAprobar'","crmRpc('claraOcObservar'","function renderBell","NO EMITIDA","id=\"bell\""].slice(0,6))assert.ok(js.includes(s),s);
 assert.ok(fs.readFileSync(path.join(ROOT,'contabilidad/index.html'),'utf8').includes('id="bell"'));
});

test('el equipo de la skill se vincula con los usuarios del CRM y define correos, áreas y cargos',async()=>{
 const t=await setup();try{
  assert.match((await t.call('claraEquipoVincular',[],'legal')).data.error,/Gerencia/);
  const r=(await t.call('claraEquipoVincular')).data.value;
  assert.deepEqual(r.vinculados.map(x=>x.nombre).sort(),['César Dávalos','Fernando Amiquero']);
  assert.deepEqual(r.sin_usuario.sort(),['Antonio Garcés','Carla García','Martín Montezuma']);
  const d=(await t.call('claraList')).data.value.data.aprobadores;const cesar=d.find(x=>x.user_id==='u-cd');
  assert.equal(cesar.email,'cdavalos@orok.com.pe');assert.deepEqual(cesar.cargos['Gerencia de Operaciones'],['BMG','MZA','MAAS']);
  assert.equal(d.find(x=>x.user_id==='u-fa').email,'teoc151@gmail.com');
  // César ya puede entrar y elaborar; se puede volver a vincular sin duplicar
  assert.equal((await t.call('claraWhoAmI',[],'cesar')).data.value.habilitado,true);
  await t.call('claraEquipoVincular');assert.equal((await t.call('claraList')).data.value.data.aprobadores.length,2);
  // Fernando es Jefe de Proyecto en MZA y BMG: no es Jefe de Obra, no aprueba y no elabora órdenes de MAAS
  const fer=d.find(x=>x.user_id==='u-fa');assert.deepEqual(fer.cargos,{'Jefe de Proyecto':['BMG','MZA']});assert.deepEqual(fer.empresas,['BMG','MZA']);
  assert.deepEqual((await t.call('claraWhoAmI',[],'fernando')).data.value.empresas,['BMG','MZA']);
  assert.match((await t.call('claraPut',['ordenes',OC()],'fernando')).data.error,/Solo puedes elaborar órdenes de BMG, MZA/);
  const z=OC({id:'MZA-OS-F1',empresa:'MZA',tipo:'OS',proyecto:''});assert.equal((await t.call('claraPut',['ordenes',z],'fernando')).status,200);
  await t.call('claraPut',['aprobadores',DIR[0]]);
  assert.deepEqual((await t.call('claraOcEnviar',[z.id],'fernando')).data.value.orden.aprobacion.pasos.map(p=>p.cargo),['Gerencia General']);
  // una obra de MAAS sin Jefe de Obra asignado no se envía
  await t.call('claraPut',['proyectos',{...PROY[0],jefe_obra:''}]);
  await t.call('claraPut',['aprobadores',DIR[3]]);
  const o=OC();await t.call('claraPut',['ordenes',o],'legal');assert.match((await t.call('claraOcEnviar',[o.id],'legal')).data.error,/Falta asignar: Jefe de Obra del proyecto Obra Surco/);
  // con un Jefe de Obra por defecto en MAAS, sí
  await t.call('claraPut',['aprobadores',{...DIR[2],cargos:{'Jefe de Obra':['MAAS']}}]);
  const e=(await t.call('claraOcEnviar',[o.id],'legal')).data.value.orden;
  assert.deepEqual(e.aprobacion.pasos.map(p=>p.cargo+':'+p.nombre),['Jefe de Obra:Juan Residente','Gerencia de Operaciones:César Dávalos','Gerencia General:Martín']);
  // si la elabora Gerencia (César, G. Operaciones), no pasa por el Jefe de Obra
  const g=OC();assert.equal((await t.call('claraPut',['ordenes',g],'cesar')).status,200);const ge=(await t.call('claraOcEnviar',[g.id],'cesar')).data.value.orden;
  assert.deepEqual(ge.aprobacion.pasos.map(p=>p.cargo),['Gerencia de Operaciones','Gerencia General']);assert.match(ge.aprobacion.regla,/elaborada por Gerencia/);
  const mg=OC();await t.call('claraPut',['ordenes',mg]);assert.deepEqual((await t.call('claraOcEnviar',[mg.id])).data.value.orden.aprobacion.pasos.map(p=>p.cargo),['Gerencia de Operaciones','Gerencia General']);
 }finally{await t.close()}
});

test('Jefe de Obra por obra: debe estar habilitado, queda el historial y al cambiarlo las órdenes pendientes pasan al nuevo con aviso',async()=>{
 const t=await setup();try{await base(t);
  assert.match((await t.call('claraPut',['proyectos',{...PROY[0],jefe_obra:'u-nadie'}])).data.error,/persona habilitada/);
  await t.call('claraPut',['aprobadores',{id:'AP-u-cd',user_id:'u-cd',nombre:'Pedro Nuevo',area:'Obra',email:'pedro@maas.pe',cargos:{},activo:true}]);
  const o=OC();await t.call('claraPut',['ordenes',o],'legal');await t.call('claraOcEnviar',[o.id],'legal');assert.equal(t.mails.at(-1).to,'residente@maas.pe');
  const p=(await t.call('claraList')).data.value.data.proyectos.find(x=>x.id===PROY[0].id);
  assert.equal((await t.call('claraPut',['proyectos',{...p,jefe_obra:'u-cd'}])).status,200);
  const l=(await t.call('claraList')).data.value.data;const q=l.proyectos.find(x=>x.id===PROY[0].id);
  assert.deepEqual(q.jefes_obra_hist.map(h=>[h.nombre,!!h.hasta]),[['Juan Residente',true],['Pedro Nuevo',false]]);
  const r=l.ordenes.find(x=>x.id===o.id);assert.equal(r.aprobacion.pasos[0].user_id,'u-cd');assert.equal(r.aprobacion.pasos[0].nombre,'Pedro Nuevo');
  assert.equal(t.mails.at(-1).to,'pedro@maas.pe');assert.match(r.hist.at(-1).e,/reasignado/);
  assert.match((await t.call('claraOcAprobar',[o.id,''],'jefe')).data.error,/No te toca/);
  assert.equal((await t.call('claraOcAprobar',[o.id,''],'cesar')).status,200);
  // cambiar otra vez cierra el periodo anterior
  const p2=(await t.call('claraList')).data.value.data.proyectos.find(x=>x.id===PROY[0].id);await t.call('claraPut',['proyectos',{...p2,jefe_obra:'u-jo'}]);
  const h=(await t.call('claraList')).data.value.data.proyectos.find(x=>x.id===PROY[0].id).jefes_obra_hist;
  assert.deepEqual(h.map(x=>[x.nombre,!!x.hasta]),[['Juan Residente',true],['Pedro Nuevo',true],['Juan Residente',false]]);
 }finally{await t.close()}
});
