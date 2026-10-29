const fs=require('fs');
const {PDFDocument,StandardFonts,rgb}=require('pdf-lib');
const clean=s=>String(s??'').replace(/[^\x20-\x7E\xA0-\xFF]/g,' ');
async function weeklyAnalyticsPDF(report,filters,settings,filePath){
 const info=report.insights,w=info.weekly,doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold),brand=rgb(.52,.27,.16),ink=rgb(.18,.15,.14);
 const palette=['346ca5','c15387','477b6b','b78732','7355a1','c7653f','58727d','968332'].map(h=>rgb(...[0,2,4].map(i=>parseInt(h.slice(i,i+2),16)/255))),follow=['c46b3a','427b69','376c9c','8c8095'].map(h=>rgb(...[0,2,4].map(i=>parseInt(h.slice(i,i+2),16)/255)));
 let page,y;
 function text(s,x,yy,size=10,strong=false){page.drawText(clean(s),{x,y:yy,size,font:strong?bold:font,color:ink});}
 function frame(title){page=doc.addPage([595,842]);page.drawText('ÖRÖK | '+clean(settings.projectName||'CRM'),{x:36,y:800,size:16,font:bold,color:brand});text('Análisis semanal - '+w.month+' | Fechas de Lima',36,777);page.drawLine({start:{x:36,y:764},end:{x:559,y:764},color:brand,thickness:1});text(title,36,739,14,true);y=715;}
 function paragraph(s){for(const line of clean(s).match(/.{1,98}(?:\s|$)|\S+/g)||[]){if(y<70)frame('Continuación');text(line.trim(),36,y,9);y-=15;}y-=6;}
 function graph(title,rows,labels,colors){frame(title);const max=Math.max(4,Math.ceil(Math.max(1,...rows.map(r=>r.values.reduce((a,b)=>a+b,0)))/4)*4),step=500/rows.length;
  [0,.25,.5,.75,1].forEach(p=>{text(String(max*p),36,370+p*260,8);page.drawLine({start:{x:55,y:373+p*260},end:{x:552,y:373+p*260},color:rgb(.88,.87,.85),thickness:.5});});
  rows.forEach((r,i)=>{const x=66+i*step;let yy=373;r.values.forEach((v,j)=>{const h=v/max*260;if(h){page.drawRectangle({x,y:yy,width:35,height:h,color:colors[j%colors.length]});if(h>14)page.drawText(String(v),{x:x+8,y:yy+h/2-3,size:9,font:bold,color:rgb(1,1,1)});yy+=h;}});text('S'+(i+1)+' '+r.from.slice(8)+'-'+r.to.slice(8),x-7,352,8);if(r.future)text('Futura',x-5,338,8);});y=311;
  labels.forEach((label,i)=>{if(y<120)frame('Leyenda - '+title);page.drawRectangle({x:36,y:y-1,width:8,height:8,color:colors[i%colors.length]});text(label,50,y,9);y-=18;});y-=10;
 }
 graph('Procedencia por semana del mes',w.weeks.map(r=>({...r,values:r.sources.map(s=>s.count)})),info.sources,palette);
 paragraph('Captados en cada semana, limitados al período '+report.from+' a '+report.to+'. Semanas de lunes a domingo, recortadas al mes.');
 paragraph('Sin fecha de ingreso: '+info.unknownReceived+'. Se excluyen de la gráfica; sincroniza la columna FECHA o registra una fecha comprobada.');
 paragraph('Filtros: '+[filters.project,filters.source,filters.campaign,filters.owner].map(x=>x||'Todos').join(' / '));
 graph('Seguimiento al cierre de cada semana',w.backlog.map(r=>({...r,values:['pending','recovered','closed','discarded'].map(k=>r.counts[k])})),['Sin seguimiento','Retomados','Venta cerrada','Desestimados'],follow);
 paragraph('Cada corte cuenta contactos únicos, incluyendo arrastres. Un contacto puede aparecer en distintos cortes: no se suman las semanas. La semana actual se mide hasta '+info.backlog.asOf+'. Las futuras no son resultados cero.');
 paragraph('Regla: próxima acción o cita vencida; en su ausencia, tres días sin actividad registrada. Los contactos sin historial suficiente se miden desde el inicio de seguimiento disponible.');
 frame('Control semanal y acumulado del mes');let total=0;
 for(const [i,r] of w.weeks.entries()){const b=w.backlog[i],n=r.sources.reduce((a,s)=>a+s.count,0);total+=n;paragraph('Semana '+r.index+' | '+r.from+' a '+r.to+(r.future?' | Futura':''));if(!r.future){paragraph('Captados: '+n+' | Acumulado del mes: '+total);paragraph('Sin seguimiento: '+b.counts.pending+' | Retomados: '+b.counts.recovered+' | Venta: '+b.counts.closed+' | Desestimados: '+b.counts.discarded);paragraph('Arrastres de meses anteriores: '+b.contacts.filter(c=>c.carried).length);}y-=8;}
 for(const [i,p] of doc.getPages().entries()){p.drawLine({start:{x:36,y:48},end:{x:559,y:48},color:brand,thickness:.5});p.drawText('OROK Desarrolladora Inmobiliaria | Control semanal | '+(i+1)+' / '+doc.getPageCount(),{x:36,y:29,size:9,font,color:ink});}
 await fs.promises.writeFile(filePath,await doc.save());return {success:true,filePath};
}
module.exports={weeklyAnalyticsPDF};
