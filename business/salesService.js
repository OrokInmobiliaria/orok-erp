const sold=u=>!!u?.sold_lead_id||['SOLD','VENDIDO','VENDIDA','VENTA'].includes(String(u?.status||'').toUpperCase());
const unitNumber=value=>String(value||'').trim().match(/^(?:D(?:PTO)?\.?\s*)?(\d{3,4})(?=\D|$)/i)?.[1]||'';
function candidates(lead,units){
  const numbers=new Set([lead.dpto1,lead.dpto2,lead.dpto_number].map(unitNumber).filter(Boolean));
  return units.filter(u=>numbers.has(String(u.unit_number)));
}
function confirmSale(d,lead,id,{at=new Date().toISOString()}={}){
  if(lead.sold_unit_id&&lead.sold_unit_id!==id)throw new Error('Este lead ya tiene una unidad vendida confirmada.');
  const u=(d.units||[]).find(u=>u.id===id);if(!u)throw new Error('Selecciona el departamento vendido del Inventario.');
  if(sold(u)&&u.sold_lead_id!==lead.id)throw new Error('El departamento '+u.unit_number+' ya está vendido.');
  u.status='SOLD';u.sold_lead_id=lead.id;u.sold_at=u.sold_at||at;
  lead.sold_unit_id=u.id;lead.sold_unit_number=String(u.unit_number);lead.sale_confirmed_at=u.sold_at;
}
function reconcileSales(d){
  for(const l of d.leads||[]){
    if(l.sold_unit_id){const u=(d.units||[]).find(u=>u.id===l.sold_unit_id);if(u&&(!sold(u)||u.sold_lead_id===l.id))confirmSale(d,l,u.id,{at:l.sale_confirmed_at||null});}
    else if(l.status==='Venta'){
      const matches=candidates(l,d.units||[]);
      if(matches.length===1&&(!sold(matches[0])||matches[0].sold_lead_id===l.id))confirmSale(d,l,matches[0].id,{at:l.sale_confirmed_at||null});
    }
  }
}
function assertQuotable(units,ref){
  const u=units.find(u=>ref?.id?u.id===ref.id:String(u.unit_number)===unitNumber(ref?.unit_number));
  if(!u)throw new Error('El departamento ya no existe en Inventario.');
  if(sold(u))throw new Error('El departamento '+u.unit_number+' está vendido y bloqueado para cotizar.');
  return u;
}
module.exports={sold,candidates,confirmSale,reconcileSales,assertQuotable};
