const HOUR=60*60*1000;

export const OPERATIONAL_SIGNALS={
  Verde:{label:'Verde',color:'#15803d',background:'#dcfce7',border:'#86efac',description:'Al día: próxima acción futura o gestión reciente.'},
  Amarillo:{label:'Amarillo',color:'#a16207',background:'#fef9c3',border:'#fde047',description:'Atender pronto: entre 24 y 48 horas sin gestión.'},
  Rojo:{label:'Rojo',color:'#b91c1c',background:'#fee2e2',border:'#fca5a5',description:'Atención vencida: más de 48 horas sin gestión o próxima acción vencida.'},
  Crítico:{label:'Crítico',color:'#7f1d1d',background:'#ffe4e6',border:'#fb7185',description:'Atención crítica: lead avanzado sin gestión por más de 72 horas.'},
};

const ADVANCED_STAGES=new Set(['Calificado','Cita','Cita Asistida','Separación','Inicial']);
const CLOSED_STAGES=new Set(['Venta','Desestimado']);
const validDate=value=>{const date=new Date(value||'');return Number.isFinite(date.getTime())?date:null;};
const laterDate=(...values)=>values.map(validDate).filter(Boolean).sort((a,b)=>b-a)[0]||null;

export function operationalSignal(lead,now=new Date()){
  if(CLOSED_STAGES.has(lead?.status))return {...OPERATIONAL_SIGNALS.Verde,key:'Verde',hours:0,kind:'cerrado'};
  const received=laterDate(lead?.received_at,lead?.imported_at,lead?.created_at,lead?.tracking_started_at);
  const activity=laterDate(lead?.last_activity_at,lead?.comment_history?.at(-1)?.at,lead?.events?.at(-1)?.at,received);
  const due=validDate(lead?.next_action_at);
  const hours=activity?Math.max(0,(now-activity)/HOUR):Infinity;
  const overdue=due&&due<now;
  const pendingFirst=lead?.status==='Lead Inicial'&&!lead?.last_activity_at&&!lead?.events?.length;
  let key='Verde';
  if(ADVANCED_STAGES.has(lead?.status)&&hours>72)key='Crítico';
  else if(overdue||hours>48)key='Rojo';
  else if(hours>=24)key='Amarillo';
  else if(due&&due>now)key='Verde';
  return {...OPERATIONAL_SIGNALS[key],key,hours,kind:pendingFirst?'primera atención':(overdue?'próxima acción vencida':'seguimiento')};
}

export function operationalQueue(leads,now=new Date()){
  const order={Crítico:0,Rojo:1,Amarillo:2,Verde:3};
  return (leads||[]).map(lead=>({lead,signal:operationalSignal(lead,now)})).sort((a,b)=>order[a.signal.key]-order[b.signal.key]||b.signal.hours-a.signal.hours);
}
