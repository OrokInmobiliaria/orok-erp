'use strict';
const test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path');
const s=fs.readFileSync(path.join(__dirname,'..','evaluador-src','evaluador.html'),'utf8');
const src=s.slice(s.indexOf('function calcPredial'),s.indexOf('function obraCurve'));
const X=new Function('sum',src+';return {calcPredial,predialPlan,vuObraTotal}')(a=>a.reduce((x,y)=>x+(+y||0),0));
test('R84: predial 2026 de la HR/PU cuadra (S/ 863.03)',()=>{assert.equal(Math.round(X.calcPredial(198838.68,5500).total*100)/100,863.03);});
test('R84: predial año por año: casa, terreno, unidades sin vender',()=>{
 const p={inicio:'2026-01',predAnioBase:2026,areaTerreno:160,predArancel:396,predConstrExist:135478.68,uit:5500};
 const soldCum=new Array(61).fill(0).map((_,t)=>t<30?0.5:t<42?0.75:1);
 const r=X.predialPlan(p,{},{io:12,ind:3,indStart:20,H:60,soldCum,obraOficial:1000000});
 assert.deepEqual(r.anios.map(x=>[x.anio,x.etapa.split(' (')[0],Math.round(x.imp*100)/100]),[[2026,'Terreno + casa existente',863.03],[2027,'Solo terreno',126.72],[2028,'Unidades sin vender',Math.round(X.calcPredial(0.5*(63360+1000000),5500).total*100)/100],[2029,'Unidades sin vender',Math.round(X.calcPredial(0.25*(63360+1000000),5500).total*100)/100]]);
 assert.match(r.pago,/^1:/);
 const r2=X.predialPlan({...p,inicio:'2026-06'},{},{io:12,ind:3,indStart:20,H:20,soldCum,obraOficial:0});assert.equal(Math.round(r2.anios[0].imp*100)/100,431.52);
});
test('R84: datos de la HR/PU de Infinity y campos en Tributarios',()=>{assert.match(s,/predArancel=396/);assert.match(s,/predConstrExist=135478\.68/);assert.match(s,/Impuesto predial año por año/);assert.doesNotMatch(s,/10798879|KARMIGATEK/i);});
test('R85: arbitrios y emisión año por año',()=>{
 const p={inicio:'2026-01',predAnioBase:2026,areaTerreno:160,predArancel:396,predConstrExist:135478.68,uit:5500,predEmision:4.79,arbAnual:813.12};
 const r=X.predialPlan(p,{units:[1,2,3,4]},{io:12,ind:3,indStart:20,H:40,soldCum:new Array(41).fill(0).map((_,t)=>t<30?0.5:1),obraOficial:0});
 assert.equal(Math.round(r.anios[0].imp*100)/100,867.82);assert.equal(r.anios[0].arb,813.12);assert.equal(r.anios[2].arb,813.12*0.5);
 const r2=X.predialPlan({...p,arbUnidad:300},{units:[1,2,3,4]},{io:12,ind:3,indStart:20,H:40,soldCum:new Array(41).fill(0).map((_,t)=>t<30?0.5:1),obraOficial:0});assert.equal(r2.anios[2].arb,600);
 assert.match(s,/arbAnual=813\.12/);
});
