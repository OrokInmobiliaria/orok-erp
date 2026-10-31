'use strict';
const test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path');
const {AsistenteIA,limpiarCampos,fechaHora}=require('../business/asistenteIA');
const lead={id:'l1',lead_number:'LD-0001',name:'Juan Pérez',status:'Contactado',sales_owner:'Ana',phone:'51999888777',comment_history:[{at:'2026-10-30T15:00:00Z',author:'Ana',text:'Pidió el 502'}]};
const otro={id:'l2',lead_number:'LD-0002',name:'Rosa Díaz',status:'Nuevo',sales_owner:'Luis'};
const D={leads:[lead,otro],settings:{}};
function lola(respuesta){const calls=[];return {calls,raw:()=>({enabled:true,provider:'openai'}),key:()=>({key:'k'}),count:async()=>{},lecciones:{instrucciones:async()=>'\nLECCION X'},call:async(c,k,sys,msgs)=>{calls.push({sys,msgs});return JSON.stringify(respuesta);}};}
test('R76: limpieza de campos y fecha en hora de Lima',()=>{
 assert.deepEqual(limpiarCampos({dni:'12.345.678',email:'JP@Mail.com',budget:'US$ 180,000',address:'',x:'y'},{email:'otro@a.com'}),{dni:'12345678',email:'jp@mail.com',budget:180000});
 assert.deepEqual(limpiarCampos({dni:'123'},{}),{});
 assert.equal(fechaHora('2026-11-03','16:00'),'2026-11-03T21:00:00.000Z');assert.equal(fechaHora('mañana','10:00'),null);
});
test('R76: sugerencia de lead propone y respeta permisos',async()=>{
 const L=lola({resumen:'Interesado en 502',proxima_accion:{texto:'Llamar para enviar cotización',fecha:'2026-11-03',hora:'10:00'},etapa_sugerida:'MQL',campos:{budget:'200000',purchase_horizon:'1-3 meses',dni:'x'},comentario:''});
 const A=new AsistenteIA({lola:L,conversation:{get:async()=>({messages:[{direction:'inbound',text:'Hola, me interesa el 502',at:'2026-10-30'}]})}});
 const r=await A.sugerirLead({lead_id:'l1'},{name:'Ana',role:'Vendedor'},D);
 assert.equal(r.proxima_accion.at,'2026-11-03T15:00:00.000Z');assert.deepEqual(r.campos,{budget:200000,purchase_horizon:'1-3 meses'});assert.equal(r.etapa_sugerida,'MQL');
 assert.match(L.calls[0].sys,/LECCION X/);assert.match(L.calls[0].msgs[0].text,/me interesa el 502/);
 await assert.rejects(()=>A.sugerirLead({lead_id:'l2'},{name:'Ana',role:'Vendedor'},D),/no asignado/);
});
test('R76: barra Pídele a la IA solo deja acciones válidas',async()=>{
 const L=lola({respuesta:'Listo',acciones:[{tipo:'proxima_accion',lead_id:'l1',texto:'Llamar',fecha:'2026-11-04',hora:'16:00'},{tipo:'comentario',lead_id:'l2',texto:'no es suyo'},{tipo:'navegar',tab:'quotes'},{tipo:'navegar',tab:'inexistente'},{tipo:'borrar_todo'},{tipo:'completar_ficha',lead_id:'l1',campos:{email:'a@b.pe'}}]});
 const A=new AsistenteIA({lola:L,conversation:null});
 const r=await A.pedir({texto:'agenda llamar a Juan el miércoles a las 4'},{name:'Ana',role:'Vendedor'},D,{quotes:'Cotizaciones',kanban:'Leads'});
 assert.deepEqual(r.acciones.map(a=>a.tipo),['proxima_accion','navegar','completar_ficha']);assert.equal(r.acciones[0].at,'2026-11-04T21:00:00.000Z');
 assert.doesNotMatch(L.calls[0].msgs[0].text,/Rosa/);
 await assert.rejects(()=>A.pedir({texto:'a'},{name:'Ana',role:'Vendedor'},D,{}),/Escribe/);
});
test('R76: conexión en servidor y pantallas',()=>{
 const r=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
 assert.match(r('application.cjs'),/IA_ASISTENTE_METHODS/);assert.match(r('src/cloudBridge.js'),/iaPedir/);assert.match(r('src/dataService.js'),/iaSugerirLead/);
 assert.match(r('src/App.jsx'),/<PideIA /);assert.match(r('src/LeadComments.jsx'),/Sugerencia/);assert.match(r('src/theme.css'),/pide-ia-btn/);
});
