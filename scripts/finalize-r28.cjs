
const fs=require('node:fs');
const path=require('node:path');
const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const write=(p,s)=>fs.writeFileSync(path.join(root,p),s,'utf8');
function replace(p,from,to,label){
 let s=read(p);
 if(!s.includes(from)) throw new Error('No se encontró '+label+' en '+p);
 s=s.replace(from,to);write(p,s);
}
replace('business/bankEvaluationService.js',".replace(/D/g,'')",".replace(/\\D/g,'')",'limpieza DNI primaria');
replace('business/bankEvaluationService.js',".replace(/D/g,'')",".replace(/\\D/g,'')",'limpieza DNI coevaluado');
replace('business/bankEvaluationService.js',"!/^d{8}$/.test","!/^\\d{8}$/.test",'validación DNI');
replace('business/bankEvaluationService.js',"!/^S+@S+.S+$/.test","!/^\\S+@\\S+\\.\\S+$/.test",'validación correo');

replace('business/whatsappService.js',
"const {AdvisorAlerts}=require('./advisorRouting');",
"const {AdvisorAlerts}=require('./advisorRouting');\nconst {conversationGuidance}=require('./bankEvaluationService');",
'importación guía GNB');
replace('business/whatsappService.js',
"if(/\\b(?:cita|visita)\\b.{0,45}\\b(?:confirmada|agendada|reservada|reprogramada|cancelada|anulada)\\b|\\b(?:agende|reserve|reprograme|cancele|anule)\\b.{0,40}\\b(?:cita|visita)\\b/.test(normalize(out.reply)))throw Error('Una confirmación de cita requiere el resultado comprobado de Calendar; el modelo no puede emitirla.');",
"if(/\\b(?:cita|visita)\\b.{0,45}\\b(?:confirmada|agendada|reservada|reprogramada|cancelada|anulada)\\b|\\b(?:agende|reserve|reprograme|cancele|anule)\\b.{0,40}\\b(?:cita|visita)\\b/.test(normalize(out.reply)))throw Error('Una confirmación de cita requiere el resultado comprobado de Calendar; el modelo no puede emitirla.');\n if(/\\b(?:gnb|banco)\\b.{0,55}\\b(?:aprobad[oa]|preaprobad[oa])\\b|\\b(?:aprobad[oa]|preaprobad[oa])\\b.{0,55}\\b(?:gnb|banco)\\b/.test(normalize(out.reply))&&job.bank_evaluation_status!=='Aprobada')throw Error('La aprobación bancaria solo puede comunicarse cuando el CRM registra el estado Aprobada.');",
'control aprobación bancaria');
replace('business/whatsappService.js',
"if(!lead){tx.set(ref,{...j,state:'cancelled',reason:'Lead eliminado.'});return null;}",
"if(!lead){tx.set(ref,{...j,state:'cancelled',reason:'Lead eliminado.'});return null;}\n    const bankFlow=['Hipotecario','Bancario','Banco GNB','GNB'].includes(lead.bank_evaluation?.financing_type||lead.purchase_method||lead.last_quote?.financing_type)||lead.status==='Evaluación GNB';",
'contexto banco');
replace('business/whatsappService.js',
"customer_context:{confirmed_buyer:!!buyer(read(),lead),birthday_greeting_allowed:!careReason(read(),lead,t)},profile:",
"customer_context:{confirmed_buyer:!!buyer(read(),lead),birthday_greeting_allowed:!careReason(read(),lead,t)},bank_evaluation_status:lead.bank_evaluation?.status||null,gnb_guidance:bankFlow?conversationGuidance(lead):null,profile:",
'guía GNB en trabajo');

replace('business/analyticsService.js',
"source:l.source||'Sin fuente'}));",
"source:l.source||'Sin fuente',financing_type:l.bank_evaluation?.financing_type||l.last_quote?.financing_type||l.purchase_method||'Sin definir',gnb_status:l.bank_evaluation?.status||'Sin evaluación',unit_interest:l.bank_evaluation?.unit_number||l.last_quote?.unit_number||l.unit_interest||'Sin unidad'}));",
'campos analíticos');
replace('business/analyticsService.js',
"const match=l=>(!filters.project||l.project===filters.project)&&(!filters.source||l.source===filters.source)&&(!filters.campaign||l.campaign_name===filters.campaign)&&(!filters.owner||l.sales_owner===filters.owner);",
"const match=l=>(!filters.project||l.project===filters.project)&&(!filters.source||l.source===filters.source)&&(!filters.campaign||l.campaign_name===filters.campaign)&&(!filters.owner||l.sales_owner===filters.owner)&&(!filters.stage||l.status===filters.stage)&&(!filters.substatus||l.substatus===filters.substatus)&&(!filters.financingType||l.financing_type===filters.financingType)&&(!filters.gnbStatus||l.gnb_status===filters.gnbStatus)&&(!filters.unit||l.unit_interest===filters.unit);",
'filtros extendidos');
replace('business/analyticsService.js',
"const stateGroups={marketing:['Lead Inicial','Contactado','Información enviada','MQL','Cita'],sales:['Cita Asistida','Calificado','Separación','Inicial','Venta'],other:['Seguimiento','Perdido']};\n const funnel=cumulativeFunnel(cohort);",
"const stateGroups={marketing:['Lead Inicial','Contactado','Información enviada','MQL','Cita'],sales:['Cita Asistida','Calificado','Evaluación GNB','Separación','Inicial','Minuta','Venta'],other:['Seguimiento','Perdido','Desestimado']};\n const funnel=cumulativeFunnel(cohort);\n const filteredIds=new Set(leads.map(l=>l.id)),bankRows=leads.filter(l=>l.bank_evaluation&&String(l.bank_evaluation.financing_type||'').toLowerCase().includes('hipotec'));\n const gnbStatuses=['Datos pendientes','Pendiente confirmación','Ficha completa','Lista para enviar','Enviada a GNB','Observada','Aprobada','No aprobada','Desistimiento'];\n const approved=bankRows.filter(l=>l.bank_evaluation.status==='Aprobada').length,sent=bankRows.filter(l=>l.bank_evaluation.sent_at).length;\n const selectedSeparations=(d.separations||[]).filter(s=>filteredIds.has(s.lead_id)),confirmed=selectedSeparations.filter(s=>['CONFIRMED','RESERVED','SOLD'].includes(String(s.status||'').toUpperCase())),minutes=selectedSeparations.filter(s=>s.minute),signed=selectedSeparations.filter(s=>s.documents?.signed_sale_minutes?.drive_file_id),notary=selectedSeparations.filter(s=>s.documents?.notary_voucher?.drive_file_id),readyClose=selectedSeparations.filter(s=>s.minute&&s.documents?.signed_sale_minutes?.drive_file_id&&s.documents?.notary_voucher?.drive_file_id);\n const assigned=leads.filter(l=>l.sales_owner&&l.sales_owner!=='Sin asignar'),open=leads.filter(l=>!l.archived_at&&!['Venta','Perdido','Desestimado'].includes(l.status)),overdue=open.filter(l=>l.next_action_at&&new Date(l.next_action_at)<new Date()),withoutNext=open.filter(l=>!l.next_action||!l.next_action_at);\n const gnb=[metric('Evaluaciones hipotecarias',bankRows.length),metric('Enviadas a GNB',sent),metric('Aprobadas por GNB',approved),ratio('Tasa de aprobación GNB',approved,bankRows.filter(l=>['Aprobada','No aprobada'].includes(l.bank_evaluation.status)).length),metric('Observadas',bankRows.filter(l=>l.bank_evaluation.status==='Observada').length),metric('Datos pendientes',bankRows.filter(l=>l.bank_evaluation.status==='Datos pendientes').length)];\n const legal=[metric('Separaciones confirmadas',confirmed.length),metric('Minutas generadas',minutes.length),metric('Minutas firmadas cargadas',signed.length),metric('Voucher de notaría cargado',notary.length),metric('Listas para cerrar venta',readyClose.length),metric('Pendientes de minuta',Math.max(0,confirmed.length-minutes.length))];\n const inventory=[metric('Unidades disponibles',unitList.filter(u=>u.status==='AVAILABLE'&&!activeForUnit(d.separations,u.id)).length),metric('Unidades separadas',unitList.filter(u=>activeForUnit(d.separations,u.id)).length),metric('Unidades vendidas',soldUnits.length),ratio('Absorción de inventario',soldUnits.length,unitList.length),metric('Unidades totales',unitList.length),metric('Separaciones activas',selectedSeparations.filter(s=>['ACTIVE','CONFIRMED','RESERVED'].includes(String(s.status||'').toUpperCase())).length)];\n const advisors=[metric('Leads con asesor',assigned.length),ratio('Cobertura de asignación',assigned.length,leads.length),metric('Abiertos sin próxima acción',withoutNext.length),metric('Próximas acciones vencidas',overdue.length),metric('Leads abiertos',open.length),metric('Asesores activos',new Set(assigned.map(l=>l.sales_owner)).size)];\n const quality=[metric('Leads sin teléfono',leads.filter(l=>!/[0-9]{7}/.test(String(l.phone||''))).length),metric('Leads sin correo',leads.filter(l=>!/^\\S+@\\S+\\.\\S+$/.test(String(l.email||''))).length),metric('Leads sin responsable',leads.filter(l=>l.sales_owner==='Sin asignar').length),metric('Leads sin fecha de ingreso',leads.filter(l=>!iso(l.received_at)).length),metric('Ventas sin importe',leads.filter(l=>l.status==='Venta'&&!Number(l.sale_amount)).length),metric('Registros sin trazabilidad nueva',leads.filter(l=>!l.tracking_started_at).length)];",
'secciones Power BI');
replace('business/analyticsService.js',
"options:Object.fromEntries(['project','source','campaign_name','sales_owner'].map(k=>[k,[...new Set(all.map(l=>l[k]))].sort()])),",
"options:Object.fromEntries(['project','source','campaign_name','sales_owner','status','substatus','financing_type','gnb_status','unit_interest'].map(k=>[k,[...new Set(all.map(l=>l[k]).filter(Boolean))].sort()])),",
'opciones extendidas');
replace('business/analyticsService.js',
"marketing:metricsMarketing,sales:metricsSales,management:[metric('Unidades vendidas en el período',saleIds.size),metric('Importe real vendido',saleAmount,'money'),metric('Ciclo de venta · mediana',percentile(cycle,.5),'days'),metric('Inventario disponible actual',unitList.filter(u=>u.status==='AVAILABLE'&&!activeForUnit(d.separations,u.id)).length),ratio('Absorción actual',soldUnits.length,unitList.length),metric('Gasto real de captación',spend,'money')],",
"marketing:metricsMarketing,sales:metricsSales,management:[metric('Unidades vendidas en el período',saleIds.size),metric('Importe real vendido',saleAmount,'money'),metric('Ciclo de venta · mediana',percentile(cycle,.5),'days'),metric('Inventario disponible actual',unitList.filter(u=>u.status==='AVAILABLE'&&!activeForUnit(d.separations,u.id)).length),ratio('Absorción actual',soldUnits.length,unitList.length),metric('Gasto real de captación',spend,'money')],gnb,legal,inventory,advisors,quality,gnbDistribution:gnbStatuses.map(status=>({status,count:bankRows.filter(l=>l.bank_evaluation.status===status).length})),",
'propiedades Power BI');

replace('src/BusinessDashboard.jsx',
"{from:'',to:'',project:'',source:'',campaign:'',owner:'',mode:'activity'}",
"{from:'',to:'',project:'',source:'',campaign:'',owner:'',stage:'',substatus:'',financingType:'',gnbStatus:'',unit:'',mode:'activity'}",
'filtros iniciales');
replace('src/BusinessDashboard.jsx',
"{filter('owner','Responsable',report?.options.sales_owner)}</div>",
"{filter('owner','Responsable',report?.options.sales_owner)}{filter('stage','Etapa',report?.options.status)}{filter('substatus','Subestado',report?.options.substatus)}{filter('financingType','Financiamiento',report?.options.financing_type)}{filter('gnbStatus','Estado GNB',report?.options.gnb_status)}{filter('unit','Unidad',report?.options.unit_interest)}</div>",
'controles de filtro');
replace('src/BusinessDashboard.jsx',
"[['management','Gerencia'],['marketing','Marketing'],['sales','Ventas']]",
"[['management','Gerencia'],['marketing','Marketing'],['sales','Ventas'],['gnb','Evaluación GNB'],['legal','Documentos y cierre'],['advisors','Asesores'],['inventory','Inventario'],['quality','Calidad de datos']]",
'pestañas analíticas');
replace('src/BusinessDashboard.jsx',
"{cards(report[view])}",
"{cards(report[view]||[])}{view==='gnb'&&<div className=\"orok-card dashboard-detail\"><h3 style={{marginTop:0}}>Distribución de evaluaciones GNB</h3><div data-responsive-grid=\"true\" style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))',gap:10}}>{(report.gnbDistribution||[]).map(row=><div key={row.status} style={{padding:12,border:'1px solid #e7dfd8',borderRadius:10}}><strong>{row.count}</strong><div style={{fontSize:12}}>{row.status}</div></div>)}</div></div>}",
'detalle GNB');

replace('src/WeeklyAnalysis.jsx',
"{selection?.part==='backlog'?<>{chart('backlog')}{chart('sources')}</>:<>{chart('sources')}{chart('backlog')}</>}",
"<div data-responsive-grid=\"true\" style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))',gap:16}}><div className=\"orok-card\"><h3 style={{marginTop:0}}>Evaluación GNB</h3>{(report.gnb||[]).slice(0,4).map(row=><p key={row.label} style={{display:'flex',justifyContent:'space-between',gap:8}}><span>{row.label}</span><strong>{row.value??'—'}{row.unit==='percent'?'%':''}</strong></p>)}</div><div className=\"orok-card\"><h3 style={{marginTop:0}}>Documentos y cierre</h3>{(report.legal||[]).slice(0,4).map(row=><p key={row.label} style={{display:'flex',justifyContent:'space-between',gap:8}}><span>{row.label}</span><strong>{row.value??'—'}</strong></p>)}</div></div>{selection?.part==='backlog'?<>{chart('backlog')}{chart('sources')}</>:<>{chart('sources')}{chart('backlog')}</>}",
'resumen semanal GNB');

replace('src/App.jsx',
"            </div>\n            <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:18}}><button type=\"button\" disabled={separationBusy}",
"            </div>\n            <section style={{marginTop:16,padding:12,border:'1px solid #e7dfd8',borderRadius:10}}><strong>Firmantes adicionales de la separación y minuta</strong><p style={{fontSize:12,color:'#57534e'}}>El titular es la persona indicada arriba. Agrega aquí al cónyuge o coevaluado que también firmará.</p>{(separationModal.signers||[]).slice(1).map((signer,offset)=>{const index=offset+1,update=(field,value)=>setSeparationModal(current=>({...current,signers:current.signers.map((item,i)=>i===index?{...item,[field]:value}:item)}));return <fieldset key={index} style={{margin:'10px 0',border:'1px solid #ddd',borderRadius:8}}><legend>Firmante adicional {index}</legend><div data-responsive-grid=\"true\" style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:8}}><label>Nombre completo<input required className=\"orok-input\" value={signer.name||''} onChange={e=>update('name',e.target.value)}/></label><label>DNI<input required pattern=\"[0-9]{8}\" maxLength=\"8\" className=\"orok-input\" value={signer.dni||''} onChange={e=>update('dni',e.target.value.replace(/\\D/g,'').slice(0,8))}/></label><label>Estado civil<input required className=\"orok-input\" value={signer.marital_status||''} onChange={e=>update('marital_status',e.target.value)}/></label><label>Domicilio<input required className=\"orok-input\" value={signer.address||''} onChange={e=>update('address',e.target.value)}/></label></div><button type=\"button\" className=\"orok-btn orok-btn-secondary\" onClick={()=>setSeparationModal(current=>({...current,signers:current.signers.filter((_,i)=>i!==index)}))}>Retirar firmante</button></fieldset>;})}<button type=\"button\" className=\"orok-btn orok-btn-secondary\" onClick={()=>setSeparationModal(current=>({...current,signers:[...(current.signers||[]),{role:'Coevaluado',name:'',dni:'',marital_status:'',address:current.address||''}]}))}>Agregar firmante</button></section>\n            <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:18}}><button type=\"button\" disabled={separationBusy}",
'firmantes adicionales');

const pkg=JSON.parse(read('package.json'));pkg.version='67.6.11-r28';write('package.json',JSON.stringify(pkg,null,2)+'\n');
let server=read('server.cjs').replaceAll("version:'67.6.10'","version:'67.6.11-r28'").replace("revision:'instagram-facebook-login-r23'","revision:'cierre-ensayo-r28'");write('server.cjs',server);
for(const p of ['application.cjs','src/App.jsx']){
 let s=read(p).replaceAll("'67.6.10-r28'","'67.6.11-r28'");write(p,s);
}
console.log('r28 finalized transforms applied');
