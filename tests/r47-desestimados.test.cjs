'use strict';
// R47 · Un lead desestimado (acción «lost» del ciclo de vida) debe salir del Kanban y aparecer en «Perdidos / Desestimados»,
// donde Gerencia puede eliminarlo. Antes el cliente lo normalizaba a «Lead Inicial» y quedaba atrapado en el tablero.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'..','src','App.jsx'),'utf8');
test('Desestimado es una etapa reconocida y cerrada en la vista',()=>{
 assert.match(app,/const OPERATIONAL_STAGES=\[\.\.\.FUNNEL_STAGES,'Perdido','Desestimado'\];/);
 assert.match(app,/const CLOSED_LOST_STAGES=\['Perdido','Desestimado'\];/);
 assert.match(app,/const lostLeads=normalizedLeads\.filter\(lead=>CLOSED_LOST_STAGES\.includes\(lead\.status\)\)/);
 assert.match(app,/const dailyQueue=normalizedLeads\.filter\(lead=>!\[\.\.\.CLOSED_LOST_STAGES,'Venta'\]\.includes\(lead\.status\)\)/);
 assert.match(app,/case 'Perdido': case 'Desestimado':/);
});
test('el backend marca «lost» como Desestimado y permite eliminarlo solo desde esa etapa',()=>{
 const lc=fs.readFileSync(path.join(__dirname,'..','business','lifecycle.js'),'utf8'),q=fs.readFileSync(path.join(__dirname,'..','business','queries.js'),'utf8');
 assert.match(lc,/lead\.status='Desestimado'/);
 assert.match(q,/\['Perdido','Desestimado'\]\.includes\(lead\.status\)/);
});
