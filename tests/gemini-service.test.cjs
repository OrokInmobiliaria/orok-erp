'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {apiErrorMessage,generate,interactionText}=require('../business/geminiService');

test('interactionText accepts Interactions REST step output',()=>{
 assert.equal(interactionText({steps:[{content:[{type:'text',text:'Resumen listo'}]}]}),'Resumen listo');
});

test('API errors expose the safe Google reason and hide API keys',async()=>{
 const fetcher=async()=>({ok:false,status:403,json:async()=>({error:'Permission denied for key AIza123456789012345678901234567890'})});
 await assert.rejects(()=>generate('Prueba','test-key',fetcher),/Gemini HTTP 403: Permission denied for key \[clave oculta\]/);
 assert.match(apiErrorMessage({message:'Quota exceeded'},429),/HTTP 429: Quota exceeded/);
});

test('text generation uses Gemini 3.8 Interactions without server storage',async()=>{
 const calls=[];
 const fetcher=async(url,options={})=>{calls.push({url,options});return {ok:true,json:async()=>({output_text:'Respuesta lista'})};};
 const result=await generate('Resume el chat','test-key',fetcher);
 assert.equal(result,'Respuesta lista');assert.equal(calls.length,1);assert.match(calls[0].url,/v1beta\/interactions$/);
 const body=JSON.parse(calls[0].options.body);assert.equal(body.model,'gemini-3.8-flash');assert.equal(body.input,'Resume el chat');assert.equal(body.store,false);
});
