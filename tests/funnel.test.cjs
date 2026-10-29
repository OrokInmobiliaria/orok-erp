const {test} = require('node:test');
const assert = require('node:assert/strict');
const {analytics} = require('../business/analyticsService');
const {cumulativeFunnel, STAGES} = require('../business/funnelService');
const {createQueries} = require('../business/queries');
const {fixture, expected, filters} = require('./fixtures/funnel.cjs');
const rows = report => [...report.funnels.marketing, ...report.funnels.sales];
const counts = report => rows(report).map(row => row.count);

test('100 received remain the base: 100 -> 70 -> 32 -> 18 -> 12 -> 3 -> 1', () => {
  const data = fixture(), before = structuredClone(data), report = analytics(data, filters);
  assert.deepEqual(counts(report), expected);
  const example = ['Lead Inicial', 'Contactado', 'MQL', 'Cita', 'Cita Asistida', 'Separación', 'Venta'];
  assert.deepEqual(example.map(stage => rows(report).find(r => r.stage === stage).count), [100,70,32,18,12,3,1]);
  assert.equal(report.stateDistribution.marketing[0].count, 30);
  assert.equal(Object.values(report.stateDistribution).flat().reduce((sum, r) => sum + r.count, 0), 100);
  assert.equal(report.funnels.other, undefined);
  assert.deepEqual(data, before, 'Reporting never writes inferred events or changes leads');
});

test('actual status-update path retains Lead Inicial on advancement and retreat', () => {
  let data = fixture();
  const q = createQueries(() => structuredClone(data), saved => { data = saved; });
  const lead = data.leads[0];
  q.updateLeadStatus(lead.id, 'Contactado', 'Prueba');
  let report = q.getAnalytics(filters);
  assert.equal(report.funnels.marketing[0].count, 100);
  assert.equal(report.funnels.marketing[1].count, 71);
  assert.equal(report.stateDistribution.marketing[0].count, 29);
  q.leadAction(lead.id,{type:'follow_up',payload:{substatus:'No contesta',reason:'Prueba de regresión',next_action:'Volver a llamar',next_action_at:'2026-09-20T15:00:00.000Z'}},'Prueba');
  report = q.getAnalytics(filters);
  assert.equal(report.funnels.marketing[1].count, 71);
  assert.equal(report.stateDistribution.other[0].count, 1);
  assert.equal(report.funnels.marketing[0].count, 100);
});

test('discarding a lead records the reason and removes every next action', () => {
  let data = fixture();
  const q = createQueries(() => structuredClone(data), saved => { data = saved; });
  const lead = data.leads[0];
  lead.next_action = 'Volver a llamar';
  lead.next_action_at = '2026-09-20T15:00:00.000Z';
  const updated = q.leadAction(lead.id,{type:'lost',payload:{reason:'Cliente decidió no continuar'}},'Prueba');
  assert.equal(updated.status,'Desestimado');
  assert.equal(updated.substatus,'Desestimado');
  assert.equal(updated.loss_reason,'Cliente decidió no continuar');
  assert.equal(updated.next_action,'');
  assert.equal(updated.next_action_at,null);
  assert.ok(updated.lost_at);
  assert.equal(updated.events.at(-1).type,'lost');
});

test('new leads increase the base and advanced-stage imports include all prior stages', () => {
  const data = fixture();
  data.leads.push({id: 'new', status: 'Venta', received_at: '2026-09-10'});
  const report = analytics(data, filters);
  assert.deepEqual(counts(report), expected.map(n => n + 1));
  assert.ok(report.funnelBasis.inferredLeads > 0);
  assert.equal(rows(report).find(r => r.stage === 'MQL').inferredCount, 19);
});

test('filters are applied to the received cohort before any funnel stage or rate', () => {
  const data = fixture();
  const sale = data.leads.at(-1);
  for (const field of ['project','source','campaign_name','sales_owner']) {
    data.leads.push({...sale, id: field, [field]: 'Other'});
  }
  data.leads.push({...data.leads.at(-1), id: 'old', sales_owner: 'Asesor A', received_at: '2026-08-31'});
  data.leads.push({...data.leads[0], id: 'newer', status: 'Venta', received_at: '2026-09-13'});
  const scoped = {...filters, project: 'Infinity 224', source: 'Facebook', campaign: 'Campaña A', owner: 'Asesor A'};
  assert.deepEqual(counts(analytics(data, scoped)), expected);
  for (const [key, field] of [['project','project'],['source','source'],['campaign','campaign_name'],['owner','sales_owner']]) {
    const result = analytics(data, {...filters, [key]: 'Other'});
    assert.equal(result.funnelBasis.total, 1, field);
    assert.ok(counts(result).every(n => n === 1));
  }
});

test('Lima date boundaries are inclusive and missing/invalid receipt dates are excluded', () => {
  const data = fixture();
  data.leads = ['2026-09-01T04:59:59Z','2026-09-01T05:00:00Z','2026-09-13T04:59:59Z','2026-09-13T05:00:00Z',null,'not-a-date'].map((received_at,i) => ({id:String(i),status:'Venta',received_at}));
  const report = analytics(data, filters);
  assert.equal(report.funnelBasis.total, 2);
  assert.equal(report.funnelBasis.withoutReceivedDate, 2);
  assert.ok(counts(report).every(n => n === 2));
  data.leads = ['2026-02-29','2026-02-30','2026-03-01'].map((received_at,i)=>({id:String(i),status:'Venta',received_at}));
  const calendar = analytics(data,{from:'2026-02-01',to:'2026-03-01'});
  assert.equal(calendar.funnelBasis.total,1,'Impossible calendar dates never enter the base');
  assert.equal(calendar.funnelBasis.withoutReceivedDate,2);
});

test('activity mode does not change the funnel cohort; subsequent progress still counts', () => {
  const data = fixture();
  data.leads = [
    {id:'in',status:'Desestimado',received_at:'2026-09-01',events:[{type:'sale',at:'2026-09-14T12:00:00Z'}]},
    {id:'old',status:'Venta',received_at:'2026-08-01',events:[{type:'sale',at:'2026-09-02T12:00:00Z'}]},
  ];
  const a = analytics(data, {...filters,mode:'activity'}), c = analytics(data, {...filters,mode:'cohort'});
  assert.deepEqual(a.funnels,c.funnels);
  assert.deepEqual(counts(a), STAGES.map(() => 1));
});

test('archived leads remain in the received base without duplicating an active ID', () => {
  const data = fixture();
  const archived = data.leads.pop();
  data.archived_leads = [{...archived,archived_at:'2026-09-10'}, {...data.leads[0],archived_at:'2026-09-10'}];
  const report = analytics(data, filters);
  assert.deepEqual(counts(report),expected);
  assert.equal(report.stateDistribution.sales.at(-1).count,0);
});

test('repeated events, appointments, milestones and previous states count each lead once', () => {
  const cohort = [
    {status:'Desestimado',events:[{type:'contacted'},{type:'contacted'},{type:'mql'}]},
    {status:'Seguimiento futuro',stage_history:[{from:'Cita Asistida',to:'Desestimado',observed:true},{from:'Desestimado',to:'Seguimiento futuro'}]},
    {status:'No contesta',appointments:[{status:'attended'},{status:'attended'}]},
    {status:'Lead Inicial',milestones:{sale:'2026-09-05'}},
    {status:'Desestimado',separations:[{status:'cancelled'},{status:'cancelled'}]},
  ];
  const report = cumulativeFunnel(cohort);
  assert.deepEqual(counts(report),[5,5,5,5,4,4,2,2,1,1]);
});

test('terminal and unknown states with no progress do not invent contact', () => {
  const report = cumulativeFunnel(['No contesta','Seguimiento futuro','Desestimado','Unknown',undefined].map(status=>({status})));
  assert.deepEqual(counts(report),[5,0,0,0,0,0,0,0,0,0]);
  assert.equal(report.inferredLeads,0);
});

test('marketing and sales use their own bases and keep stages cumulative', () => {
  const report = analytics(fixture(),filters), r = rows(report);
  assert.equal(r[0].ofTotalPct,100);
  assert.equal(r[1].ofTotalPct,70);
  assert.equal(r[4].fromPreviousPct,18/32*100);
  assert.equal(report.funnelBasis.marketingTotal,100);
  assert.equal(report.funnelBasis.salesTotal,12, 'Sales starts only with Cita Asistida');
  assert.equal(report.funnels.sales[0].ofTotalPct,100, 'Cita Asistida is the sales base');
  assert.equal(report.funnels.sales[1].fromPreviousPct,6/12*100, 'Calificado follows attended appointments');
  for(let i=1;i<r.length;i++)assert.ok(r[i].count<=r[i-1].count);
  assert.ok(r.reduce((n,s)=>n+s.ofTotalPct,0)>100,'Do not normalize funnel stages to 100%');
});

test('historical default includes every unique database lead and grows with imports', () => {
  const data={settings:{projectName:'Infinity 224'},units:[],leads:[
    {id:'legacy',status:'Contactado',source:'Facebook'},
    {id:'dated',status:'Cita Asistida',received_at:'2026-09-10T12:00:00Z',source:'Instagram'},
  ],archived_leads:[{id:'dated',status:'Venta',received_at:'2026-09-10T12:00:00Z'}]};
  let report=analytics(data,{});
  assert.equal(report.scope,'historical');
  assert.equal(report.funnelBasis.marketingTotal,2);
  assert.equal(report.funnelBasis.salesTotal,1);
  data.leads.push({id:'new-import',status:'Lead Inicial',source:'Facebook'});
  report=analytics(data,{});
  assert.equal(report.funnelBasis.marketingTotal,3);
  assert.equal(report.funnels.marketing[0].count,3);
});

test('sales base maps attended scheduled appointments and manual attended leads, including Marco Prado', () => {
  const data={settings:{projectName:'Infinity 224'},units:[],leads:[
    {id:'marco',name:'Marco Prado',status:'Cita Asistida',received_at:'2026-09-01'},
    {id:'mapped',name:'Desde agenda',status:'Cita',received_at:'2026-09-02',appointments:[{status:'attended',scheduled_at:'2026-09-05'}]},
    {id:'scheduled-only',status:'Cita',received_at:'2026-09-03',appointments:[{status:'scheduled',scheduled_at:'2026-09-06'}]},
    {id:'manual-advanced',status:'Calificado',received_at:'2026-09-04'},
  ],archived_leads:[]};
  const report=analytics(data,{});
  assert.equal(report.funnelBasis.marketingTotal,4);
  assert.equal(report.funnelBasis.salesTotal,3);
  assert.equal(report.funnels.sales[0].count,3);
  assert.equal(report.funnels.sales[1].count,1);
});

test('empty and unmatched cohorts return zeros with no NaN or invented conversion', () => {
  for(const report of [analytics({...fixture(),leads:[]},filters),analytics(fixture(),{...filters,source:'Missing'})]) {
    for(const row of rows(report)) {
      assert.equal(row.count,0);
      assert.equal(row.ofTotalPct,null);
      assert.equal(row.fromPreviousPct,null);
    }
  }
});

test('existing fixture shape without events uses status and does not require migration', () => {
  const data = {settings:{projectName:'Infinity 224'},leads:[{id:'lead-1',name:'Cliente de prueba',phone:'999123456',status:'Contactado',received_at:'2026-09-01T12:00:00Z'}],units:[]};
  assert.deepEqual(counts(analytics(data,filters)),[1,1,0,0,0,0,0,0,0,0]);
});
