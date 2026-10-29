'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const SUPPORT='soportetecnologico@orok.com.pe';
function safeSmtpDiagnostic(error){
 const code=['EAUTH','ETIMEDOUT','ECONNECTION','ESOCKET','ENOTFOUND','EDNS'].includes(error?.code)?error.code:'SMTP_ERROR';
 const response=typeof error?.response==='string'?error.response.slice(0,1500):'';
 const match=/(?:^|[\r\n])([245]\d{2})[ -]([245]\.\d{1,3}\.\d{1,3})(?:\s|$)/.exec(response);
 const status=Number.isInteger(error?.responseCode)&&error.responseCode>=200&&error.responseCode<=599?error.responseCode:match?Number(match[1]):null;
 return [code,status&&'SMTP '+status,match?.[2]].filter(Boolean).join(' / ');
}
function createCloudApprovalMail(config,transportFactory=options=>require('nodemailer').createTransport(options)){
 const file=path.join(config.privateDir,'support-smtp.enc.json');
 const key=()=>{if(typeof config.sessionSecret!=='string'||config.sessionSecret.length<40)throw Error('Falta la clave privada del servidor.');return crypto.hkdfSync('sha256',Buffer.from(config.sessionSecret),'orok-support-smtp','cloud-mail-v1',32);};
 function read(){
  try{const s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||s.size>16000)throw Error('archivo');
   if(process.platform!=='win32'&&(s.mode&0o077))throw Error('permisos');
   const envelope=JSON.parse(fs.readFileSync(file,'utf8'));if(envelope.version!==1)throw Error('version');
   const decipher=crypto.createDecipheriv('aes-256-gcm',key(),Buffer.from(envelope.iv,'base64'));
   decipher.setAAD(Buffer.from(config.project));decipher.setAuthTag(Buffer.from(envelope.tag,'base64'));
   return JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.data,'base64')),decipher.final()]).toString('utf8'));
  }catch(e){if(e.code==='ENOENT')return null;throw Error('No se pudo abrir la conexión privada de correo. Revisa su configuración en el servidor.');}
 }
 const publicSettings=()=>{const c=read();return {host:c?.host||'smtp.gmail.com',port:c?.port||465,user:c?.user||'',recipient:SUPPORT,configured:!!c,managed:false,storage:'server'};};
 function normalize(input){
  const host=String(input.host||'').trim().toLowerCase(),port=Number(input.port),user=String(input.user||'').trim().toLowerCase();
  if(!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host)||host.endsWith('.local')||![465,587].includes(port))throw Error('Indica un servidor de correo y el puerto seguro 465 o 587.');
  if(!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@orok\.com\.pe$/.test(user))throw Error('Usa una cuenta real de correo @orok.com.pe para enviar.');
  const previous=read();let password=input.password;
  if(password===undefined||password===''){
   if(!previous||previous.host!==host||previous.port!==port||previous.user!==user)throw Error('Ingresa la clave de aplicación del correo de salida.');
   password=previous.password;
  }
  if(typeof password!=='string'||!password||password.length>256||password.includes('\0'))throw Error('Clave de aplicación no válida.');
  if(host==='smtp.gmail.com'){
   password=password.replace(/[\s\u200B-\u200D\uFEFF]/g,'');
   if(!/^[a-zA-Z0-9]{16}$/.test(password))throw Error('Para Gmail pega la clave completa de 16 caracteres que Google mostró al crear la contraseña de aplicación. El nombre de la aplicación, la contraseña del CRM y el código de aprobación son datos distintos.');
  }else if(/[\r\n]/.test(password))throw Error('Clave de aplicación no válida.');
  return {host,port,user,password};
 }
 const options=c=>({host:c.host,port:c.port,secure:c.port===465,requireTLS:true,
  tls:{minVersion:'TLSv1.2',rejectUnauthorized:true,servername:c.host},auth:{user:c.user,pass:c.password},
  connectionTimeout:15000,greetingTimeout:15000,socketTimeout:30000,
  logger:false,debug:false,disableFileAccess:true,disableUrlAccess:true});
 function deliveryError(e){
  const diagnostic=' Diagnóstico: '+safeSmtpDiagnostic(e)+'.';
  if(e.code==='EAUTH')return Error('Google o el proveedor rechazó el acceso. Revisa la cuenta principal de Google y la clave de aplicación generada en esa misma cuenta.'+diagnostic);
  if(['ETIMEDOUT','ECONNECTION','ESOCKET','ENOTFOUND','EDNS'].includes(e.code))return Error('No se pudo conectar al servidor de correo. Revisa el servidor, puerto y salida de red del VPS.'+diagnostic);
  return Error('No se pudo validar la conexión segura de correo. La configuración anterior se conserva.'+diagnostic);
 }
 async function configure(input){
  const c=normalize(input),transport=transportFactory(options(c));
  try{await transport.verify();}catch(e){throw deliveryError(e);}finally{transport.close?.();}
  fs.mkdirSync(config.privateDir,{recursive:true,mode:0o700});
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key(),iv);cipher.setAAD(Buffer.from(config.project));
  const data=Buffer.concat([cipher.update(JSON.stringify(c),'utf8'),cipher.final()]);
  const envelope={version:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')};
  const temp=file+'.'+crypto.randomUUID()+'.tmp';
  try{fs.writeFileSync(temp,JSON.stringify(envelope),{flag:'wx',mode:0o600});fs.renameSync(temp,file);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
  return publicSettings();
 }
 async function send({name,role,code,requestId}){
  const c=read();if(!c)throw Error('Configura la cuenta real de correo de salida antes de solicitar la aprobación.');
  const transport=transportFactory(options(c));
  try{const result=await transport.sendMail({from:c.user,to:SUPPORT,
   subject:'Validar acceso CRM ÖRÖK: '+String(name).replace(/[\r\n]/g,' '),
   text:`Solicitud de validación de acceso al CRM\nUsuario: ${name}\nRol: ${role}\nSolicitud: ${requestId}\nCódigo de aprobación: ${code}\nVálido 30 minutos para esta cuenta y contraseña. Si soporte autoriza el acceso, introduce el código en el CRM. La contraseña no se incluye en el correo.\nDestinatario: ${SUPPORT}`});
   if(!result.accepted?.some(a=>String(a).toLowerCase()===SUPPORT))throw Error('No aceptado');
   return {sent:true};
  }finally{transport.close?.();}
 }
 // R38 · Avisos del ERP (solicitudes de aprobación de órdenes). Solo a correos del directorio de aprobadores; sin adjuntos.
 async function notify({to,subject,text}){
  const c=read();if(!c)throw Error('El correo de salida del servidor no está configurado.');
  const list=[].concat(to).map(x=>String(x||'').trim().toLowerCase()).filter(Boolean);
  if(!list.length||list.length>5||!list.every(x=>/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(x)))throw Error('Correo de destino no válido.');
  const transport=transportFactory(options(c));
  try{const result=await transport.sendMail({from:c.user,to:list.join(', '),subject:String(subject).replace(/[\r\n]/g,' ').slice(0,200),text:String(text).slice(0,8000)});
   if(!result.accepted?.length)throw Error('No aceptado');return {sent:true,to:list};
  }catch(e){if(e.message==='No aceptado')throw Error('El servidor de correo no aceptó el destinatario.');throw deliveryError(e);}finally{transport.close?.();}
 }
 return {publicSettings,configure,send,notify};
}
module.exports={createCloudApprovalMail,safeSmtpDiagnostic};
