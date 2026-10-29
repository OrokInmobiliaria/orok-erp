const {randomBytes,randomUUID,randomInt,createHash,scryptSync,timingSafeEqual}=require('crypto');
const {SUPPORT_EMAIL}=require('./approvalMail');
const approved=u=>u.approval?.state==='approved'&&u.approval.credentialHash===u.hash;
const publicUser=u=>({id:u.id,name:u.name,role:u.role,brokerName:u.brokerName||'',mustChangePassword:!!u.mustChangePassword,approvalRequired:!approved(u)});
const normalize=s=>String(s||'').trim().toLocaleLowerCase('es');
function credential(password){
  if(typeof password!=='string'||password.length<8||password.length>128)throw new Error('La contraseña debe tener entre 8 y 128 caracteres.');
  const salt=randomBytes(16).toString('hex');
  return {salt,hash:scryptSync(password,salt,64).toString('hex')};
}
function verify(password,u){
  if(typeof password!=='string'||password.length>128||!u?.hash)return false;
  const expected=Buffer.from(u.hash,'hex'),actual=scryptSync(password,u.salt,64);
  return expected.length===actual.length&&timingSafeEqual(expected,actual);
}
function createAuth(read,write,{sendApproval=async()=>{throw Error('Configura el correo de soporte.');},approvalRequired=true}={}){
  const sessions=new Map(),failures=new Map(),sending=new Set();
  const view=u=>({...publicUser(u),approvalRequired:approvalRequired&&!approved(u)});
  const users=()=>read().users||[];
  function identity(sender,manager=false){
    const session=sessions.get(sender),u=users().find(u=>u.id===session?.id&&u.hash===session.hash);
    if(!u)throw new Error('Inicia sesión para continuar.');
    if(manager&&u.role!=='Gerente')throw new Error('Esta operación requiere acceso de Gerencia.');
    return u;
  }
  function requireUser(sender,manager=false){
    const u=identity(sender,manager);
    if(u.mustChangePassword)throw new Error('Cambia tu contraseña temporal para continuar.');
    if(approvalRequired&&!approved(u))throw Error('El acceso requiere validación de '+SUPPORT_EMAIL+'.');
    return view(u);
  }
  function attempt(key,fn){
    const f=failures.get(key);if(f?.until>Date.now())throw new Error('Demasiados intentos. Intenta nuevamente en un minuto.');
    try{const result=fn();failures.delete(key);return result;}catch(e){const count=(f?.count||0)+1;failures.set(key,{count,until:count>=5?Date.now()+60000:0});throw e;}
  }
  return {
    restoreSession:(sender,session)=>{if(session)sessions.set(sender,session);},
    exportSession:sender=>sessions.get(sender)||null,
    info:()=>({setupRequired:users().length===0,users:users().map(view),supportEmail:SUPPORT_EMAIL}),
    requireSetupManager:sender=>view(identity(sender,true)),
    async requestApproval(sender){
      const u=identity(sender);if(u.mustChangePassword)throw Error('Primero define tu contraseña personal.');if(approved(u))throw Error('Esta cuenta ya está validada.');
      if(sending.has(u.id)||Date.now()-Number(u.approval?.requestedAt||0)<60000)throw Error('Espera un minuto antes de solicitar otro código.');
      const code=String(randomInt(0,100000000)).padStart(8,'0'),salt=randomBytes(16).toString('hex'),id=randomUUID(),hash=createHash('sha256').update(salt+code).digest('hex');
      const d=read(),record=d.users.find(r=>r.id===u.id);record.approval={state:'pending',credentialHash:u.hash,requestedAt:Date.now(),requestId:id,challengeHash:hash,salt,expiresAt:Date.now()+30*60000,attempts:0,sent:false};write(d);sending.add(u.id);
      try{await sendApproval({name:u.name,role:u.role,code,requestId:id});const latest=read(),r=latest.users.find(r=>r.id===u.id);if(r.hash!==u.hash||r.approval?.requestId!==id)throw Error('La clave cambió; solicita una validación nueva.');r.approval.sent=true;write(latest);return {sent:true,email:SUPPORT_EMAIL,requestId:id};}
      catch(e){const latest=read(),r=latest.users.find(r=>r.id===u.id);if(r?.approval?.requestId===id){r.approval.sent=false;write(latest);}throw Error('No se pudo enviar la validación. Revisa el servidor y la clave SMTP en la configuración de soporte. La cuenta sigue pendiente.');}
      finally{sending.delete(u.id);}
    },
    verifyApproval(sender,code){
      const u=identity(sender),d=read(),r=d.users.find(r=>r.id===u.id),a=r.approval;
      if(!a?.sent||a.state!=='pending'||a.credentialHash!==u.hash||a.expiresAt<Date.now()||a.attempts>=5)throw Error('Código no disponible o vencido. Solicita una validación nueva.');
      a.attempts++;const actual=createHash('sha256').update(a.salt+String(code)).digest();
      if(!/^[0-9]{8}$/.test(String(code))||!timingSafeEqual(actual,Buffer.from(a.challengeHash,'hex'))){write(d);throw Error('Código incorrecto.');}
      r.approval={state:'approved',credentialHash:u.hash,approvedAt:new Date().toISOString(),email:SUPPORT_EMAIL,requestId:a.requestId};
      d.access_audit=[...(d.access_audit||[]),{userId:u.id,event:'support_approval',at:r.approval.approvedAt,requestId:a.requestId,email:SUPPORT_EMAIL}];write(d);return {...view(r),loginTime:Date.now()};
    },
    bootstrap(sender,{name,password,legacyPin}){
      return attempt('bootstrap',()=>{
        const d=read();if(d.users?.length)throw new Error('Los usuarios ya están configurados.');
        if(String(legacyPin)!==String(d.settings?.managerPin||'2026'))throw new Error('PIN de Gerencia anterior incorrecto.');
        if(!String(name||'').trim())throw new Error('Ingresa el nombre de Gerencia.');
        const u={id:randomUUID(),name:name.trim(),role:'Gerente',...credential(password)};
        d.users=[u];delete d.settings.managerPin;write(d);sessions.set(sender,{id:u.id,hash:u.hash});return {...view(u),loginTime:Date.now()};
      });
    },
    login(sender,{id,password}){
      return attempt('login:'+id,()=>{const u=users().find(u=>u.id===id);if(!verify(password,u))throw new Error('Usuario o contraseña incorrectos.');sessions.set(sender,{id:u.id,hash:u.hash});return {...view(u),loginTime:Date.now()};});
    },
    logout(sender){sessions.delete(sender);return true;},
    requireUser,
    createUser(sender,{name,role,password,brokerName}){
      requireUser(sender,true);const d=read();name=String(name||'').trim();
      if(!name||name.length>100)throw new Error('Ingresa un nombre de hasta 100 caracteres.');
      if(d.users.some(u=>normalize(u.name)===normalize(name)))throw new Error('Ya existe un usuario con ese nombre.');
      if(!['Vendedor','Gerente','Broker'].includes(role))throw new Error('Rol no válido.');
      brokerName=String(brokerName||'').trim();
      if(role==='Broker'){const brokers=[1,2,3].map(n=>String(d.settings?.['broker'+n+'Name']||'').trim()).filter(Boolean);if(!brokers.includes(brokerName))throw Error('Selecciona un broker autorizado para esta cuenta.');if(d.users.some(u=>u.role==='Broker'&&u.brokerName===brokerName))throw Error('Ese broker ya tiene una cuenta asignada.');}else brokerName='';
      const temporaryPassword=password||randomBytes(12).toString('base64url');
      const u={id:randomUUID(),name,role,brokerName,...credential(temporaryPassword),mustChangePassword:true};
      d.users.push(u);write(d);return {user:view(u),temporaryPassword};
    },
    reset(sender,id){
      const manager=requireUser(sender,true);if(id===manager.id)throw new Error('Usa Cambiar mi contraseña para tu cuenta.');
      const d=read(),u=d.users.find(u=>u.id===id);if(!u)throw new Error('Usuario no encontrado.');
      const temporaryPassword=randomBytes(12).toString('base64url');Object.assign(u,credential(temporaryPassword),{mustChangePassword:true,approval:{state:'pending'}});write(d);
      return {user:view(u),temporaryPassword};
    },
    changePassword(sender,{currentPassword,password}){
      const d=read(),s=sessions.get(sender),u=d.users?.find(u=>u.id===s?.id&&u.hash===s.hash);
      if(!verify(currentPassword,u))throw new Error('Contraseña actual incorrecta.');
      if(password===currentPassword)throw new Error('Elige una contraseña distinta.');
      Object.assign(u,credential(password),{mustChangePassword:false,approval:{state:'pending'}});write(d);sessions.set(sender,{id:u.id,hash:u.hash});return {...view(u),loginTime:Date.now()};
    }
  };
}
module.exports={createAuth,credential,verify};
