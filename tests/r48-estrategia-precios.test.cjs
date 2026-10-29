'use strict';
// R48 · Ventas › Estrategia de precios: línea base del Excel, avance real desde separaciones/ventas del CRM, etapas por valor vendido,
// feria con cupos de descuento, escenarios meta / línea base / superar, precios sugeridos y aplicación solo por Gerencia con historial.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {MemoryFirestore}=require('./memory-firestore.cjs'),{FirestoreProject}=require('../firestore-project.cjs');
const {PreciosEstrategia,calcular,limpiarConfig,proyectarRestante,unitKey}=require('../business/preciosEstrategia');
const G={name:'Martín Montezuma',role:'Gerente'},V={name:'Antonio',role:'Vendedor'};
const U=[['D101_2','Loft Garden',1,59.2,'Si',378300],['D201_2','Flat 3D',2,91.67,'No',590500],['D302_2','Flat 2D',3,53.79,'Si',349200],['D301_2','Duplex 2D',3,80.62,'Si',523400],['D402_2','Duplex 2D',4,68.87,'No',450600],['D501_2','Flat 1D',5,52.82,'No',348300],['D601_2','Flat 1D',6,46.06,'Si',306100],['D602_2','Flat 1D',6,43.31,'Si',287800],['D701_2','Duplex 2D',7,77.05,'No',516000],['D702_2','Flat 2D',7,57.36,'No',384100],['D801_2','Duplex 2D',8,98.57,'No',665100]];
const cfgIn={proyecto:'Infinity 224',meta_recaudacion:5337000,linea_base:5342560,unidades:U.map(u=>({unidad:u[0],tipo:u[1],piso:u[2],area:u[3],ancla:u[4],precio_base:u[5]})),
 etapas:[{nombre:'Etapa 1',alza:0},{nombre:'Etapa 2',alza:.07,umbral:.35},{nombre:'Etapa 3',alza:.11,umbral:.7}],
 feria:{fecha_inicio:'2026-11-06',descuento_cupo:30000,cupos:3,metas:{preventas:3,reservas:3,calificados:60,citas:25}},fuente:{tipo:'excel',nombre:'infinity224-estrategia-feria.xlsx'}};
const units=()=>U.map((u,i)=>({id:'u'+i,unit_number:u[0].slice(1,4),price:400000,status:'AVAILABLE'}));
const ventas=[{unit_id:'u7',status:'CONFIRMED',final_price:257800,confirmed_at:'2026-11-06T15:00:00Z'},{unit_id:'u6',status:'CONFIRMED',final_price:276100,confirmed_at:'2026-11-07T15:00:00Z'},{unit_id:'u2',status:'CONFIRMED',final_price:319200,confirmed_at:'2026-11-07T18:00:00Z'},{unit_id:'u0',status:'CONFIRMED',final_price:378300,confirmed_at:'2026-11-08T16:00:00Z'},{unit_id:'u9',status:'RELEASED',final_price:384100,confirmed_at:'2026-11-08T17:00:00Z'}];

test('validación: unidades, meta y etapas ordenadas; números de unidad del Excel se cruzan con Inventario',()=>{
 assert.equal(unitKey('D101_2'),'101');assert.equal(unitKey('Dpto 702'),'702');
 assert.throws(()=>limpiarConfig({...cfgIn,unidades:[]}),/al menos una unidad/);
 assert.throws(()=>limpiarConfig({...cfgIn,meta_recaudacion:0}),/meta/);
 assert.throws(()=>limpiarConfig({...cfgIn,etapas:[{alza:0},{alza:.1,umbral:.7},{alza:.2,umbral:.3}]}),/menor a mayor/);
 assert.throws(()=>limpiarConfig({...cfgIn,unidades:[...cfgIn.unidades,cfgIn.unidades[0]]}),/repetidas/);
 const c=limpiarConfig(cfgIn);assert.equal(c.unidades.length,11);assert.equal(c.unidades.filter(u=>u.ancla).length,5);
});

test('sin ventas: lista Etapa 1 = 4,799,400; la escalera de etapas proyecta y calcula el ajuste para llegar a la meta',()=>{
 const r=calcular(limpiarConfig(cfgIn),{units:units(),separations:[]},new Date('2026-10-29T12:00:00Z'));
 assert.equal(r.lista_etapa1,4799400);assert.equal(r.etapa_activa,'Etapa 1');assert.equal(r.recaudado,0);
 const p=proyectarRestante(limpiarConfig(cfgIn).etapas,4799400,0);assert.equal(Math.round(p.valor),Math.round(1679790+1679790*1.07+1439820*1.11));
 // Durante la feria vigente se descuentan los 3 cupos pendientes (S/ 90,000) de lo proyectado.
 assert.equal(r.proyectado,Math.round(p.valor-90000));assert.equal(r.brecha_vs_meta,r.proyectado-5337000);
 assert.ok(r.ajuste_sugerido_pct>0);assert.equal(r.escenarios.length,3);
 assert.equal(r.escenarios[0].alcanzable_sin_ajuste,false);
 assert.ok(r.unidades.every(u=>u.precio_sugerido%100===0&&u.precio_sugerido>=u.precio_base));
});

test('con ventas reales: avance por valor activa la Etapa 2, cupos usados, liberadas no cuentan y curva base vs real',()=>{
 const r=calcular(limpiarConfig(cfgIn),{units:units(),separations:ventas,leads:[{status:'Calificado',received_at:'2026-11-06T16:00:00Z',appointments:[{scheduled_at:'2026-11-07T15:00:00Z'}]}]},new Date('2026-11-12T12:00:00Z'));
 assert.equal(r.unidades_vendidas,4);assert.equal(r.recaudado,257800+276100+319200+378300);
 assert.equal(r.etapa_activa,'Etapa 1');assert.ok(r.siguiente_etapa.falta_lista>0);
 assert.equal(r.feria.cupos_usados,3);assert.equal(r.feria.vigente,false);assert.equal(r.feria.metas.preventas.real,4);
 assert.deepEqual(r.feria.metas.preventas.por_dia.map(d=>d.real),[1,2,1]);assert.equal(r.feria.metas.calificados.real,1);assert.equal(r.feria.metas.citas.real,1);
 assert.equal(r.curva.length,4);assert.ok(r.curva.at(-1).base>r.curva.at(-1).real,'los cupos de feria quedan por debajo de la línea base');
 assert.equal(r.unidades.find(u=>u.unidad==='702').estado,'Disponible','una separación liberada devuelve la unidad');
 const mas=calcular(limpiarConfig(cfgIn),{units:units(),separations:[...ventas,{unit_id:'u1',status:'SOLD',final_price:590500,sold_at:'2026-11-20T10:00:00Z'}]},new Date('2026-11-21'));
 assert.equal(mas.etapa_activa,'Etapa 2');assert.ok(mas.unidades.filter(u=>u.estado==='Disponible').every(u=>u.precio_etapa===Math.round(u.precio_base*1.07/100)*100));
});

test('guardar y aplicar: solo Gerencia, revisión para no pisar cambios, no toca unidades vendidas y deja historial',async()=>{
 const store=new FirestoreProject(new MemoryFirestore());await store.initialize({settings:{},leads:[],units:units(),quotes:[],separations:[]});
 const p=new PreciosEstrategia(store),d={units:units(),separations:[...ventas]};
 await assert.rejects(p.rpc('preciosEstrategia',[],V,async()=>d),/Gerencia/);
 assert.equal((await p.rpc('preciosEstrategia',[],G,async()=>d)).configurada,false);
 const s=await p.rpc('preciosEstrategiaGuardar',[{config:cfgIn}],G,async()=>d);assert.equal(s.revision,1);
 await assert.rejects(p.rpc('preciosEstrategiaGuardar',[{config:cfgIn,revision:5}],G,async()=>d),/Otra persona/);
 const est=await p.rpc('preciosEstrategia',[],G,async()=>d);assert.equal(est.configurada,true);assert.equal(est.calculo.unidades_total,11);
 d.units[0].status='SOLD';const doc=await p.config();
 assert.throws(()=>p.aplicarEnDatos(d,doc,[],V),/Gerencia/);
 const ap=p.aplicarEnDatos(d,doc,['201','801'],G);
 assert.deepEqual(ap.cambios.map(c=>c.unidad),['201','801']);assert.equal(d.units[1].price,ap.cambios[0].despues);assert.match(d.units[1].price_source,/Estrategia de precios/);
 assert.equal(d.units[0].price,400000,'una unidad vendida no cambia');
 await p.registrarAplicacion(ap);assert.equal((await p.rpc('preciosHistorial',[],G)).length,1);
 assert.throws(()=>p.aplicarEnDatos(d,doc,['201'],G),/No hay precios por cambiar/);
 const mora=await p.paraMora(d);assert.equal(mora.schema,'ventas.precios@1');assert.equal(mora.unidades,undefined,'el Evaluador recibe el resumen, no la lista por unidad');
});

test('integración: servidor, puente del navegador, menú de Ventas (solo Gerencia), M.O.R.A y lector de Excel',()=>{
 const R=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
 const app=R('application.cjs');assert.match(app,/PRECIOS_METHODS\.includes\(name\)/);assert.match(app,/method==='aplicarPreciosEstrategia'/);assert.match(app,/Antes de aplicar precios de la estrategia/);assert.match(app,/managerMethods=new Set\(\['aplicarPreciosEstrategia'/);
 assert.match(R('src/cloudBridge.js'),/'preciosEstrategia','preciosEstrategiaGuardar','preciosHistorial','preciosOfertaFeria','aplicarPreciosEstrategia'/);
 assert.match(R('src/navModel.mjs'),/\['precios', 'Estrategia de precios'/);assert.match(R('src/navModel.mjs'),/MANAGER_ONLY = \['precios'/);
 assert.match(R('src/App.jsx'),/activeTab==='precios'&&currentUser\.role==='Gerente'&&<EstrategiaPrecios\/>/);
 assert.match(R('business/moraIntegration.js'),/this\.precios\.paraMora\(d\)/);
 const ui=R('src/EstrategiaPrecios.jsx');for(const s of ['Importar Excel de estrategia','Cuadro final','Aplicar precios sugeridos','Línea base vs real','Historial de precios aplicados','/evaluador/exceljs.min.js'])assert.ok(ui.includes(s),s);
});

test('feria: preventa y reserva para cualquier unidad, cupos por modalidad registrada en la cotización y oferta para el vendedor',()=>{
 const {ofertaFeria}=require('../business/preciosEstrategia');
 const cfg=limpiarConfig({...cfgIn,feria:{fecha_inicio:'2026-11-06',preventa:{descuento:30000,cupos:3},reserva:{descuento:20000,cupos:0,condicion:'Separación de S/ 1,500'},metas:{preventas:3,reservas:3}}});
 const durante=new Date('2026-11-07T15:00:00Z');
 const quotes=[{id:'q1',feria_modalidad:'preventa'},{id:'q2',feria_modalidad:'reserva'}];
 const seps=[{unit_id:'u1',status:'CONFIRMED',final_price:560500,quote_id:'q1',confirmed_at:'2026-11-06T15:00:00Z'},{unit_id:'u10',status:'ACTIVE',final_price:645100,quote_id:'q2',created_at:'2026-11-07T14:00:00Z'}];
 const r=calcular(cfg,{units:units(),separations:seps,quotes},durante);
 const [pre,res]=r.feria.ofertas;assert.equal(pre.usados,1);assert.equal(pre.restantes,2);assert.equal(res.usados,1);
 assert.equal(r.feria.descuento_pendiente,2*30000,'reserva sin límite no se proyecta como descuento pendiente');
 assert.ok(['201','801'].every(u=>r.ventas_feria.some(v=>v.unidad===u)),'unidades que no eran ancla también usan cupos');
 const o=ofertaFeria(cfg,{units:units(),separations:seps,quotes},durante);assert.equal(o.vigente,true);
 assert.deepEqual(o.ofertas.map(x=>[x.modalidad,x.descuento,x.cupos_restantes]),[['preventa',30000,2],['reserva',20000,null]]);
 assert.equal(o.ofertas[0].meta,undefined,'el vendedor no ve metas ni márgenes');
 assert.equal(ofertaFeria(cfg,{units:units(),separations:seps,quotes},new Date('2026-11-12')).vigente,false);
 const app=fs.readFileSync(path.join(__dirname,'..','application.cjs'),'utf8');
 assert.match(app,/input\.feriaOferta/);assert.match(app,/feria_modalidad:request\.feria\.modalidad/);assert.match(app,/La oferta de feria ya no está disponible/);
 assert.match(fs.readFileSync(path.join(__dirname,'..','src','App.jsx'),'utf8'),/aria-label="Oferta de feria"/);
});

test('estudio de mercado del Evaluador: S/ por m² por dormitorios y tamaño; referencia o tope en el sugerido',()=>{
 const {resumenMercado,dormDe}=require('../business/preciosEstrategia');
 assert.equal(dormDe('Flat 1D'),1);assert.equal(dormDe('Duplex 2D'),2);assert.equal(dormDe('Loft Garden'),1);assert.equal(dormDe('Flat 3D'),3);
 const c=(precio,area,d,estado='venta',moneda='PEN')=>({nombre:'P',precio,area,dmin:d,dmax:d,estado,moneda});
 const ev={id:'ev1',project:{nombre:'Infinity 224'},updated_at:'2026-10-28',analysis:{mercado:{precio_sugerido_m2:7100,rango_m2:[6800,7400]}},
  workspace:{mercado:{tc:3.75,descNeg:5,distrito:'Surquillo',comps:[c(330000,45,1),c(345000,48,1),c(320000,44,1),c(90000,46,1,'venta','USD'),c(420000,60,2),c(450000,62,2),c(440000,58,2),c(700000,95,3),c(100,50,1),c(300000,50,1,'usado')]}}};
 const m=resumenMercado(ev);assert.equal(m.comparables,8,'fuera: S/ m² absurdo y usados');
 const uno=m.por_dormitorios.find(g=>g.grupo==='1 dorm.');assert.equal(uno.n,4);assert.ok(uno.mediana>6500&&uno.mediana<7500);
 const r=calcular(limpiarConfig(cfgIn),{units:units(),separations:[]},new Date('2026-10-29'),m);
 const d602=r.unidades.find(u=>u.unidad==='602');assert.match(d602.mercado.criterio,/1 dorm\. y/);assert.ok(d602.posicion_mercado);
 const top=calcular(limpiarConfig({...cfgIn,mercado:{modo:'tope'}}),{units:units(),separations:[]},new Date('2026-10-29'),m);
 assert.ok(top.unidades.filter(u=>u.mercado?.p75_m2).every(u=>u.ratio_sugerido_m2<=u.mercado.p75_m2+3),'en modo tope ningún sugerido pasa el p75');
 assert.equal(r.mercado.comps,undefined,'la pantalla recibe el resumen, no los avisos crudos');
});
