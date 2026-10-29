'use strict';

const lifecycle=require('./lifecycle');

const REQUIRED_FIELDS=[
 ['name','Nombre'],['dni','DNI'],['marital_status','Estado civil'],
 ['gross_income','Ingreso bruto mensual'],['employment_tenure','Antigüedad laboral'],
 ['first_home','Primera vivienda'],['initial_payment','Cuota inicial'],
 ['email','Correo electrónico'],['phone','Número de teléfono'],['unit_price','Costo del departamento'],
];
const STATUSES=['Datos pendientes','Pendiente confirmación','Ficha completa','Lista para enviar','Enviada a GNB','Observada','Aprobada','No aprobada','Desistimiento'];
const BANK_TYPES=new Set(['Hipotecario','Bancario','Banco GNB','GNB']);
const DIRECT_TYPES=new Set(['Directo','Contado']);
const text=(value,max=500)=>String(value??'').trim().slice(0,max);
const number=value=>{const n=Number(value);return Number.isFinite(n)&&n>=0?Math.round(n*100)/100:null;};
const boolean=value=>value===true||value==='true'||value==='Sí'||value==='Si'?true:value===false||value==='false'||value==='No'?false:null;
const isBankFinancing=value=>BANK_TYPES.has(text(value,50));
const isDirectFinancing=value=>DIRECT_TYPES.has(text(value,50));

function primaryFrom(lead={},input={}){
 const prior=lead.bank_evaluation?.applicants?.find(item=>item.role==='Titular')||{};
 return {
  id:text(input.id||prior.id||'titular',100),role:'Titular',
  name:text(input.name??prior.name??lead.name,200),dni:text(input.dni??prior.dni??lead.dni,20).replace(/\D/g,'').slice(0,8),
  marital_status:text(input.marital_status??prior.marital_status??lead.marital_status,80),
  gross_income:number(input.gross_income??prior.gross_income??lead.gross_income),
  employment_tenure:text(input.employment_tenure??prior.employment_tenure??lead.employment_tenure,100),
  first_home:boolean(input.first_home??prior.first_home??lead.first_home),
  email:text(input.email??prior.email??lead.email,250).toLowerCase(),phone:text(input.phone??prior.phone??lead.phone,40),
 };
}

function normalizeApplicant(input={},index=0){
 return {id:text(input.id||('coevaluado-'+(index+1)),100),role:index===0?'Titular':text(input.role||'Coevaluado',50),name:text(input.name,200),dni:text(input.dni,20).replace(/\D/g,'').slice(0,8),marital_status:text(input.marital_status,80),gross_income:number(input.gross_income),employment_tenure:text(input.employment_tenure,100),first_home:boolean(input.first_home),email:text(input.email,250).toLowerCase(),phone:text(input.phone,40)};
}

function missingFields(evaluation={}){
 const primary=(evaluation.applicants||[]).find(item=>item.role==='Titular')||evaluation.applicants?.[0]||{};
 const values={...primary,initial_payment:evaluation.initial_payment,unit_price:evaluation.unit_price};
 return REQUIRED_FIELDS.filter(([key])=>{
  const value=values[key];
  if(['gross_income','initial_payment','unit_price'].includes(key))return !(Number(value)>0);
  if(key==='first_home')return typeof value!=='boolean';
  if(key==='dni')return !/^\d{8}$/.test(String(value||''));
  if(key==='email')return !/^\S+@\S+\.\S+$/.test(String(value||''));
  return !text(value);
 }).map(([key,label])=>({key,label}));
}

function progress(evaluation={}){const missing=missingFields(evaluation);return {complete:REQUIRED_FIELDS.length-missing.length,total:REQUIRED_FIELDS.length,ready:missing.length===0,missing};}

function deriveStatus(evaluation={}){
 const current=text(evaluation.status,80);
 if(['Enviada a GNB','Observada','Aprobada','No aprobada','Desistimiento'].includes(current))return current;
 const state=progress(evaluation);if(!state.ready)return 'Datos pendientes';
 return evaluation.confirmed_at?'Ficha completa':'Pendiente confirmación';
}

function changeStage(lead,to,actor,at,extra={}){
 if(lead.status===to)return;
 const from=lead.status;lead.status=to;lead.stage_history=[...(lead.stage_history||[]),{from,to,at,actor,observed:false,...extra}];
 lifecycle.event(lead,to==='Evaluación GNB'?'finance_review':'financial',actor,{from,...extra},at);
}

function saveEvaluation(d,leadId,input={},actor='Usuario registrado'){
 const lead=(d.leads||[]).find(item=>item.id===leadId);if(!lead)throw Error('Lead no encontrado.');
 if(['Venta','Perdido','Desestimado'].includes(lead.status))throw Error('El lead está cerrado y no admite una evaluación nueva.');
 const at=new Date().toISOString(),financingType=text(input.financing_type??lead.bank_evaluation?.financing_type??lead.last_quote?.financing_type,50)||'Hipotecario';
 const supplied=Array.isArray(input.applicants)?input.applicants:[];
 const primary=primaryFrom(lead,supplied[0]||input);
 const applicants=[primary,...supplied.slice(1).map((item,index)=>normalizeApplicant(item,index+1))].filter(item=>item.name||item.role==='Titular');
 const previous=lead.bank_evaluation||{};
 const evaluation={...previous,financing_type:financingType,applicants,initial_payment:number(input.initial_payment??previous.initial_payment??lead.initial_payment),unit_price:number(input.unit_price??previous.unit_price??lead.last_quote?.final_price??lead.budget),unit_id:text(input.unit_id??previous.unit_id??lead.last_quote?.unit_id,100),unit_number:text(input.unit_number??previous.unit_number??lead.last_quote?.unit_number,50),quote_id:text(input.quote_id??previous.quote_id??lead.last_quote?.id,100),updated_at:at,updated_by:text(actor,200),revision:Number(previous.revision||0)+1,audit:[...(previous.audit||[]),{at,actor:text(actor,200),action:'save',note:text(input.note,500)}]};
 if(isDirectFinancing(financingType)){
  evaluation.status='No aplica · compra '+financingType.toLowerCase();evaluation.skipped_at=at;evaluation.skipped_by=text(actor,200);
  lead.purchase_method=financingType;lead.bank_evaluation=evaluation;lead.substatus='Financiamiento '+financingType;
  if(lead.status==='Evaluación GNB')changeStage(lead,'Calificado',actor,at,{reason:'La modalidad no requiere evaluación bancaria.'});
  return evaluation;
 }
 if(!isBankFinancing(financingType))throw Error('Selecciona Hipotecario, Directo o Contado.');
 evaluation.status=deriveStatus(evaluation);lead.purchase_method='Hipotecario';lead.bank_evaluation=evaluation;lead.substatus=evaluation.status;
 changeStage(lead,'Evaluación GNB',actor,at,{gnb_status:evaluation.status});
 return evaluation;
}

function transitionEvaluation(d,leadId,status,input={},actor='Usuario registrado'){
 if(!STATUSES.includes(status))throw Error('Estado de evaluación GNB no válido.');
 const lead=(d.leads||[]).find(item=>item.id===leadId);if(!lead?.bank_evaluation||!isBankFinancing(lead.bank_evaluation.financing_type))throw Error('Registra primero la ficha de evaluación bancaria.');
 const evaluation=lead.bank_evaluation,state=progress(evaluation),at=new Date().toISOString(),reason=text(input.reason,1000);
 if(['Ficha completa','Lista para enviar','Enviada a GNB','Aprobada'].includes(status)&&!state.ready)throw Error('Faltan datos para completar la evaluación: '+state.missing.map(item=>item.label).join(', ')+'.');
 if(['Observada','No aprobada','Desistimiento'].includes(status)&&!reason)throw Error('Indica el motivo para conservar la trazabilidad.');
 if(status==='Aprobada'&&!evaluation.sent_at)throw Error('Registra primero el envío de la evaluación a GNB.');
 if(status==='Enviada a GNB')Object.assign(evaluation,{sent_at:at,sent_by:text(actor,200),sent_reference:text(input.reference,250)});
 if(['Aprobada','No aprobada'].includes(status))Object.assign(evaluation,{result_at:at,result_by:text(actor,200),result_reference:text(input.reference,250)});
 if(status==='Ficha completa')Object.assign(evaluation,{confirmed_at:at,confirmed_by:text(actor,200)});
 evaluation.status=status;evaluation.updated_at=at;evaluation.updated_by=text(actor,200);evaluation.revision=Number(evaluation.revision||0)+1;evaluation.audit=[...(evaluation.audit||[]),{at,actor:text(actor,200),action:'transition',from:lead.substatus||'',to:status,reason,reference:text(input.reference,250)}];
 lead.substatus=status;
 if(status==='Aprobada')changeStage(lead,'Calificado',actor,at,{gnb_status:status});
 else if(['No aprobada','Desistimiento'].includes(status)){lead.next_action='';lead.next_action_at=null;}
 else changeStage(lead,'Evaluación GNB',actor,at,{gnb_status:status});
 lifecycle.event(lead,'finance_review',actor,{status,reason,reference:text(input.reference,250)},at);
 return evaluation;
}

function conversationGuidance(lead={}){
 const evaluation=lead.bank_evaluation||{financing_type:'Hipotecario',applicants:[primaryFrom(lead)]};const state=progress(evaluation);
 return {purpose:'Evaluación crediticia del Banco GNB previa a la separación',known:REQUIRED_FIELDS.filter(([key])=>!state.missing.some(item=>item.key===key)).map(([,label])=>label),missing:state.missing,assistant_rule:'Reutiliza los datos ya confirmados; solicita únicamente los faltantes y explica que se requieren para pasar a la evaluación del Banco GNB. Nunca inventes el precio del departamento ni afirmes que el banco aprobó al cliente.'};
}

module.exports={REQUIRED_FIELDS,STATUSES,isBankFinancing,isDirectFinancing,missingFields,progress,deriveStatus,saveEvaluation,transitionEvaluation,conversationGuidance};
