'use strict';
// R65 · Respuestas del formulario (inicial, presupuesto, tipología…) en el lead, el Kanban y el puntaje.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {parseLeadCSV,syncLeads}=require('../business/leadImport.js');
const CSV='FECHA,NOMBRE,TELÉFONO,EMAIL,"Depas desde 43 a 97m2 desde S/316,000, ¿esta dentro de tu presupuesto?","¿Con cuanto de inicial cuentas?","¿Buscas un Depa en San Miguel de 1-2 y 3 Dorm, de 43 a 97 m²?",CAMPAÑA,ANUNCIO,PLATAFORMA,STATUS,COMENTARIO\n2026-09-07,Marcela Ramos,51998072239,m@x.com,si,40 mil,si,LC,P2,ig,NO CONTESTO,llamar';
test('la hoja de LeadCenter conserva las preguntas del formulario y actualiza leads existentes',()=>{
 const it=parseLeadCSV(CSV)[0];assert.deepEqual(it.form_answers.map(x=>x.v),['si','40 mil','si']);assert.equal(it.comments,'llamar');
 const lead={id:'l1',lead_number:'LD-0275',name:'Marcela Ramos Romero',phone:'51998072239',email:'m@x.com',status:'Lead Inicial'},leads=[lead];
 const r=syncLeads(leads,[it],false,'sheet:x');assert.equal(r.result.updated,1);assert.equal(r.leads[0].form_answers[1].v,'40 mil');
});
test('etiquetas cortas, respuestas y señales para el puntaje',async()=>{
 const {respuestas,senales,etiqueta}=await import('../src/formAnswers.mjs'),{interestScore}=await import('../src/leadScore.mjs');
 const lead={status:'Lead Inicial',form_answers:parseLeadCSV(CSV)[0].form_answers};
 assert.deepEqual(respuestas(lead).map(r=>r.etiqueta),['Presupuesto','Inicial','Tipología']);assert.equal(etiqueta('¿Con qué banco tienes tu crédito?'),'Financiamiento');
 assert.deepEqual(senales(lead).map(s=>s[0]),[4,6,3]);
 const base=interestScore({status:'Lead Inicial'}).score,con=interestScore(lead).score;assert.equal(con-base,13);assert.ok(interestScore(lead).reasons.some(t=>/declaró inicial \(40 mil\)/.test(t)));
 assert.ok(senales({form_answers:[{k:'¿Esta dentro de tu presupuesto?',v:'No'}]})[0][0]<0);
});
test('cableado: tarjeta del Kanban y formularios de Meta',()=>{
 assert.match(fs.readFileSync(path.join(__dirname,'..','src','App.jsx'),'utf8'),/kanban-form-answers/);
 assert.match(fs.readFileSync(path.join(__dirname,'..','business','omnichannel.js'),'utf8'),/lead\.form_answers=metaFormPairs/);
});
