'use strict';
// R33d · Las distancias ingresadas a mano no se sobrescriben con el cálculo automático; OpenAI queda permitido para el asistente.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {safeFetch}=require('../safe-network.cjs');
test('distancia manual: se respeta en el cálculo automático; vaciarla la devuelve al cálculo y nunca la deja en 0',()=>{
 const src=fs.readFileSync(require.resolve('../evaluador/app.js'),'utf8');
 const code=src.slice(src.indexOf('const mAltKey='),src.indexOf('function mRateNote'));
 const comps=[{direccion:'Av. La Marina 2600',distrito:'San Miguel'},{direccion:'Calle Laredo 226',distrito:'San Miguel'},{direccion:''}];
 const ctx={S:{mercado:{alcance:'radio',cuadras:7,distrito:'San Miguel',comps}}};vm.createContext(ctx);vm.runInContext(code,ctx);
 ctx.mDistManual(comps[0],'3.5');
 assert.deepEqual([comps[0].distManual,comps[0].distCuadras,comps[0].distM],[true,3.5,350]);
 const items=ctx.mGeoItems(ctx.S.mercado);assert.deepEqual(items.map(x=>x.index),[1]);
 const r=ctx.mApplyGeo(ctx.S.mercado,{items:[{index:0,lat:-12,lon:-77,distance_m:900},{index:1,lat:-12.1,lon:-77.1,distance_m:420}]});
 assert.equal(comps[0].distCuadras,3.5);assert.equal(comps[0].distM,350);assert.equal(comps[1].distCuadras,4.2);assert.deepEqual([r.n,r.kept],[1,1]);
 ctx.mDistManual(comps[0],'');assert.deepEqual([comps[0].distManual,comps[0].distCuadras,comps[0].distM],[false,null,null]);
 assert.deepEqual(ctx.mGeoItems(ctx.S.mercado).map(x=>x.index),[0,1]);
 const app=src;assert.match(app,/c\.distManual\?'cuadras · manual'/);
});
test('el asistente L.O.L.A puede salir a OpenAI, Anthropic y Gemini; otros destinos siguen bloqueados',async()=>{
 const seen=[];const f=safeFetch(async(url)=>{seen.push(url);return new Response('{}',{status:200,headers:{'content-type':'application/json'}})});
 for(const u of ['https://api.openai.com/v1/chat/completions','https://api.anthropic.com/v1/messages','https://generativelanguage.googleapis.com/v1beta/models/x:generateContent'])await f(u,{method:'POST'});
 assert.equal(seen.length,3);
 await assert.rejects(()=>f('https://evil.example/x'));await assert.rejects(()=>f('http://api.openai.com/v1'));
});
