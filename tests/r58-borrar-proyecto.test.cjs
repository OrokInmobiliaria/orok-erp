'use strict';
// R58 · Borrar proyecto con doble confirmación (Gerencia + otra Gerencia, una de ellas Gerencia General).
// «Borrar» = archivar: el proyecto deja de verse y sus datos se conservan (nunca se eliminan).
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {MemoryFirestore}=require('./memory-firestore.cjs'),{FirestoreProject}=require('../firestore-project.cjs');
const {ProyectosRegistro,proyectosHub,PROYECTOS_METHODS}=require('../business/proyectos');
const G1={id:'u-ger1',name:'Martín',role:'Gerente'},G2={id:'u-ger2',name:'Operaciones',role:'Gerente'},G3={id:'u-ger3',name:'Finanzas',role:'Gerente'},V={id:'u-v',name:'Vendedor',role:'Vendedor'};
async function armar(gg=['u-ger1']){
 const db=new MemoryFirestore(),store=new FirestoreProject(db),registro=new ProyectosRegistro(store),cerrados=[];
 const principal={id:null,app:{}},abrir=async()=>({watch:()=>({read:async()=>({}),close:()=>cerrados.push('cache')}),close:()=>cerrados.push('store')});
 const hub=proyectosHub({principal,abrir,contexto:(st,ca,id)=>({id,store:st,cache:ca,app:{}}),registro,esGerenciaGeneral:u=>gg.includes(u.id)});
 const p=await registro.reservar({nombre:'Residencial Ventura',empresa:'BMG'},G1);await registro.registrar(p);await hub.obtener(p.id);
 return {registro,hub,p,cerrados,ck:'orok_proyecto='+p.id};
}
test('métodos expuestos',()=>{for(const m of ['proyectoBorrarSolicitar','proyectoBorrarConfirmar','proyectoBorrarCancelar'])assert.ok(PROYECTOS_METHODS.includes(m),m)});
test('Gerencia General solicita, otra Gerencia confirma: se archiva, se conservan los datos y vuelve al principal',async()=>{
 const {registro,hub,p,cerrados,ck}=await armar();
 await assert.rejects(hub.rpc('proyectoBorrarSolicitar',[p.id,{confirmacion:'Residencial Ventura'}],V,ck),/solo para Gerencia/);
 await assert.rejects(hub.rpc('proyectoBorrarSolicitar',[p.id,{confirmacion:'Ventura'}],G1,ck),/nombre exacto/);
 await assert.rejects(hub.rpc('proyectoBorrarSolicitar',['infinity224',{confirmacion:'Infinity 224'}],G1,ck),/principal no se puede borrar/);
 const s=await hub.rpc('proyectoBorrarSolicitar',[p.id,{confirmacion:'residencial  ventura',motivo:'Terreno no se compró'}],G1,ck);assert.equal(s.value.gg,true);
 await assert.rejects(hub.rpc('proyectoBorrarSolicitar',[p.id,{confirmacion:'Residencial Ventura'}],G2,ck),/pendiente/);
 let l=(await hub.rpc('proyectosListar',[],G1,ck)).value,x=l.proyectos.find(q=>q.id===p.id);assert.equal(x.borrado.mia,true);assert.equal(x.borrado.puedo_confirmar,false);assert.equal(l.soy_gerencia_general,true);
 l=(await hub.rpc('proyectosListar',[],G2,ck)).value;assert.equal(l.proyectos.find(q=>q.id===p.id).borrado.puedo_confirmar,true);
 await assert.rejects(hub.rpc('proyectoBorrarConfirmar',[p.id],G1,ck),/otra Gerencia/,'la misma persona no puede confirmar');
 const c=await hub.rpc('proyectoBorrarConfirmar',[p.id],G2,ck);assert.equal(c.value.estado,'archivado');assert.equal(c.usar,'infinity224','si estaba abierto vuelve al principal');
 assert.ok(!(await registro.todos()).some(q=>q.id===p.id),'ya no aparece');assert.ok(cerrados.includes('cache'));
 const doc=(await registro.col.doc(p.id).get()).data();assert.equal(doc.archivado,true);assert.equal(doc.borrado.confirmado_por,'Operaciones');assert.equal(doc.nombre,'Residencial Ventura','el registro se conserva');
 assert.match(doc.historial.map(h=>h.nota).join('|'),/Solicitó borrar el proyecto: Terreno no se compró\|Confirmó el borrado/);
});
test('sin Gerencia General en ninguna de las dos confirmaciones no se borra; GG puede confirmar; cancelar y vencimiento',async()=>{
 const {registro,hub,p,ck}=await armar(['u-ger1']);
 await hub.rpc('proyectoBorrarSolicitar',[p.id,{confirmacion:'Residencial Ventura'}],G2,ck);
 assert.equal((await hub.rpc('proyectosListar',[],G3,ck)).value.proyectos.find(q=>q.id===p.id).borrado.puedo_confirmar,false);
 await assert.rejects(hub.rpc('proyectoBorrarConfirmar',[p.id],G3,ck),/Gerencia General/);
 await hub.rpc('proyectoBorrarCancelar',[p.id],G3,ck);assert.equal((await registro.uno(p.id)).borrado,undefined);
 await assert.rejects(hub.rpc('proyectoBorrarConfirmar',[p.id],G1,ck),/No hay una solicitud/);
 await hub.rpc('proyectoBorrarSolicitar',[p.id,{confirmacion:'Residencial Ventura'}],G2,ck);
 const d=await registro.uno(p.id);d.borrado.at=new Date(Date.now()-8*86400e3).toISOString();await registro.guardar(d);
 await assert.rejects(hub.rpc('proyectoBorrarConfirmar',[p.id],G1,ck),/vigente/,'vence a los 7 días');
 await hub.rpc('proyectoBorrarSolicitar',[p.id,{confirmacion:'Residencial Ventura'}],G2,ck);
 const c=await hub.rpc('proyectoBorrarConfirmar',[p.id],G1,'');assert.equal(c.usar,undefined,'otro navegador sin ese proyecto abierto no cambia');
});
test('cableado: botón junto a «Nuevo proyecto», Gerencia General desde Aprobaciones y métodos en el puente',()=>{
 const ui=fs.readFileSync(path.join(__dirname,'..','src','Proyectos.jsx'),'utf8');
 for(const t of ['Borrar proyecto','db.proyectoBorrarSolicitar','db.proyectoBorrarConfirmar','Segunda confirmación','Gerencia General'])assert.ok(ui.includes(t),t);
 assert.ok(ui.indexOf('setBorrar(true)')<ui.indexOf('setNuevo(true)'),'el botón va junto a «+ Nuevo proyecto»');
 assert.ok(fs.readFileSync(path.join(__dirname,'..','src','cloudBridge.js'),'utf8').includes("'proyectoBorrarConfirmar'"));
 assert.match(fs.readFileSync(path.join(__dirname,'..','application.cjs'),'utf8'),/projectDrive,clara\}/);
 assert.match(fs.readFileSync(path.join(__dirname,'..','business','proyectos.js'),'utf8'),/cargos\?\.\['Gerencia General'\]/);
});
