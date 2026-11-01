'use strict';
const test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path');
const s=fs.readFileSync(path.join(__dirname,'..','evaluador-src','evaluador.html'),'utf8');
const src=s.slice(s.indexOf('function calcPredial'),s.indexOf('function obraCurve'));
const X=new Function('sum',src+';return {calcPredial,predialPlan,vuObraTotal}')(a=>a.reduce((x,y)=>x+(+y||0),0));
test('R84: predial 2026 de la HR/PU cuadra (S/ 863.03)',()=>{assert.equal(Math.round(X.calcPredial(198838.68,5500).total*100)/100,863.03);});
test('R95: predial: antes de la obra lo paga el propietario; terreno durante la obra; un año de unidades',()=>{
 const p={inicio:'2026-01',predAnioBase:2026,areaTerreno:160,predArancel:396,predConstrExist:135478.68,uit:5500};
 const r=X.predialPlan(p,{units:[1,2]},{io:12,ent:26,ind:3,indStart:26,H:40,soldCum:new Array(41).fill(1),obraOficial:1000000});
 assert.deepEqual(r.anios.map(x=>[x.anio,x.etapa.split(' (')[0]]),[[2027,'Solo terreno'],[2028,'Solo terreno'],[2029,'Unidades terminadas']]);
 assert.equal(Math.round(r.anios[0].imp*100)/100,126.72);assert.equal(Math.round(r.anios[2].imp*100)/100,Math.round(X.calcPredial(63360+1000000,5500).total*100)/100);
 const r2=X.predialPlan({...p,predDesdeInicio:true},{units:[1]},{io:12,ent:26,ind:3,indStart:26,H:40,soldCum:new Array(41).fill(1),obraOficial:0});assert.equal(r2.anios[0].etapa,'Terreno + casa existente');assert.equal(Math.round(r2.anios[0].imp*100)/100,863.03);
});
test('R84: datos de la HR/PU de Infinity y campos en Tributarios',()=>{assert.match(s,/predArancel=396/);assert.match(s,/predConstrExist=135478\.68/);assert.match(s,/Impuesto predial año por año/);assert.doesNotMatch(s,/10798879|KARMIGATEK/i);});
test('R85/R95: arbitrios y emisión por año',()=>{
 const p={inicio:'2026-01',predAnioBase:2026,areaTerreno:160,predArancel:396,predConstrExist:135478.68,uit:5500,predEmision:4.79,arbAnual:813.12,predDesdeInicio:true};
 const r=X.predialPlan(p,{units:[1,2,3,4]},{io:12,ent:26,ind:3,indStart:26,H:40,soldCum:new Array(41).fill(1),obraOficial:0});
 assert.equal(Math.round(r.anios[0].imp*100)/100,867.82);assert.equal(r.anios[0].arb,813.12);assert.equal(r.anios.at(-1).arb,813.12);
 const r2=X.predialPlan({...p,arbUnidad:300},{units:[1,2,3,4]},{io:12,ent:26,ind:3,indStart:26,H:40,soldCum:new Array(41).fill(1),obraOficial:0});assert.equal(r2.anios.at(-1).arb,1200);
 assert.match(s,/arbAnual=813\.12/);
});
test('R87: arbitrios durante la obra editables, evidencia y cristal en Evaluador y Contabilidad',()=>{
 const p={inicio:'2026-01',predAnioBase:2026,areaTerreno:160,predArancel:396,predConstrExist:1,uit:5500,arbAnual:813.12,arbTerreno:300};
 const r=X.predialPlan({...p,predDesdeInicio:true},{units:[1]},{io:12,ent:26,ind:3,indStart:20,H:30,soldCum:new Array(31).fill(1),obraOficial:0});assert.equal(r.anios[0].arb,813.12);assert.equal(r.anios[1].arb,300);
 const r2=X.predialPlan({...p,arbTerreno:'',predDesdeInicio:true},{units:[1]},{io:12,ent:26,ind:3,indStart:20,H:30,soldCum:new Array(31).fill(1),obraOficial:0});assert.equal(r2.anios[1].arb,813.12);
 assert.match(s,/TRIBUTOS MUNICIPALES \(R87/);assert.match(s,/p\.arbFuente/);
 for(const f of ['evaluador-src/evaluador.html','contabilidad-src/clara-contabilidad.html'])assert.match(fs.readFileSync(path.join(__dirname,'..',f),'utf8'),/R87 · Cristal 2\.0/);
});

test('R96: predial y costo del banco se editan desde Supuestos',()=>{
 assert.match(s,/fld\('p\.predAniosUnidades'/);assert.match(s,/id="i-p-predDesdeInicio" data-k="p\.predDesdeInicio"/);assert.match(s,/id="i-p-interesModo" data-k="p\.interesModo"/);
});
