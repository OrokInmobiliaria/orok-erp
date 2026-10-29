'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const NOW=Date.parse('2026-10-26T15:00:00Z');
const days=n=>new Date(NOW-n*86400000).toISOString();
const lead=(extra={})=>({id:'l1',status:'Lead Inicial',received_at:days(1),last_activity_at:days(1),events:[],milestones:{},appointments:[],...extra});

test('el puntaje sube con la etapa alcanzada y se mantiene entre 0 y 100',async()=>{
 const {interestScore}=await import('../src/leadScore.mjs');
 const order=['Lead Inicial','Contactado','Información enviada','MQL','Cita','Cita Asistida','Calificado','Evaluación GNB','Separación','Inicial','Minuta'];
 const scores=order.map(status=>interestScore(lead({status}),NOW).score);
 for(let i=1;i<scores.length;i++)assert.ok(scores[i]>scores[i-1],order[i]+' debe superar a '+order[i-1]+': '+scores);
 const maxed=interestScore(lead({status:'Minuta',budget:500000,purchase_horizon:'1 mes',unit_interest:'2D',finance_status:'Aprobado',last_quote:{code:'C1'},appointments:[{status:'scheduled',scheduled_at:new Date(NOW+86400000).toISOString()}],bank_evaluation:{status:'Lista para enviar'}}),NOW);
 assert.equal(maxed.score,100);
 const worst=interestScore(lead({status:'Lead Inicial',contact_attempts:5,finance_status:'Rechazado',last_activity_at:days(60),received_at:days(60),appointments:[{status:'no_show',scheduled_at:days(40)}]}),NOW);
 assert.ok(worst.score>=0&&worst.score<20,String(worst.score));
});

test('venta, lead desestimado y baja solicitada no reciben puntaje',async()=>{
 const {interestScore}=await import('../src/leadScore.mjs');
 assert.deepEqual([interestScore(lead({status:'Venta'}),NOW).score,interestScore(lead({status:'Venta'}),NOW).band],[null,'Cerrado']);
 assert.equal(interestScore(lead({sold_unit_id:'u1'}),NOW).band,'Cerrado');
 assert.equal(interestScore(lead({status:'Desestimado'}),NOW).band,'Desestimado');
 assert.equal(interestScore(lead({opt_out:true}),NOW).band,'No contactar');
 assert.equal(interestScore(null,NOW).band,'Sin puntaje');
});

test('datos personales y sensibles no influyen en el puntaje',async()=>{
 const {interestScore}=await import('../src/leadScore.mjs');
 const base=lead({status:'MQL',budget:300000,purchase_horizon:'3 meses',unit_interest:'2D'});
 const other={...base,name:'Persona Distinta',dni:'12345678',marital_status:'Casado',district:'Surco',address:'Calle 1',email:'a@b.pe',phone:'+51999999999',age:61,gender:'F',monthly_income:99999,nationality:'Otra',source:'Otra fuente'};
 assert.deepEqual(interestScore(other,NOW),interestScore(base,NOW));
});

test('la visita agendada, la evaluación financiera y la cotización suman; la inasistencia y el rechazo restan',async()=>{
 const {interestScore}=await import('../src/leadScore.mjs');
 const base=interestScore(lead({status:'MQL'}),NOW).score;
 assert.equal(interestScore(lead({status:'MQL',last_quote:{}}),NOW).score-base,6);
 assert.equal(interestScore(lead({status:'MQL',finance_status:'Aprobado'}),NOW).score-base,8);
 assert.equal(interestScore(lead({status:'MQL',finance_status:'Rechazado'}),NOW).score-base,-10);
 assert.equal(interestScore(lead({status:'MQL',appointments:[{status:'scheduled',scheduled_at:new Date(NOW+3600000).toISOString()}]}),NOW).stage,'Cita');
 const future=interestScore(lead({status:'MQL',appointments:[{status:'scheduled',scheduled_at:new Date(NOW+3600000).toISOString()}]}),NOW);
 assert.ok(future.reasons.some(r=>/visita agendada/.test(r)));
 const noShow=interestScore(lead({status:'MQL',appointments:[{status:'no_show',scheduled_at:days(2)}]}),NOW);
 assert.ok(noShow.reasons.some(r=>/No asistió/.test(r)));
});

test('un lead en seguimiento conserva la etapa más avanzada alcanzada',async()=>{
 const {interestScore}=await import('../src/leadScore.mjs');
 const result=interestScore(lead({status:'Seguimiento',substatus:'Esperando banco',milestones:{mql:days(10),scheduled:days(8),attended:days(6)}}),NOW);
 assert.equal(result.stage,'Cita Asistida');
 assert.ok(result.score>=52-12&&result.score<=52+20);
});

test('la inactividad prolongada resta y la reciente suma',async()=>{
 const {interestScore}=await import('../src/leadScore.mjs');
 const fresh=interestScore(lead({status:'Contactado',last_activity_at:days(1)}),NOW).score;
 const week=interestScore(lead({status:'Contactado',last_activity_at:days(5)}),NOW).score;
 const old=interestScore(lead({status:'Contactado',last_activity_at:days(20)}),NOW).score;
 const dead=interestScore(lead({status:'Contactado',last_activity_at:days(45)}),NOW).score;
 assert.ok(fresh>week&&week>old&&old>dead,[fresh,week,old,dead].join(','));
});

test('calcular el puntaje no modifica el lead',async()=>{
 const {interestScore}=await import('../src/leadScore.mjs');
 const original=lead({status:'Cita',budget:1,events:[{type:'scheduled',at:days(2)}]}),copy=structuredClone(original);
 interestScore(original,NOW);
 assert.deepEqual(original,copy);
});
