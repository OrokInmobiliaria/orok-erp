'use strict';
const test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path');
test('R80: cuadro de áreas oficial fija las áreas del modelo',()=>{
 const s=fs.readFileSync(path.join(__dirname,'..','evaluador-src','evaluador.html'),'utf8'),b=fs.readFileSync(path.join(__dirname,'..','evaluador','app.js'),'utf8');
 for(const t of [s,b]){assert.match(t,/function cabOficialParse/);assert.match(t,/function cabOficialAplicar/);assert.match(t,/cabFijo\(k\)/);assert.match(t,/cab-oficial-importar/);}
 const src=s.slice(s.indexOf('const OF_COLS'),s.indexOf('function cabOficial(){'));
 const f=new Function('S',src+';return {cabOficialParse,cabOficialTot,cabOficialAplicar,cabFijo,ofPiso};');
 const st={cab:{},p:{},units:[{id:'802',tipo:'Flat 3D',aj:2,piso:8,tech:1,libre:1}]},X=f(st);
 const filas=X.cabOficialParse('Nivel;Común techada\nAzotea\t20.42\t27.00\t\t\t\t\n802\t15.00\t0.00\t0.00\t\t78.14\t20.43\n502\t0.00\t\t\t\t0.00\t0.00\n101\t50.16\t\t\t\t40,29\t18.91\nSot\t69.31\t\t\t\t0\t0');
 assert.equal(filas.length,5);const t=X.cabOficialTot(filas);assert.equal(t.vendT,118.43);assert.equal(t.comunT,154.89);assert.equal(t.tech,273.32);
 st.cab.oficial={activo:true,filas};X.cabOficialAplicar(st);
 assert.deepEqual(st.units.map(u=>[u.id,u.piso,u.tech,u.libre,u.tipo]),[['802',8,78.14,20.43,'Flat 3D'],['101',1,40.29,18.91,'Por definir']]);assert.equal(st.p.comunTechada,154.89);
 assert.ok(!X.cabFijo('units.0.tech'));assert.ok(!X.cabFijo('p.comunTechada')); // R81 · nada se bloquea
});
test('R81: dúplex, factor libre por unidad, costo de área libre y deshacer en cada módulo',()=>{
 const r=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8'),s=r('evaluador-src/evaluador.html');
 assert.match(s,/function fLib\(u,p\)/);assert.match(s,/units\.\$\{i\}\.niveles/);assert.match(s,/const areaConstr=areaTech\+libreV/);assert.match(s,/function costFac\(p\)/);assert.match(s,/id="undoGen" data-act="undo-gen"/);assert.match(s,/CRITERIOS DE CABIDA Y MIX/);
 const fLib=new Function(s.slice(s.indexOf('const UNIT_USOS'),s.indexOf('function usoCostoM2'))+';return fLib')();assert.equal(fLib({fl:''},{factorLibre:1}),1);assert.equal(fLib({fl:0.5},{factorLibre:1}),0.5);assert.equal(fLib({},{factorLibre:0.8}),0.8);
 const c=r('contabilidad-src/clara-contabilidad.html');assert.match(c,/id="undoGen"/);assert.match(c,/function undoRec/);
 assert.match(r('src/App.jsx'),/<BotonDeshacer\/>/);assert.match(r('src/dataService.js'),/registrarDeshacer/);assert.match(r('src/Greta.jsx'),/registrarDeshacer/);
});
test('R81: pila de deshacer del ERP',async()=>{
 const m=await import('../src/deshacer.js');let n=0,v=0;const off=m.suscribirDeshacer(c=>{n=c});
 m.registrarDeshacer('a',async()=>{v=1});m.registrarDeshacer('b',async()=>{v=2});assert.equal(n,2);assert.equal(await m.deshacer(),'b');assert.equal(v,2);assert.equal(await m.deshacer(),'a');assert.equal(v,1);assert.equal(await m.deshacer(),null);off();
});
test('R82: área libre vendible con precio por m² por unidad y vendible total en resúmenes',()=>{
 const s=fs.readFileSync(path.join(__dirname,'..','evaluador-src','evaluador.html'),'utf8');
 assert.match(s,/Área vendible total \(techada \+ libre\)/);assert.match(s,/units\.\$\{i\}\.pl/);assert.match(s,/ES VENDIBLE y siempre entra al precio/);
 const src=s.slice(s.indexOf('const UNIT_USOS'),s.indexOf('function usoCostoM2'));const f=new Function(src+';return fLib')();
 const p={precioM2:6000,factorLibre:1};assert.equal(f({},p),1);assert.equal(f({pl:3000},p),0.5);assert.equal(f({pl:'',fl:0.8},p),0.8);
});
