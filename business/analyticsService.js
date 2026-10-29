const {sold}=require('./salesService');
const {activeForUnit}=require('./separationService');
const {iso}=require('./lifecycle');
const {buildInsights}=require('./insightService');
const {cumulativeFunnel}=require('./funnelService');
const day=value=>{const normalized=iso(value);return normalized?new Date(normalized).toLocaleDateString('en-CA',{timeZone:'America/Lima'}):'';};
const sum=(rows,key)=>rows.reduce((n,r)=>n+Number(r[key]||0),0);
const unique=rows=>new Set(rows.map(r=>r.lead_id)).size;
const percentile=(values,p)=>{if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.max(0,Math.ceil(sorted.length*p)-1)];};
const metric=(label,value,unit='count',detail='')=>({label,value,unit,detail});
const ratio=(label,n,d,known=true)=>metric(label,known&&d?n/d*100:null,'percent',`${n} / ${d}${known?'':' · Historial parcial'}`);
function analytics(d,filters={}){
 const today=day(new Date().toISOString()),requestedFrom=String(filters.from||''),requestedTo=String(filters.to||''),hasDateFilter=!!(requestedFrom||requestedTo);
 if(hasDateFilter&&(!/^\d{4}-\d{2}-\d{2}$/.test(requestedFrom)||!/^\d{4}-\d{2}-\d{2}$/.test(requestedTo)||!iso(requestedFrom)||!iso(requestedTo)||requestedFrom>requestedTo))throw Error('El período no es válido.');
 const defaults=d.settings?.projectName||'Proyecto principal';
 const inPeriod=value=>{if(!hasDateFilter)return true;const date=day(value);return !!date&&date>=requestedFrom&&date<=requestedTo;};
 const activeIds=new Set((d.leads||[]).map(l=>l.id));
 const all=[...(d.leads||[]),...(d.archived_leads||[]).filter(l=>!activeIds.has(l.id))].map(l=>({...l,project:l.project||defaults,sales_owner:l.sales_owner||'Sin asignar',campaign_name:l.campaign_name||'Sin campaña',source:l.source||'Sin fuente',financing_type:l.bank_evaluation?.financing_type||l.last_quote?.financing_type||l.purchase_method||'Sin definir',gnb_status:l.bank_evaluation?.status||'Sin evaluación',unit_interest:l.bank_evaluation?.unit_number||l.last_quote?.unit_number||l.unit_interest||'Sin unidad'}));
 const match=l=>(!filters.project||l.project===filters.project)&&(!filters.source||l.source===filters.source)&&(!filters.campaign||l.campaign_name===filters.campaign)&&(!filters.owner||l.sales_owner===filters.owner)&&(!filters.stage||l.status===filters.stage)&&(!filters.substatus||l.substatus===filters.substatus)&&(!filters.financingType||l.financing_type===filters.financingType)&&(!filters.gnbStatus||l.gnb_status===filters.gnbStatus)&&(!filters.unit||l.unit_interest===filters.unit);
 const leads=all.filter(match),cohort=leads.filter(l=>inPeriod(l.received_at));
 const receivedDates=leads.map(l=>day(l.received_at)).filter(Boolean).sort();
 const from=hasDateFilter?requestedFrom:(receivedDates[0]||today),to=hasDateFilter?requestedTo:today;
 const complete=cohort.length>0&&cohort.every(l=>l.history_complete===true);
 const eventRows=rows=>rows.flatMap(l=>(l.events||[]).map(e=>({...e,lead_id:l.id,lead:l})));
 const events=eventRows(leads),cohortEvents=eventRows(cohort),activity=events.filter(e=>inPeriod(e.at));
 const ev=(type,rows=activity)=>rows.filter(e=>e.type===type);
 const has=(l,type)=>(l.events||[]).some(e=>e.type===type);
 const first=(l,type)=>(l.events||[]).filter(e=>e.type===type).sort((a,b)=>a.at.localeCompare(b.at))[0]?.at;
 const appointments=leads.flatMap(l=>(l.appointments||[]).map(a=>({...a,lead_id:l.id}))).filter(a=>inPeriod(a.scheduled_at));
 const resolved=appointments.filter(a=>['attended','no_show'].includes(a.status)),attended=resolved.filter(a=>a.status==='attended');
 const cohortAppointments=cohort.flatMap(l=>(l.appointments||[]).map(a=>({...a,lead_id:l.id})));
 const knownVisits=cohortAppointments.filter(a=>['attended','no_show'].includes(a.status));
 const cohortVisited=cohort.filter(l=>has(l,'attended'));
 const cohortSeparated=cohortVisited.filter(l=>has(l,'separation')),cohortSold=cohortVisited.filter(l=>has(l,'sale'));
 const separations=cohort.flatMap(l=>l.separations||[]);
 const financialLost=separations.filter(s=>s.status==='cancelled'&&s.reason==='Financiero');
 const response=cohort.map(l=>{const t=first(l,'attempt');return t&&l.received_at?(new Date(t)-new Date(l.received_at))/60000:null;}).filter(v=>v!==null&&v>=0);
 const saleEvents=ev('sale'),saleIds=new Set(saleEvents.map(e=>e.unit_id).filter(Boolean));
 const datedSales=leads.filter(l=>has(l,'sale'));
 const cycle=datedSales.filter(l=>inPeriod(first(l,'sale'))&&l.received_at).map(l=>(new Date(first(l,'sale'))-new Date(l.received_at))/86400000).filter(n=>n>=0);
 const expenseCandidates=(d.marketing_expenses||[]).filter(e=>inPeriod(e.date)&&(!filters.project||!e.project||e.project===filters.project)&&(!filters.source||!e.source||e.source===filters.source)&&(!filters.campaign||!e.campaign_name||e.campaign_name===filters.campaign));
 const expenses=expenseCandidates.filter(e=>e.spend_type==='campaign'&&e.project&&e.source&&e.campaign_name&&Number(e.amount)>=0);
 const spendKnown=!filters.owner&&expenses.length>0&&expenseCandidates.every(e=>e.spend_type==='other'||expenses.includes(e));
 const spend=spendKnown?sum(expenses,'amount'):null;
 const cost=(label,count,known=true)=>metric(label,spendKnown&&known&&count?spend/count:null,'money',`Gasto registrado / ${count}${filters.owner?' · Sin asignación de gasto por asesor':''}`);
 const isCohort=filters.mode==='cohort';
 const mqls=cohort.filter(l=>has(l,'mql')),contacted=cohort.filter(l=>has(l,'contacted')),booked=cohort.filter(l=>has(l,'scheduled'));
 const contactedValid=cohort.filter(l=>/\d{7}/.test(String(l.phone||'').replace(/\D/g,''))||/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(l.email||''));
 const metricsMarketing=isCohort?[
  ratio('Datos de contacto válidos',contactedValid.length,cohort.length),ratio('Contactabilidad efectiva',contacted.length,cohort.length,complete),
  metric('Primera respuesta · mediana',percentile(response,.5),'minutes',`${response.length} leads con ambas fechas`),metric('Primera respuesta · P90',percentile(response,.9),'minutes',`${response.length} leads con ambas fechas`),
  ratio('Conversión a MQL',mqls.length,cohort.length,complete),ratio('Lead a cita agendada',booked.length,cohort.length,complete),cost('Costo por MQL',mqls.length,complete),cost('Costo por cita agendada',booked.length,complete),cost('CPL',cohort.length)
 ]:[metric('Leads recibidos',cohort.length),metric('Contactos efectivos',unique(ev('contacted'))),metric('MQL registrados',unique(ev('mql'))),metric('Prospectos con cita agendada',unique(ev('scheduled'))),metric('Gasto real de captación',spend,'money'),cost('Costo operativo por MQL del período',unique(ev('mql'))),cost('Costo operativo por cita del período',unique(ev('scheduled'))),cost('CPL del período',cohort.length)];
 const metricsSales=isCohort?[
  ratio('Aceptación de MQL por Ventas',mqls.filter(l=>has(l,'sql')).length,mqls.length,complete),ratio('Asistencia',knownVisits.filter(a=>a.status==='attended').length,knownVisits.length),
  ratio('Visita a separación',cohortSeparated.length,cohortVisited.length,complete),ratio('Cierre comercial con visita',cohortSold.length,cohortVisited.length,complete),
  ratio('Caída financiera',financialLost.length,separations.length,complete),metric('Ciclo de venta · mediana',percentile(cohort.filter(l=>has(l,'sale')&&l.received_at).map(l=>(new Date(first(l,'sale'))-new Date(l.received_at))/86400000).filter(n=>n>=0),.5),'days')
 ]:[metric('Prospectos aceptados · SQL',unique(ev('sql'))),metric('Citas asistidas',attended.length),ratio('Asistencia de citas resueltas',attended.length,resolved.length),metric('Inasistencias',resolved.length-attended.length),metric('Cancelaciones de citas',appointments.filter(a=>a.status==='cancelled').length),metric('Reprogramaciones',ev('rescheduled').length),metric('Separaciones registradas',ev('separation').length),metric('Caídas financieras registradas',ev('separation_cancelled').filter(e=>e.reason==='Financiero').length)];
 const unitList=(d.units||[]).filter(u=>!filters.project||(u.project||defaults)===filters.project),soldUnits=unitList.filter(sold);
 const uniqueSales=[...new Map(saleEvents.filter(e=>e.unit_id).map(e=>[e.unit_id,e])).values()];
 const saleAmount=uniqueSales.length&&uniqueSales.every(e=>Number.isFinite(e.amount)&&e.amount>0)?sum(uniqueSales,'amount'):uniqueSales.length?null:0;
 const rowsFor=field=>[...new Set(leads.map(l=>l[field]))].map(name=>{
   const rows=leads.filter(l=>l[field]===name),g=rows.filter(l=>inPeriod(l.received_at)),ae=eventRows(rows).filter(e=>inPeriod(e.at));
   const visits=g.filter(l=>has(l,'attended')),closed=visits.filter(l=>has(l,'sale'));
   const sales=[...new Map(ae.filter(e=>e.type==='sale'&&e.unit_id).map(e=>[e.unit_id,e])).values()];
   const related=expenses.filter(e=>field==='project'?e.project===name:field==='campaign_name'?e.campaign_name===name:false),booked=new Set(ae.filter(e=>e.type==='scheduled').map(e=>e.lead_id)).size;
   return {name,leads:g.length,mql:g.filter(l=>has(l,'mql')).length,visits:visits.length,closed:closed.length,conversion:g.length&&g.every(l=>l.history_complete)?(visits.length?closed.length/visits.length*100:null):null,sales:sales.length,revenue:sales.every(e=>Number(e.amount)>0)?sum(sales,'amount'):null,spend:spendKnown&&related.length?sum(related,'amount'):null,cpa:spendKnown&&related.length&&booked?sum(related,'amount')/booked:null};
 }).sort((a,b)=>b.sales-a.sales||b.leads-a.leads);
 const stateGroups={marketing:['Lead Inicial','Contactado','Información enviada','MQL','Cita'],sales:['Cita Asistida','Calificado','Evaluación GNB','Separación','Inicial','Minuta','Venta'],other:['Seguimiento','Perdido','Desestimado']};
 const funnel=cumulativeFunnel(cohort);
 const filteredIds=new Set(leads.map(l=>l.id)),bankRows=leads.filter(l=>l.bank_evaluation&&String(l.bank_evaluation.financing_type||'').toLowerCase().includes('hipotec'));
 const gnbStatuses=['Datos pendientes','Pendiente confirmación','Ficha completa','Lista para enviar','Enviada a GNB','Observada','Aprobada','No aprobada','Desistimiento'];
 const approved=bankRows.filter(l=>l.bank_evaluation.status==='Aprobada').length,sent=bankRows.filter(l=>l.bank_evaluation.sent_at).length;
 const selectedSeparations=(d.separations||[]).filter(s=>filteredIds.has(s.lead_id)),confirmed=selectedSeparations.filter(s=>['CONFIRMED','RESERVED','SOLD'].includes(String(s.status||'').toUpperCase())),minutes=selectedSeparations.filter(s=>s.minute),signed=selectedSeparations.filter(s=>s.documents?.signed_sale_minutes?.drive_file_id),notary=selectedSeparations.filter(s=>s.documents?.notary_voucher?.drive_file_id),readyClose=selectedSeparations.filter(s=>s.minute&&s.documents?.signed_sale_minutes?.drive_file_id&&s.documents?.notary_voucher?.drive_file_id);
 const assigned=leads.filter(l=>l.sales_owner&&l.sales_owner!=='Sin asignar'),open=leads.filter(l=>!l.archived_at&&!['Venta','Perdido','Desestimado'].includes(l.status)),overdue=open.filter(l=>l.next_action_at&&new Date(l.next_action_at)<new Date()),withoutNext=open.filter(l=>!l.next_action||!l.next_action_at);
 const gnb=[metric('Evaluaciones hipotecarias',bankRows.length),metric('Enviadas a GNB',sent),metric('Aprobadas por GNB',approved),ratio('Tasa de aprobación GNB',approved,bankRows.filter(l=>['Aprobada','No aprobada'].includes(l.bank_evaluation.status)).length),metric('Observadas',bankRows.filter(l=>l.bank_evaluation.status==='Observada').length),metric('Datos pendientes',bankRows.filter(l=>l.bank_evaluation.status==='Datos pendientes').length)];
 const legal=[metric('Separaciones confirmadas',confirmed.length),metric('Minutas generadas',minutes.length),metric('Minutas firmadas cargadas',signed.length),metric('Voucher de notaría cargado',notary.length),metric('Listas para cerrar venta',readyClose.length),metric('Pendientes de minuta',Math.max(0,confirmed.length-minutes.length))];
 const inventory=[metric('Unidades disponibles',unitList.filter(u=>u.status==='AVAILABLE'&&!activeForUnit(d.separations,u.id)).length),metric('Unidades separadas',unitList.filter(u=>activeForUnit(d.separations,u.id)).length),metric('Unidades vendidas',soldUnits.length),ratio('Absorción de inventario',soldUnits.length,unitList.length),metric('Unidades totales',unitList.length),metric('Separaciones activas',selectedSeparations.filter(s=>['ACTIVE','CONFIRMED','RESERVED'].includes(String(s.status||'').toUpperCase())).length)];
 const advisors=[metric('Leads con asesor',assigned.length),ratio('Cobertura de asignación',assigned.length,leads.length),metric('Abiertos sin próxima acción',withoutNext.length),metric('Próximas acciones vencidas',overdue.length),metric('Leads abiertos',open.length),metric('Asesores activos',new Set(assigned.map(l=>l.sales_owner)).size)];
 const quality=[metric('Leads sin teléfono',leads.filter(l=>!/[0-9]{7}/.test(String(l.phone||''))).length),metric('Leads sin correo',leads.filter(l=>!/^\S+@\S+\.\S+$/.test(String(l.email||''))).length),metric('Leads sin responsable',leads.filter(l=>l.sales_owner==='Sin asignar').length),metric('Leads sin fecha de ingreso',leads.filter(l=>!iso(l.received_at)).length),metric('Ventas sin importe',leads.filter(l=>l.status==='Venta'&&!Number(l.sale_amount)).length),metric('Registros sin trazabilidad nueva',leads.filter(l=>!l.tracking_started_at).length)];
 return {from,to,scope:hasDateFilter?'period':'historical',mode:isCohort?'cohort':'activity',generated_at:new Date().toISOString(),insights:buildInsights(d,filters,from,to),options:Object.fromEntries(['project','source','campaign_name','sales_owner','status','substatus','financing_type','gnb_status','unit_interest'].map(k=>[k,[...new Set(all.map(l=>l[k]).filter(Boolean))].sort()])),
  coverage:{total:leads.length,received:leads.filter(l=>iso(l.received_at)).length,complete:cohort.filter(l=>l.history_complete).length,cohort:cohort.length,legacy:leads.filter(l=>!l.tracking_started_at).length,expensesUnattributed:expenseCandidates.length-expenses.length,appointmentsPending:appointments.filter(a=>a.status==='scheduled'&&a.scheduled_at<new Date().toISOString()).length,legacySalesWithoutAmount:leads.filter(l=>l.status==='Venta'&&!Number(l.sale_amount)).length},
  marketing:metricsMarketing,sales:metricsSales,management:[metric('Unidades vendidas en el período',saleIds.size),metric('Importe real vendido',saleAmount,'money'),metric('Ciclo de venta · mediana',percentile(cycle,.5),'days'),metric('Inventario disponible actual',unitList.filter(u=>u.status==='AVAILABLE'&&!activeForUnit(d.separations,u.id)).length),ratio('Absorción actual',soldUnits.length,unitList.length),metric('Gasto real de captación',spend,'money')],gnb,legal,inventory,advisors,quality,gnbDistribution:gnbStatuses.map(status=>({status,count:bankRows.filter(l=>l.bank_evaluation.status===status).length})),
  funnels:funnel.funnels,
  funnelBasis:{scope:hasDateFilter?'period':'historical',marketingTotal:funnel.bases.marketing,salesTotal:funnel.bases.sales,total:funnel.total,inferredLeads:funnel.inferredLeads,withoutReceivedDate:hasDateFilter?leads.filter(l=>!iso(l.received_at)).length:0},
  stateDistribution:Object.fromEntries(Object.entries(stateGroups).map(([group,stages])=>[group,stages.map(stage=>({stage,count:leads.filter(l=>!l.archived_at&&l.status===stage).length}))])),
  comparisons:{projects:rowsFor('project'),campaigns:rowsFor('campaign_name'),owners:rowsFor('sales_owner')},
  pending:leads.filter(l=>!l.archived_at&&!['Venta','Perdido','Desestimado'].includes(l.status)).map(l=>({id:l.id,name:l.name,owner:l.sales_owner,stage:l.status,substatus:l.substatus||'',next:l.next_action||'Sin próxima acción',next_action_at:l.next_action_at||null,days:l.last_activity_at?Math.max(0,Math.floor((Date.now()-new Date(l.last_activity_at))/86400000)):null})).sort((a,b)=>(b.days??-1)-(a.days??-1)).slice(0,20)
 };
}
module.exports={analytics,percentile,day};
