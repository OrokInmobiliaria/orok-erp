'use strict';
const fs=require('node:fs'),path=require('node:path'),https=require('node:https');
const {randomUUID,createHmac,timingSafeEqual}=require('node:crypto');
const CHANNELS=['instagram','messenger','tiktok'];
function request(url,{method='GET',headers={},body,maxBytes=4*1024*1024}={}){
 return new Promise((resolve,reject)=>{
  const u=new URL(url);
  if(u.protocol!=='https:'||u.username||u.password||(u.port&&u.port!=='443')||!['graph.facebook.com','graph.instagram.com','business-api.tiktok.com'].includes(u.hostname))return reject(Error('Destino social no autorizado.'));
  const req=https.request(u,{method,headers,timeout:15000},res=>{const parts=[];let n=0;res.on('data',b=>{n+=b.length;if(n>maxBytes)return req.destroy(Error('Respuesta social demasiado grande.'));parts.push(b);});res.on('error',reject);res.on('end',()=>{let data;try{data=JSON.parse(Buffer.concat(parts).toString());}catch{data={};}resolve({status:res.statusCode,data});});});
  req.on('timeout',()=>req.destroy(Error('La plataforma social tardó demasiado.')));req.on('error',reject);if(body)req.write(body);req.end();
 });
}
function readSetup(dir){try{return JSON.parse(fs.readFileSync(path.join(dir,'social-integrations.json'),'utf8'));}catch{return {};}}
function publicSetup(s){return {channels:Object.fromEntries(CHANNELS.map(c=>{const a=s[c]||{};return [c,{enabled:a.enabled===true,sending_enabled:a.sendingEnabled===true,environment:a.environment||'test',login_provider:c==='instagram'?(a.loginProvider||'instagram'):c==='messenger'?'facebook':'tiktok',account_id:a.accountId||'',api_version:a.apiVersion||'',test_recipients:a.testRecipients||[],test_lead_form_ids:a.testLeadFormIds||[],test_discovery_phrase:a.testDiscoveryPhrase||'',configured:!!a.accessToken,verification_configured:!!a.appSecret&&!!a.verifyToken,transport:c==='tiktok'?'authenticated_bridge_pending_provider':'direct_meta',automatic_enabled:a.automaticEnabled===true,agenda_enabled:a.agendaEnabled===true,new_conversation_mode:a.newConversationMode||'observer'}];})),ads:Object.fromEntries(['meta','tiktok'].map(p=>{const a=s.ads?.[p]||{};return [p,{enabled:a.enabled===true,configured:!!a.accessToken,account_id:a.accountId||'',currency:a.currency||'',timezone:a.timezone||'',api_version:a.apiVersion||''}];})),saved_at:s.savedAt||null};}
function saveSetup(dir,input,actor){
 const s=readSetup(dir);
 for(const c of CHANNELS){if(!input.channels?.[c])continue;const a=input.channels[c],old=s[c]||{};
  const accountId=String(a.accountId??old.accountId??'').trim();if(accountId&&!/^\d{4,40}$/.test(accountId))throw Error('ID de cuenta social no válido.');
  const apiVersion=String(a.apiVersion||old.apiVersion||'v26.0');if(c!=='tiktok'&&!/^v\d{2}\.\d+$/.test(apiVersion))throw Error('Versión de Meta no válida.');
  const loginProvider=c==='instagram'?String(a.loginProvider??old.loginProvider??'instagram'):'facebook';if(c==='instagram'&&!['instagram','facebook'].includes(loginProvider))throw Error('Acceso de Instagram no válido.');if(c==='instagram'&&loginProvider!==(old.loginProvider||'instagram')&&(!String(a.accessToken||'').trim()||!String(a.appSecret||'').trim()))throw Error('Al cambiar el acceso de Instagram, registra el token y el App Secret de esa conexión.');
  const testRecipients=[...new Set((a.testRecipients||[]).map(String))];if(testRecipients.length>50||testRecipients.some(v=>!/^\d{3,50}$/.test(v)))throw Error('ID de destinatario de prueba no válido.');
  const testLeadFormIds=[...new Set((a.testLeadFormIds??old.testLeadFormIds??[]).map(String))],testDiscoveryPhrase=String(a.testDiscoveryPhrase??old.testDiscoveryPhrase??'').trim();if(testLeadFormIds.length>50||testLeadFormIds.some(v=>!/^\d{3,50}$/.test(v)))throw Error('ID de formulario de prueba no válido.');if(testDiscoveryPhrase&&(testDiscoveryPhrase.length<12||testDiscoveryPhrase.length>100||/[\r\n]/.test(testDiscoveryPhrase)))throw Error('La frase de identificación de pruebas debe tener entre 12 y 100 caracteres en una línea.');
  const next={...old,...(c==='instagram'?{loginProvider}:{}),accountId,apiVersion,testRecipients,testLeadFormIds,testDiscoveryPhrase,automaticEnabled:a.automaticEnabled===true,agendaEnabled:a.agendaEnabled===true,newConversationMode:a.newConversationMode==='auto'?'auto':'observer',environment:a.environment==='production'?'production':'test',enabled:a.enabled===true,sendingEnabled:a.sendingEnabled===true};
  for(const k of ['accessToken','appSecret','verifyToken'])if(String(a[k]||'').trim())next[k]=String(a[k]).trim();
  if(next.enabled&&(!accountId||c!=='tiktok'&&(!next.accessToken||String(next.appSecret||'').length<24||String(next.verifyToken||'').length<24)))throw Error('Completa el ID, token y secretos de verificación de '+c+'.');
  if(c==='tiktok'&&(next.sendingEnabled||next.automaticEnabled))throw Error('TikTok: falta verificar acceso y adaptar el contrato oficial de envío.');
  if(next.sendingEnabled&&next.environment==='test'&&!testRecipients.length)throw Error('Indica los destinatarios autorizados para pruebas.');s[c]=next;
 }
 s.ads||={};for(const p of ['meta','tiktok']){const a=input.ads?.[p];if(!a)continue;const old=s.ads[p]||{},next={...old,enabled:a.enabled===true,accountId:String(a.accountId??old.accountId??'').replace(/^act_/,''),currency:String(a.currency||old.currency||'').toUpperCase(),timezone:String(a.timezone||old.timezone||''),apiVersion:String(a.apiVersion||old.apiVersion||'v26.0')};
  if(next.accountId&&!/^\d{4,40}$/.test(next.accountId))throw Error('ID publicitario no válido.');if(next.currency&&!/^[A-Z]{3}$/.test(next.currency))throw Error('Moneda publicitaria no válida.');
  if(next.timezone){try{new Intl.DateTimeFormat('es',{timeZone:next.timezone});}catch{throw Error('Zona horaria no válida.');}}
  if(p==='meta'&&!/^v\d{2}\.\d+$/.test(next.apiVersion))throw Error('Versión de Meta no válida.');if(String(a.accessToken||'').trim())next.accessToken=String(a.accessToken).trim();
  if(next.enabled&&(!next.accountId||!next.accessToken||!next.currency||!next.timezone))throw Error('Completa cuenta, token, moneda y zona horaria publicitaria.');s.ads[p]=next;
 }
 s.savedAt=new Date().toISOString();s.savedBy=actor;fs.mkdirSync(dir,{recursive:true,mode:0o700});const file=path.join(dir,'social-integrations.json'),tmp=file+'.'+randomUUID();fs.writeFileSync(tmp,JSON.stringify(s,null,2),{mode:0o600});fs.renameSync(tmp,file);return publicSetup(s);
}
function validSignature(raw,signature,secret){if(!secret||String(secret).length<24||!/^sha256=[a-f0-9]{64}$/.test(String(signature)))return false;const expected='sha256='+createHmac('sha256',secret).update(raw).digest('hex');return timingSafeEqual(Buffer.from(expected),Buffer.from(signature));}
function metaEvents(payload,channel,account){
 if(!['messenger','instagram'].includes(channel)||payload?.object!==(channel==='messenger'?'page':'instagram'))throw Error('Evento de canal social no válido.');const out=[];
 for(const entry of payload.entry||[]){if(String(entry.id)!==account)throw Error('Cuenta social no autorizada.');for(const item of entry.messaging||[]){
  const m=item.message;if(!m||m.is_deleted||m.is_unsupported||!m.mid)continue;
  const echo=m.is_echo===true,contact=String(echo?item.recipient?.id:item.sender?.id||'');if(String(echo?item.sender?.id:item.recipient?.id)!==account)throw Error('Destinatario social no autorizado.');
  out.push({channel,account_id:account,contact_id:contact,message:{id:String(m.mid),at:item.timestamp,direction:echo?'outbound':'inbound',type:m.text?'text':m.attachments?.[0]?.type||'unsupported',text:m.text||'',attachments:(m.attachments||[]).slice(0,5).map(a=>({type:String(a.type||''),url:String(a.payload?.url||'')}))},referral:item.referral||m.referral||null});
 }}if(out.length>100)throw Error('El lote social supera 100 mensajes.');return out;
}
class SocialGateway{
 constructor(dir,{requester=request}={}){this.dir=dir;this.request=requester;}
 setup(){return readSetup(this.dir);}
 assertSend(t){const s=this.setup()[t.channel];if(!s?.enabled||!s.sendingEnabled||s.accountId!==t.account_id||!s.accessToken)throw Error('El envío del canal está desactivado o sin configurar.');if(t.channel==='tiktok')throw Error('TikTok: autorización y adaptador de envío pendientes.');if(s.environment!=='production'&&!s.testRecipients?.includes(t.contact_id))throw Error('Destinatario no autorizado para pruebas.');return s;}
 async send(t,text){const s=this.assertSend(t);if(t.channel==='instagram'&&!['instagram','facebook'].includes(s.loginProvider||'instagram'))throw Error('Acceso de Instagram no válido.');const host=t.channel==='instagram'&&(s.loginProvider||'instagram')==='instagram'?'graph.instagram.com':'graph.facebook.com',payload={recipient:{id:t.contact_id},message:{text}};if(t.channel==='messenger')payload.messaging_type='RESPONSE';
  const r=await this.request(`https://${host}/${s.apiVersion}/${s.accountId}/messages`,{method:'POST',headers:{Authorization:'Bearer '+s.accessToken,'Content-Type':'application/json'},body:JSON.stringify(payload)});
  if(r.status<200||r.status>=300){const e=Error('La plataforma rechazó el envío (HTTP '+r.status+'). Comprueba permisos y ventana de atención.');e.definitive=r.status>=400&&r.status<500;throw e;}
  if(!r.data.message_id)throw Error('Envío sin identificador confirmado. Revisa la plataforma antes de repetir.');return String(r.data.message_id);
 }
}
module.exports={CHANNELS,request,readSetup,publicSetup,saveSetup,validSignature,metaEvents,SocialGateway};
