'use strict';
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
function visitRequest(text){const s=norm(text);if(/\b(?:no|nunca|cancelar|anular|reprogramar|cambiar)\b/.test(s))return false;return /\b(?:agendar|reservar|programar|coordinar)\b.{0,40}\b(?:cita|visita)\b|\b(?:quiero|quisiera|deseo|me gustaria|puedo|podria)\b.{0,40}\b(?:visitar|conocer|ir|pasar)\b.{0,40}\bshowroom\b|^(?:visitar|conocer) (?:el )?showroom[.!?\s]*$/.test(s);}
function resolveSlot(text,slots,clock=Date.now()){
 let s=norm(text).replace(/\b(?:una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)\b/g,w=>({una:'1',dos:'2',tres:'3',cuatro:'4',cinco:'5',seis:'6',siete:'7',ocho:'8',nueve:'9',diez:'10',once:'11',doce:'12'}[w]));
 if(/\b(?:no|quizas|tal vez|puede ser|no se|o bien)\b|\s(?:o|u)\s/.test(s))return {state:'ambiguous'};
 const times=[...s.matchAll(/\b(?:a las?\s+)?(\d{1,2})(?::(\d{2}))?\s*(a\.?\s*m\.?|p\.?\s*m\.?|de la (?:manana|tarde|noche))?/g)].filter(m=>/^a la/.test(m[0])||m[2]!==undefined||m[3]);
 if(times.length!==1)return {state:'ambiguous'};
 const tm=times[0],h=Number(tm[1]),minute=Number(tm[2]||0),qual=tm[3]||'';
 if(h>23||minute>59||qual&&h>12)return {state:'ambiguous'};
 let hour=h;if(/p|tarde|noche/.test(qual))hour=h%12+12;else if(/a\.?\s*m|manana/.test(qual))hour=h%12;
 else if(h>=1&&h<=9)return {state:'ambiguous'};
 s=s.slice(0,tm.index)+' '+s.slice(tm.index+tm[0].length);
 const today=new Date(clock-5*3600000),ymd=d=>d.toISOString().slice(0,10),date=ymd(today),tomorrow=ymd(new Date(today.getTime()+86400000)),weekdays=['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];
 let dayMatch=null;
 const numeric=/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}))?\b/.exec(s),iso=/\b(\d{4})-(\d{2})-(\d{2})\b/.exec(s),namedDays=weekdays.filter(w=>new RegExp('\\b'+w+'\\b').test(s)),weekday=namedDays[0];
 if(namedDays.length>1)return {state:'ambiguous'};
 if(iso)dayMatch=d=>ymd(d)===iso[0];
 else if(numeric)dayMatch=d=>d.getUTCDate()===Number(numeric[1])&&d.getUTCMonth()+1===Number(numeric[2])&&(!numeric[3]||d.getUTCFullYear()===Number(numeric[3]));
 else if(/\bpasado manana\b/.test(s))dayMatch=d=>ymd(d)===ymd(new Date(today.getTime()+2*86400000));
 else if(/\bmanana\b/.test(s))dayMatch=d=>ymd(d)===tomorrow;
 else if(/\bhoy\b/.test(s))dayMatch=d=>ymd(d)===date;
 else if(weekday)dayMatch=d=>d.getUTCDay()===weekdays.indexOf(weekday);
 if(!dayMatch)return {state:'ambiguous'};
 const found=slots.filter(v=>{const d=new Date(Date.parse(v.start)-5*3600000);return dayMatch(d)&&(!weekday||d.getUTCDay()===weekdays.indexOf(weekday))&&d.getUTCHours()===hour&&d.getUTCMinutes()===minute;});
 return found.length===1?{state:'matched',slot:found[0]}:{state:found.length?'ambiguous':'not_offered'};
}
function confirmation(text){const s=norm(text).replace(/[.!¡,]/g,'').replace(/\s+/g,' ');if(/^(?:si|si confirmo|si confirmo la visita|si confirmo ese dia y hora|confirmo|confirmo ese horario|confirmo ese dia y hora|de acuerdo|si esta bien|si por favor)$/.test(s))return 'yes';if(/^(?:no|no confirmo|otro horario|otra fecha|prefiero otro horario|ver otros horarios)$/.test(s))return 'no';return null;}
module.exports={visitRequest,resolveSlot,confirmation};
