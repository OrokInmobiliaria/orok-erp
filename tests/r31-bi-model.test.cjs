'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const NOW=Date.parse('2026-10-26T17:00:00Z'),at=d=>d+'T15:00:00Z';
const leads=[
 {id:'1',status:'Venta',source:'Facebook',sales_owner:'Ana',project:'Infinity 224',campaign_name:'C1',received_at:at('2026-10-05')},
 {id:'2',status:'Cita Asistida',source:'Facebook',sales_owner:'Ana',project:'Infinity 224',campaign_name:'C1',received_at:at('2026-10-12')},
 {id:'3',status:'Contactado',source:'Instagram',sales_owner:'Luis',project:'Infinity 224',campaign_name:'C2',received_at:at('2026-10-20')},
 {id:'4',status:'Seguimiento',source:'Instagram',sales_owner:'Luis',project:'Infinity 224',received_at:at('2026-10-21'),milestones:{scheduled:at('2026-10-22')}},
 {id:'5',status:'Lead Inicial',source:'',received_at:at('2026-09-15')},
 {id:'6',status:'Lead Inicial',source:'Facebook'},
];
const units=[{price:300000,status:'AVAILABLE'},{price:400000,status:'SOLD'},{price:500000,status:'available',sold_lead_id:'1'}];
const expenses=[{date:'2026-10-03',amount:500,source:'Facebook',campaign_name:'C1'},{date:'2026-10-10',amount:300,source:'Instagram'},{date:'2026-09-10',amount:100,source:'Facebook'}];
test('KPIs, embudo y costo por lead del período',async()=>{
 const {buildModel}=await import('../src/biModel.mjs');
 const m=buildModel({leads,units,expenses},{from:'2026-10-01',to:'2026-10-31'});
 assert.equal(m.kpis.leads.value,4);assert.equal(m.kpis.sales.value,1);assert.equal(m.kpis.appointments.value,3);
 assert.equal(m.kpis.spend.value,800);assert.equal(m.kpis.cpl.value,200);assert.equal(m.kpis.conversion.value,.25);
 assert.deepEqual(m.funnel.map(s=>s.count),[4,4,3,3,2,1,1]);
 assert.equal(m.undated_excluded,1);assert.equal(m.total_leads,6);
 assert.deepEqual(m.previous_range,{from:'2026-08-31',to:'2026-09-30'});assert.equal(m.kpis.leads.delta,3);
});
test('el filtro cruzado por fuente y por etapa reduce todo de forma consistente',async()=>{
 const {buildModel}=await import('../src/biModel.mjs');
 const m=buildModel({leads,units,expenses},{from:'2026-10-01',to:'2026-10-31',source:'Instagram'});
 assert.equal(m.kpis.leads.value,2);assert.equal(m.kpis.spend.value,300);assert.equal(m.bySource.length,1);
 const s=buildModel({leads,units,expenses},{stage:'Cita'});assert.equal(s.kpis.leads.value,3);
});
test('agrupaciones, matriz, tendencia semanal e inventario',async()=>{
 const {buildModel,weekStart}=await import('../src/biModel.mjs');
 const m=buildModel({leads,units,expenses},{});
 assert.equal(m.bySource.find(x=>x.name==='Sin fuente').leads,1);
 const fb=m.bySource.find(x=>x.name==='Facebook');assert.equal(fb.leads,3);assert.equal(fb.spend,600);
 assert.equal(m.byOwner.find(x=>x.name==='Ana').sales,1);
 assert.deepEqual(m.matrix.find(x=>x.name==='Facebook').cells,[3,2,2,2,2,1,1]);
 assert.equal(weekStart(Date.parse('2026-10-26T15:00:00Z')),'2026-10-26');assert.equal(weekStart(Date.parse('2026-10-25T15:00:00Z')),'2026-10-19');
 assert.ok(m.trend.every((w,i,a)=>!i||a[i-1].week<w.week));
 assert.deepEqual([m.inventory.available,m.inventory.sold,m.inventory.sold_value],[1,2,900000]);
});
test('atajos de período y sin datos no rompe',async()=>{
 const {buildModel,preset}=await import('../src/biModel.mjs');
 assert.deepEqual(preset('month',NOW),{from:'2026-10-01',to:'2026-10-26'});assert.deepEqual(preset('7d',NOW),{from:'2026-10-20',to:'2026-10-26'});
 const e=buildModel({},{from:'2026-10-01',to:'2026-10-31'});assert.equal(e.kpis.leads.value,0);assert.equal(e.kpis.cpl.value,null);assert.equal(e.trend.length,0);
});
