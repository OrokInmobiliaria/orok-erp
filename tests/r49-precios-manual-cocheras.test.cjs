'use strict';
// R49 · Estrategia de precios: ajuste manual por unidad (% sobre la etapa activa o precio fijo) además del automático,
// y los estacionamientos dentro de la meta con el mismo criterio (etapas, ajuste, manual, aplicar e historial).
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {calcular,limpiarConfig,limpiarManual,cocherasOcupadas,PreciosEstrategia,PRECIOS_METHODS}=require('../business/preciosEstrategia');
const U=[['D101_2','Loft Garden',59.2,378300],['D201_2','Flat 3D',91.67,590500],['D302_2','Flat 2D',53.79,349200],['D601_2','Flat 1D',46.06,306100]];
const base={proyecto:'Infinity 224',meta_recaudacion:2050000,unidades:U.map(u=>({unidad:u[0],tipo:u[1],area:u[2],precio_base:u[3]})),
 etapas:[{nombre:'Etapa 1',alza:0},{nombre:'Etapa 2',alza:.07,umbral:.35},{nombre:'Etapa 3',alza:.11,umbral:.7}]};
const units=()=>U.map((u,i)=>({id:'u'+i,unit_number:u[0].slice(1,4),price:u[3],status:'AVAILABLE'}));
const hoy=new Date('2026-10-29T12:00:00Z');

test('sin cocheras declaradas: A–D a S/ 56,000 entran en la lista y en la meta',()=>{
 const cfg=limpiarConfig(base);assert.deepEqual(cfg.cocheras.map(c=>c.codigo),['A','B','C','D']);
 const r=calcular(cfg,{units:units()},hoy);
 assert.equal(r.lista_etapa1,U.reduce((a,u)=>a+u[3],0)+4*56000);assert.equal(r.cocheras_total,4);
 const est=r.unidades.filter(u=>u.kind==='cochera');assert.equal(est.length,4);
 assert.ok(est.every(e=>e.precio_actual===56000&&e.en_erp&&e.precio_objetivo>=56000&&e.precio_objetivo%100===0));
 assert.throws(()=>limpiarConfig({...base,cocheras:[{codigo:'A',precio_base:5e4},{codigo:'a',precio_base:6e4}]}),/repetidos/);
});

test('manual: % sobre la etapa activa o precio fijo; lo manual no recibe el ajuste automático y el resto se recalcula',()=>{
 assert.equal(limpiarManual({modo:'pct',valor:.9}),null);assert.deepEqual(limpiarManual({modo:'pct',valor:-.05}),{modo:'pct',valor:-.05});
 assert.deepEqual(limpiarManual({modo:'precio',valor:300000.4}),{modo:'precio',valor:300000});assert.equal(limpiarManual({modo:'x'}),null);
 const auto=calcular(limpiarConfig(base),{units:units()},hoy);
 assert.ok(auto.ajuste_sugerido_pct>0);assert.ok(auto.unidades.every(u=>u.origen==='automatico'));
 const cfg=limpiarConfig({...base,unidades:base.unidades.map((u,i)=>i===0?{...u,manual:{modo:'precio',valor:350000}}:i===1?{...u,manual:{modo:'pct',valor:.05}}:u)});
 const r=calcular(cfg,{units:units()},hoy),u101=r.unidades.find(u=>u.unidad==='101'),u201=r.unidades.find(u=>u.unidad==='201');
 assert.equal(u101.precio_objetivo,350000);assert.equal(u101.origen,'manual');assert.equal(u101.diferencia_vs_actual,350000-378300);
 assert.equal(u201.precio_objetivo,Math.round(590500*1.05/100)*100);
 assert.equal(r.manual_total,350000+u201.precio_objetivo);
 // Se rebajó la 101 por debajo de lo automático: el resto sube más que antes para seguir apuntando a la meta.
 assert.ok(r.ajuste_sugerido_pct>auto.ajuste_sugerido_pct,`${r.ajuste_sugerido_pct} > ${auto.ajuste_sugerido_pct}`);
 const u302=r.unidades.find(u=>u.unidad==='302');assert.equal(u302.origen,'automatico');assert.equal(u302.precio_objetivo,u302.precio_sugerido);
 assert.equal(r.escenarios[0].ajuste_pct,r.ajuste_sugerido_pct);
});

test('cochera manual: precio fijo y % como cualquier unidad',()=>{
 const cfg=limpiarConfig({...base,cocheras:[{codigo:'A',precio_base:56000,manual:{modo:'precio',valor:60000}},{codigo:'B',precio_base:56000,manual:{modo:'pct',valor:-.1}},{codigo:'C',precio_base:58000}]});
 const r=calcular(cfg,{units:units()},hoy,null,{C:57000}),e=k=>r.unidades.find(u=>u.unidad==='EST-'+k);
 assert.equal(e('A').precio_objetivo,60000);assert.equal(e('B').precio_objetivo,50400);assert.equal(e('C').precio_actual,57000);assert.equal(e('C').origen,'automatico');
});

test('separación con estacionamiento: la parte de la cochera se cuenta en la cochera, no en el departamento',()=>{
 const data={units:units(),quotes:[{id:'q1',unit_id:'u2',price:349200+56000,parking:'B',parking_price:56000}],separations:[{id:'s1',unit_id:'u2',quote_id:'q1',status:'CONFIRMED',final_price:(349200+56000)*.95,confirmed_at:'2026-11-06T15:00:00Z'}]};
 const oc=cocherasOcupadas(data);assert.equal(oc.get('B').precio,Math.round(56000*.95));
 const r=calcular(limpiarConfig(base),data,hoy);
 assert.equal(r.unidades.find(u=>u.unidad==='302').precio_real,Math.round(349200*.95));assert.equal(r.unidades.find(u=>u.unidad==='EST-B').estado,'Separación');
 assert.equal(r.cocheras_vendidas,1);assert.equal(r.unidades_vendidas,1);assert.equal(r.recaudado,Math.round((349200+56000)*.95));
 assert.equal(cocherasOcupadas({...data,separations:[{...data.separations[0],status:'RELEASED'}]}).size,0,'liberada vuelve a estar libre');
});

test('aplicar: departamentos van a Inventario y cocheras a la estrategia; la cotización usa ese precio y bloquea la separada',async()=>{
 const docs=new Map(),col=n=>({doc:id=>({get:async()=>({data:()=>docs.get(n+'/'+id)}),_k:n+'/'+id})});
 const store={ref:{collection:col},db:{runTransaction:async fn=>fn({get:async r=>({data:()=>docs.get(r._k)}),set:(r,v)=>docs.set(r._k,v)})}};
 const p=new PreciosEstrategia(store);p.evaluaciones=async()=>[];
 const G={name:'Martín',role:'Gerente'};
 const cfg={...base,cocheras:[{codigo:'A',precio_base:56000,manual:{modo:'precio',valor:61000}},{codigo:'B',precio_base:56000}],unidades:base.unidades.map((u,i)=>i===0?{...u,manual:{modo:'precio',valor:390000}}:u)};
 const d={units:units(),quotes:[],separations:[]};
 await p.guardar({config:cfg},G,d);
 assert.equal(await p.precioCochera('A',d),56000,'antes de aplicar rige el precio vigente');
 const doc=await p.config(),ap=p.aplicarEnDatos(d,doc,['101','EST-A'],G);
 assert.deepEqual(ap.cambios.map(c=>[c.unidad,c.despues,c.origen]),[['101',390000,'manual'],['EST-A',61000,'manual']]);
 assert.equal(d.units[0].price,390000);assert.match(d.units[0].price_source,/ajuste manual/);
 await p.registrarAplicacion(ap);assert.equal(await p.precioCochera('A',d),61000);
 const sep={...d,quotes:[{id:'q',parking:'A',price:1,parking_price:61000}],separations:[{unit_id:'u1',quote_id:'q',status:'ACTIVE',final_price:1}]};
 await assert.rejects(p.precioCochera('A',sep),/ya está separado/);await assert.rejects(p.precioCochera('Z',d),/no existe/);
 assert.deepEqual((await p.cocheras(sep)).map(c=>[c.codigo,c.disponible]),[['A',false],['B',true]]);
 assert.ok(PRECIOS_METHODS.includes('preciosCocheras'));
});

test('cableado: cotización sin S/ 56,000 fijos, puente y pantalla',()=>{
 const rd=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
 const app=rd('application.cjs'),ui=rd('src/EstrategiaPrecios.jsx'),main=rd('src/App.jsx');
 assert.doesNotMatch(app,/:56000/);assert.match(app,/request\.parkingPrice=request\.parking==='Ninguno'\?0:await precios\.precioCochera\(/);
 assert.match(app,/parking_price:request\.parkingPrice/);
 assert.ok(rd('src/cloudBridge.js').includes("'preciosCocheras'"));
 assert.doesNotMatch(main,/Estacionamiento A \(\+ S\/ 56,000\)/);assert.match(main,/preciosCocheras/);
 for(const t of ['Ajuste manual','Precio objetivo','Asignar a marcadas','Volver a automático','Guardar ajustes manuales','Estacionamientos','Agregar estacionamiento'])assert.ok(ui.includes(t),t);
});

test('escalera hacia el precio ERP: Etapa 1 = oferta, sube por avance hasta el ERP congelado; aplicar no mueve la referencia',async()=>{
 const erpUnits=()=>U.map((u,i)=>({id:'u'+i,unit_number:u[0].slice(1,4),price:Math.round(u[3]*1.08/100)*100,status:'AVAILABLE'}));
 const cfg=limpiarConfig({...base,ancla:'erp',cocheras:[],etapas:[{nombre:'Etapa 1',umbral:0},{nombre:'Etapa 2',umbral:.35,avance:.5},{nombre:'Etapa 3',umbral:.7,avance:1}]});
 assert.equal(cfg.ancla,'erp');assert.deepEqual(cfg.etapas.map(e=>e.avance),[0,.5,1]);
 const d={units:erpUnits()},r=calcular(cfg,d,hoy),u=r.unidades.find(x=>x.unidad==='101');
 assert.equal(u.precio_erp,Math.round(378300*1.08/100)*100);assert.deepEqual(u.precios_etapas,[378300,Math.round((378300+(u.precio_erp-378300)/2)/100)*100,u.precio_erp]);
 assert.ok(r.etapas[0].vs_erp_pct<0&&r.etapas[2].vs_erp_pct===0,JSON.stringify(r.etapas));
 // Sin estudio de mercado y en modo rango: el techo del sugerido es el precio ERP.
 const t=calcular({...cfg,meta_recaudacion:9e6,mercado:{modo:'tope'}},d,hoy);assert.ok(t.unidades.every(x=>x.precio_sugerido<=x.precio_erp&&x.topado_por_erp),'techo ERP');
 assert.equal(t.diagnostico.alcanza_meta_con_techo,false);assert.match(t.diagnostico.recomendaciones.join(' '),/Sin estudio de mercado/);
 // Guardar congela el ERP de hoy; después de aplicar (Inventario cambia) la referencia se mantiene.
 const docs=new Map(),col=n=>({doc:id=>({get:async()=>({data:()=>docs.get(n+'/'+id)}),_k:n+'/'+id})});
 const p=new PreciosEstrategia({ref:{collection:col},db:{runTransaction:async fn=>fn({get:async r=>({data:()=>docs.get(r._k)}),set:(r,v)=>docs.set(r._k,v)})}});p.evaluaciones=async()=>[];
 await p.guardar({config:{...base,ancla:'erp',cocheras:[]}},{name:'G',role:'Gerente'},d);
 const congelado=(await p.config()).config.unidades[0].precio_erp;assert.equal(congelado,d.units[0].price);
 d.units[0].price=111100;await p.guardar({config:(await p.config()).config,revision:(await p.config()).revision},{name:'G',role:'Gerente'},d);
 assert.equal((await p.config()).config.unidades[0].precio_erp,congelado,'no se reemplaza al guardar');
 await p.guardar({config:(await p.config()).config,revision:(await p.config()).revision,refrescar_erp:true},{name:'G',role:'Gerente'},d);
 assert.equal((await p.config()).config.unidades[0].precio_erp,111100,'«Tomar precios ERP de hoy» sí lo actualiza');
});

test('lectura del mercado: oferta bajo p25, ERP sobre p75 y techo del mercado frente a la meta',()=>{
 const cfg=limpiarConfig({...base,ancla:'erp',cocheras:[],mercado:{modo:'tope'},unidades:base.unidades.map(u=>({...u,precio_erp:Math.round(u.precio_base*1.3)}))});
 const mercado={proyecto:'X',comparables:12,comps:[...Array(12)].map((_,i)=>({dormitorios:i%3+1,area:40+i*5,pm2:6800+i*40}))};
 const r=calcular(cfg,{units:units()},hoy,mercado);
 assert.equal(r.diagnostico.con_mercado,true);
 assert.ok(r.diagnostico.erp_sobre_p75.length>0,'ERP +30 % queda sobre el p75');
 assert.ok(r.unidades.filter(u=>u.kind==='unidad'&&u.mercado).every(u=>!u.precio_sugerido||u.precio_sugerido<=Math.max(u.precio_etapa,Math.round(u.mercado.p75_m2*u.area/100)*100)),'el sugerido no pasa el techo del mercado');
 assert.ok(r.diagnostico.recomendaciones.some(t=>/percentil 75/.test(t)));
});
