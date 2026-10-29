'use strict';
const {allowedURL}=require('../safe-network.cjs');
const fs=require('node:fs/promises');
const path=require('node:path');

const lifecycle=require('./lifecycle');
const {SALE_DOCUMENTS,saleDocumentProgress}=require('./minuteService');
const BLOCKING_STATUSES=new Set(['CONFIRMED','RESERVED']);
const OPEN_STATUSES=new Set(['DRAFT','ACTIVE','CONFIRMED','RESERVED']);
const REQUIRED_DOCUMENTS=['dni','signed_separation','reservation_voucher'];
const ALL_DOCUMENTS=[...REQUIRED_DOCUMENTS,...SALE_DOCUMENTS];
const text=(value,max=500)=>String(value??'').trim().slice(0,max);
const amount=value=>{const n=Number(value);if(!Number.isFinite(n)||n<0)throw Error('Revisa los montos de la separación.');return Math.round(n*100)/100;};
const isBlocking=separation=>BLOCKING_STATUSES.has(String(separation?.status||'').toUpperCase());
const activeForUnit=(rows,unitId)=>[...(rows||[])].reverse().find(item=>item.unit_id===unitId&&isBlocking(item))||null;
const addCalendarDays=(value,days)=>new Date(Date.parse(value)+Number(days)*86400000).toISOString();
const documentProgress=separation=>{const documents=separation?.documents||{},complete=REQUIRED_DOCUMENTS.filter(kind=>documents[kind]?.drive_file_id).length;return {complete,total:REQUIRED_DOCUMENTS.length,ready:complete===REQUIRED_DOCUMENTS.length};};
const minimumSeparationAmount=separation=>Math.round(Math.max(Number(separation?.separation_amount||0),Number(separation?.final_price||0)*0.01)*100)/100;
const voucherPaymentStatus=separation=>{
 const required=minimumSeparationAmount(separation),raw=separation?.documents?.reservation_voucher?.review?.extracted?.amount,paid=raw===null||raw===undefined?null:amount(raw);
 return {required,paid,covers:Number.isFinite(paid)&&required>0&&paid+0.009>=required};
};

function googleDocumentExport(value){
 const raw=allowedURL(value),url=new URL(raw),match=url.pathname.match(/^\/document\/d\/([\w-]+)/);
 if(url.hostname==='docs.google.com'&&match)return `https://docs.google.com/document/d/${match[1]}/export?format=txt`;
 if(/\.(txt|text)(?:$|\?)/i.test(url.pathname+url.search)||['orok.com.pe','www.orok.com.pe','infinity224.pe','www.infinity224.pe'].includes(url.hostname))return raw;
 throw Error('La plantilla debe ser un Google Docs público o un archivo TXT del sitio del proyecto.');
}

async function fetchSeparationTemplate(value,fetcher=fetch){
 if(!text(value,2048))return {text:await fs.readFile(path.join(__dirname,'../templates/separacion-base.txt'),'utf8'),source:'Plantilla interna de respaldo'};
 const source=googleDocumentExport(text(value,2048)),response=await fetcher(source,{signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw Error(`No se pudo leer la plantilla de separación (HTTP ${response.status}). Revisa que el enlace sea público.`);
 const bytes=Buffer.from(await response.arrayBuffer());
 if(bytes.length>300000)throw Error('La plantilla de separación supera 300 KB.');
 if(bytes[0]===0x50&&bytes[1]===0x4b)throw Error('El enlace descarga un Word. Ábrelo como Google Docs y pega el enlace público del documento.');
 const result=bytes.toString('utf8').replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').trim();
 if(/^\s*<(?:!doctype|html)/i.test(result))throw Error('Se recibió una página web en lugar de la plantilla. Revisa los permisos del Google Docs.');
 for(const token of ['{{CLIENT_NAME}}','{{UNIT_NUMBER}}','{{FINAL_PRICE}}'])if(!result.includes(token))throw Error('La plantilla no contiene el campo obligatorio '+token+'.');
 return {text:result,source};
}

function updateSeparation(d,id,action,payload={},actor='Usuario registrado'){
 const separation=(d.separations||[]).find(item=>item.id===id);if(!separation)throw Error('Separación no encontrada. Actualiza la pantalla.');
 const currentStatus=String(separation.status||'').toUpperCase();if(!OPEN_STATUSES.has(currentStatus))throw Error('Esta separación ya fue cerrada.');
 const unit=(d.units||[]).find(item=>item.id===separation.unit_id);if(!unit)throw Error('La unidad ya no existe en el inventario.');
 const lead=(d.leads||[]).find(item=>item.id===separation.lead_id),linked=lead?.separations?.find(item=>item.id===separation.id);
 const at=new Date().toISOString(),reason=text(payload.reason,1000);if(action!=='confirm'&&!reason)throw Error('Indica el motivo para conservar la auditoría.');
 const from=separation.status;let to=from,entry={at,actor:text(actor,200)||'Usuario registrado',action:text(action,40),reason,from};
 if(action==='confirm'){
  if(!['DRAFT','ACTIVE'].includes(currentStatus))throw Error('La separación ya está confirmada.');
  const other=activeForUnit(d.separations,unit.id);if(other&&other.id!==separation.id)throw Error('La unidad ya tiene una separación activa: '+other.code+'.');
  if(!lead)throw Error('El lead vinculado ya no está disponible.');
  if(['Perdido','Desestimado','Venta'].includes(lead.status))throw Error('El lead no puede pasar a Separación desde su estado actual.');
  const method=payload.confirmation_method==='documents'?'documents':'manual';
  const payment=voucherPaymentStatus(separation);if(method==='documents'&&!payment.covers)throw Error(`El voucher no cubre el mínimo requerido de S/ ${payment.required.toFixed(2)}.`);
  if(method==='manual'&&separation.documents?.reservation_voucher&&!payment.covers&&!reason)throw Error('El voucher no cubre el mínimo requerido o no pudo verificarse. Indica el motivo de la confirmación manual.');
  to='CONFIRMED';Object.assign(separation,{status:to,confirmed_at:at,confirmed_by:entry.actor,confirmation_method:method,confirmation_note:reason||(method==='documents'?'Documentación obligatoria completa':'Separación realizada'),expires_at:addCalendarDays(at,15)});
  if(!(lead.separations||[]).some(item=>item.id===separation.id))lead.separations=[...(lead.separations||[]),{id:separation.id,at,status:'active',unit_id:unit.id,code:separation.code}];
  if(lead.status!=='Separación'){const before=lead.status;lead.status='Separación';lead.substatus='Documentación completa';lead.stage_history=[...(lead.stage_history||[]),{from:before,to:'Separación',at,actor:entry.actor,observed:false}];lifecycle.event(lead,'separation',entry.actor,{separation_id:separation.id,unit_id:unit.id},at);}
 }else if(action==='release'){
  to='RELEASED';Object.assign(separation,{status:to,released_at:at,released_by:entry.actor,release_reason:reason});
  if(linked)Object.assign(linked,{status:'released',released_at:at,reason});
 }else if(action==='reserve'){
  if(!['CONFIRMED','RESERVED'].includes(currentStatus))throw Error('Confirma primero la separación.');
  const expiresAt=new Date(payload.expires_at);if(Number.isNaN(expiresAt.getTime())||expiresAt.getTime()<=Date.now())throw Error('Indica una nueva fecha futura para mantener la reserva.');
  to='RESERVED';Object.assign(separation,{status:to,expires_at:expiresAt.toISOString(),reserved_at:at,reserved_by:entry.actor,reserve_reason:reason});if(linked)Object.assign(linked,{status:'active',expires_at:separation.expires_at});entry.expires_at=separation.expires_at;
 }else if(action==='sold'){
  if(!['CONFIRMED','RESERVED'].includes(currentStatus))throw Error('Confirma primero la separación.');
  if(!separation.minute?.pdf_path)throw Error('Genera la minuta correspondiente antes de cerrar la venta.');
  const closing=saleDocumentProgress(separation);if(!closing.ready)throw Error('Para cerrar la venta carga la minuta firmada y el voucher de notaría.');
  if(!lead)throw Error('El lead vinculado ya no está disponible.');
  const alreadySold=unit.sold_lead_id||['SOLD','VENDIDO','VENDIDA','VENTA'].includes(String(unit.status||'').toUpperCase());
  if(alreadySold&&unit.sold_lead_id!==separation.lead_id)throw Error('La unidad ya figura vendida a otro lead.');
  to='SOLD';Object.assign(separation,{status:to,sold_at:at,sold_by:entry.actor,sale_reason:reason});separation.minute.status='Documentación completa';separation.minute.completed_at=at;
  if(linked)Object.assign(linked,{status:'sold',sold_at:at});
  Object.assign(unit,{status:'SOLD',sold_lead_id:separation.lead_id,sold_at:unit.sold_at||at,sold_via_separation_id:separation.id,sold_amount:Number(separation.final_price||0)});
  const before=lead.status;Object.assign(lead,{status:'Venta',substatus:'Documentación completa',sold_unit_id:unit.id,sale_amount:Number(separation.final_price||0),sale_confirmed_at:at,next_action:'',next_action_at:null});
  if(before!=='Venta')lead.stage_history=[...(lead.stage_history||[]),{from:before,to:'Venta',at,actor:entry.actor,observed:false}];
  lifecycle.event(lead,'sale',entry.actor,{amount:Number(separation.final_price||0),unit_id:unit.id,separation_id:separation.id},at);
 }else throw Error('Acción de separación no válida.');
 entry.to=to;separation.audit=[...(separation.audit||[]),entry];return separation;
}

function attachDocument(d,id,kind,file,actor='Usuario registrado'){
 if(!ALL_DOCUMENTS.includes(kind))throw Error('Tipo de documento no válido.');
 const separation=(d.separations||[]).find(item=>item.id===id);if(!separation)throw Error('Separación no encontrada.');
 if(!OPEN_STATUSES.has(String(separation.status||'').toUpperCase()))throw Error('La separación está cerrada y no admite documentos nuevos.');
 if(SALE_DOCUMENTS.includes(kind)&&!separation.minute?.pdf_path)throw Error('Genera primero la minuta.');
 if(!file?.drive_file_id||!file?.drive_url||!file?.name)throw Error('No se recibió un archivo válido desde la nube.');
 const at=new Date().toISOString(),entry={name:text(file.name,200),drive_file_id:text(file.drive_file_id,200),drive_url:text(file.drive_url,2048),mime_type:text(file.mime_type,100),size:Number(file.size||0),revision:Number(file.revision||1),uploaded_at:at,uploaded_by:text(actor,200)||'Usuario registrado',...(file.review?{review:file.review}:{})};
 separation.documents={...(separation.documents||{}),[kind]:entry};
 separation.audit=[...(separation.audit||[]),{at,actor:entry.uploaded_by,action:'document_upload',from:separation.status,to:separation.status,reason:kind}];
 const progress=documentProgress(separation),closingProgress=saleDocumentProgress(separation),paymentValidation=voucherPaymentStatus(separation);let autoConfirmed=false,autoConfirmationBlocked=false;
 if(REQUIRED_DOCUMENTS.includes(kind)&&progress.ready&&['DRAFT','ACTIVE'].includes(String(separation.status||'').toUpperCase())){
  if(paymentValidation.covers){updateSeparation(d,id,'confirm',{reason:'Los tres documentos obligatorios fueron cargados y el voucher cubre el monto mínimo.',confirmation_method:'documents'},actor);autoConfirmed=true;}
  else autoConfirmationBlocked=true;
 }
 if(SALE_DOCUMENTS.includes(kind)&&separation.minute){
  separation.minute.status=closingProgress.ready?'Documentación completa':kind==='signed_sale_minutes'?'Voucher notaría pendiente':'Lista firma';
  separation.minute.updated_at=at;const lead=(d.leads||[]).find(item=>item.id===separation.lead_id);if(lead){lead.status='Minuta';lead.substatus=separation.minute.status;}
 }
 return {separation,progress,closingProgress,paymentValidation,autoConfirmed,autoConfirmationBlocked};
}

module.exports={BLOCKING_STATUSES,OPEN_STATUSES,REQUIRED_DOCUMENTS,SALE_DOCUMENTS,ALL_DOCUMENTS,isBlocking,activeForUnit,addCalendarDays,documentProgress,saleDocumentProgress,minimumSeparationAmount,voucherPaymentStatus,fetchSeparationTemplate,updateSeparation,attachDocument,amount,text};
