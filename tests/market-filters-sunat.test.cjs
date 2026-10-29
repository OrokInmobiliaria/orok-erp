'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {validateRate}=require('../business/exchangeRate');
test('SUNAT exige origen, moneda, fecha reciente y valor válido; nunca fabrica un respaldo',()=>{
 const d={origen:'SUNAT',moneda:'USD',fecha:'2026-10-26',venta:3.451};
 assert.equal(validateRate(d,'2026-10-26').value,3.451);
 for(const change of [{venta:0},{venta:'no'},{fecha:'2026-10-27'},{fecha:'2026-10-01'},{origen:'Otro'},{moneda:'EUR'}])assert.throws(()=>validateRate({...d,...change},'2026-10-26'));
});
test('altura filtra también sin distancia y los límites geográficos permiten inclusión explícita',()=>{
 const src=fs.readFileSync(require.resolve('../evaluador/app.js'),'utf8');
 const code=src.slice(src.indexOf('const mAltKey='),src.indexOf('function mRateNote'));
 const ctx={S:{mercado:{alcance:'radio',cuadras:7,alturaFiltro:'a',distrito:'San Miguel'}}};vm.createContext(ctx);vm.runInContext(code,ctx);
 assert.equal(ctx.mComparableIncluded({pisos:9}),false);
 assert.equal(ctx.mComparableIncluded({pisos:5}),true);
 assert.equal(ctx.mComparableIncluded({pisos:5,distM:700}),true);
 assert.equal(ctx.mComparableIncluded({pisos:5,distM:701}),false);
 assert.equal(ctx.mComparableIncluded({pisos:9,distM:800,scopeOverride:true}),true);
 assert.equal(ctx.mComparableIncluded({pisos:9,scopeOverride:true,incl:false}),false);
 ctx.S.mercado.alcance='distrito';assert.equal(ctx.mComparableIncluded({pisos:5,distrito:'Surco'}),false);
 assert.equal(ctx.mComparableIncluded({pisos:5,distrito:'San Miguel'}),true);
});