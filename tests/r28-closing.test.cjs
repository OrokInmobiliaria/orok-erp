'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createMinute,saleDocumentProgress}=require('../business/minuteService');
const {attachDocument,updateSeparation}=require('../business/separationService');
const {LegalTemplateStore}=require('../business/legalTemplateStore');
const {templateValues}=require('../business/legalDocumentPDF');

const file=(id,name)=>({drive_file_id:id,drive_url:'https://drive.google.com/file/d/'+id+'/view',name,mime_type:'application/pdf',size:100});

test('la venta exige minuta firmada y voucher notarial y conserva la auditoría',()=>{
 const separation={id:'s1',code:'SEP-1',status:'CONFIRMED',lead_id:'l1',unit_id:'u1',unit_number:'804',financing_type:'Directo',final_price:420000,signers:[{name:'Ana Pérez',dni:'12345678',marital_status:'Soltera',address:'Lima'}],documents:{},audit:[]};
 separation.minute=createMinute(separation,'Asesor',{source:'Drive privado',file_id:'tpl-2',modified_at:'2026-10-24'},'/files/minuta.pdf',separation.signers);
 const d={separations:[separation],units:[{id:'u1',status:'AVAILABLE'}],leads:[{id:'l1',status:'Separación',events:[],separations:[{id:'s1',status:'active'}],next_action:'Llamar',next_action_at:'2026-10-25T10:00:00Z'}]};
 assert.throws(()=>updateSeparation(d,'s1','sold',{reason:'Cierre'},'Gerencia'),/minuta firmada/i);
 attachDocument(d,'s1','signed_sale_minutes',file('signed','Minuta firmada.pdf'),'Gerencia');
 assert.equal(saleDocumentProgress(separation).ready,false);
 attachDocument(d,'s1','notary_voucher',file('notary','Voucher notaría.pdf'),'Gerencia');
 assert.equal(saleDocumentProgress(separation).ready,true);
 updateSeparation(d,'s1','sold',{reason:'Cierre documentado'},'Gerencia');
 assert.equal(d.units[0].status,'SOLD');
 assert.equal(d.leads[0].status,'Venta');
 assert.equal(d.leads[0].next_action,'');
 assert.equal(separation.minute.status,'Documentación completa');
 assert.ok(separation.audit.some(row=>row.action==='sold'));
});

test('las minutas de Drive conservan sus marcadores equivalentes y el CRM los completa',()=>{
 const store=new LegalTemplateStore({credentialFile:'sin-uso',folderUrl:''});
 assert.doesNotThrow(()=>store.validate('bank_minute','{{BUYER_1_NAME}}\n{{APARTMENT_NUMBER}}\n{{TOTAL_SALE_PRICE}}'));
 assert.doesNotThrow(()=>store.validate('direct_minute','{{BUYER_NAME}}\n{{UNIT_NUMBER}}\n{{SALE_PRICE}}'));
 const values=templateValues({minute:{type:'direct_minute',signers:[{name:'Ana Pérez',dni:'12345678',marital_status:'Soltera',address:'Lima'}]},separation:{code:'SEP-1',final_price:420000},unit:{unit_number:'804'}});
 assert.equal(values.BUYER_NAME,'Ana Pérez');
 assert.equal(values.BUYER_1_ID,'12345678');
 assert.equal(values.APARTMENT_NUMBER,'804');
 assert.equal(values.SALE_PRICE,values.FINAL_PRICE);
 assert.equal(values.TOTAL_SALE_PRICE,values.FINAL_PRICE);
});