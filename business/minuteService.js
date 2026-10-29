'use strict';
const lifecycle=require('./lifecycle');
const TYPES={Hipotecario:'bank_minute',Directo:'direct_minute',Contado:'direct_minute'};
const SALE_DOCUMENTS=['signed_sale_minutes','notary_voucher'];
const STATUSES=['Pendiente generar','Borrador bancaria','Borrador directa','En revisión','Lista firma','Firmada','Voucher notaría pendiente','Documentación completa'];
const text=(value,max=500)=>String(value??'').trim().slice(0,max);
const saleDocumentProgress=separation=>{const documents=separation?.documents||{},complete=SALE_DOCUMENTS.filter(kind=>documents[kind]?.drive_file_id).length;return {complete,total:SALE_DOCUMENTS.length,ready:complete===SALE_DOCUMENTS.length};};
const minuteType=separation=>{const type=TYPES[separation?.financing_type];if(!type)throw Error('La modalidad de financiamiento no permite determinar la minuta.');return type;};
function createMinute(separation,actor,template,filePath,signers){
 if(!['CONFIRMED','RESERVED'].includes(String(separation.status||'').toUpperCase()))throw Error('Confirma la separación antes de generar la minuta.');
 const type=minuteType(separation),at=new Date().toISOString(),normalized=(signers||separation.signers||[]).map((s,index)=>({role:index?'Coevaluado':'Titular',name:text(s.name,200),dni:text(s.dni,20).replace(/\D/g,'').slice(0,8),marital_status:text(s.marital_status,80),address:text(s.address,500)}));
 if(!normalized.length||normalized.some(s=>!s.name||s.dni.length!==8))throw Error('Completa el nombre y DNI de todas las personas que firmaron la separación.');
 return {type,status:type==='bank_minute'?'Borrador bancaria':'Borrador directa',signers:normalized,template_source:template.source,template_file_id:template.file_id,template_modified_at:template.modified_at,pdf_path:filePath,generated_at:at,generated_by:text(actor,200),revision:Number(separation.minute?.revision||0)+1,audit:[...(separation.minute?.audit||[]),{at,actor:text(actor,200),action:'generate',to:type}]};
}
function updateMinuteStatus(d,separationId,status,input={},actor='Usuario registrado'){
 if(!STATUSES.includes(status))throw Error('Estado de minuta no válido.');
 const separation=(d.separations||[]).find(item=>item.id===separationId);if(!separation?.minute)throw Error('Genera primero la minuta.');
 const at=new Date().toISOString(),reason=text(input.reason,1000);if(['En revisión'].includes(status)&&!reason)throw Error('Indica la observación.');
 const progress=saleDocumentProgress(separation);if(status==='Documentación completa'&&!progress.ready)throw Error('Falta la minuta firmada o el voucher de notaría.');
 separation.minute.status=status;separation.minute.updated_at=at;separation.minute.updated_by=text(actor,200);separation.minute.audit=[...(separation.minute.audit||[]),{at,actor:text(actor,200),action:'status',to:status,reason}];
 const lead=(d.leads||[]).find(item=>item.id===separation.lead_id);if(lead){lead.substatus=status;if(lead.status!=='Minuta'){const from=lead.status;lead.status='Minuta';lead.stage_history=[...(lead.stage_history||[]),{from,to:'Minuta',at,actor:text(actor,200),observed:false}];lifecycle.event(lead,'minute',actor,{status,separation_id:separation.id},at);}}
 return separation.minute;
}
module.exports={TYPES,SALE_DOCUMENTS,STATUSES,saleDocumentProgress,minuteType,createMinute,updateMinuteStatus};
