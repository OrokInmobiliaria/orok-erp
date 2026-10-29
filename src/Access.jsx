import React,{useState,useEffect} from 'react';
import {SupportMailSettings} from './AccessValidation';
import {Eye,EyeOff} from 'lucide-react';

export function LoginScreen({onLogin}){
  const [info,setInfo]=useState(null),[id,setId]=useState(''),[name,setName]=useState(''),[password,setPassword]=useState(''),[showPassword,setShowPassword]=useState(false),[startModule,setStartModule]=useState('crm'),[legacyPin,setLegacyPin]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{
    if(!window.crmAuth){setError('Abre esta versión desde la aplicación de escritorio actualizada.');return;}
    window.crmAuth.logout().then(()=>window.crmAuth.info()).then(setInfo).catch(e=>setError(e.message));
  },[]);
  const selectedUser=info?.users?.find(user=>user.id===id);
  const canChooseModule=!info?.setupRequired&&selectedUser?.role==='Gerente';
  async function submit(e){e.preventDefault();setBusy(true);setError('');try{const user=info.setupRequired?await window.crmAuth.bootstrap({name,password,legacyPin}):await window.crmAuth.login({id,password});onLogin({...user,startModule:user.role==='Gerente'?startModule:'crm'});}catch(e){setError(e.message);}finally{setBusy(false);}}
  return <div className="access-screen" style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'var(--orok-bg)'}}><div className="orok-card" style={{width:'100%',maxWidth:420}}>
    <h1 className="orok-logo-text" style={{textAlign:'center'}}>ÖRÖK</h1>
    {canChooseModule?<div style={{display:'flex',alignItems:'center',gap:5,margin:'10px 0 14px',fontSize:16}}>
      <span>Acceso a</span>
      <select aria-label="Módulo de acceso" value={startModule} onChange={e=>setStartModule(e.target.value)} style={{minWidth:0,maxWidth:'100%',border:0,borderRadius:9,background:'rgba(148,163,184,.10)',color:'inherit',font:'inherit',fontWeight:600,padding:'5px 28px 5px 8px',cursor:'pointer'}}>
        <option value="evaluador">Evaluador Inmobiliario</option>
        <option value="crm">CRM Inmobiliario</option>
        <option value="contabilidad">Contabilidad y Finanzas</option>
      </select>
    </div>:<p>Acceso al CRM Inmobiliario</p>}
    {error&&<p role="alert" style={{color:'#991b1b'}}>{error}</p>}
    {!info?(!error&&<p>Cargando usuarios…</p>):<form onSubmit={submit}>
      {info.setupRequired?<><p>Activa Gerencia con el código inicial entregado para este CRM. Luego podrás crear las cuentas de los asesores.</p><label>Nombre de Gerencia<input className="orok-input" value={name} onChange={e=>setName(e.target.value)} required maxLength={100} autoComplete="username"/></label><label>Código inicial de activación<input type="password" className="orok-input" value={legacyPin} onChange={e=>setLegacyPin(e.target.value)} required/></label></>:<label>Usuario<select className="orok-input" value={id} onChange={e=>{setId(e.target.value);const user=info.users.find(item=>item.id===e.target.value);if(user?.role!=='Gerente')setStartModule('crm');}} required><option value="">Seleccionar usuario</option>{info.users.map(u=><option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}</select></label>}
      <label>{info.setupRequired?'Nueva contraseña (mínimo 8 caracteres)':'Contraseña'}<span style={{display:'block',position:'relative'}}><input type={showPassword?'text':'password'} className="orok-input" style={{paddingRight:52}} value={password} onChange={e=>setPassword(e.target.value)} required minLength={info.setupRequired?8:1} maxLength={128} autoComplete={info.setupRequired?'new-password':'current-password'}/><button type="button" aria-label={showPassword?'Ocultar contraseña':'Mostrar contraseña'} title={showPassword?'Ocultar contraseña':'Mostrar contraseña'} onClick={()=>setShowPassword(value=>!value)} style={{position:'absolute',right:8,top:'calc(50% - 5px)',transform:'translateY(-50%)',border:0,background:'transparent',color:'var(--orok-brand)',cursor:'pointer',padding:8,display:'grid',placeItems:'center'}}>{showPassword?<EyeOff size={20}/>:<Eye size={20}/>}</button></span></label>
      <button disabled={busy} className="orok-btn orok-btn-primary" style={{width:'100%'}}>{busy?'Verificando…':info.setupRequired?'Activar Gerencia':'Iniciar Sesión'}</button>
    </form>}
  </div></div>;
}

export function PasswordChange({onComplete,onCancel,required=false}){
  const [currentPassword,setCurrent]=useState(''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  async function submit(e){e.preventDefault();if(password!==confirm)return setError('Las contraseñas nuevas no coinciden.');setBusy(true);try{const u=await window.crmAuth.changePassword({currentPassword,password});onComplete(u);}catch(e){setError(e.message);}finally{setBusy(false);}}
  return <div className="orok-card" style={{maxWidth:440,margin:'40px auto'}}><h2>Cambiar mi contraseña</h2>{required&&<p>Cambia la contraseña temporal para ingresar al CRM.</p>}<form onSubmit={submit}>
    <label>Contraseña actual<input className="orok-input" type="password" required value={currentPassword} onChange={e=>setCurrent(e.target.value)} autoComplete="current-password"/></label>
    <label>Nueva contraseña<input className="orok-input" type="password" required minLength={8} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)} autoComplete="new-password"/></label>
    <label>Repetir nueva contraseña<input className="orok-input" type="password" required value={confirm} onChange={e=>setConfirm(e.target.value)} autoComplete="new-password"/></label>
    {error&&<p role="alert" style={{color:'#991b1b'}}>{error}</p>}<div style={{display:'flex',gap:10}}><button disabled={busy} className="orok-btn orok-btn-primary">Guardar contraseña</button><button type="button" onClick={onCancel} className="orok-btn orok-btn-secondary">{required?'Cambiar usuario':'Cancelar'}</button></div>
  </form></div>;
}

export function UserManagement({currentUser,settings,onSettings}){
  const [users,setUsers]=useState([]),[name,setName]=useState(''),[role,setRole]=useState('Vendedor'),[brokerName,setBrokerName]=useState(''),[password,setPassword]=useState(''),[issued,setIssued]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const brokers=[1,2,3].map(n=>String(settings['broker'+n+'Name']||'').trim()).filter(Boolean);
  const sellers=users.filter(u=>u.role==='Vendedor');
  const refresh=()=>window.crmAuth.info().then(i=>setUsers(i.users));
  useEffect(()=>{refresh().catch(e=>setError(e.message));},[]);
  async function run(fn){setBusy(true);setError('');setIssued(null);try{setIssued(await fn());await refresh();setPassword('');setName('');setBrokerName('');}catch(e){setError(e.message);}finally{setBusy(false);}}

  return <div className="orok-card"><h2>Usuarios y contraseñas</h2><p>Gerencia crea los usuarios y restablece sus contraseñas. Cada usuario tiene una contraseña propia y necesita aprobación de soportetecnologico@orok.com.pe.</p>
    <form onSubmit={e=>{e.preventDefault();run(()=>window.crmAuth.createUser({name,role,password,brokerName}));}} style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
      <label>Nombre del nuevo usuario<input className="orok-input" required maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></label><label>Rol<select className="orok-input" value={role} onChange={e=>setRole(e.target.value)}><option>Vendedor</option><option value="Broker">Broker</option><option value="Gerente">Gerencia</option></select></label>
      {role==='Broker'&&<label>Broker autorizado<select className="orok-input" required value={brokerName} onChange={e=>setBrokerName(e.target.value)}><option value="">Seleccionar broker</option>{brokers.map(b=><option key={b}>{b}</option>)}</select></label>}{role==='Broker'&&!brokers.length&&<p role="alert" style={{gridColumn:'1 / -1',color:'#991b1b'}}>Primero registra el nombre del broker en Reglas Comerciales Fijas.</p>}
      <label style={{gridColumn:'1 / -1'}}>Contraseña temporal (dejar vacío para generar)<input type="password" className="orok-input" minLength={8} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)} autoComplete="new-password"/></label><button disabled={busy} className="orok-btn orok-btn-primary">Crear usuario</button>
    </form>
    <SupportMailSettings/>

    {error&&<p role="status">{error}</p>}
    {issued&&<div style={{background:'#f5ebe6',padding:16,borderRadius:12,marginTop:15}}><strong>Cuenta pendiente: {issued.user.name}</strong><p>Contraseña temporal (entrega privada al usuario):</p><p style={{userSelect:'all'}}>{issued.temporaryPassword}</p><p style={{fontSize:12}}>El usuario debe elegir su cuenta al ingresar, cambiar esta clave temporal y solicitar validación a soportetecnologico@orok.com.pe. No podrá usar el CRM hasta que soporte apruebe la cuenta y su clave definitiva.</p></div>}

    <div style={{marginTop:20,padding:'14px',background:'#faf7f5',borderRadius:12}}><strong>Vendedor de planta predeterminado</strong><p style={{fontSize:12,margin:'6px 0'}}>Los leads nuevos, importados e históricos sin responsable se asignan a esta cuenta, salvo que ingrese un Broker.</p><select aria-label="Vendedor de planta predeterminado" className="orok-input" value={settings.defaultSalesOwner||settings.agentName||''} onChange={e=>onSettings({...settings,defaultSalesOwner:e.target.value})}><option value="">Seleccionar vendedor</option>{sellers.map(u=><option key={u.id}>{u.name}</option>)}</select>{!sellers.length&&<p style={{fontSize:12,color:'#991b1b'}}>Crea primero una cuenta de tipo Vendedor.</p>}</div>
    <div style={{marginTop:20}}>{users.map(u=><div key={u.id} style={{display:'flex',justifyContent:'space-between',gap:12,padding:'12px 0',borderTop:'1px solid #e7dfd8'}}><span>{u.name} · {u.role}{u.brokerName?' · '+u.brokerName:''} · {u.approvalRequired?'Pendiente de soporte':'Validado'}</span>{u.id!==currentUser.id&&<button disabled={busy} className="orok-btn orok-btn-secondary" onClick={()=>{if(window.confirm('¿Restablecer la contraseña de '+u.name+'? La anterior dejará de funcionar.'))run(()=>window.crmAuth.reset(u.id));}}>Restablecer contraseña</button>}</div>)}</div>
  </div>;
}
