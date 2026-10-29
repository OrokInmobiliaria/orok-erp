'use strict';
const NAME='orok_retomar_consulta_v1',LANGUAGE='es';
const BODY='Hola {{1}}, somos el equipo de ÖRÖK. Nos escribiste sobre Infinity 224. ¿Deseas retomar tu consulta? Podemos ayudarte con información del proyecto, una visita o un asesor.';
const BUTTONS=['Sí, continuar','No, gracias'];
const definition={name:NAME,language:LANGUAGE,category:'MARKETING',components:[{type:'BODY',text:BODY,example:{body_text:[['María']]}},{type:'BUTTONS',buttons:BUTTONS.map(text=>({type:'QUICK_REPLY',text}))}]};
function validateApproved(t){
 if(!t||t.name!==NAME||t.language!==LANGUAGE||t.status!=='APPROVED')throw Error('La plantilla de recuperación aún no está APPROVED en Meta o fue pausada/rechazada.');
 const components=t.components||[],body=components.find(c=>c.type==='BODY'),buttons=components.find(c=>c.type==='BUTTONS');
 if(components.length!==2||body?.text!==BODY||buttons?.buttons?.length!==2||buttons.buttons.some((b,i)=>b.type!=='QUICK_REPLY'||b.text!==BUTTONS[i]))throw Error('La plantilla aprobada no coincide con el texto y botones de esta versión. Revisa la propuesta en Meta.');
 return t;
}
function personalized(lead){const first=String(lead.name||'').trim().split(/\s+/)[0];return first&&!/^\+?\d+$/.test(first)?first.slice(0,60):'👋';}
function content(lead,draft){return {type:'template',template:{name:NAME,language:{code:LANGUAGE},components:[{type:'body',parameters:[{type:'text',text:personalized(lead)}]},...['continue','stop'].map((choice,index)=>({type:'button',sub_type:'quick_reply',index:String(index),parameters:[{type:'payload',payload:'orok:recovery:'+choice+':'+draft.id}]}))]}};}
module.exports={NAME,LANGUAGE,BODY,BUTTONS,definition,validateApproved,personalized,content};
