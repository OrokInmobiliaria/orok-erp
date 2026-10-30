'use strict';
// R60 · «Ajustar a las unidades» (el piso toma el área real de sus departamentos), Evaluador a todo el ancho
// y el botón «Dictar o adjuntar» se pide con la versión en la dirección (sin copias viejas con el botón flotante).
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const R=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8'),src=R('evaluador/app.js');
const trozo=(a,b)=>src.slice(src.indexOf(a),src.indexOf(b,src.indexOf(a)));
const f=new Function('esc','nf',trozo('const CAB_USOS=','V.cabida=()=>{')+trozo('function cabCuadre(){','function cabTablero(){')+';return {cabDefault,cabCalc,cabAjustar};')(String,String);
test('tres departamentos en un piso se suman y «Ajustar a las unidades» iguala el cálculo',()=>{
 const S={p:{areaTerreno:320,uso:'Vivienda · 4 pisos'},units:[{piso:3,tech:64.36,libre:0},{piso:3,tech:53.79,libre:0},{piso:3,tech:40,libre:4.39}]};S.cab=f.cabDefault(S);
 const i=S.cab.pisos.findIndex(x=>x.nivel==='Piso 3');let r=f.cabCalc(S).rows[i];assert.equal(r.uN,3);assert.equal(Math.round(r.uTech*100)/100,158.15);assert.ok(r.vend-r.uTech>1);
 assert.equal(f.cabAjustar(S,i),true);r=f.cabCalc(S).rows[i];assert.ok(Math.abs(r.vend-158.15)<0.02,'vendible del cálculo = unidades');assert.equal(r.libreV,4.39);assert.equal(r.und,3);
 const p2=S.cab.pisos.findIndex(x=>x.nivel==='Piso 2');assert.equal(f.cabAjustar(S,p2),false,'un piso sin unidades no cambia');
});
test('cableado: botones de ajuste, ancho completo y versión en la dirección del botón de IA',()=>{
 for(const t of ["a==='cab-ajustar'","a==='cab-ajustar-todo'",'Ajustar todos los pisos a las unidades','mismo número de piso'])assert.ok(src.includes(t),t);
 assert.match(R('src/App.jsx'),/\['evaluador','contabilidad','ordenesErp'\]\.includes\(activeTab\)\) \? '100%'/);
 assert.ok(R('server.cjs').includes("ia-rellenar.js?v='+encodeURIComponent(require('./package.json').version)"));
 assert.ok(R('build.mjs').includes('ia-rellenar.js?v='));assert.ok(R('dist/index.html').includes('/ia-rellenar.js?v=67.6.45-r60'));
 assert.ok(R('public/ia-rellenar.js').includes('retirarFlotante'));
});
