const {PDFDocument,StandardFonts,rgb}=require('pdf-lib');
const fs=require('fs');
const clean=s=>String(s??'').normalize('NFC').replace(/[^\x20-\x7E\xA0-\xFF]/g,' ');
const value=m=>m.value===null||m.value===undefined?'Sin datos':(m.unit==='money'?'S/ ':'')+Number(m.value).toLocaleString('es-PE',{maximumFractionDigits:1})+({percent:'%',minutes:' min',days:' días'}[m.unit]||'');
const funnelLabel=stage=>stage==='Lead Inicial'?'Total Leads Recibidos':stage==='Cita'?'Cita agendada':stage;
const funnelPercent=n=>n===null||n===undefined?'Sin base':Number(n).toLocaleString('es-PE',{maximumFractionDigits:1})+'%';
async function analyticsPDF(report,filters,settings,filePath){
 if(filters.weekly)return require('./weeklyAnalyticsPDF').weeklyAnalyticsPDF(report,filters,settings,filePath);
 const doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold);let page,y;
 const brand=rgb(.52,.27,.16),ink=rgb(.18,.15,.14);
 function newPage(title){page=doc.addPage([595,842]);page.drawText('ÖRÖK | '+clean(settings.projectName||'CRM Inmobiliario'),{x:40,y:800,size:16,font:bold,color:brand});page.drawText('Control de Marketing y Ventas | '+(report.scope==='historical'?'Histórico completo':report.from+' a '+report.to),{x:40,y:780,size:10,font,color:ink});page.drawLine({start:{x:40,y:768},end:{x:555,y:768},thickness:1,color:brand});page.drawText(clean(title),{x:40,y:741,size:14,font:bold,color:brand});y=720;}
 function line(text,{size=10,strong=false,x=40}={}){
  const words=clean(text).split(/\s+/);let row='';const f=strong?bold:font;
  const put=s=>{if(y<62)newPage('Continuación');page.drawText(s,{x,y,size,font:f,color:ink});y-=size+6;};
  for(const word of words){const next=row?row+' '+word:word;if(f.widthOfTextAtSize(next,size)>550-x&&row){put(row);row=word;}else row=next;}
  if(row)put(row);y-=3;
 }
 newPage('Alcance y calidad de datos');
 line('Medición: '+(report.scope==='historical'?'Histórico completo de leads únicos en la base de datos.':'Leads recibidos en el período, seguidos hasta hoy.'));
 for(const [k,label] of [['project','Proyecto'],['source','Fuente'],['campaign','Campaña'],['owner','Responsable']])line(label+': '+(filters[k]||'Todos'));
 line('Fuente, campaña y responsable: asignación actual del lead. Gerencia: ventas del período e inventario actual. Los eventos mantienen el responsable que los registró.');
 const c=report.coverage;
 line(`${c.received} / ${c.total} leads con fecha de ingreso. ${c.complete} / ${c.cohort} captados con historial completo. ${c.legacy} registros sin seguimiento nuevo.`);
 line(`${c.legacySalesWithoutAmount} ventas anteriores sin importe real. ${c.expensesUnattributed} gastos sin atribución a captación. ${c.appointmentsPending} citas vencidas pendientes de resolver.`);
 line('Sin datos indica información insuficiente. Los ceros reflejan eventos registrados y no reconstruyen el pasado. No se utiliza el presupuesto del cliente como venta.');
 line('Asistencia = asistidas / (asistidas + inasistencias). Se excluyen citas futuras, pendientes, canceladas y reprogramadas. Costos = gasto real de captación identificado / resultados registrados.');
 line('Cohorte: las conversiones siguen a los mismos leads ingresados en el período. Actividad: puede incluir leads de períodos anteriores. La primera respuesta mide el primer intento registrado.');
 for(const [key,label] of [['management','Gerencia'],['marketing','Marketing'],['sales','Ventas']]){
  newPage(label);for(const m of report[key]){line(m.label+': '+value(m),{strong:true,size:12});if(m.detail)line(m.detail,{size:9});y-=9;}
 }
 newPage('Embudo acumulado');
 line('Marketing / Total Leads Recibidos: '+report.funnelBasis.marketingTotal,{strong:true,size:12});
 line('Ventas / Citas asistidas: '+report.funnelBasis.salesTotal,{strong:true,size:12});
 line('Base: '+(report.scope==='historical'?'todos los leads únicos de la base':'recibidos del '+report.from+' al '+report.to)+', con los filtros seleccionados e incluidos archivados. Ventas se alimenta de citas agendadas que asistieron o asistencias manuales.');
 line('Cada etapa incluye las posteriores. Las etapas no se suman. Se usa el avance máximo del estado o historial; las etapas previas inferidas no acreditan una asistencia individual.');
 line(report.funnelBasis.inferredLeads+' leads con etapas previas inferidas. '+report.funnelBasis.withoutReceivedDate+' sin fecha válida, excluidos del período.');
 for(const [group,rows] of Object.entries(report.funnels)){line(({marketing:'Marketing - base: Total Leads Recibidos',sales:'Ventas - base: Citas asistidas'})[group],{strong:true,size:12});for(const r of rows)line(funnelLabel(r.stage)+': '+r.count+' | '+funnelPercent(r.ofTotalPct)+' de la base | '+funnelPercent(r.fromPreviousPct)+' de la etapa anterior');y-=10;}
 line('Seguimiento y descartes - distribución actual, fuera del embudo',{strong:true});
 line('Tarjetas activas con los filtros seleccionados, sin filtro de fecha.');
 for(const r of report.stateDistribution.other)line(r.stage+': '+r.count);
 if(report.insights){
  const info=report.insights,colors=[rgb(.2,.42,.65),rgb(.75,.33,.53),rgb(.28,.48,.42),rgb(.72,.53,.2),rgb(.45,.34,.63),rgb(.78,.4,.25)];
  newPage('Embudos de Marketing y Ventas');
  for(const [j,key] of ['marketing','sales'].entries()){const x=40+j*268,base=key==='marketing'?report.funnelBasis.marketingTotal:report.funnelBasis.salesTotal;page.drawText(key==='marketing'?'Marketing - acumulado':'Ventas - Citas asistidas',{x,y:710,size:12,font:bold,color:brand});page.drawText('Base: '+base+' '+(key==='marketing'?'leads recibidos':'citas asistidas'),{x,y:693,size:10,font,color:ink});report.funnels[key].forEach((r,i)=>{const w=base?248*r.count/base:0,xx=x+(248-w)/2,yy=668-i*61;page.drawText(clean(funnelLabel(r.stage)),{x,y:yy,size:9,font,color:ink});const count=r.count+' | '+funnelPercent(r.ofTotalPct);page.drawText(count,{x,y:yy-14,size:10,font:bold,color:ink});page.drawRectangle({x,y:yy-39,width:248,height:17,color:rgb(.96,.92,.90)});if(w>0)page.drawRectangle({x:xx,y:yy-39,width:w,height:17,color:key==='marketing'?brand:colors[2],opacity:1-i*.1});});}
  y=350;line('Anchos y porcentajes sobre la base propia de cada embudo. Cada etapa es subconjunto de la anterior. Las etapas no se suman.');
  function bars(title,rows,labels){
   for(let offset=0;offset<Math.max(1,rows.length);offset+=12){const chunk=rows.slice(offset,offset+12);newPage(title+(offset?' - continuación':''));const max=Math.max(1,...chunk.map(r=>r.values.reduce((n,v)=>n+v,0))),bw=Math.min(30,450/Math.max(1,chunk.length)-8);page.drawLine({start:{x:50,y:365},end:{x:550,y:365},color:ink,thickness:.5});chunk.forEach((r,i)=>{const x=55+i*490/Math.max(1,chunk.length);let yy=365;r.values.forEach((v,j)=>{const h=v/max*260;if(h){page.drawRectangle({x,y:yy,width:bw,height:h,color:colors[j%colors.length]});if(h>14)page.drawText(String(v),{x:x+3,y:yy+h/2-3,size:8,font,color:rgb(1,1,1)});yy+=h;}});page.drawText(clean(r.label),{x,y:347,size:7,font,color:ink});});y=319;labels.forEach((label,i)=>{if(y<85)newPage('Leyenda');page.drawRectangle({x:40,y:y-2,width:9,height:9,color:colors[i%colors.length]});line(label,{x:56});});}
  }
  for(const cumulative of [false,true])bars(cumulative?'Procedencia acumulada desde el inicio del período':'Procedencia por mes de ingreso',info.monthly.map(m=>({label:m.month,values:(cumulative?m.cumulative:m.sources).map(s=>s.count)})),info.sources);
  bars('Rezagados acumulados por mes - contactos únicos',info.backlogMonthly.map(b=>({label:b.month,values:['pending','recovered','closed','discarded'].map(k=>b.counts[k])})),['Sin seguimiento','Retomados','Venta cerrada','Desestimados']);
  line('Cada barra acumula contactos desde su primer corte semanal pendiente, sin duplicarlos dentro de esa barra. No se suman las barras. Los colores muestran la situación actual y se actualizan al retomar seguimiento. Plazo estándar: 3 días; una próxima acción o cita registrada determina su vencimiento.');line('Registros sin inicio fiable del seguimiento: '+info.backlog.unknown+'. Riesgo de pérdida por falta de seguimiento; no prueba una pérdida comercial.');
 }
 for(const [key,rows] of Object.entries(report.comparisons)){
  newPage('Comparativo por '+({projects:'proyecto',campaigns:'campaña',owners:'responsable'})[key]);line('Captados, MQL, visitas y cierre: cohorte hasta hoy. Ventas, importe y CPA: actividad del período.',{size:9});
  if(!rows.length)line('Sin leads para estos filtros.');
  for(const r of rows){if(y<150)newPage('Comparativo - continuación');line(r.name,{strong:true,size:12});line(`Captados: ${r.leads} | MQL: ${r.mql} | Visitas (leads): ${r.visits} | Cierre: ${value({value:r.conversion,unit:'percent'})} (${r.closed}/${r.visits})`);line(`Ventas: ${r.sales} | Importe: ${value({value:r.revenue,unit:'money'})} | CPA operativo: ${value({value:r.cpa,unit:'money'})}`);y-=6;}
 }
 newPage('Seguimiento pendiente');for(const l of report.pending){line(l.name+' | '+l.owner,{strong:true});line(l.stage+' | Días sin actividad: '+(l.days??'Sin datos')+' | '+l.next);}
 const pages=doc.getPages();pages.forEach((p,i)=>{p.drawLine({start:{x:40,y:44},end:{x:555,y:44},thickness:.5,color:brand});p.drawText('OROK Desarrolladora Inmobiliaria | Reporte de gestión | '+(i+1)+' / '+pages.length,{x:40,y:28,size:9,font,color:ink});});
 await fs.promises.writeFile(filePath,await doc.save());return {success:true,filePath};
}
module.exports={analyticsPDF};
