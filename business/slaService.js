const DAY_KEYS=['sun','mon','tue','wed','thu','fri','sat'];
const DEFAULT_POLICY={firstResponseMinutes:10,warningMinutes:5,criticalMinutes:60,requiredCadenceAttempts:7};
const MIN_RELIABLE_TIMESTAMP=Date.UTC(2000,0,1);

function validDate(value){
 if(value===0||(typeof value==='string'&&/^\d+$/.test(value.trim())))return null;
 const date=new Date(value);
 return Number.isFinite(date.getTime())&&date.getTime()>=MIN_RELIABLE_TIMESTAMP?date:null;
}

function validTime(value){return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value||''));}
function minutes(value){const [hours,mins]=String(value).split(':').map(Number);return hours*60+mins;}
function limaParts(value){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value));
 const read=type=>parts.find(part=>part.type===type)?.value;
 const weekday={Sun:'sun',Mon:'mon',Tue:'tue',Wed:'wed',Thu:'thu',Fri:'fri',Sat:'sat'}[read('weekday')];
 return {year:Number(read('year')),month:Number(read('month')),day:Number(read('day')),minute:minutes(`${read('hour')}:${read('minute')}`),weekday};
}
function atLima({year,month,day},minute){return new Date(Date.UTC(year,month-1,day,Math.floor(minute/60)+5,minute%60));}
function tomorrow({year,month,day}){const next=new Date(Date.UTC(year,month-1,day+1));return {year:next.getUTCFullYear(),month:next.getUTCMonth()+1,day:next.getUTCDate()};}
function windowsFor(date,schedule){
 const weekday=DAY_KEYS[new Date(Date.UTC(date.year,date.month-1,date.day)).getUTCDay()];
 return (schedule?.[weekday]||[]).filter(window=>validTime(window.start)&&validTime(window.end)&&minutes(window.start)<minutes(window.end)).map(window=>({start:minutes(window.start),end:minutes(window.end)})).sort((a,b)=>a.start-b.start);
}
function nextWorkingInstant(value,schedule){
 const local=limaParts(value);let date={year:local.year,month:local.month,day:local.day};let from=local.minute;
 for(let dayOffset=0;dayOffset<8;dayOffset++){
  for(const window of windowsFor(date,schedule)){
   if(from<window.end)return atLima(date,Math.max(from,window.start));
  }
  date=tomorrow(date);from=0;
 }
 return null;
}
function addOperationalMinutes(value,amount,schedule){
 let cursor=nextWorkingInstant(value,schedule);if(!cursor)return null;let remaining=Number(amount);
 while(remaining>0){
  const local=limaParts(cursor),date={year:local.year,month:local.month,day:local.day};
  const currentWindow=windowsFor(date,schedule).find(window=>local.minute>=window.start&&local.minute<window.end);
  if(!currentWindow){cursor=nextWorkingInstant(cursor,schedule);continue;}
  const available=currentWindow.end-local.minute;
  if(remaining<=available)return new Date(cursor.getTime()+remaining*60000);
  remaining-=available;cursor=nextWorkingInstant(new Date(cursor.getTime()+available*60000),schedule);
  if(!cursor)return null;
 }
 return cursor;
}
function operationalMinutesBetween(from,to,schedule){
 if(new Date(to)<=new Date(from))return 0;let cursor=nextWorkingInstant(from,schedule),total=0,target=new Date(to);
 while(cursor&&cursor<target){
  const local=limaParts(cursor),date={year:local.year,month:local.month,day:local.day};
  const window=windowsFor(date,schedule).find(item=>local.minute>=item.start&&local.minute<item.end);
  if(!window){cursor=nextWorkingInstant(cursor,schedule);continue;}
  const until=atLima(date,window.end),segmentEnd=until<target?until:target;
  total+=(segmentEnd-cursor)/60000;cursor=segmentEnd<target?nextWorkingInstant(segmentEnd,schedule):null;
 }
 return total;
}
function latestBotResult(lead){return (lead.events||[]).filter(event=>event.type==='bot').sort((a,b)=>String(b.at).localeCompare(String(a.at)))[0]?.result||null;}
function evaluateLeadSla(lead,{schedule,policy={}}={},at=new Date()){
 const rules={...DEFAULT_POLICY,...policy},now=validDate(at)||new Date(),bot=latestBotResult(lead),hasHumanContact=(lead.events||[]).some(event=>event.type==='contacted');
 const isInitialStage=lead.status==='Lead Inicial';
 const received=validDate(lead.received_at)||validDate(lead.created_at);const firstDue=isInitialStage&&received?addOperationalMinutes(received,rules.firstResponseMinutes,schedule):null;
 const attempts=(lead.events||[]).filter(event=>event.type==='attempt').length;
 const needsHuman=['handoff','error','no_response'].includes(bot)||!bot;
 const nextActionAt=validDate(lead.next_action_at);
 const nextDue=nextActionAt?nextWorkingInstant(nextActionAt,schedule):null;
 const scheduled=(lead.appointments||[]).filter(item=>item?.status==='scheduled').map(item=>validDate(item.scheduled_at)).filter(Boolean).sort((a,b)=>a-b)[0]||null;
 let reason='',severity='Verde',reference=null;
 if(isInitialStage&&!received){severity='Amarillo';reason='Fecha de ingreso no verificable; revisa el registro antes de calcular el plazo.';}
 else if(scheduled&&scheduled>now){reference=nextDue&&nextDue<scheduled?nextDue:scheduled;reason=reference===scheduled?'Cita agendada; mantener seguimiento hasta la cita.':'Confirmación de cita programada.';}
 else if(scheduled&&scheduled<=now){reference=scheduled;reason='Cita pendiente de confirmar, asistir, reprogramar o marcar no-show.';}
 else if(isInitialStage&&!hasHumanContact&&bot==='resolved'){reason='Atendido por bot con resultado verificable.';}
 else if(isInitialStage&&!hasHumanContact&&needsHuman){reference=firstDue;reason=bot==='handoff'?'Bot derivó atención a un humano.':bot==='error'||bot==='no_response'?'Bot sin atención verificable.':'Primera atención pendiente.';}
 else if(nextDue){reference=nextDue;reason='Próxima acción programada.';}
 else if(lead.status==='Seguimiento'){severity='Amarillo';reason='Seguimiento sin próxima acción programada.';}
 if(reference){
  const remaining=(reference-now)/60000;
  if(remaining<0){const overdue=operationalMinutesBetween(reference,now,schedule);severity=overdue>=rules.criticalMinutes?'Crítico':'Rojo';reason+=' Plazo vencido.';}
  else if(remaining<=rules.warningMinutes)severity='Amarillo';
 }
 const autoMove=isInitialStage&&!hasHumanContact&&attempts>=rules.requiredCadenceAttempts?{status:'Seguimiento',substatus:'No contesta',reason:'Cadencia registrada sin contacto efectivo.'}:null;
 return {severity,reason,first_due_at:firstDue?.toISOString()||null,next_due_at:nextDue?.toISOString()||null,attempts,bot_result:bot,auto_move:autoMove};
}
module.exports={nextWorkingInstant,addOperationalMinutes,operationalMinutesBetween,evaluateLeadSla,validDate};
