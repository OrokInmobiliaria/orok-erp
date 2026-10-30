'use strict';
const fs=require('node:fs'),path=require('node:path'),https=require('node:https');
const {spawn}=require('node:child_process');
const {randomUUID}=require('node:crypto');
const {NAME,LANGUAGE,validateApproved}=require('./recoveryTemplate');
const {DEFAULT_CALENDAR_ID,calendarId}=require('./calendarIdentity');
const AUDIO=new Set(['audio/aac','audio/amr','audio/mpeg','audio/mp4','audio/ogg']);
function audioMime(value){const m=String(value||'').split(';')[0].trim().toLowerCase();return ({'audio/x-m4a':'audio/mp4','audio/m4a':'audio/mp4','audio/mp3':'audio/mpeg','audio/x-mp3':'audio/mpeg'})[m]||m;}
const MIME_EXT={'audio/aac':'aac','audio/amr':'amr','audio/mpeg':'mp3','audio/mp4':'m4a','audio/ogg':'ogg','audio/webm':'webm'};
function request(url,options={}){
 return new Promise((resolve,reject)=>{
  const u=new URL(url),media=options.media===true;
  if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443'||!(u.hostname==='graph.facebook.com'||media&&['lookaside.fbsbx.com','mmg.whatsapp.net'].includes(u.hostname)))return reject(Error('Destino de Meta no autorizado.'));
  const req=https.request(u,{method:options.method||'GET',headers:options.headers||{},timeout:15000},res=>{
   const parts=[];let length=0;
   res.on('data',chunk=>{length+=chunk.length;if(length>(options.maxBytes||16*1024*1024)){req.destroy(Error('El archivo supera el tamaño permitido.'));return;}parts.push(chunk);});
   res.on('error',reject);res.on('end',()=>{const bytes=Buffer.concat(parts);resolve({ok:res.statusCode>=200&&res.statusCode<300,status:res.statusCode,headers:res.headers,bytes,json:()=>JSON.parse(bytes.toString('utf8'))});});
  });
  req.on('timeout',()=>req.destroy(Error('Meta no respondió dentro del plazo.')));req.on('error',reject);if(options.body)req.write(options.body);req.end();
 });
}
function readSetup(privateDir){let s;try{s=JSON.parse(fs.readFileSync(path.join(privateDir,'whatsapp-inbox.json'),'utf8'));}catch{s={};}if(s.ffmpegPath===undefined&&fs.existsSync('/usr/bin/ffmpeg'))s.ffmpegPath='/usr/bin/ffmpeg';return s;}
function publicSetup(s){return {business_account_id:s.businessAccountId||'',calendar_id:s.calendarId||DEFAULT_CALENDAR_ID,test_advisor_phone:s.environment==='test'?s.testAdvisorPhone||'':'',advisor_phones:s.advisorPhones||[],enabled:s.enabled===true,sending_enabled:s.sendingEnabled===true,automatic_enabled:s.automaticEnabled===true,agenda_enabled:s.agendaEnabled===true,environment:s.environment||'test',phone_number_ids:s.phoneNumberIds||[],test_recipients:s.testRecipients||[],api_version:s.apiVersion||'',configured:!!s.accessToken,verification_configured:!!s.appSecret&&!!s.verifyToken,audio_conversion:!!s.ffmpegPath,new_conversation_mode:s.newConversationMode||'observer'};}
function saveSetup(privateDir,input,actor){
 const old=readSetup(privateDir),s={...old};
 for(const field of ['enabled','sendingEnabled','automaticEnabled','agendaEnabled'])s[field]=input[field]===true;
 s.newConversationMode=input.newConversationMode==='auto'?'auto':input.newConversationMode==='observer'?'observer':old.newConversationMode||'observer';
 s.environment=input.environment==='production'?'production':'test';
 s.apiVersion=String(input.apiVersion||old.apiVersion||'').trim();if(!/^v\d{2}\.\d+$/.test(s.apiVersion))throw Error('Indica la versión de Graph API que muestra Meta, por ejemplo v26.0.');
 s.phoneNumberIds=[...new Set((input.phoneNumberIds||[]).map(String))];if(!s.phoneNumberIds.length||s.phoneNumberIds.some(v=>!/^\d{5,30}$/.test(v)))throw Error('Indica al menos un Phone Number ID de Meta válido.');
 s.testRecipients=[...new Set((input.testRecipients||[]).map(v=>String(v).replace(/\D/g,'')))];if(s.testRecipients.some(v=>!/^\d{7,15}$/.test(v))||s.environment==='test'&&!s.testRecipients.length)throw Error('En pruebas indica tu número autorizado con código de país.');
 if(input.testAdvisorPhone!==undefined)s.testAdvisorPhone=String(input.testAdvisorPhone||'').replace(/\D/g,'');
 if(input.advisorPhones!==undefined){const list=(Array.isArray(input.advisorPhones)?input.advisorPhones:String(input.advisorPhones||'').split(/[,;\s]+/)).map(v=>String(v).replace(/\D/g,'')).filter(Boolean);if(list.some(v=>!/^\d{7,15}$/.test(v)))throw Error('Cada celular de asesor debe tener código de país, por ejemplo 51 seguido del número.');s.advisorPhones=[...new Set(list)].slice(0,10);}
 if(s.testAdvisorPhone&&(!/^\d{7,15}$/.test(s.testAdvisorPhone)||s.environment==='test'&&!s.testRecipients.includes(s.testAdvisorPhone)))throw Error('El teléfono de avisos del ensayo debe ser un destinatario autorizado, con código de país.');
 if(input.calendarId!==undefined)s.calendarId=String(input.calendarId||'').trim();s.calendarId=calendarId(s);
 const proposedToken=String(input.accessToken||'').trim();if(proposedToken&&/[^\x21-\x7e]/.test(proposedToken))throw Error('El token de acceso contiene espacios o caracteres ajenos a una clave. Copia solo el token completo de Meta.');
 for(const field of ['accessToken','appSecret','verifyToken'])if(String(input[field]||'').trim())s[field]=String(input[field]).trim();
 if(s.enabled&&(!s.accessToken||String(s.appSecret||'').length<24||String(s.verifyToken||'').length<24))throw Error('Completa el token, App Secret y token de verificación privados.');
 if(input.ffmpegPath!==undefined){const file=String(input.ffmpegPath||'');if(file&&!/^\/[A-Za-z0-9_./-]+$/.test(file))throw Error('Ruta de conversión de audio no válida.');s.ffmpegPath=file;}
 if(input.businessAccountId!==undefined){s.businessAccountId=String(input.businessAccountId||'').trim();if(s.businessAccountId&&!/^\d{5,30}$/.test(s.businessAccountId))throw Error('WABA ID de Meta no válido.');}
 s.savedAt=new Date().toISOString();s.savedBy=actor;
 fs.mkdirSync(privateDir,{recursive:true,mode:0o700});const dest=path.join(privateDir,'whatsapp-inbox.json'),tmp=dest+'.'+randomUUID();fs.writeFileSync(tmp,JSON.stringify(s,null,2),{mode:0o600});fs.renameSync(tmp,dest);return publicSetup(s);
}
class WhatsAppGateway{
 constructor(privateDir,{requester=request,spawnProcess=spawn}={}){this.privateDir=privateDir;this.request=requester;this.spawnProcess=spawnProcess;}
 setup(){return readSetup(this.privateDir);}
 assertRecipient(account,phone,{send=false,automatic=false}={}){
  const s=this.setup();if(!s.enabled||!s.accessToken||!/^v\d{2}\.\d+$/.test(s.apiVersion)||!s.phoneNumberIds?.includes(account))throw Error('Configura y habilita este número de WhatsApp en Gerencia.');
  if(s.environment!=='production'&&!s.testRecipients?.includes(phone))throw Error('Este destinatario no está autorizado para las pruebas.');
  if(send&&!s.sendingEnabled)throw Error('El envío de WhatsApp está desactivado.');if(automatic&&!s.automaticEnabled)throw Error('La atención automática está desactivada.');return s;
 }
 async api(s,endpoint,options={}){
  const r=await this.request('https://graph.facebook.com/'+s.apiVersion+'/'+endpoint,{...options,headers:{Authorization:'Bearer '+s.accessToken,...options.headers}});
  let data;try{data=r.json();}catch{data={};}
  if(!r.ok){const e=Error('Meta rechazó la operación (HTTP '+r.status+(data.error?.code?', código '+Number(data.error.code):'')+'). Revisa permisos, destinatario y ventana de atención.');e.definitive=r.status>=400&&r.status<500;throw e;}
  return data;
 }
 async send(account,phone,content,{automatic=false}={}){
  const s=this.assertRecipient(account,phone,{send:true,automatic}),payload={messaging_product:'whatsapp',recipient_type:'individual',to:phone,...content};
  const data=await this.api(s,account+'/messages',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  if(!data.messages?.[0]?.id)throw Error('Meta no devolvió el identificador del envío; comprueba la entrega antes de repetir.');return data.messages[0].id;
 }
 async approvedRecovery(account){return this.approvedTemplate(account,require('./recoveryTemplate').definition);}
 async approvedTemplate(account,definition){
  const s=this.setup();if(!s.businessAccountId||!s.phoneNumberIds?.includes(account))throw Error('Configura WABA ID y número del negocio.');
  const phones=await this.api(s,s.businessAccountId+'/phone_numbers?fields=id&limit=100');if(!phones.data?.some(p=>p.id===account))throw Error('Meta no confirmó que el número pertenece al WABA configurado.');
  const q=new URLSearchParams({name:definition.name,fields:'name,language,status,category,components',limit:'100'}),r=await this.api(s,s.businessAccountId+'/message_templates?'+q),t=r.data?.find(t=>t.name===definition.name&&t.language===definition.language);
  if(t?.status!=='APPROVED')throw Error('La plantilla no está APPROVED en Meta o fue pausada/rechazada.');
  if(t.components?.length!==definition.components.length||definition.components.some(c=>{const actual=t.components.find(x=>x.type===c.type);return !actual||c.text&&actual.text!==c.text||c.buttons&&(actual.buttons?.length!==c.buttons.length||c.buttons.some((b,i)=>b.type!==actual.buttons[i].type||b.text!==actual.buttons[i].text));}))throw Error('La plantilla no coincide con el contenido aprobado para esta versión.');
  return t;
 }
 async media(account,phone,id){
  const s=this.assertRecipient(account,phone);if(!/^[A-Za-z0-9_-]{1,300}$/.test(id))throw Error('Identificador de archivo no válido.');
  const info=await this.api(s,id+'?phone_number_id='+encodeURIComponent(account));if(!info.url)throw Error('El archivo ya no está disponible en Meta.');
  const r=await this.request(info.url,{media:true,maxBytes:16*1024*1024,headers:{Authorization:'Bearer '+s.accessToken}});if(!r.ok)throw Error('No se pudo descargar el archivo de Meta.');
  return {bytes:r.bytes,mime:String(info.mime_type||r.headers['content-type']||'application/octet-stream').split(';')[0],filename:'WhatsApp-'+id+'.'+(MIME_EXT[info.mime_type]||'bin')};
 }
 async uploadAttachment(account,phone,input){
  const file=require('./whatsappAttachment').attachment(input),s=this.assertRecipient(account,phone,{send:true}),boundary='orok-'+randomUUID();
  const before=Buffer.from('--'+boundary+'\r\nContent-Disposition: form-data; name="messaging_product"\r\n\r\nwhatsapp\r\n--'+boundary+'\r\nContent-Disposition: form-data; name="type"\r\n\r\n'+file.mime+'\r\n--'+boundary+'\r\nContent-Disposition: form-data; name="file"; filename="'+file.filename.replace(/[^\x20-\x7e]/g,'_')+'"\r\nContent-Type: '+file.mime+'\r\n\r\n');
  const data=await this.api(s,account+'/media',{method:'POST',headers:{'Content-Type':'multipart/form-data; boundary='+boundary},body:Buffer.concat([before,file.bytes,Buffer.from('\r\n--'+boundary+'--\r\n')])});
  if(!data.id)throw Error('Meta no devolvió el identificador del archivo.');return String(data.id);
 }
 async uploadAudio(account,phone,bytes,mime){
  const s=this.assertRecipient(account,phone,{send:true});if(!AUDIO.has(mime)||!bytes.length||bytes.length>16*1024*1024)throw Error('Formato de audio no compatible o archivo mayor a 16 MB.');
  const boundary='orok-'+randomUUID(),before=Buffer.from('--'+boundary+'\r\nContent-Disposition: form-data; name="messaging_product"\r\n\r\nwhatsapp\r\n--'+boundary+'\r\nContent-Disposition: form-data; name="type"\r\n\r\n'+mime+'\r\n--'+boundary+'\r\nContent-Disposition: form-data; name="file"; filename="audio.'+MIME_EXT[mime]+'"\r\nContent-Type: '+mime+'\r\n\r\n');
  const data=await this.api(s,account+'/media',{method:'POST',headers:{'Content-Type':'multipart/form-data; boundary='+boundary},body:Buffer.concat([before,bytes,Buffer.from('\r\n--'+boundary+'--\r\n')])});if(!data.id)throw Error('Meta no devolvió el identificador del audio.');return String(data.id);
 }
 async convertAudio(bytes,mime){
  mime=audioMime(mime);
  if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>16*1024*1024)throw Error('El audio está vacío o supera 16 MB.');
  if(!AUDIO.has(mime)&&mime!=='audio/webm')throw Error('Selecciona un audio MP3, M4A, AAC, AMR u OGG/Opus.');
  const ffmpeg=this.setup().ffmpegPath;
  // Browsers may produce Opus inside MP4. Normalize MP4 and WebM to OGG/Opus
  // instead of assuming that a supported container implies a supported codec.
  if(mime!=='audio/webm'&&mime!=='audio/mp4')return {bytes,mime};
  if(!ffmpeg){if(mime==='audio/mp4'&&!bytes.includes(Buffer.from('Opus')))return {bytes,mime};throw Error('Este audio necesita conversión con FFmpeg en el servidor. Adjunta un MP3 u OGG/Opus mientras se habilita.');}
  const folder=fs.mkdtempSync(path.join(this.privateDir,'wa-audio-')),input=path.join(folder,'input.'+MIME_EXT[mime]),output=path.join(folder,'output.ogg');
  try{fs.writeFileSync(input,bytes,{mode:0o600});await new Promise((resolve,reject)=>{const child=this.spawnProcess(ffmpeg,['-nostdin','-y','-i',input,'-vn','-ac','1','-ar','48000','-c:a','libopus','-b:a','32k','-threads','1',output],{stdio:'ignore'}),timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('La conversión de audio tardó demasiado.'));},15000);child.once('error',()=>{clearTimeout(timer);reject(Error('No se pudo iniciar FFmpeg.'));});child.once('exit',code=>{clearTimeout(timer);code===0?resolve():reject(Error('No se pudo convertir el audio.'));});});const converted=fs.readFileSync(output);if(!converted.length||converted.length>16*1024*1024||converted.subarray(0,4).toString()!=='OggS'||!converted.includes(Buffer.from('OpusHead')))throw Error('La conversión no produjo un OGG/Opus válido.');return {bytes:converted,mime:'audio/ogg'};}finally{fs.rmSync(folder,{recursive:true,force:true});}
 }
}
module.exports={WhatsAppGateway,readSetup,publicSetup,saveSetup,AUDIO,request,audioMime};
