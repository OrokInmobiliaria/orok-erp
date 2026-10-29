const {randomUUID}=require('crypto');
const now=()=>new Date().toISOString();
const FOLLOW_UP_SUBSTATUSES=['No contesta','Seguimiento futuro','Cita no concretada','No-show','Post-visita','Cotización','Objeciones','Evaluación financiera','Consulta con decisor','Negociación','Esperando banco','Esperando fondos'];
const STAGE_EVENTS={'Contactado':'contacted','MQL':'mql','Cita Asistida':'attended','Calificado':'financial','Evaluación GNB':'finance_review','Separación':'separation','Minuta':'minute','Inicial':'initial','Venta':'sale'};
function iso(value){
 if(!value)return null;let s=String(value).trim();
 if(/^\d{2}\/\d{2}\/\d{4}$/.test(s)){const [d,m,y]=s.split('/');s=`${y}-${m}-${d}`;}
 if(/^\d{4}-\d{2}-\d{2}$/.test(s))s+='T00:00:00-05:00';
 if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s))s+=':00-05:00';
 const calendar=s.match(/^(\d{4})-(\d{2})-(\d{2})/);if(calendar){const [,y,m,d]=calendar,t=new Date(Date.UTC(+y,+m-1,+d));if(t.getUTCFullYear()!==+y||t.getUTCMonth()!==+m-1||t.getUTCDate()!==+d)return null;}
 const date=new Date(s);return Number.isFinite(date.getTime())?date.toISOString():null;
}
function event(lead,type,actor,details={},at=now()){
 const entry={id:randomUUID(),type,at,actor:actor||'Sin asignar',owner:lead.sales_owner||actor||'Sin asignar',project:lead.project||'',source:lead.source||'',campaign:lead.campaign_name||'',...details};
 lead.events=[...(lead.events||[]),entry];lead.tracking_started_at ||= at;
 if(!lead.milestones)lead.milestones={};
 if(!lead.milestones[type])lead.milestones[type]=at;
 lead.last_activity_at=lead.last_activity_at&&lead.last_activity_at>at?lead.last_activity_at:at;return entry;
}
function transition(lead,before,actor,{observed=false}={}){
 if(lead.status===before)return;
 const at=now();lead.stage_history=[...(lead.stage_history||[]),{from:before,to:lead.status,at,actor,observed}];
 if(observed){lead.history_complete=false;return;}
 const type=STAGE_EVENTS[lead.status];
 // Attendance comes only from a resolved appointment, never from guessing a stage.
 if(type&&type!=='attended'&&!(type==='sale'&&lead.milestones?.sale)&&!(type==='separation'&&(lead.separations||[]).some(s=>s.status==='active')))event(lead,type,actor,lead.status==='Venta'?{amount:Number(lead.sale_amount),unit_id:lead.sold_unit_id}:{});
 if(lead.status==='Separación'&&!(lead.separations||[]).some(s=>s.status==='active'))lead.separations=[...(lead.separations||[]),{id:randomUUID(),at,status:'active'}];
}
function setFollowUp(lead,actor,{substatus,next_action,next_action_at,reason}={}){
 const value=String(substatus||'').trim(),cleanReason=String(reason||'').trim(),next=String(next_action||'').trim(),date=iso(next_action_at);
 if(!FOLLOW_UP_SUBSTATUSES.includes(value))throw Error('Selecciona un subestado válido de Seguimiento.');
 if(!cleanReason)throw Error('Indica el motivo para enviar el lead a Seguimiento.');
 if(!next||!date)throw Error('Indica una próxima acción y su fecha programada.');
 lead.status='Seguimiento';lead.substatus=value;lead.next_action=next;lead.next_action_at=date;
 event(lead,'follow_up',actor,{substatus:value,reason:cleanReason,next_action:next,next_action_at:date});
}
function applyAction(lead,action,actor){
 const at=now(),p=action.payload||{};
 switch(action.type){
 case 'profile':{
   if(p.email!==undefined&&String(p.email).trim()&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(p.email).trim()))throw Error('Correo no válido.');
   if(p.phone!==undefined&&String(p.phone).trim()&&String(p.phone).replace(/\D/g,'').length<7)throw Error('Teléfono no válido.');
   const changed=[];
   for(const key of ['name','phone','email','address','source','project','sales_owner','purchase_horizon','unit_interest','next_action']){
    if(p[key]===undefined)continue;const value=String(p[key]).trim();
    if(value!==String(lead[key]||'')){lead[key]=value;changed.push(key);}
   }
   if(p.dni!==undefined){const dni=String(p.dni||'').trim();if(dni&&!/^\d{8}$/.test(dni))throw Error('El DNI debe tener 8 dígitos.');if(dni!==String(lead.dni||'')){lead.dni=dni;changed.push('dni');}}
   if(p.budget!==undefined){if(!Number.isFinite(Number(p.budget))||Number(p.budget)<0)throw Error('Presupuesto no válido.');if(Number(lead.budget)!==Number(p.budget)){lead.budget=Number(p.budget);changed.push('budget');}}
   if(p.received_at){const date=iso(p.received_at);if(!date||date>at)throw Error('Fecha de ingreso no válida.');if(lead.received_at&&lead.received_at!==date)throw Error('La fecha de ingreso ya está registrada.');lead.received_at=date;lead.received_date_source='Declarada por usuario';changed.push('received_at');}
   if(p.next_action_at!==undefined){const date=p.next_action_at?iso(p.next_action_at):null;if(p.next_action_at&&!date)throw Error('Fecha de próxima acción no válida.');if(date!==lead.next_action_at){lead.next_action_at=date;changed.push('next_action_at');}}
   event(lead,'profile',actor,{fields:changed,...(p.next_action_at!==undefined?{next_action_at:lead.next_action_at}:{})});break;
 }
 case 'attempt':lead.contact_attempts=(Number(lead.contact_attempts)||0)+1;event(lead,'attempt',actor);break;
 case 'contact':event(lead,'contacted',actor);if(['Lead Inicial','No contesta'].includes(lead.status))lead.status='Contactado';break;
 case 'mql':
   if(!(Number(lead.budget)>0)||!lead.purchase_horizon||!lead.unit_interest)throw Error('Completa presupuesto, tipo de departamento y horizonte de compra antes de marcar MQL.');
   event(lead,'mql',actor);lead.status='MQL';break;
 case 'accept':
   if(!lead.milestones?.mql)throw Error('Primero registra la calificación MQL.');
   if(!lead.sales_owner)throw Error('Asigna el responsable comercial.');
   if(lead.sql_status==='accepted')throw Error('Ventas ya aceptó este prospecto.');
   lead.sql_status='accepted';event(lead,'sql',actor);break;
 case 'reject':
   if(!p.reason?.trim())throw Error('Indica el motivo de rechazo.');lead.sql_status='rejected';event(lead,'sql_rejected',actor,{reason:p.reason});break;
 case 'schedule':{
   const date=iso(p.scheduled_at);if(!date||date<at)throw Error('Agenda una fecha y hora futura.');
   const pending=(lead.appointments||[]).find(a=>a.status==='scheduled');
   if(pending){pending.status='rescheduled';pending.resolved_at=at;event(lead,'rescheduled',actor,{appointment_id:pending.id});}
   const a={id:randomUUID(),scheduled_at:date,created_at:at,status:'scheduled',owner:lead.sales_owner||actor,replaces_id:pending?.id||null};
   lead.appointments=[...(lead.appointments||[]),a];event(lead,'scheduled',actor,{appointment_id:a.id});lead.status='Cita';const local=new Date(new Date(date).getTime()-5*3600000).toISOString();lead.appointment={date:local.slice(0,10),time:local.slice(11,16)};break;
 }
 case 'appointment':{
   const a=(lead.appointments||[]).find(a=>a.id===p.id);
   if(!a||a.status!=='scheduled')throw Error('La cita ya fue resuelta o no existe.');
   if(!['attended','no_show','cancelled'].includes(p.status))throw Error('Resultado de cita no válido.');
   if(p.status!=='cancelled'&&a.scheduled_at>at)throw Error('La cita aún es futura.');
   a.status=p.status;a.resolved_at=at;
   if(p.status==='attended'){a.attended_at=a.scheduled_at;lead.status='Cita Asistida';}
   event(lead,p.status,actor,{appointment_id:a.id},p.status==='attended'?a.scheduled_at:at);break;
 }
 case 'follow_up':setFollowUp(lead,actor,p);break;
 case 'lost':{
   const reason=String(p.reason||'').trim();
   if(!reason)throw Error('Indica el motivo para desestimar el lead.');
   lead.status='Desestimado';lead.substatus='Desestimado';lead.loss_reason=reason.slice(0,500);lead.lost_at=at;
   lead.next_action='';lead.next_action_at=null;
   event(lead,'lost',actor,{reason:lead.loss_reason});break;
 }
 case 'financial':
   if(!['Precalificado','Condicionado','Aprobado','Crédito directo viable','Rechazado'].includes(p.status))throw Error('Selecciona el resultado financiero.');
   lead.finance_status=p.status;event(lead,'finance_review',actor,{result:p.status});
   if(['Aprobado','Crédito directo viable'].includes(p.status)){lead.status='Calificado';event(lead,'financial',actor);}break;
 case 'cancel_separation':{
   const s=(lead.separations||[]).find(s=>s.status==='active');if(!s)throw Error('No hay una separación activa registrada.');
   if(!['Financiero','Precio','Ubicación','Competencia','Decisión personal','Otro'].includes(p.reason))throw Error('Selecciona el motivo de cancelación.');
   s.status='cancelled';s.cancelled_at=at;s.reason=p.reason;lead.loss_reason=p.reason;lead.status='Desestimado';event(lead,'separation_cancelled',actor,{separation_id:s.id,reason:p.reason});break;
 }
 default:throw Error('Acción no válida.');
 }
 return lead;
}
module.exports={iso,event,transition,applyAction};
