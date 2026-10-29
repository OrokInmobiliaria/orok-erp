'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {saveEvaluation,transitionEvaluation,progress,conversationGuidance}=require('../business/bankEvaluationService');

const full={financing_type:'Hipotecario',applicants:[{name:'Ana Pérez',dni:'12345678',marital_status:'Soltera',gross_income:7200,employment_tenure:'3 años',first_home:true,email:'ana@example.com',phone:'955111222'}],initial_payment:70000,unit_price:420000,unit_number:'804',quote_id:'q1'};

test('la ficha GNB reutiliza datos, pide solo faltantes y requiere resultado humano',()=>{
 const d={leads:[{id:'l1',status:'Calificado',name:'Ana Pérez',email:'ana@example.com',phone:'955111222',events:[]}]};
 const evaluation=saveEvaluation(d,'l1',full,'Asesor');
 assert.equal(progress(evaluation).ready,true);
 assert.equal(evaluation.status,'Pendiente confirmación');
 assert.equal(d.leads[0].status,'Evaluación GNB');
 transitionEvaluation(d,'l1','Ficha completa',{},'Asesor');
 assert.throws(()=>transitionEvaluation(d,'l1','Aprobada',{},'Asesor'),/primero el envío/i);
 transitionEvaluation(d,'l1','Enviada a GNB',{reference:'exp-100'},'Asesor');
 transitionEvaluation(d,'l1','Aprobada',{reference:'correo GNB'},'Asesor');
 assert.equal(d.leads[0].status,'Calificado');
 assert.equal(d.leads[0].bank_evaluation.status,'Aprobada');
 assert.deepEqual(conversationGuidance(d.leads[0]).missing,[]);
});

test('compra directa omite GNB y conserva trazabilidad',()=>{
 const d={leads:[{id:'l2',status:'Evaluación GNB',name:'Luis',events:[],bank_evaluation:{financing_type:'Hipotecario',applicants:[]}}]};
 const evaluation=saveEvaluation(d,'l2',{financing_type:'Directo'},'Asesor');
 assert.match(evaluation.status,/No aplica/);
 assert.equal(d.leads[0].status,'Calificado');
 assert.equal(d.leads[0].purchase_method,'Directo');
});
