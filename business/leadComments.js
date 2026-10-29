const {randomUUID}=require('node:crypto');
function appendComment(lead,input,actor,at=new Date().toISOString()){
 const text=String(input?.text||'').trim(),requestId=String(input?.requestId||'');
 if(!text||text.length>10000)throw Error('Escribe un comentario de 1 a 10000 caracteres.');
 if(!/^[\w-]{1,100}$/.test(requestId))throw Error('Identificador de comentario no válido.');
 const history=lead.comment_history||[];
 const old=history.find(c=>c.request_id===requestId);
 if(old){if(old.text!==text)throw Error('La solicitud ya se usó para otro comentario.');return old;}
 const entry={id:randomUUID(),request_id:requestId,text,at,author:actor||'Sin asignar'};
 lead.comment_history=[...history,entry];
 return entry;
}
module.exports={appendComment};
