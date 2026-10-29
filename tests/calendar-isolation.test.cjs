"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {calendarId,DEFAULT_CALENDAR_ID}=require('../business/calendarIdentity');
const {saveSetup,readSetup}=require('../business/whatsappGateway');
const cal='lola_955318057@group.calendar.google.com';
const input={enabled:true,sendingEnabled:true,automaticEnabled:false,agendaEnabled:false,environment:'test',apiVersion:'v25.0',phoneNumberIds:['1289961847537245'],testRecipients:['51955318057'],businessAccountId:'1587372263406852',accessToken:'test_token_ASCII',appSecret:'a'.repeat(32),verifyToken:'b'.repeat(32)};
test('production preserves the sales calendar; rehearsal agenda cannot use primary or sales',()=>{
 assert.equal(calendarId({environment:'production',agendaEnabled:true}),DEFAULT_CALENDAR_ID);
 for(const id of ['primary','ventas@orok.com.pe','otro@example.test'])assert.throws(()=>calendarId({environment:'test',agendaEnabled:true,calendarId:id}),/exclusivo/);
 assert.equal(calendarId({environment:'test',agendaEnabled:true,calendarId:cal}),cal);
 assert.throws(()=>calendarId({environment:'production',calendarId:'https://calendar.example/test'}),/válido/);
});
test('malformed token or unsafe rehearsal calendar does not replace the existing private configuration',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'calendar-identity-'));
 try{
  saveSetup(dir,input,'Gerencia');const file=path.join(dir,'whatsapp-inbox.json'),before=fs.readFileSync(file,'utf8');
  for(const token of ['texto con espacios','Configuración guardada','token\tcontrol','token…truncado']){assert.throws(()=>saveSetup(dir,{...input,accessToken:token},'Gerencia'),/token de acceso/);assert.equal(fs.readFileSync(file,'utf8'),before);}
  assert.throws(()=>saveSetup(dir,{...input,agendaEnabled:true,calendarId:'ventas@orok.com.pe'},'Gerencia'),/exclusivo/);assert.equal(fs.readFileSync(file,'utf8'),before);
  const result=saveSetup(dir,{...input,accessToken:'',appSecret:'',verifyToken:'',calendarId:cal,agendaEnabled:true},'Gerencia');
  assert.equal(result.calendar_id,cal);assert.equal(readSetup(dir).accessToken,input.accessToken);assert.equal(result.agenda_enabled,true);assert.equal(JSON.stringify(result).includes(input.accessToken),false);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
