'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {allowedURL,safeFetch}=require('../safe-network.cjs');
const ok=()=>({status:200,headers:new Headers(),body:null});
test('Claude y el mapa pueden llamar a sus servicios, sin ampliar enlaces de usuarios',async()=>{
 const seen=[],fetch=safeFetch(async(url)=>{seen.push(url);return ok()});
 await fetch('https://api.anthropic.com/v1/messages');
 await fetch('https://nominatim.openstreetmap.org/search?q=Lima');
 assert.equal(seen.length,2);
 for(const u of ['https://api.anthropic.com/v1/messages','https://nominatim.openstreetmap.org/search','http://api.anthropic.com/','https://api.anthropic.com.evil.test/']) assert.throws(()=>allowedURL(u));
 await assert.rejects(fetch('https://api.anthropic.com.evil.test/'));
});
test('una redirección del proveedor no puede reenviar credenciales a otro servidor',async()=>{
 let count=0;const fetch=safeFetch(async()=>{count++;return {status:302,headers:new Headers({location:'https://drive.google.com/'}),body:null}});
 await assert.rejects(fetch('https://api.anthropic.com/v1/messages',{headers:{'x-api-key':'secreto'}}),/Redirección de servicio no autorizada/);
 assert.equal(count,1);
});
