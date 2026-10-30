'use strict';
// R58 · Cabida: altura máxima municipal en pisos o en metros (sin coeficiente de edificación) y puente
// cálculo por piso → cuadro de áreas vendibles (unidades con área techada y libre). El tablero no reemplaza al cuadro.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'..','evaluador','app.js'),'utf8');
const trozo=(a,b)=>src.slice(src.indexOf(a),src.indexOf(b,src.indexOf(a)));
const codigo=trozo('const CAB_USOS=','V.cabida=()=>{')+trozo('function cabCuadre(){','function cabTablero(){');
const f=new Function('esc','nf',codigo+';return {cabDefault,cabCalc,cabPisosMax,cabAltura,cabLlevar};')(String,(v)=>String(v));
const S0={p:{areaTerreno:200,uso:'Vivienda multifamiliar · 6 pisos',nEstac:0},units:[]};
test('altura en metros: pisos = 1 + ⌊(altura − primer piso) / entrepiso⌋',()=>{
 assert.equal(f.cabPisosMax({alturaModo:'metros',alturaM:18,alturaP1:3,entrepiso:2.7}),6);
 assert.equal(f.cabPisosMax({alturaModo:'metros',alturaM:18.9,alturaP1:3,entrepiso:2.65}),7);
 assert.equal(f.cabPisosMax({alturaModo:'metros',alturaM:2,alturaP1:3,entrepiso:2.7}),0);
 assert.equal(f.cabPisosMax({alturaModo:'pisos',pisosMax:8,alturaM:30}),8,'en pisos se usa el número directo');
 assert.equal(Math.round(f.cabAltura({alturaP1:3,entrepiso:2.7},6)*100)/100,16.5);
});
test('sin coeficiente: los pisos por defecto salen de la altura y el parámetro antiguo se descarta',()=>{
 const c=f.cabDefault(S0,{coefMax:3,alturaModo:'metros',alturaM:13.8});
 assert.equal(c.param.coefMax,undefined);assert.equal(c.pisos.filter(x=>x.uso!=='sotano'&&x.uso!=='azotea').length,5);
 assert.ok(!src.includes('cab.param.coefMax'),'ya no se pide el coeficiente');
});
test('el cálculo alimenta el cuadro de unidades: solo pisos sin unidades, área repartida en partes iguales',()=>{
 const S={...S0,units:[{id:'201',piso:2,tech:60,libre:0},{id:'202',piso:2,tech:40,libre:0}]};S.cab=f.cabDefault(S);
 S.cab.pisos.forEach(x=>{if(x.uso==='tipico'||x.uso==='primero')x.und=2});S.cab.pisos[0].libreV=20;
 const {rows}=f.cabCalc(S);const p2=rows.find(r=>r.piso===2);assert.equal(p2.uN,2);assert.equal(p2.uTech,100);
 const nu=f.cabLlevar(S);assert.ok(!nu.some(u=>u.piso===2),'el piso 2 ya tiene unidades: no se toca');
 const p1=nu.filter(u=>u.piso===1);assert.equal(p1.length,2);assert.deepEqual(p1.map(u=>u.id),['101','102']);
 const v1=rows.find(r=>r.piso===1).vend;assert.equal(p1[0].tech,Math.round(v1/2*100)/100);assert.equal(p1[0].libre,10);assert.equal(p1[0].tipo,'Por definir');
});
test('cableado: selector pisos/metros, botón «Llevar al cuadro de unidades» y cuadre por piso',()=>{
 for(const t of ['data-k="cab.param.alturaModo"',"a==='cab-llevar'",'Llevar al cuadro de unidades','id="cabCuadre"','${cabCuadre()}','Altura de entrepiso'])assert.ok(src.includes(t),t);
});
