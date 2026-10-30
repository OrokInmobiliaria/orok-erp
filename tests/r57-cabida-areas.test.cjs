'use strict';
// R57 · Cabida: cálculo de áreas por piso (techada = circulación + muros + comunes + vendible), % ⇄ m², piso sobre piso,
// coeficiente sin sótanos, área libre del primer piso y terreno por frente × fondo. «Datos generales» colapsable.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'..','evaluador','app.js'),'utf8');
const trozo=(a,b)=>src.slice(src.indexOf(a),src.indexOf(b,src.indexOf(a)));
const codigo=trozo('const CAB_USOS=','V.cabida=()=>{');
const {cabDefault,cabCalc}=new Function(codigo+';return {cabDefault,cabCalc};')();
// R58: cabTablero/cabCuadre/cabLlevar viven después de V.cabida; aquí solo se prueban los cálculos.
const S0={p:{areaTerreno:160,uso:'Vivienda multifamiliar · 8 pisos + azotea + sótano',nEstac:4},units:[{piso:1},{piso:2},{piso:3},{piso:3}]};
test('cabida por defecto desde datos generales: huella, pisos, sótano y azotea',()=>{
 const c=cabDefault(S0);assert.equal(c.param.pisosMax,8);assert.deepEqual(c.pisos.map(f=>f.nivel),['Sótano 1','Piso 1','Piso 2','Piso 3','Piso 4','Piso 5','Piso 6','Piso 7','Piso 8','Azotea']);
 assert.equal(c.pisos[1].tech,104);assert.equal(c.pisos[1].libre,56);assert.equal(c.pisos[3].und,2);assert.equal(c.pisos[0].estac,4);assert.equal(c.pisos[9].tech,36.4);
});
test('totales: vendible, eficiencia, coeficiente sin sótanos y área libre del primer piso',()=>{
 const S={...S0,cab:cabDefault(S0)};const {rows,t}=cabCalc(S);
 assert.equal(Math.round(rows[2].vend*100)/100,83.2,'piso típico: 104 × (1 − 20 %)');
 assert.equal(Math.round(t.techSobre*100)/100,104*8+36.4);
 assert.equal(Math.round(t.libreP1Pct*100),35);assert.equal(t.pisos,8);assert.ok(t.eficSobre>0.75&&t.eficSobre<0.85);
 S.cab.param.frente=8;S.cab.param.fondo=20;assert.equal(cabCalc(S).t.areaMedidas,160);
});
test('cableado: % ⇄ m², piso encima, sótano, azotea, usar en el modelo y «Datos generales» colapsable',()=>{
 for(const t of ["cab\\.pisos\\.(\\d+)\\.(circ|muros|comun)M2$","a==='cab-dup'","a==='cab-sotano'","a==='cab-azotea'","a==='cab-usar'","a==='cab-medidas'",'<details class="panel" id="cabDatos"',"e.target.id==='cabDatos'",'Área por medidas (frente × fondo)','Cálculo de áreas por piso'])assert.ok(src.includes(t),t);
 assert.ok(fs.readFileSync(path.join(__dirname,'..','evaluador-src','evaluador.html'),'utf8').includes('function cabTablero()'),'la fuente del Evaluador tiene el tablero');
});
