'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const leads=[
 {id:'a1',lead_number:'LD-0171',name:'José Pérez García',dni:'48448113',phone:'51 900 000 001',email:'jose.perez@orok.com.pe',source:'Instagram',campaign_name:'Showroom octubre',sales_owner:'Antonio Garces',last_quote:{code:'2026-0001508',unit_number:'302'}},
 {id:'b2',lead_number:'LD-0039',name:'Giovanna Romero',phone:'+51952393267',email:'giro0408@gmail.com',source:'Facebook'},
 {id:'c3',lead_number:'LD-0040',name:'Pérez Lucía',phone:'987654321',source:'TikTok'},
];
test('busca por código, DNI, teléfono en cualquier formato, correo y cotización',async()=>{
 const {searchLeads}=await import('../src/leadSearch.mjs');const ids=q=>searchLeads(leads,q).map(r=>r.lead.id);
 assert.deepEqual(ids('LD-0171'),['a1']);assert.deepEqual(ids('ld0171'),['a1']);
 assert.deepEqual(ids('48448113'),['a1']);
 assert.deepEqual(ids('952 393 267'),['b2']);assert.deepEqual(ids('51952393267'),['b2']);assert.deepEqual(ids('+51 952393267'),['b2']);assert.deepEqual(ids('393267'),['b2']);
 assert.deepEqual(ids('giro0408'),['b2']);
 assert.deepEqual(ids('2026-0001508'),['a1']);
});
test('varias palabras deben coincidir todas, sin importar tildes ni orden',async()=>{
 const {searchLeads}=await import('../src/leadSearch.mjs');const ids=q=>searchLeads(leads,q).map(r=>r.lead.id);
 assert.deepEqual(ids('perez').sort(),['a1','c3']);
 assert.deepEqual(ids('jose perez'),['a1']);assert.deepEqual(ids('PEREZ josé'),['a1']);
 assert.deepEqual(ids('perez tiktok'),['c3']);
 assert.deepEqual(ids('perez garces'),['a1']);
 assert.deepEqual(ids('nadie'),[]);assert.deepEqual(ids('   '),[]);
});
test('busca por usuario de Instagram u otra red e indica en qué campo coincidió',async()=>{
 const {searchLeads,socialHandles}=await import('../src/leadSearch.mjs');
 const social=socialHandles([{channel:'instagram',lead_id:'c3',name:'lucia.depas'},{channel:'whatsapp',lead_id:'b2',name:'x'}]);
 const r=searchLeads(leads,'@lucia.depas',{social});assert.deepEqual(r.map(x=>x.lead.id),['c3']);assert.deepEqual(r[0].matched,['red social']);
 assert.deepEqual(searchLeads(leads,'48448113')[0].matched,['DNI']);
});
test('las coincidencias exactas de código o teléfono van primero',async()=>{
 const {searchLeads}=await import('../src/leadSearch.mjs');
 const many=[{id:'x',name:'Cliente 900000001 referido'},{id:'y',name:'Otro',phone:'900000001'}];
 assert.equal(searchLeads(many,'900000001')[0].lead.id,'y');
});
