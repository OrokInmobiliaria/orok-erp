const fs=require('fs'),path=require('path');
const SUPPORT_EMAIL='soportetecnologico@orok.com.pe';
function createApprovalMail({app,safeStorage},transportFactory=options=>require('nodemailer').createTransport(options)){
 const file=path.join(app.getPath('userData'),'orok-support-mail.json');
 const read=()=>fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{};
 const publicSettings=()=>{const c=read();return {host:c.host||'',port:c.port||465,user:SUPPORT_EMAIL,recipient:SUPPORT_EMAIL,configured:!!(c.host&&c.secret)};};
 function configure({host,port,password}){
  host=String(host||'').trim();port=Number(port);
  if(!/^[a-zA-Z0-9.-]+$/.test(host)||![465,587].includes(port))throw Error('Indica el servidor SMTP y puerto 465 o 587.');
  if(!safeStorage?.isEncryptionAvailable())throw Error('El sistema no ofrece almacenamiento seguro para la clave de correo.');
  const previous=read();let secret=previous.secret;
  if(password){if(typeof password!=='string'||password.length>256)throw Error('Clave de correo no válida.');secret=safeStorage.encryptString(password).toString('base64');}
  if(!secret)throw Error('Ingresa la clave de aplicación o de SMTP del correo de soporte.');
  const next={host,port,user:SUPPORT_EMAIL,secret};fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(next),{mode:0o600});return publicSettings();
 }
 async function send({name,role,code,requestId}){
  const c=read();if(!c.secret||!c.host)throw Error('Falta configurar el correo SMTP de soporte. La cuenta seguirá pendiente.');
  if(!safeStorage?.isEncryptionAvailable())throw Error('No se puede abrir la configuración segura de correo.');
  const transport=transportFactory({host:c.host,port:c.port,secure:c.port===465,requireTLS:true,tls:{minVersion:'TLSv1.2',rejectUnauthorized:true},auth:{user:SUPPORT_EMAIL,pass:safeStorage.decryptString(Buffer.from(c.secret,'base64'))},connectionTimeout:15000,greetingTimeout:15000,socketTimeout:30000,logger:false,debug:false,disableFileAccess:true,disableUrlAccess:true});
  try{const result=await transport.sendMail({from:SUPPORT_EMAIL,to:SUPPORT_EMAIL,subject:'Validar acceso CRM ÖRÖK: '+String(name).replace(/[\r\n]/g,' '),text:`Solicitud de validación de cuenta y contraseña vigente\n\nUsuario: ${name}\nRol: ${role}\nSolicitud: ${requestId}\n\nCódigo de aprobación: ${code}\nVálido durante 30 minutos y para esta cuenta y contraseña únicamente.\n\nSi soporte autoriza el alta y la clave configurada, debe introducir este código en la ventana Validación de acceso del CRM correspondiente. Si no reconoce la solicitud, no debe aprobarla. La contraseña no se incluye en el correo.\n\nDestinatario exclusivo: ${SUPPORT_EMAIL}`});if(!result.accepted?.some(a=>String(a).toLowerCase()===SUPPORT_EMAIL))throw Error('El servidor no aceptó el correo de validación.');return {sent:true};}finally{transport.close?.();}
 }
 return {publicSettings,configure,send};
}
module.exports={createApprovalMail,SUPPORT_EMAIL};
