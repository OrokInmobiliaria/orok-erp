'use strict';
const crypto=require('node:crypto');
const {createAuth}=require('./business/authService');
const SUPPORT='soportetecnologico@orok.com.pe';
function signer(secret){
 if(typeof secret!=='string'||secret.length<40)throw Error('Configura una clave de sesión de al menos 40 caracteres.');
 const mac=value=>crypto.createHmac('sha256',secret).update(value).digest('base64url');
 return {issue(session){if(!session)return '';const data=Buffer.from(JSON.stringify({id:session.id,version:mac(session.hash),exp:Date.now()+12*3600000})).toString('base64url');return data+'.'+mac(data);},verify(cookie,users){try{const [data,sig,...extra]=String(cookie||'').split('.');if(extra.length||!sig||sig.length!==43||!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(mac(data))))return null;const value=JSON.parse(Buffer.from(data,'base64url'));if(!Number.isFinite(value.exp)||value.exp<Date.now()||value.exp>Date.now()+12*3600000+10000)return null;const user=users.find(u=>u.id===value.id&&mac(u.hash)===value.version);return user?{id:user.id,hash:user.hash}:null;}catch{return null;}}};
}
class CloudAuth{
 constructor(db,{project='infinity224',sessionSecret,bootstrapCode,sendApproval}){if(!/^[\w-]{1,100}$/.test(project))throw Error('Proyecto no válido.');this.ref=db.collection('orok_auth').doc(project);this.db=db;this.sign=signer(sessionSecret);this.bootstrapCode=bootstrapCode;this.send=sendApproval;}
 service(state,write,outbox=[]){return createAuth(()=>structuredClone(state.value),value=>{state.value=value;write();},{sendApproval:async mail=>{outbox.push(mail);}});}
 async execute(method,args,cookie){
  if(!['info','bootstrap','login','logout','createUser','reset','changePassword','requestApproval','verifyApproval','requireUser','requireSetupManager'].includes(method))throw Error('Operación de acceso no válida.');
  const result=await this.db.runTransaction(async tx=>{
   const snapshot=await tx.get(this.ref);let dirty=false;const state={value:snapshot.exists?snapshot.data():{settings:{},users:[]}},outbox=[];
   const knownId=(state.value.users||[]).some(u=>u.id===args[0]?.id)?args[0].id:'unknown';const rateKey=['login','bootstrap'].includes(method)?crypto.createHash('sha256').update(method+':'+knownId).digest('hex'):null;const rate=rateKey&&state.value.failures?.[rateKey];if(rate?.until>Date.now())throw Error('Demasiados intentos. Intenta nuevamente en un minuto.');
   if(method==='bootstrap'&&!state.value.users.length){if(!this.bootstrapCode||this.bootstrapCode.length<24)throw Error('La activación inicial debe configurarse en el servidor.');state.value.settings.managerPin=this.bootstrapCode;}
   const service=this.service(state,()=>{dirty=true;},outbox),session=this.sign.verify(cookie,state.value.users||[]);service.restoreSession('web',session);let value,error;try{if(method==='info')value=service.info();else if(method==='logout')value=service.logout('web');else value=await service[method]('web',...args);}catch(e){error=e.message;}
   if(rateKey){state.value.failures||={};if(error){const count=(rate?.count||0)+1;state.value.failures[rateKey]={count,until:count>=5?Date.now()+60000:0};}else delete state.value.failures[rateKey];dirty=true;}
   if(dirty){delete state.value.settings.managerPin;if(Buffer.byteLength(JSON.stringify(state.value))>800000)throw Error('Demasiados usuarios o registros de acceso.');tx.set(this.ref,state.value);}return {value,error,outbox,session:service.exportSession('web')};
  });
  if(result.error)throw Error(result.error);for(const mail of result.outbox){try{await this.send(mail);}catch{await this.db.runTransaction(async tx=>{const s=await tx.get(this.ref),d=s.data(),u=d.users.find(u=>u.approval?.requestId===mail.requestId);if(u){u.approval.sent=false;tx.set(this.ref,d);}});throw Error('No se pudo entregar la solicitud a soporte. La cuenta sigue pendiente.');}}return {value:result.value,cookie:this.sign.issue(result.session)};
 }
 async require(cookie,manager=false){return (await this.execute('requireUser',[manager],cookie)).value;}
 // Authentication remains in Firebase; a SQL transaction must never read its foreign reference.
 // Read current auth on each mutation and fail closed if Firebase is unavailable.
 async requireTx(tx,cookie,manager=false){const s=await (tx.persistence==='postgresql'?this.ref.get():tx.get(this.ref));const state={value:s.exists?s.data():{users:[]}};const service=this.service(state,()=>{});service.restoreSession('web',this.sign.verify(cookie,state.value.users||[]));return service.requireUser('web',manager);}
 watch(){let data,problem,resolve;const ready=new Promise(r=>resolve=r);const off=this.ref.onSnapshot(s=>{data=s.exists?s.data():{users:[]};problem=null;resolve();},e=>{problem=e;resolve();});return {require:async(cookie,manager=false)=>{await ready;if(problem)throw problem;const state={value:data},service=this.service(state,()=>{});service.restoreSession('web',this.sign.verify(cookie,data.users||[]));return service.requireUser('web',manager);},close:off};}
}
module.exports={CloudAuth,signer,SUPPORT};
