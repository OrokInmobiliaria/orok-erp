'use strict';
// R61 · Cuadro de áreas vendibles: repetir la distribución de un piso modelo del piso X al Y (numeración automática).
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'..','evaluador','app.js'),'utf8');
const trozo=(a,b)=>src.slice(src.indexOf(a),src.indexOf(b,src.indexOf(a)));
const {unitsRepetir}=new Function('esc','nf',trozo('function cabCuadre(){','function cabTablero(){')+';return {unitsRepetir};')(String,String);
const U=()=>[{id:'101',tipo:'Loft',piso:1,tech:57,libre:0,aj:0},{id:'301',tipo:'Flat 1D',piso:3,tech:40,libre:0,aj:0},{id:'302',tipo:'Flat 3D',piso:3,tech:56,libre:2,aj:1},{id:'401',tipo:'Flat 1D',piso:4,tech:45,libre:0,aj:0}];
test('repite el piso 3 del 4 al 8: numera 401, 402 … 802 y reemplaza lo que había en esos pisos',()=>{
 const r=unitsRepetir({units:U()},3,4,8);assert.deepEqual(r.pisos,[4,5,6,7,8]);assert.equal(r.nuevas.length,10);assert.equal(r.reemplazadas,1);
 assert.deepEqual(r.nuevas.slice(0,2).map(u=>[u.id,u.piso,u.tipo,u.tech,u.libre,u.aj]),[['401',4,'Flat 1D',40,0,0],['402',4,'Flat 3D',56,2,1]]);assert.equal(r.nuevas.at(-1).id,'802');
});
test('el piso modelo dentro del rango no se toca; errores claros',()=>{
 assert.deepEqual(unitsRepetir({units:U()},3,2,4).pisos,[2,4]);
 assert.throws(()=>unitsRepetir({units:U()},5,6,8),/no tiene unidades/);assert.throws(()=>unitsRepetir({units:U()},3,8,6),/rango/);assert.throws(()=>unitsRepetir({units:U()},3,3,3),/solo contiene/);
 const r=unitsRepetir({units:[{id:'A',tipo:'X',piso:2,tech:50,libre:0}]},2,10,10);assert.equal(r.nuevas[0].id,'1001','sin número de piso en el código: correlativo');
});
test('cableado: controles y acción en el cuadro de áreas vendibles',()=>{for(const t of ['Repetir distribución','id="rep-src"','id="rep-desde"','id="rep-hasta"','data-act="units-repetir"',"a==='units-repetir'"])assert.ok(src.includes(t),t)});
test('uso por unidad: vivienda, comercial u oficina con su propio precio y costo por m² (0 = igual que vivienda)',()=>{
 const {unitUso,usoPrecioM2,usoCostoM2}=new Function(trozo('const UNIT_USOS=','function compute(')+';return {unitUso,usoPrecioM2,usoCostoM2};')();
 const p={precioM2:6000,costoM2:2300,precioM2Comercial:8000,costoM2Comercial:0,precioM2Oficina:0,costoM2Oficina:2600};
 assert.equal(unitUso({}),'vivienda');assert.equal(unitUso({uso:'oficina'}),'oficina');assert.equal(unitUso({uso:'raro'}),'vivienda');
 assert.equal(usoPrecioM2(p,{uso:'comercial'}),8000);assert.equal(usoCostoM2(p,{uso:'comercial'}),2300);assert.equal(usoPrecioM2(p,{uso:'oficina'}),6000);assert.equal(usoCostoM2(p,{uso:'oficina'}),2600);assert.equal(usoPrecioM2(p,{}),6000);
 for(const t of ['usoPrecioM2(p,u)','usoCostoM2(p,u)-p.costoM2','data-k="units.${i}.uso"','Comercio y oficinas',"['comercial','Comercial (locales)']"])assert.ok(src.includes(t),t);
});
test('el modelo financiero usa el precio y el costo por m² del uso (ventas y construcción cambian; vivienda sin cambios)',()=>{
 const vm=require('node:vm'),c={};vm.createContext(c);vm.runInContext(src.split('//MODEL-START')[1].split('//MODEL-END')[0]+';this.S=JSON.parse(JSON.stringify(DEF));',c);
 const s=c.S,base=c.compute(s),u=s.units[0],t=+u.tech;
 u.uso='comercial';const igual=c.compute(s);assert.equal(igual.vDept,base.vDept,'0 = igual que vivienda');assert.equal(igual.constrSub,base.constrSub);
 s.p.precioM2Comercial=s.p.precioM2+1000;s.p.costoM2Comercial=s.p.costoM2+500;const m=c.compute(s);
 assert.ok(m.vDept>base.vDept,'sube la venta del local');assert.ok(Math.abs(m.constrSub-base.constrSub-t*500)<1e-6,'construcción: + techada × diferencia de costo');
});
