'use strict';
const test=require('node:test'),assert=require('node:assert'),fs=require('fs'),os=require('os'),path=require('path');
const {metaEvents}=require('../business/whatsappInbox');const {WhatsAppGateway}=require('../business/whatsappGateway');
test('R72: el historial del celular llega como mensajes históricos (sin automatización)',()=>{
 const ev=metaEvents({object:'whatsapp_business_account',entry:[{changes:[{field:'history',value:{metadata:{phone_number_id:'706',display_phone_number:'51912971742'},history:[{threads:[{id:'51955318057',messages:[{from:'51955318057',id:'a',timestamp:'1',type:'text',text:{body:'Hola'}},{from:'51912971742',id:'b',timestamp:'2',type:'text',text:{body:'Buenas'}}]}]}]}}]}]});
 assert.equal(ev.length,2);assert.ok(ev.every(e=>e.historical));assert.equal(ev[0].message.direction,'inbound');assert.equal(ev[1].message.direction,'outbound');assert.equal(ev[1].phone,'51955318057');
});
test('R72: el registro integrado cambia el código, suscribe la app y pide la sincronización',async()=>{
 const d=fs.mkdtempSync(path.join(os.tmpdir(),'wa'));fs.writeFileSync(path.join(d,'whatsapp-inbox.json'),JSON.stringify({accessToken:'SYS',appSecret:'x'.repeat(32),apiVersion:'v26.0',businessAccountId:'2444',phoneNumberIds:['706']}));
 const calls=[];const g=new WhatsAppGateway(d,{requester:async(u,o={})=>{calls.push((o.method||'GET')+' '+u.replace(/client_secret=[^&]+/,'client_secret=***'));const b=u.includes('oauth/access_token')?{access_token:'BIZ'}:u.includes('smb_app_data')?{success:true,request_id:'r1'}:{success:true};return {ok:true,status:200,json:()=>b};}});
 const r=await g.signup({code:'abcdefghijklmnop',waba_id:'2444',phone_number_id:'706',event:'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING'});
 assert.equal(r.suscrita,true);assert.equal(r.sync.smb_app_state_sync.ok,true);assert.equal(r.sync.history.ok,true);
 assert.ok(calls.some(c=>c.startsWith('POST')&&c.includes('2444/subscribed_apps')));assert.equal(calls.filter(c=>c.includes('smb_app_data')).length,2);
 await assert.rejects(()=>g.sync('history'),/una sola vez/);
 assert.equal(g.setup().accessToken,'SYS');
});
