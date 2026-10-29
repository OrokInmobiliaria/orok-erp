const {iso}=require('./lifecycle');
const day=value=>new Date(value).toLocaleDateString('en-CA',{timeZone:'America/Lima'});
const endDay=date=>new Date(new Date(date+'T00:00:00-05:00').getTime()+86400000-1).toISOString();
function weeksInMonth(month){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||!iso(month+'-01'))throw Error('Mes de análisis no válido.');
 const [year,m]=month.split('-').map(Number),days=new Date(Date.UTC(year,m,0)).getUTCDate(),weeks=[];
 for(let first=1;first<=days;){const weekday=new Date(Date.UTC(year,m-1,first)).getUTCDay(),last=Math.min(days,first+(7-weekday)%7);const date=n=>month+'-'+String(n).padStart(2,'0');weeks.push({index:weeks.length+1,from:date(first),to:date(last),label:'Semana '+(weeks.length+1)+' · '+String(first).padStart(2,'0')+'–'+String(last).padStart(2,'0')});first=last+1;}
 return weeks;
}
module.exports={weeksInMonth,endDay,day};
