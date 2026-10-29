const {phoneKey}=require('./leadImport');
const {iso}=require('./lifecycle');
const {weeksInMonth,endDay}=require('./calendarService');
const TOUCH=new Set(['received','attempt','contacted','mql','sql','scheduled','attended','finance_review','financial','separation','initial','sale','separation_cancelled']);
const day=value=>new Date(value).toLocaleDateString('en-CA',{timeZone:'America/Lima'});
const month=value=>day(value).slice(0,7);
const nextMonth=m=>{const [y,n]=m.split('-').map(Number);return `${n===12?y+1:y}-${String(n===12?1:n+1).padStart(2,'0')}`;};
const endMonth=m=>new Date(new Date(nextMonth(m)+'-01T00:00:00-05:00').getTime()-1).toISOString();
function monthsBetween(from,to){const rows=[];for(let m=from.slice(0,7);m<=to.slice(0,7)&&rows.length<240;m=nextMonth(m))rows.push(m);return rows;}
// A person is grouped by a shared phone/email, including transitive matches.
// Equal names with different contacts remain separate people.
function contacts(leads){
 const parent=leads.map((_,i)=>i),keys=new Map();const root=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
 leads.forEach((l,i)=>{const tokens=[phoneKey(l.phone)?'p:'+phoneKey(l.phone):'',l.email?'e:'+String(l.email).trim().toLowerCase():''].filter(Boolean);if(!tokens.length)tokens.push('id:'+l.id);for(const k of tokens){if(keys.has(k))parent[root(i)]=root(keys.get(k));else keys.set(k,i);}});
 const groups=new Map();leads.forEach((l,i)=>{const k=root(i);groups.set(k,[...(groups.get(k)||[]),l]);});return [...groups.values()];
}
function buildInsights(d,filters={},from,to,now=new Date().toISOString()){
 const project=d.settings?.projectName||'Proyecto principal',activeIds=new Set((d.leads||[]).map(l=>l.id));
 const all=[...(d.leads||[]),...(d.archived_leads||[]).filter(l=>!activeIds.has(l.id))].map(l=>({...l,project:l.project||project,source:l.source||'Sin fuente',campaign_name:l.campaign_name||'Sin campaña',sales_owner:l.sales_owner||'Sin asignar'}));
 const match=l=>(!filters.project||l.project===filters.project)&&(!filters.source||l.source===filters.source)&&(!filters.campaign||l.campaign_name===filters.campaign)&&(!filters.owner||l.sales_owner===filters.owner);
 const scoped=all.filter(match),months=monthsBetween(from,to),within=l=>iso(l.received_at)&&day(l.received_at)>=from&&day(l.received_at)<=to;
 const selected=scoped.filter(within),has=(l,type)=>(l.events||[]).some(e=>e.type===type),sources=[...new Set(selected.map(l=>l.source))].sort();
 const summarize=rows=>({count:rows.length,stages:Object.fromEntries([...new Set(rows.map(l=>l.status))].map(s=>[s,rows.filter(l=>l.status===s).length])),ids:rows.map(l=>l.id)});
 const monthly=months.map(m=>({month:m,sources:sources.map(source=>({source,...summarize(selected.filter(l=>month(l.received_at)===m&&l.source===source))})),cumulative:sources.map(source=>({source,...summarize(selected.filter(l=>month(l.received_at)<=m&&l.source===source))}))}));
 const networks=sources.map(source=>{const rows=selected.filter(l=>l.source===source),sales=rows.filter(l=>has(l,'sale')).length;return {source,...summarize(rows),mql:rows.filter(l=>has(l,'mql')).length,visits:rows.filter(l=>has(l,'attended')).length,sales,conversion:rows.length&&rows.every(l=>l.history_complete)?sales/rows.length*100:null};});
 const analysisMonth=filters.analysisMonth||to.slice(0,7),weeks=weeksInMonth(analysisMonth),weeklyBacklog=weeks.map(w=>({...w,contacts:[],cutoff:endDay(w.to)<now?endDay(w.to):now,future:w.from>day(now)}));
 const overdueDays=3,cohorts=[],unknown=[];
 for(const group of contacts(scoped)){
  const active=group.filter(l=>activeIds.has(l.id)&&!l.sold_unit_id&&!['Venta','Desestimado'].includes(l.status));
  const rep=(active.length?active:group.filter(l=>activeIds.has(l.id))).sort((a,b)=>String(b.last_activity_at||'').localeCompare(String(a.last_activity_at||'')))[0]||group[0];
  const events=group.flatMap(l=>(l.events||[]).map(e=>({...e,at:iso(e.at)}))).filter(e=>e.at&&e.at<=now).sort((a,b)=>a.at.localeCompare(b.at));
  const starts=group.map(l=>iso(l.followup_tracking_started_at||l.tracking_started_at)||(l.history_complete?iso(l.received_at):null)).filter(Boolean);
  if(!starts.length){if(active.length)unknown.push(rep.id);continue;}
  const start=starts.sort()[0];if(start>now)continue;
  const touches=[start,...events.filter(e=>TOUCH.has(e.type)&&e.at>=start).map(e=>e.at)].sort();
  const terminal=group.flatMap(l=>[...(l.events||[]).filter(e=>['sale','separation_cancelled'].includes(e.type)).map(e=>iso(e.at)),...(l.stage_history||[]).filter(e=>!e.observed&&['Venta','Desestimado'].includes(e.to)).map(e=>iso(e.at))]).filter(Boolean).sort().at(-1);
  // Closed legacy leads have no defensible inactivity interval.
  if(!active.length&&!terminal)continue;
  function pendingAt(cutoff){
   if(cutoff<start||(!active.length&&terminal&&terminal<=cutoff))return false;
   const last=touches.filter(t=>t<=cutoff).at(-1)||start;
   let due=new Date(new Date(last).getTime()+overdueDays*86400000).toISOString();
   const plan=events.filter(e=>e.type==='profile'&&e.at>=last&&e.at<=cutoff&&e.next_action_at!==undefined).at(-1);
   if(plan?.next_action_at&&iso(plan.next_action_at))due=iso(plan.next_action_at);
   const appointments=group.flatMap(l=>l.appointments||[]).filter(a=>a.created_at&&iso(a.created_at)<=cutoff&&(!a.resolved_at||iso(a.resolved_at)>cutoff)&&iso(a.scheduled_at));
   if(appointments.length)due=appointments.map(a=>iso(a.scheduled_at)).sort()[0];
   return due<=cutoff;
  }
  let origin,originDate;
  for(const m of monthsBetween(month(start)+'-01',day(now))){for(const w of weeksInMonth(m)){if(w.from>day(now))break;const cutoff=endDay(w.to)<now?endDay(w.to):now;if(pendingAt(cutoff)){origin=m;originDate=day(cutoff);break;}}if(origin)break;}
  if(!origin)continue;
  const kind=!active.length?(group.some(l=>l.status==='Venta'||l.sold_unit_id)?'closed':'discarded'):pendingAt(now)?'pending':'recovered';
  const contact={id:rep.id,name:rep.name,phone:rep.phone||'',email:rep.email||'',source:rep.source,stage:rep.status,owner:rep.sales_owner,next:rep.next_action||'Sin próxima acción',origin,originDate,kind,canOpen:activeIds.has(rep.id),duplicates:group.length-1};
  cohorts.push(contact);
  for(const w of weeklyBacklog){if(w.future||originDate>day(w.cutoff))continue;let weeklyKind=pendingAt(w.cutoff)?'pending':'recovered';if(!active.length&&terminal&&terminal<=w.cutoff)weeklyKind=kind;w.contacts.push({...contact,kind:weeklyKind,carried:origin<analysisMonth});}
 }
 const buckets=[];const before=cohorts.filter(c=>c.origin<from.slice(0,7));if(before.length)buckets.push({month:'Anteriores',contacts:before});
 for(const m of months)buckets.push({month:m,contacts:cohorts.filter(c=>c.origin===m)});
 const counts=rows=>Object.fromEntries(['pending','recovered','closed','discarded'].map(k=>[k,rows.filter(c=>c.kind===k).length]));
 const backlogMonthly=months.map(m=>{const rows=cohorts.filter(c=>c.origin<=m);return {month:m,contacts:rows,counts:counts(rows)};});
 const sourceWeeks=weeks.map(w=>({...w,future:w.from>day(now),sources:sources.map(source=>({source,...summarize(selected.filter(l=>day(l.received_at)>=w.from&&day(l.received_at)<=w.to&&l.source===source))}))}));
 return {weekly:{month:analysisMonth,weeks:sourceWeeks,backlog:weeklyBacklog.map(w=>({...w,counts:counts(w.contacts)})),priorSources:sources.map(source=>({source,...summarize(selected.filter(l=>month(l.received_at)<analysisMonth&&l.source===source))}))},backlogMonthly,unknownDateRows:scoped.filter(l=>!iso(l.received_at)).map(l=>({id:l.id,name:l.name,phone:l.phone,email:l.email,stage:l.status,owner:l.sales_owner,canOpen:activeIds.has(l.id)})),monthly,networks,sources,leadRows:scoped.map(l=>({id:l.id,name:l.name,phone:l.phone,email:l.email,stage:l.status,owner:l.sales_owner,canOpen:activeIds.has(l.id)})),unknownReceived:scoped.filter(l=>!iso(l.received_at)).length,backlog:{days:overdueDays,asOf:day(now),unknown:unknown.length,buckets:buckets.map(b=>({...b,counts:Object.fromEntries(['pending','recovered','closed','discarded'].map(k=>[k,b.contacts.filter(c=>c.kind===k).length]))})),unique:cohorts.length}};
}
module.exports={buildInsights,contacts,monthsBetween,endMonth};
