'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {analytics}=require('../business/analyticsService');

test('el tablero estructural expone GNB, documentos, asesores, inventario y calidad',()=>{
 const at='2026-10-20T15:00:00.000Z';
 const lead={id:'l1',name:'Ana',status:'Minuta',substatus:'Borrador bancaria',project:'Infinity 224',source:'Instagram',campaign_name:'Octubre',sales_owner:'Asesor 1',received_at:at,tracking_started_at:at,last_activity_at:at,phone:'955111222',email:'ana@example.com',events:[{type:'attended',at,lead_id:'l1'},{type:'separation',at,lead_id:'l1'}],bank_evaluation:{financing_type:'Hipotecario',status:'Aprobada',sent_at:at,unit_number:'804'}};
 const separation={id:'s1',lead_id:'l1',unit_id:'u1',status:'CONFIRMED',minute:{status:'Borrador bancaria'},documents:{signed_sale_minutes:{drive_file_id:'f1'},notary_voucher:{drive_file_id:'f2'}}};
 const d={settings:{projectName:'Infinity 224'},leads:[lead],archived_leads:[],units:[{id:'u1',project:'Infinity 224',status:'AVAILABLE'}],separations:[separation],marketing_expenses:[]};
 const report=analytics(d,{});
 for(const key of ['gnb','legal','advisors','inventory','quality'])assert.ok(Array.isArray(report[key])&&report[key].length);
 assert.equal(report.gnb.find(row=>row.label==='Aprobadas por GNB').value,1);
 assert.equal(report.legal.find(row=>row.label==='Listas para cerrar venta').value,1);
 assert.ok(report.options.gnb_status.includes('Aprobada'));
 assert.equal(analytics(d,{gnbStatus:'Aprobada'}).coverage.total,1);
});
