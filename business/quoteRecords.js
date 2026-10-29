const columns=['Fecha','Hora','Código','Prospecto','Departamento','Precio lista (S/)','Monto final (S/)','Asesor'];
function selectedQuotes(quotes,ids){
  if(!Array.isArray(ids)||!ids.length)throw new Error('Selecciona al menos una cotización.');
  const selected=new Set(ids);const rows=quotes.filter(q=>selected.has(q.id));
  if(rows.length!==selected.size)throw new Error('Una cotización ya no está disponible. Actualiza la selección.');
  return rows;
}
function quotesCSV(quotes){
  const cell=v=>'"'+String(v??'').replace(/^[=+@\-\t\r]/,"'$&").replace(/"/g,'""')+'"';
  const number=v=>Number.isFinite(Number(v))?String(Number(v)):'';
  const rows=quotes.map(q=>{
    const date=new Date(q.date),valid=!Number.isNaN(date.getTime());
    return [valid?date.toLocaleDateString('es-PE',{timeZone:'America/Lima'}):'',valid?date.toLocaleTimeString('es-PE',{timeZone:'America/Lima',hour12:false}):'',q.quote_code,q.lead_name,q.unit_number,number(q.price),number(q.final_price),q.seller];
  });
  return '\uFEFF'+[columns,...rows].map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';
}
module.exports={selectedQuotes,quotesCSV};
