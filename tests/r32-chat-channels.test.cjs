'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const threads=[{channel:'whatsapp',lead_id:'a',thread_id:'a',last_message_at:'2026-10-26T10:00:00Z',preview:'Hola'},{channel:'instagram',lead_id:'a',thread_id:'ig1',last_message_at:'2026-10-26T12:00:00Z',preview:'Precio del 302?'},{channel:'messenger',lead_id:null,thread_id:'m1',name:'Sin vínculo',last_message_at:'2026-10-25T09:00:00Z'},{channel:'telegram',lead_id:'a',thread_id:'x'},{channel:'tiktok',lead_id:'b',thread_id:'tt1',last_message_at:'2026-10-24T09:00:00Z',preview:'info'}];
const leads=[{id:'a',name:'Ana Pérez',phone:'51911111111'},{id:'b',name:'Beto',phone:''},{id:'c',name:'Carla',phone:'51 922 222 222'}];
test('cada tarjeta muestra los canales del lead en orden fijo; WhatsApp solo si hay teléfono o conversación',async()=>{
 const {indexByLead,channelsForLead}=await import('../src/chatChannels.mjs');const idx=indexByLead(threads);
 assert.deepEqual(channelsForLead(leads[0],idx).map(c=>c.channel),['whatsapp','instagram']);
 assert.equal(channelsForLead(leads[0],idx)[1].thread_id,'ig1');
 assert.deepEqual(channelsForLead(leads[1],idx).map(c=>c.channel),['tiktok']);
 assert.deepEqual(channelsForLead(leads[2],idx).map(c=>[c.channel,c.has_messages]),[['whatsapp',false]]);
 assert.equal(idx.a.some(t=>t.channel==='telegram'),false);
});
test('la bandeja cuenta por red, filtra por pestaña y búsqueda y ordena por lo más reciente',async()=>{
 const {inboxView}=await import('../src/chatChannels.mjs');
 const all=inboxView(threads,leads);assert.deepEqual(all.counts,{all:4,whatsapp:1,instagram:1,messenger:1,tiktok:1});
 assert.deepEqual(all.list.map(r=>r.thread_id),['ig1','a','m1','tt1']);
 assert.equal(all.list.find(r=>r.thread_id==='m1').display_name,'Sin vínculo');assert.equal(all.list.find(r=>r.thread_id==='m1').linked,false);
 assert.deepEqual(inboxView(threads,leads,{channel:'instagram'}).list.map(r=>r.display_name),['Ana Pérez']);
 assert.deepEqual(inboxView(threads,leads,{query:'302'}).list.map(r=>r.thread_id),['ig1']);
});
