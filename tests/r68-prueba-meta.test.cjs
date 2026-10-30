'use strict';
const test=require('node:test'),assert=require('node:assert');const fs=require('fs'),os=require('os'),path=require('path');
const {WhatsAppGateway}=require('../business/whatsappGateway');
test('R68: la prueba de Meta confirma número y suscripción sin exponer la llave',async()=>{
 const d=fs.mkdtempSync(path.join(os.tmpdir(),'wa'));fs.writeFileSync(path.join(d,'whatsapp-inbox.json'),JSON.stringify({accessToken:'SECRETO',apiVersion:'v26.0',businessAccountId:'2444699232563984',phoneNumberIds:['706464295879452']}));
 const g=new WhatsAppGateway(d,{requester:async(u,o)=>{const b=u.includes('subscribed_apps')?(o.method==='POST'?{success:true}:{data:[{whatsapp_business_api_data:{id:'1633244618375190',name:'OROK CRM Ventas'}}]}):{display_phone_number:'+51 912 971 742',status:'CONNECTED'};return {ok:true,status:200,json:()=>b};}});
 const r=await g.diagnose();assert.equal(r.app_suscrita,true);assert.equal(r.phones[0].numero,'+51 912 971 742');assert.ok(!JSON.stringify(r).includes('SECRETO'));
});
test('R68: sin token pide guardarlo primero',async()=>{const d=fs.mkdtempSync(path.join(os.tmpdir(),'wa'));const g=new WhatsAppGateway(d);await assert.rejects(()=>g.diagnose(),/token/);});
