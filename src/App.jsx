import {LeadScoreBadge} from './LeadScoreBadge';
import CrmLolaPanel from './CrmLolaPanel';
import LeadComments from './LeadComments';
import MarketingExpenses from './MarketingExpenses';
import useToolLinks from './useToolLinks';
import React, { useState, useEffect, useRef } from 'react';
import { api } from './dataService';
import { googleCalendarUrlForLead } from './calendarInvite.mjs';
import BusinessDashboard from './BusinessDashboard';
import WeeklyAnalysis from './WeeklyAnalysis';
import LeadLifecycle from './LeadLifecycle';
import WhatsAppConversation,{Connection as WhatsAppConnection} from './WhatsAppConversation';
import SocialConnections from './SocialConnections';
import SocialInbox from './SocialInbox';
import AdsDashboard from './AdsDashboard';
import CampaignStudio from './CampaignStudio';
import MarketingAssistant from './MarketingAssistant';
import {GretaHoy, GretaTendencias, GretaPublicar, GretaKpis, GretaConfig, GretaAssistant, GretaFormularios} from './Greta'; // R42 · módulo Marketing con G.R.E.T.A
import PowerDashboard from './PowerDashboard';
import GroupedNav from './GroupedNav';
import LeadExportMenu from './LeadExportMenu';
import SocialChatPanel from './SocialChatPanel';
import ChannelIcon from './ChannelIcon';
import {indexByLead,channelsForLead,CHANNELS} from './chatChannels.mjs';
import {searchLeads,socialHandles} from './leadSearch.mjs';
import LeadSearchPalette from './LeadSearchPalette';
import AppearanceMenu from './AppearanceMenu';
import HelpCenter from './HelpCenter';
import MoraPanel from './MoraPanel';
import LolaAssistant from './LolaAssistant';
import ConexionesIA from './ConexionesIA'; // R44 · conector del ERP para Claude
import OperacionesLola from './OperacionesLola'; // R45 · L.O.L.A Operaciones
import Proyectos, {ProyectoSelector} from './Proyectos.jsx';
import EstrategiaPrecios from './EstrategiaPrecios'; // R48 · Ventas › Estrategia de precios
import PrecioEspecial from './PrecioEspecial'; // R48 · precio especial con aprobación de Gerencia
import {modulesFor, moduleOf, MODULES, canonicalTab} from './navModel.mjs';
import AccessValidation from './AccessValidation';
import {LoginScreen,PasswordChange,UserManagement} from './Access';
const isSold=u=>!!u.sold_lead_id||['SOLD','VENDIDO','VENDIDA','VENTA'].includes(String(u.status||'').toUpperCase());
import { LayoutDashboard, KanbanSquare, Building2, Wrench, Settings, MessageCircle, Phone, Calendar, Gift, Clock, FileText, FileSpreadsheet, FolderOpen, Save, Cloud, DownloadCloud, UploadCloud, Users, Image as ImageIcon, Sparkles, Bot, LogOut, Lock, PieChart, Activity, DollarSign, UserPlus, Upload, Trash2, Printer, Wallet, TrendingDown, Megaphone, Target, BarChart2, Search, ChevronsDown, ChevronsUp, BookOpen } from 'lucide-react';

const FUNNEL_GROUPS = {Marketing:['Lead Inicial','Contactado','Información enviada','MQL','Cita'],Ventas:['Cita Asistida','Calificado','Evaluación GNB','Separación','Inicial','Minuta','Venta'],Seguimiento:['Seguimiento']};
const FUNNEL_STAGES=Object.values(FUNNEL_GROUPS).flat();
const FOLLOW_UP_STAGES=FUNNEL_GROUPS.Seguimiento;
const OPERATIONAL_STAGES=[...FUNNEL_STAGES,'Perdido','Desestimado'];
const CLOSED_LOST_STAGES=['Perdido','Desestimado'];
const FOLLOW_UP_COLUMNS=[
  {key:'followup-no-answer',status:'Seguimiento',substatus:'No contesta',label:'No contesta'},
  {key:'followup-future',status:'Seguimiento',substatus:'Seguimiento futuro',label:'Seguimiento futuro'},
  {key:'followup-active',status:'Seguimiento',label:'Seguimiento activo'}
];
const LEAD_SOURCES = ['Facebook', 'Instagram', 'TikTok', 'Local (Showroom)', 'Broker Externo', 'Web'];
const PROJECT_STAGES = ['Preventa en planos', 'Venta inicio de obra', 'Venta durante la obra', 'Acabados'];
const SEMAPHORE_COLORS={Verde:'#16a34a',Amarillo:'#d97706',Rojo:'#dc2626',Crítico:'#7f1d1d'};
const BRAND_PALETTES=[
  {id:'orok-tierra',name:'ÖRÖK Tierra',brand:'#85442A',accent:'#B7793E',background:'#FCF9F6',surface:'#FFFFFF',text:'#292524',soft:'#F5EBE6',border:'#E7DFD8'},
  {id:'cobre-marfil',name:'Cobre y Marfil',brand:'#7C432A',accent:'#C6905A',background:'#FFF9F0',surface:'#FFFFFF',text:'#30241D',soft:'#F7E9D7',border:'#E8D2BC'},
  {id:'olivo-arena',name:'Olivo y Arena',brand:'#4F5D3A',accent:'#A88645',background:'#F7F5EC',surface:'#FFFFFF',text:'#263126',soft:'#ECE9D8',border:'#D8D2B9'},
  {id:'petroleo-dorado',name:'Petróleo y Dorado',brand:'#0F4C5C',accent:'#D59B4A',background:'#F2F8F8',surface:'#FFFFFF',text:'#183238',soft:'#DDECEF',border:'#C7DDE1'},
  {id:'borgona-rose',name:'Borgoña y Rosé',brand:'#6B2337',accent:'#B96A73',background:'#FBF3F5',surface:'#FFFFFF',text:'#351C24',soft:'#F2DFE4',border:'#DFC4CC'}
];
const applyBrandTheme=data=>{
 const palette=BRAND_PALETTES.find(item=>item.id===data.brandPalette)||BRAND_PALETTES[0];
 const values={
  '--orok-brand':data.brandColor||palette.brand,
  '--orok-accent':data.brandAccentColor||palette.accent,
  '--orok-bg':data.brandBackgroundColor||palette.background,
  '--orok-card-bg':data.brandSurfaceColor||palette.surface,
  '--orok-text':data.brandTextColor||palette.text,
  '--orok-soft':data.brandSoftColor||palette.soft,
  '--orok-border':data.brandBorderColor||palette.border
 };
 for(const [key,value] of Object.entries(values))document.documentElement.style.setProperty(key,value);
};
const semaphoreColor=severity=>SEMAPHORE_COLORS[severity]||'#94a3b8';
const semaphoreText=severity=>({Verde:'En plazo',Amarillo:'Atención próxima',Rojo:'Acción vencida',Crítico:'Atención urgente'})[severity]||'Sin evaluar';
const SLA_DAYS=[['mon','Lunes'],['tue','Martes'],['wed','Miércoles'],['thu','Jueves'],['fri','Viernes'],['sat','Sábado'],['sun','Domingo']];
const DEFAULT_SLA_SCHEDULE=Object.fromEntries(SLA_DAYS.map(([key])=>[key,[{start:'10:00',end:'13:00'},{start:'14:00',end:'21:00'}]]));
const clone=value=>JSON.parse(JSON.stringify(value));
const clock=value=>{const minutes=Number(value);return String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0');};
const clockMinutes=value=>{const [hours,minutes]=String(value||'00:00').split(':').map(Number);return hours*60+minutes;};
const normalizeDuplicateText=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es-PE').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
const normalizeDuplicatePhone=value=>String(value||'').replace(/\D/g,'').replace(/^51(?=9\d{8}$)/,'');
const duplicateReason=(first,second)=>{
  const dni=String(first?.dni||'').replace(/\D/g,''),otherDni=String(second?.dni||'').replace(/\D/g,'');
  const phone=normalizeDuplicatePhone(first?.phone),otherPhone=normalizeDuplicatePhone(second?.phone);
  const email=String(first?.email||'').trim().toLowerCase(),otherEmail=String(second?.email||'').trim().toLowerCase();
  const name=normalizeDuplicateText(first?.name),otherName=normalizeDuplicateText(second?.name);
  if(dni&&dni===otherDni)return 'DNI';
  if(phone&&phone===otherPhone)return 'teléfono';
  if(email&&email===otherEmail)return 'correo';
  if(name&&name.split(' ').length>=2&&name===otherName)return 'nombre y apellidos';
  return '';
};
const duplicateCandidates=(lead,rows)=>rows.filter(other=>other.id!==lead.id).map(other=>({lead:other,reason:duplicateReason(lead,other)})).filter(match=>match.reason);
const parseDuplicateLeadError=message=>{const raw=String(message||''),prefix='DUPLICATE_LEAD:';if(!raw.includes(prefix))return null;try{return JSON.parse(atob(raw.slice(raw.indexOf(prefix)+prefix.length)));}catch{return null;}};

const limaSlaInput=value=>value&&Number.isFinite(Date.parse(value))?new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Lima',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(value)).replace(' ','T'):'';
function SLASettings({settings}){
  const initial=()=>{const saved=settings.sla||{};return {...saved,enabled:saved.enabled===true,activated_at:saved.activated_at||'',policy:{firstResponseMinutes:10,warningMinutes:5,criticalMinutes:60,requiredCadenceAttempts:7,...(saved.policy||{})},schedule:{...clone(DEFAULT_SLA_SCHEDULE),...(saved.schedule||{})}};};
  const [draft,setDraft]=useState(initial),[message,setMessage]=useState(''),[preview,setPreview]=useState(null),[allPreview,setAllPreview]=useState(null),[busy,setBusy]=useState(false);
  useEffect(()=>setDraft(initial()),[JSON.stringify(settings.sla||{})]);
  const updateDay=(day,windows)=>setDraft(value=>({...value,schedule:{...value.schedule,[day]:windows}}));
  const setSlot=(day,index,key,value)=>{const windows=(draft.schedule[day]||[]).map(item=>({...item}));windows[index][key]=clock(value);const start=clockMinutes(windows[index].start),end=clockMinutes(windows[index].end);if(start>=end)windows[index][key]=clock(key==='start'?end-15:start+15);updateDay(day,windows);};
  async function save(event){event.preventDefault();setBusy(true);setMessage('');try{await api.updateSettings({...settings,sla:draft});setMessage(draft.enabled?'SLA activado solo para leads ingresados desde la fecha indicada.':'Configuración guardada; el SLA sigue desactivado.');}catch(error){setMessage(error.message);}finally{setBusy(false);}}
  async function simulate(){setBusy(true);setMessage('');try{if(!draft.activated_at)throw Error('Define primero la fecha y hora de activación para la simulación.');setPreview(await api.previewSla({...draft,enabled:true}));}catch(error){setMessage(error.message);}finally{setBusy(false);}}
  async function simulateAll(){setBusy(true);setMessage('');try{const previewDraft={...draft,enabled:true,activated_at:draft.activated_at||new Date().toISOString()};setAllPreview(await api.previewAllSla(previewDraft));}catch(error){setMessage(error.message);}finally{setBusy(false);}}
  async function applyAll(){setBusy(true);setMessage('');try{if(!draft.activated_at)throw Error('Define la fecha y hora de inicio antes de aplicar el SLA. La simulación no la necesita ni guarda cambios.');await api.updateSettings({...settings,sla:{...draft,enabled:true}});const result=await api.applyAllSla();setMessage(`Se actualizaron ${result.updated||0} semáforos. No se movió ninguna tarjeta ni se alteró el embudo.`);setAllPreview(null);}catch(error){setMessage(error.message);}finally{setBusy(false);}}
  return <form className="orok-card" onSubmit={save} style={{display:'grid',gap:14}}>
    <div><h3 style={{margin:'0 0 5px'}}>Semáforo y cola diaria</h3><p style={{fontSize:13,margin:0,color:'#57534e'}}>La regla evalúa solo leads recibidos desde su activación. No lee ni modifica el Kanban al abrirlo; se revisa en segundo plano cada 30 minutos.</p></div>
    <label style={{display:'flex',alignItems:'center',gap:8}}><input type="checkbox" checked={draft.enabled} onChange={event=>setDraft({...draft,enabled:event.target.checked})}/> Activar semáforo y movimientos operativos</label>
    <label>Inicio de aplicación (Lima)<input required className="orok-input" type="datetime-local" value={limaSlaInput(draft.activated_at)} onChange={event=>setDraft({...draft,activated_at:event.target.value?new Date(event.target.value+'-05:00').toISOString():''})}/></label>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:10}}><label>Primera atención (min)<input className="orok-input" type="number" min="1" max="120" value={draft.policy.firstResponseMinutes} onChange={event=>setDraft({...draft,policy:{...draft.policy,firstResponseMinutes:Number(event.target.value)}})}/></label><label>Aviso amarillo (min antes)<input className="orok-input" type="number" min="1" max="60" value={draft.policy.warningMinutes} onChange={event=>setDraft({...draft,policy:{...draft.policy,warningMinutes:Number(event.target.value)}})}/></label><label>Crítico tras vencimiento (min)<input className="orok-input" type="number" min="15" max="480" value={draft.policy.criticalMinutes} onChange={event=>setDraft({...draft,policy:{...draft.policy,criticalMinutes:Number(event.target.value)}})}/></label></div>
    <p style={{fontSize:12,margin:0}}>Cadencia sin respuesta: minuto 0, 15–30 min, 2 h, día 1, 2, 4 y 7. Con siete intentos registrados, sin contacto efectivo, el sistema puede pasar únicamente de <strong>Lead Inicial</strong> a <strong>Seguimiento / No contesta</strong>.</p>
    <div><p style={{fontSize:12,margin:'0 0 8px'}}>Horario base: lunes a domingo. Gerencia desmarca un día cuando sea descanso y ajusta cada turno con los deslizadores.</p><div style={{display:'grid',gap:8}}>{SLA_DAYS.map(([day,label])=>{const windows=draft.schedule[day]||[],morning=windows[0],afternoon=windows[1];const renderSlot=(slot,index,min,max,title)=>slot&&<div style={{display:'grid',gridTemplateColumns:'92px 1fr auto',alignItems:'center',gap:8}}><span style={{fontSize:12}}>{title}</span><input aria-label={label+' '+title} type="range" min={min} max={max} step="15" value={clockMinutes(slot.start)} onChange={event=>setSlot(day,index,'start',event.target.value)}/><span style={{fontSize:12,whiteSpace:'nowrap'}}>{slot.start}–{slot.end}</span><span/><input aria-label={label+' '+title+' fin'} type="range" min={min} max={max} step="15" value={clockMinutes(slot.end)} onChange={event=>setSlot(day,index,'end',event.target.value)}/><span/></div>;return <div key={day} style={{border:'1px solid #e7dfd8',borderRadius:10,padding:10}}><label style={{display:'flex',gap:8,alignItems:'center',fontWeight:700}}><input type="checkbox" checked={windows.length>0} onChange={event=>updateDay(day,event.target.checked?clone(DEFAULT_SLA_SCHEDULE[day]):[])}/>{label}{windows.length===0&&<small style={{fontWeight:400,color:'#78716c'}}> · Descanso</small>}</label>{windows.length>0&&<div style={{marginTop:7,display:'grid',gap:4}}>{renderSlot(morning,0,600,780,'Turno 1')}{renderSlot(afternoon,1,840,1260,'Turno 2')}</div>}</div>;})}</div></div>
    <div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button type="button" disabled={busy} className="orok-btn orok-btn-secondary" onClick={simulate}>{busy?'Evaluando…':'Probar desde activación'}</button><button type="button" disabled={busy} className="orok-btn orok-btn-secondary" onClick={simulateAll}>{busy?'Evaluando…':'Simular todo el Kanban'}</button><button disabled={busy} className="orok-btn orok-btn-primary">{busy?'Guardando…':'Guardar SLA'}</button></div>
    {preview&&<div role="status" style={{padding:12,borderRadius:10,background:'#f5f3ff',fontSize:13}}><strong>Prueba desde activación:</strong> {preview.eligible} lead(s) dentro del alcance, {preview.updated} semáforo(s) que cambiarían y {preview.moved} movimiento(s) posible(s) bajo la regla vigente.</div>}
    {allPreview&&<div role="status" style={{padding:12,borderRadius:10,background:'#ecfdf5',border:'1px solid #a7f3d0',fontSize:13}}><strong>Simulación completa, sin cambios:</strong> {allPreview.eligible} lead(s) activos evaluados; {allPreview.updated} semáforo(s) cambiarían. No se moverá ninguna tarjeta ni se modificará el embudo.<div style={{display:'flex',gap:10,flexWrap:'wrap',marginTop:8}}>{Object.entries(allPreview.bySeverity||{}).map(([severity,total])=><span key={severity}><strong style={{color:semaphoreColor(severity)}}>{severity}</strong>: {total}</span>)}</div>{allPreview.leads?.length>0&&<ul style={{margin:'8px 0 0',maxHeight:170,overflowY:'auto'}}>{allPreview.leads.map(lead=><li key={lead.id}>{lead.lead_number||lead.id} · {lead.name||'Sin nombre'} → <strong style={{color:semaphoreColor(lead.severity)}}>{lead.severity}</strong>{lead.manual?' (manual, se conserva)':''} · {lead.reason}</li>)}</ul>}<button type="button" disabled={busy} className="orok-btn orok-btn-primary" style={{marginTop:10}} onClick={applyAll}>{busy?'Aplicando…':'Aplicar solo estos semáforos'}</button></div>}{message&&<p role="status" style={{margin:0}}>{message}</p>}
  </form>;
}

function AIIntegrationMenu({settings}){
  const initial=()=>({provider:settings.aiIntegration?.provider||'Gemini',botOrchestrator:settings.aiIntegration?.botOrchestrator||settings.aiIntegration?.whatsappProvider||'LeadCenter',botEngine:settings.aiIntegration?.botEngine||'Proveedor externo',summaryEnabled:settings.aiIntegration?.summaryEnabled!==false,summaryPrompt:settings.aiIntegration?.summaryPrompt||'Resume la conversación comercial. Identifica necesidad puntual, interés, objeciones y próxima acción sugerida. No inventes datos.',meta:{facebook:settings.aiIntegration?.meta?.facebook===true,instagram:settings.aiIntegration?.meta?.instagram===true,commentMode:settings.aiIntegration?.meta?.commentMode||'bot_handoff',publicReply:settings.aiIntegration?.meta?.publicReply||'¡Gracias por escribirnos! Te enviamos un mensaje privado para continuar la atención.',privateReply:settings.aiIntegration?.meta?.privateReply||'Gracias por tu interés en ÖRÖK. Para atenderte de inmediato, continúa por WhatsApp:',whatsappUrl:settings.aiIntegration?.meta?.whatsappUrl||'',reviewBeforeLead:settings.aiIntegration?.meta?.reviewBeforeLead!==false}});
  const [draft,setDraft]=useState(initial);
  const [credentials,setCredentials]=useState({webhookUrl:'',responseWebhookUrl:'',apiKey:'',webhookSecret:''});
  const [credentialMessage,setCredentialMessage]=useState('');
  const [message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>setDraft(initial()),[JSON.stringify(settings.aiIntegration||{})]);
  async function save(event){event.preventDefault();setBusy(true);setMessage('');try{const url=draft.meta.whatsappUrl.trim();if(url&&!/^https:\/\/(wa\.me|api\.whatsapp\.com)\//i.test(url))throw Error('Usa un enlace seguro de WhatsApp: https://wa.me/... o https://api.whatsapp.com/...');await api.updateSettings({...settings,aiIntegration:{...draft,meta:{...draft.meta,whatsappUrl:url,connectionStatus:'awaiting_credentials'},summaryMode:'manual',webhookStatus:'disabled'}});setMessage('Preparación guardada. Facebook, Instagram y WhatsApp siguen sin conexión hasta registrar las credenciales privadas.');}catch(error){setMessage(error.message);}finally{setBusy(false);}}
  async function saveCredentials(event){
    event.preventDefault();setBusy(true);setCredentialMessage('Guardando conexión…');
    try{
      if(!credentials.webhookUrl.trim())throw Error('Completa la URL del webhook antes de guardar.');
      if((draft.botOrchestrator==='n8n'||credentials.webhookSecret.trim())&&credentials.webhookSecret.trim().length<24)throw Error('El secreto de firma debe tener al menos 24 caracteres. Usa la misma clave aleatoria de 32 o más en CRM y n8n.');
      const result=await api.saveIntegrationCredentials({provider:draft.botOrchestrator,engine:draft.botEngine,...credentials});
      setCredentials(value=>({...value,apiKey:'',webhookSecret:''}));
      setCredentialMessage('Credenciales guardadas en el servidor privado. La automatización sigue desactivada.');
      try{await api.updateSettings({...settings,aiIntegration:{...draft,meta:{...draft.meta,whatsappUrl:draft.meta.whatsappUrl.trim(),connectionStatus:'configured_private'},summaryMode:'manual',webhookStatus:'configured_private',credentialsConfiguredAt:result.saved_at}});}
      catch{setCredentialMessage('Credenciales guardadas en el servidor privado. Falta actualizar el indicador de conexión; no vuelvas a generar la clave.');}
    }catch(error){setCredentialMessage(error.message||'No se pudo guardar la conexión.');}finally{setBusy(false);}
  }
  const nodeStyle={padding:16,border:'1px solid #e7dfd8',borderRadius:14,background:'#fffdfb'};
  return <div style={{maxWidth:900,margin:'0 auto',display:'grid',gap:20}}>
    <div className="orok-card"><h2 style={{marginTop:0,display:'flex',alignItems:'center',gap:8}}><Bot size={24}/> IA y automatizaciones</h2><p style={{color:'#57534e'}}>Panel exclusivo de Gerencia. Configura los nodos y deja la conexión apagada hasta contar con los datos técnicos del proveedor.</p></div>
    <form className="orok-card" onSubmit={save} style={{display:'grid',gap:14}}>
      <div style={nodeStyle}><strong>1 · Resumen IA en la ficha</strong><p style={{fontSize:13,color:'#57534e'}}>Disponible para todos los usuarios solo cuando Gerencia lo habilita. Cada resumen se solicita manualmente y se guarda como comentario histórico.</p><label style={{display:'flex',gap:8,alignItems:'center'}}><input type="checkbox" checked={draft.summaryEnabled} onChange={e=>setDraft({...draft,summaryEnabled:e.target.checked})}/> Activar resumen IA para los usuarios</label><label>Proveedor<select className="orok-input" value={draft.provider} onChange={e=>setDraft({...draft,provider:e.target.value})}><option>Gemini</option><option disabled>Otro proveedor · próximamente</option></select></label><label>Prompt de resumen e interpretación<textarea className="orok-input" rows="5" maxLength="3000" value={draft.summaryPrompt} onChange={e=>setDraft({...draft,summaryPrompt:e.target.value})}/></label><p style={{fontSize:12,marginBottom:0}}>Clave: se configura en Ajustes de Gerencia. No se muestra ni se comparte con vendedores.</p></div>
      <div style={nodeStyle}><strong>2 · Canales sociales y WhatsApp</strong><p style={{fontSize:13,color:'#57534e'}}>Prepara la respuesta a comentarios, pero no publica ni envía mensajes hasta que Gerencia conecte oficialmente Meta y el proveedor de WhatsApp.</p><div style={{display:'flex',gap:14,flexWrap:'wrap'}}><label style={{display:'flex',gap:8,alignItems:'center'}}><input type="checkbox" checked={draft.meta.facebook} onChange={e=>setDraft({...draft,meta:{...draft.meta,facebook:e.target.checked}})}/> Preparar Facebook</label><label style={{display:'flex',gap:8,alignItems:'center'}}><input type="checkbox" checked={draft.meta.instagram} onChange={e=>setDraft({...draft,meta:{...draft.meta,instagram:e.target.checked}})}/> Preparar Instagram</label></div><label>Modo al recibir un comentario<select className="orok-input" value={draft.meta.commentMode} onChange={e=>setDraft({...draft,meta:{...draft.meta,commentMode:e.target.value}})}><option value="bot_handoff">Bot responde y deriva a WhatsApp</option><option value="manual">Solo registrar para respuesta humana</option><option value="review">Bot prepara, Gerencia revisa antes de enviar</option></select></label><label>Respuesta pública automática<textarea className="orok-input" rows="2" maxLength="500" value={draft.meta.publicReply} onChange={e=>setDraft({...draft,meta:{...draft.meta,publicReply:e.target.value}})}/></label><label>Mensaje privado / derivación<textarea className="orok-input" rows="3" maxLength="1000" value={draft.meta.privateReply} onChange={e=>setDraft({...draft,meta:{...draft.meta,privateReply:e.target.value}})}/></label><label>Enlace de atención por WhatsApp<input className="orok-input" type="url" value={draft.meta.whatsappUrl} onChange={e=>setDraft({...draft,meta:{...draft.meta,whatsappUrl:e.target.value}})} placeholder="https://wa.me/51999999999"/></label><label style={{display:'flex',gap:8,alignItems:'center'}}><input type="checkbox" checked={draft.meta.reviewBeforeLead} onChange={e=>setDraft({...draft,meta:{...draft.meta,reviewBeforeLead:e.target.checked}})}/> Crear primero una interacción para revisión; no crear lead automático</label><div data-responsive-grid="true" style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:10}}><label>Orquestador del bot<select className="orok-input" value={draft.botOrchestrator} onChange={e=>setDraft({...draft,botOrchestrator:e.target.value})}><option>LeadCenter</option><option>n8n</option><option>Otro proveedor oficial</option></select></label><label>Motor que responde<select className="orok-input" value={draft.botEngine} onChange={e=>setDraft({...draft,botEngine:e.target.value})}><option>Proveedor externo</option><option>IA propia mediante n8n</option><option>Bot LeadCenter</option></select></label></div><p style={{fontSize:12,margin:0}}>Gemini queda reservado para los resúmenes solicitados desde la ficha. n8n puede recibir los webhooks oficiales, aplicar la IA y reglas aprobadas por Gerencia, responder y devolver el historial al CRM.</p><p style={{fontSize:12,marginBottom:0}}>Estado: <strong>{settings.aiIntegration?.webhookStatus==='configured_private'?'credenciales privadas configuradas':'pendiente de credenciales oficiales'}</strong>. Las claves, URL de webhook y secretos se guardan solo en el servidor privado.</p></div>
      <div style={{...nodeStyle,display:'grid',gap:10}}><strong>3 · Credenciales privadas del conector</strong><p style={{fontSize:13,margin:0,color:'#57534e'}}>Solo Gerencia puede registrar o reemplazar estos datos. Por seguridad se muestran vacíos al volver a abrir esta pantalla.</p><div data-responsive-grid="true" style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))',gap:10}}><label>URL del webhook<input className="orok-input" type="url" value={credentials.webhookUrl} onChange={e=>setCredentials({...credentials,webhookUrl:e.target.value})} placeholder="https://proveedor.com/webhooks/orok"/></label><label>URL de respuesta (opcional)<input className="orok-input" type="url" value={credentials.responseWebhookUrl} onChange={e=>setCredentials({...credentials,responseWebhookUrl:e.target.value})} placeholder="https://proveedor.com/responder"/></label><label>Llave de acceso / API key<input className="orok-input" type="password" autoComplete="new-password" value={credentials.apiKey} onChange={e=>setCredentials({...credentials,apiKey:e.target.value})} placeholder="Se guarda solo en el servidor"/></label><label>Secreto de firma<input className="orok-input" type="password" autoComplete="new-password" value={credentials.webhookSecret} onChange={e=>setCredentials({...credentials,webhookSecret:e.target.value})} placeholder="Se guarda solo en el servidor"/></label></div><button type="button" disabled={busy} className="orok-btn orok-btn-secondary" onClick={saveCredentials}>{busy?'Guardando…':'Guardar credenciales privadas'}</button>{credentialMessage&&<p role="status" aria-live="polite" style={{margin:0,padding:12,border:'1px solid #d6b9a7',borderRadius:8,fontWeight:600}}>{credentialMessage}</p>}</div>
      <div style={nodeStyle}><strong>4 · Reglas de seguridad</strong><p style={{fontSize:13,marginBottom:0}}>La IA solo propone resumen, necesidad e interés. No cambia columnas, subestados, citas, ventas o pérdidas. Todo movimiento comercial requiere confirmación de un usuario.</p></div>
      <button disabled={busy} className="orok-btn orok-btn-primary">{busy?'Guardando…':'Guardar preparación'}</button>{message&&<p role="status" style={{margin:0}}>{message}</p>}
    </form>
    <div className="orok-card"><WhatsAppConnection onSaved={()=>{}}/></div>
    <SLASettings settings={settings}/>
  </div>;
}

const formatMoneyPEN = (val) => new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', maximumFractionDigits: 0 }).format(val);
const formatLeadReceivedAt = value => {
  if(value===0||(typeof value==='string'&&/^\d+$/.test(value.trim())))return 'Sin fecha';
  const date=new Date(value);
  return Number.isFinite(date.getTime())&&date.getTime()>=Date.UTC(2000,0,1) ? new Intl.DateTimeFormat('es-PE',{timeZone:'America/Lima',day:'2-digit',month:'2-digit',year:'numeric',hour:'numeric',minute:'2-digit',hour12:true}).format(date) : 'Sin fecha';
};

const getStatusColor = (status) => {
  switch (status) {
    case 'Lead Inicial': return { bg: '#e7e5e4', text: '#57534e', bar: '#a8a29e' };
    case 'Perdido': case 'Desestimado': return { bg: '#fee2e2', text: '#991b1b', bar: '#ef4444' };
    case 'Seguimiento': return { bg: '#ffedd5', text: '#9a3412', bar: '#f97316' };
    case 'Información enviada': return { bg: '#e0e7ff', text: '#3730a3', bar: '#6366f1' };
    case 'Venta': return { bg: '#dcfce7', text: '#166534', bar: '#22c55e' };
    case 'Separación': case 'Inicial': return { bg: '#fef08a', text: '#854d0e', bar: '#eab308' };
    case 'Cita': return { bg: '#e0e7ff', text: '#3730a3', bar: '#6366f1' };
    default: return { bg: '#e0f2fe', text: '#0369a1', bar: '#3b82f6' };
  }
}

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);

  const [settings, setSettings] = useState({});
  const [units, setUnits] = useState([]);
  const [leads, setLeads] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [separations, setSeparations] = useState([]);
  const [duplicateDeletionLog,setDuplicateDeletionLog]=useState([]);
  const [marketingExpenses, setMarketingExpenses] = useState([]);
  const [sessionMinutes, setSessionMinutes] = useState(0);
  const [passwordOpen,setPasswordOpen]=useState(false);
  const [sale,setSale]=useState(null);
  const [lifecycleId,setLifecycleId]=useState(null);
  const [whatsappLeadId,setWhatsAppLeadId]=useState(null);
  const [socialChat,setSocialChat]=useState(null),[whatsappOrigin,setWhatsAppOrigin]=useState('kanban');
  const openChat=({channel,leadId,threadId,origin})=>{if(leadId)api.logChatAccess(leadId,{channel,origin,action:'open',thread_id:threadId}).catch(()=>{});if(channel==='whatsapp'){setSocialChat(null);setWhatsAppOrigin(origin);setWhatsAppLeadId(leadId);}else{setWhatsAppLeadId(null);setSocialChat({channel,threadId,origin});}};
  const [lifecycleMode,setLifecycleMode]=useState('full');
  const [saleError,setSaleError]=useState('');
  const [saleBusy,setSaleBusy]=useState(false);
  const [stageMove,setStageMove]=useState(null);
  const [semaphoreChange,setSemaphoreChange]=useState(null);
  const loginRefreshRef=useRef('');

  useEffect(() => {
    if(!currentUser||currentUser.mustChangePassword||currentUser.approvalRequired)return;
    const unsubSettings = api.listenSettings(async (data) => {
       if(api.isNative && data.exchangeRate === 3.75) {
          const rate = await api.fetchExchangeRate();
          if(rate) data.exchangeRate = rate;
       }
       setSettings(data);
       applyBrandTheme(data);
    });
    const unsubUnits = api.listenUnits(setUnits);
    const unsubLeads = api.listenLeads(setLeads);
    const unsubQuotes = api.listenQuotes ? api.listenQuotes(setQuotes) : () => {};
    const unsubSeparations = api.listenSeparations ? api.listenSeparations(setSeparations) : () => {};
    const unsubDuplicateLog=api.listenDuplicateDeletionLog?api.listenDuplicateDeletionLog(setDuplicateDeletionLog):()=>{};
    const unsubME = currentUser.role==='Gerente'&&api.listenMarketingExpenses ? api.listenMarketingExpenses(setMarketingExpenses) : () => {};
    

    return () => { unsubSettings(); unsubUnits(); unsubLeads(); unsubQuotes(); unsubSeparations(); unsubDuplicateLog(); unsubME(); };
  }, [currentUser?.id,currentUser?.mustChangePassword,currentUser?.approvalRequired]);

  useEffect(()=>{
    if(!currentUser||currentUser.mustChangePassword||currentUser.approvalRequired||!api.refreshOnLogin)return;
    const key=currentUser.id+':'+currentUser.loginTime;if(loginRefreshRef.current===key)return;loginRefreshRef.current=key;
    api.refreshOnLogin().catch(error=>console.error('No se pudo completar la actualización inicial:',error.message));
  },[currentUser?.id,currentUser?.loginTime,currentUser?.mustChangePassword,currentUser?.approvalRequired]);

  // Reading the CRM must be read-only.  Historic data corrections are a
  // deliberate managerial operation, never something that runs on login.

  // Timer Effect for Session Tracking
  useEffect(() => {
    let interval;
    if (currentUser) {
      interval = setInterval(() => {
        const mins = Math.floor((Date.now() - currentUser.loginTime) / 60000);
        setSessionMinutes(mins);
      }, 60000);
    }
    return () => clearInterval(interval);
  }, [currentUser]);

  const handleLogout = async () => {
    if (currentUser) {
      const finalDuration = Math.floor((Date.now() - currentUser.loginTime) / 60000);
      const sessionData = {
        name: currentUser.name,
        role: currentUser.role,
        loginTime: new Date(currentUser.loginTime).toISOString(),
        logoutTime: new Date().toISOString(),
        durationMinutes: finalDuration
      };
      
      if (api.isNative && window.crmDB && window.crmDB.saveSession) {
          try { await window.crmDB.saveSession(sessionData); } catch(e){}
      }
    }
    await window.crmAuth.logout();
    setCurrentUser(null);setSessionMinutes(0);setSettings({});setUnits([]);setLeads([]);setQuotes([]);setSeparations([]);setDuplicateDeletionLog([]);setMarketingExpenses([]);setPasswordOpen(false);setSale(null);setLifecycleId(null);setWhatsAppLeadId(null);setLifecycleMode('full');setStageMove(null);setSemaphoreChange(null);
  };

  if (!currentUser) {
    return <LoginScreen onLogin={setCurrentUser} settings={settings} />;
  }

  if(currentUser.mustChangePassword||passwordOpen)return <PasswordChange required={currentUser.mustChangePassword} onComplete={u=>{setCurrentUser({...u,loginTime:currentUser.loginTime,startModule:currentUser.startModule});setPasswordOpen(false);}} onCancel={currentUser.mustChangePassword?handleLogout:()=>setPasswordOpen(false)}/>;
  if(currentUser.approvalRequired)return <AccessValidation user={currentUser} onValidated={u=>setCurrentUser({...u,startModule:currentUser.startModule})} onLogout={handleLogout}/>;
  const handleLeadStageChange=async(id,status)=>{
    const lead=leads.find(l=>l.id===id);if(!lead)return;
    if(status===lead.status)return;
    if(['Seguimiento','Perdido'].includes(status)){setLifecycleId(id);return;}
    if(['MQL','Cita','Cita Asistida','Calificado'].includes(status)&&lead.status!==status){setLifecycleId(id);return;}
    if(status==='Venta'&&!lead.sold_unit_id){
      const numbers=new Set([lead.dpto1,lead.dpto2,lead.dpto_number].map(v=>String(v||'').match(/(?:^|\s)(\d{3,4})(?=\D|$)/)?.[1]).filter(Boolean));
      const matches=units.filter(u=>!isSold(u)&&numbers.has(String(u.unit_number)));
      setSale({lead,unitId:matches.length===1?matches[0].id:'',amount:''});setSaleError('');return;
    }
    setStageMove({lead,from:lead.status,to:status});
  };
  const confirmStageMove=async()=>{
    if(!stageMove)return;const move=stageMove;
    try{await api.updateLeadStatus(move.lead.id,move.to);setStageMove(null);}catch(e){alert(e.message);}
  };
  const confirmSale=async e=>{e.preventDefault();setSaleBusy(true);try{await api.updateLeadAdvanced(sale.lead.id,{status:'Venta',sold_unit_id:sale.unitId,sale_amount:sale.amount});setSale(null);}catch(e){setSaleError(e.message);}finally{setSaleBusy(false);}};
  const updateSemaphore=async(lead,severity,reason)=>{
    const updated=await api.updateLeadAdvanced(lead.id,{sla:{...(lead.sla||{}),severity,control_mode:'manual',manual_severity:severity,manual_adjustment:true,manual_adjusted_at:new Date().toISOString()},semaphore_override_reason:reason});
    setLeads(current=>current.map(item=>item.id===updated.id?updated:item));
    return updated;
  };
  const requestSemaphore=(lead,severity)=>setSemaphoreChange({lead,severity,reason:'',busy:false,error:''});
  const confirmSemaphore=async()=>{
    if(!semaphoreChange)return;
    const change=semaphoreChange,reason=String(change.reason||'').trim();
    if(!reason){setSemaphoreChange({...change,error:'Indica el motivo del ajuste manual.'});return;}
    setSemaphoreChange({...change,busy:true,error:''});
    try{await updateSemaphore(change.lead,change.severity,reason);setSemaphoreChange(null);}catch(error){setSemaphoreChange({...change,busy:false,error:error.message||'No se pudo guardar el semáforo.'});}
  };
  const openLifecycle=(id,mode='full')=>{setLifecycleId(id);setLifecycleMode(mode);};
  const data = { settings, units, leads, quotes, separations, duplicateDeletionLog, marketingExpenses, currentUser, handleLogout, sessionMinutes, handleLeadStageChange, requestSemaphore, openLifecycle, openWhatsApp:setWhatsAppLeadId,openChat, changePassword:()=>setPasswordOpen(true) };
  return <><DesktopView data={data} />
    {whatsappLeadId&&leads.some(lead=>lead.id===whatsappLeadId)&&<WhatsAppConversation user={currentUser} origin={whatsappOrigin} key={whatsappLeadId} lead={leads.find(lead=>lead.id===whatsappLeadId)} onClose={()=>setWhatsAppLeadId(null)}/>}
    {socialChat&&<SocialChatPanel key={socialChat.threadId} threadId={socialChat.threadId} origin={socialChat.origin} leads={leads} onClose={()=>setSocialChat(null)} onOpenWhatsApp={id=>openChat({channel:'whatsapp',leadId:id,threadId:id,origin:socialChat.origin})}/>}
    {lifecycleId&&leads.some(l=>l.id===lifecycleId)&&<LeadLifecycle key={lifecycleId+'-'+lifecycleMode} lead={leads.find(l=>l.id===lifecycleId)} settings={settings} mode={lifecycleMode} onClose={()=>{setLifecycleId(null);setLifecycleMode('full');}}/>} 
    {semaphoreChange&&<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.45)',zIndex:2060,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}><section role="dialog" aria-modal="true" aria-label="Confirmar ajuste de semáforo" className="orok-card" style={{width:460,maxWidth:'95vw'}}><h2 style={{marginTop:0}}>Ajustar semáforo manual</h2><p><strong>{semaphoreChange.lead.name}</strong> → <strong>{semaphoreChange.severity}</strong></p><p style={{fontSize:12,color:'#57534e'}}>No mueve la tarjeta ni altera el embudo. El color queda resaltado como ajuste manual hasta que se elija volver al cálculo SLA.</p><label>Motivo del ajuste<textarea autoFocus className="orok-input" value={semaphoreChange.reason} onChange={e=>setSemaphoreChange({...semaphoreChange,reason:e.target.value,error:''})} placeholder="Ej.: cliente pidió atención prioritaria" rows="3"/></label>{semaphoreChange.error&&<p role="alert" style={{color:'#991b1b'}}>{semaphoreChange.error}</p>}<div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:14}}><button type="button" className="orok-btn orok-btn-secondary" disabled={semaphoreChange.busy} onClick={()=>setSemaphoreChange(null)}>Cancelar</button><button type="button" className="orok-btn orok-btn-primary" disabled={semaphoreChange.busy} onClick={confirmSemaphore}>{semaphoreChange.busy?'Guardando…':'Confirmar semáforo'}</button></div></section></div>}
    {stageMove&&<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.45)',zIndex:2050,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}><section role="dialog" aria-modal="true" aria-label="Confirmar cambio de fase" className="orok-card" style={{width:460,maxWidth:'95vw'}}><h2 style={{marginTop:0}}>Confirmar movimiento en Kanban</h2><p><strong>{stageMove.lead.name}</strong></p><p>{stageMove.from} → <strong>{stageMove.to}</strong></p><p style={{fontSize:12,color:'#57534e'}}>Al confirmar, la tarjeta y los indicadores de las columnas se actualizarán. Para registrar detalle, usa Gestión y seguimiento.</p><div style={{display:'flex',gap:10,justifyContent:'flex-end'}}><button type="button" className="orok-btn orok-btn-secondary" onClick={()=>setStageMove(null)}>Cancelar</button><button type="button" className="orok-btn orok-btn-primary" onClick={confirmStageMove}>Confirmar cambio</button></div></section></div>}
    {sale&&<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.45)',zIndex:2000,display:'flex',alignItems:'center',justifyContent:'center'}}><form onSubmit={confirmSale} className="orok-card" style={{width:440,maxWidth:'90vw'}}><h2>Confirmar venta</h2><p>{sale.lead.name}</p><label>Departamento vendido<select className="orok-input" required value={sale.unitId} onChange={e=>setSale({...sale,unitId:e.target.value})}><option value="">Seleccionar departamento</option>{units.filter(u=>!isSold(u)).map(u=><option key={u.id} value={u.id}>Dpto {u.unit_number} · {u.unit_type}</option>)}</select></label><label>Importe real de venta (S/)<input aria-label="Importe real de venta" className="orok-input" type="text" inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" required value={sale.amount} onChange={e=>setSale({...sale,amount:e.target.value})}/></label><p>Esta unidad quedará vendida y bloqueada para nuevas cotizaciones.</p>{saleError&&<p role="alert" style={{color:'#991b1b'}}>{saleError}</p>}<div style={{display:'flex',gap:10}}><button disabled={saleBusy} className="orok-btn orok-btn-primary">Confirmar venta y bloquear</button><button type="button" disabled={saleBusy} onClick={()=>setSale(null)} className="orok-btn orok-btn-secondary">Cancelar</button></div></form></div>}
  </>;
}

// =======================
// SHARED RESPONSIVE VIEW
// =======================
const lastTea=()=>{try{const v=Number(localStorage.getItem('orok-tea'));return v>=1&&v<=30?v:7.8;}catch{return 7.8;}};
function DesktopView({ data }) {
  const [dashboardClassic, setDashboardClassic] = useState(false);
  const [quoteBusy,setQuoteBusy]=useState(false);
  const quoteRequest=useRef(null);
  const { leads, units, quotes, separations, duplicateDeletionLog, marketingExpenses, settings, currentUser, handleLogout, sessionMinutes, handleLeadStageChange, requestSemaphore, openLifecycle, openWhatsApp, openChat, changePassword } = data;
  const [activeTab, setActiveTab] = useState(()=>{const m=(()=>{try{return new URLSearchParams(location.search).get('modulo')}catch(_){return null}})()||currentUser?.startModule;return currentUser?.role==='Gerente'&&['evaluador','contabilidad'].includes(m)?m:currentUser?.role==='Gerente'&&m==='marketing'?'mkHome':'dashboard';}); // R36 · accesos directos de la app instalada
  // R50 · Cambio de proyecto (selector o Mis proyectos): ir al panel con los datos del proyecto elegido; «orok-ir» abre una pestaña.
  useEffect(()=>{const ir=t=>{try{handleTabChange(t);}catch(_){setActiveTab(t);}};const p=()=>ir('dashboard'),g=e=>ir(e.detail||'proyectos');window.addEventListener('orok-proyecto',p);window.addEventListener('orok-ir',g);return()=>{window.removeEventListener('orok-proyecto',p);window.removeEventListener('orok-ir',g);};});
  const appModule = currentUser?.role === 'Gerente' ? moduleOf(activeTab) : 'crm';
  useEffect(() => { if (currentUser && currentUser.role !== 'Gerente' && moduleOf(activeTab) !== 'crm') setActiveTab('dashboard'); }, [currentUser?.role, activeTab]);
  const [chatThreads, setChatThreads] = useState([]),[searchOpen,setSearchOpen]=useState(false);
  const chatIndex=React.useMemo(()=>indexByLead(chatThreads),[chatThreads]);
  useEffect(()=>{const key=e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();setSearchOpen(true);}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[]);
  useEffect(()=>{if(activeTab!=='kanban')return;let live=true;const load=()=>api.getChatIndex().then(r=>{if(live)setChatThreads(r.threads||[]);}).catch(()=>{});load();const timer=setInterval(()=>{if(!document.hidden)load();},60000);return()=>{live=false;clearInterval(timer);};},[activeTab]);
  const [accountOpen,setAccountOpen]=useState(false);
  const [dashboardFilters,setDashboardFilters]=useState(null);
  const [weeklySelection,setWeeklySelection]=useState(null);
  const openWeekly=(month,filters,part)=>{setWeeklySelection({month,filters,part});setActiveTab('weekly');};
  const [funnelGroup,setFunnelGroup]=useState('Todos');
  const [kanbanSearch,setKanbanSearch]=useState('');
  const [showDailyQueue,setShowDailyQueue]=useState(false);
  const [showLostLeads,setShowLostLeads]=useState(false);
  const [lostLeadDeletion,setLostLeadDeletion]=useState({id:'',message:'',error:false});
  const [lostLeadDeleting,setLostLeadDeleting]=useState('');
  const [kanbanExpanded,setKanbanExpanded]=useState(true);
  const [kanbanCardExpanded,setKanbanCardExpanded]=useState({});
  const [showDuplicateRegistry,setShowDuplicateRegistry]=useState(false);
  const [duplicateKeepByLead,setDuplicateKeepByLead]=useState({});
  const [duplicateDeleteBusy,setDuplicateDeleteBusy]=useState('');
  const [kanbanStickyOffsets,setKanbanStickyOffsets]=useState({header:0,toolbar:0});
  const appHeaderRef=useRef(null);
  const kanbanToolbarRef=useRef(null);
  const kanbanBoardRef=useRef(null);
  const kanbanStageStripRef=useRef(null);
  const [selectedQuoteIds,setSelectedQuoteIds]=useState([]);
  const [quoteActionBusy,setQuoteActionBusy]=useState(false);
  useEffect(()=>{setSelectedQuoteIds(ids=>ids.filter(id=>quotes.some(q=>q.id===id)));},[quotes]);
  const toggleQuote=id=>setSelectedQuoteIds(ids=>ids.includes(id)?ids.filter(x=>x!==id):[...ids,id]);
  const deleteSelectedQuotes=async ids=>{
    if(!ids.length||!confirm(`¿Borrar ${ids.length} cotización(es) del resumen? Los leads y los PDF guardados se conservan.`))return;
    setQuoteActionBusy(true);
    try{await api.deleteQuotes(ids);setSelectedQuoteIds(current=>current.filter(id=>!ids.includes(id)));}
    catch(e){alert('No se pudo borrar: '+e.message);}finally{setQuoteActionBusy(false);}
  };
  const exportSelectedQuotes=async()=>{
    setQuoteActionBusy(true);
    try{const result=await api.exportQuotes(selectedQuoteIds);if(result.error)throw new Error(result.error);if(result.success)alert(`Se exportaron ${result.count} cotizaciones. Puedes abrir el CSV con Excel o importarlo en Google Sheets.`);}
    catch(e){alert('No se pudo exportar: '+e.message);}finally{setQuoteActionBusy(false);}
  };

  const normalizedLeads = leads.map(l => {
     let st = l.status ? String(l.status).trim() : 'Lead Inicial';
     const validMatch = OPERATIONAL_STAGES.find(f => f.toLowerCase() === st.toLowerCase());
     return { ...l, status: validMatch || 'Lead Inicial' };
  });
  const deleteDuplicateLead=async(lead,match)=>{
    if(!match?.lead||!confirm(`Eliminar el duplicado ${lead.name} (${lead.lead_number||lead.id}) y conservar ${match.lead.name} (${match.lead.lead_number||match.lead.id})? La operación quedará registrada y no se podrá eliminar una venta.`))return;
    setDuplicateDeleteBusy(lead.id);
    try{await api.deleteDuplicateLead(lead.id,match.lead.id);}catch(error){alert(error.message);}finally{setDuplicateDeleteBusy('');}
  };
  const syncQuoteProfile=async id=>{setQuoteActionBusy(true);try{const result=await api.syncQuoteLeadProfile(id);alert(result.changed?'Ficha y cotización sincronizadas.':'La ficha y la cotización ya estaban sincronizadas.');}catch(error){alert(error.message);}finally{setQuoteActionBusy(false);}};

  const tools=useToolLinks(settings);
  const {leads:leadUrls,units:unitSheetUrl,plansExt:plansExtUrl,plansInt:plansIntUrl,finishes:acabadosUrl,separationTemplate:separationTemplateUrl,legalTemplatesFolder,separationFilesFolder}=tools.draft;
  const setLeadUrl=tools.setLead;
  const setUnitSheetUrl=value=>tools.change('units',value);
  const setPlansExtUrl=value=>tools.change('plansExt',value);
  const setPlansIntUrl=value=>tools.change('plansInt',value);
  const setAcabadosUrl=value=>tools.change('finishes',value);
  const setSeparationTemplateUrl=value=>tools.change('separationTemplate',value);
  const setLegalTemplatesFolder=value=>tools.change('legalTemplatesFolder',value);
  const setSeparationFilesFolder=value=>tools.change('separationFilesFolder',value);
  const [strictSync,setStrictSync]=useState(false);
  const [toolSyncMessage,setToolSyncMessage]=useState('');
  const syncSavedLeads=async()=>{
    setSyncing(true);setToolSyncMessage('');
    try{
      if(tools.dirty||!settings.toolLinks)await tools.save();
      const result=await api.syncConfiguredLeads();
      setToolSyncMessage(result.busy?'Ya hay una sincronización en curso.':result.skipped?'No hay fuentes registradas.':(result.results||[]).map((r,i)=>'Fuente '+(i+1)+': '+(r.error|| (r.skipped?'Configuración actualizada; se revisará en el siguiente ciclo.':r.added+' nuevos, '+r.updated+' actualizados'))).join(' · '));
    }catch(e){setToolSyncMessage(e.message);}finally{setSyncing(false);}
  };
  const [syncing, setSyncing] = useState(false);
  
  const [useAIInventory, setUseAIInventory] = useState(false);
  const [useAILeads, setUseAILeads] = useState(false);
  const [useAIPlans, setUseAIPlans] = useState(false);

  const [dragOverStage, setDragOverStage] = useState('');

  const [localSettings, setLocalSettings] = useState({});
  
  const [newLead, setNewLead] = useState({ 
    name: '', dni: '', address: '', email: '', phone: '', budget: '', source: 'Facebook', status: 'Lead Inicial', unit_interest: 'Flat', dpto_number: '', comments: ''
  });
  


  const [apptModalLead, setApptModalLead] = useState(null);
  const [apptDate, setApptDate] = useState('');
  const [apptTime, setApptTime] = useState('');

  // R48 · Oferta de feria vigente (preventa en planos o reserva) para cualquier unidad; el servidor fija el descuento y los cupos.
  const [feriaOferta, setFeriaOferta] = useState({vigente:false,ofertas:[]});
  const [cocheras, setCocheras] = useState([{codigo:'A',precio:56000,disponible:true},{codigo:'B',precio:56000,disponible:true},{codigo:'C',precio:56000,disponible:true},{codigo:'D',precio:56000,disponible:true}]);
  // R48 · Resumen de cotizaciones colapsable y filtrable; el buscador global lleva a las cotizaciones del lead.
  const [quotesOpen, setQuotesOpen] = useState(true), [quoteFilter, setQuoteFilter] = useState('');
  const [quoteModal, setQuoteModal] = useState({ open: false, unit: null, leadId: '', leadSearch: '', clientName:'', dni: '', phone:'', email:'', address:'', unitInterest:'', budget:'', discountPct: 0, teaPct: lastTea(), financingType: 'Hipotecario', customInitialPct: 10, parking: 'Ninguno', brokerName: '', directCreditMonths: settings.directCreditMonths || 12, recontactAt: '' });
  useEffect(()=>{if(!quoteModal.open)return;let live=true;Promise.resolve(window.crmDB?.preciosOfertaFeria?.()).then(r=>{if(live&&r)setFeriaOferta(r);}).catch(()=>{});Promise.resolve().then(()=>window.crmDB?.preciosCocheras?.()).then(r=>{if(live&&Array.isArray(r))setCocheras(r);}).catch(()=>{});return()=>{live=false;};},[quoteModal.open]);
  const [separationModal,setSeparationModal]=useState(null);
  const [separationDecision,setSeparationDecision]=useState(null);
  const [separationDocuments,setSeparationDocuments]=useState(null);
  const [separationBusy,setSeparationBusy]=useState(false);
  const [separationClock,setSeparationClock]=useState(Date.now());
  const separationRequest=useRef(null);
  useEffect(()=>{const timer=setInterval(()=>setSeparationClock(Date.now()),60000);return()=>clearInterval(timer);},[]);
  const blockingSeparationForUnit=unitId=>[...separations].reverse().find(item=>item.unit_id===unitId&&['CONFIRMED','RESERVED'].includes(String(item.status||'').toUpperCase()))||null;
  const separationDocumentProgress=separation=>['dni','signed_separation','reservation_voucher'].filter(kind=>separation?.documents?.[kind]?.drive_file_id).length;
  const separationPaymentStatus=separation=>{const required=Math.round(Math.max(Number(separation?.separation_amount||0),Number(separation?.final_price||0)*0.01)*100)/100,raw=separation?.documents?.reservation_voucher?.review?.extracted?.amount,paid=raw===null||raw===undefined?null:Number(raw);return {required,paid,covers:Number.isFinite(paid)&&required>0&&paid+0.009>=required};};
  const inventoryBadgeForUnit=unit=>{if(isSold(unit))return {label:'VENDIDO · BLOQUEADO',background:'#fee2e2',color:'#991b1b'};const separation=blockingSeparationForUnit(unit.id);if(separation)return {label:separation.status==='RESERVED'?'RESERVADA · BLOQUEADA':'EN SEPARACIÓN · BLOQUEADA',background:'#ffedd5',color:'#9a3412'};return {label:unit.status,background:unit.status==='AVAILABLE'?'#dcfce7':'#fee2e2',color:unit.status==='AVAILABLE'?'#166534':'#991b1b'};};
  const separationReviewDetail=(kind,review)=>{
    const extracted=review?.extracted||{};
    if(kind==='dni'&&extracted.dni_last4)return `DNI termina en ${extracted.dni_last4}${extracted.full_name?` · ${extracted.full_name}`:''}`;
    if(kind==='reservation_voucher'&&extracted.amount!==null&&extracted.amount!==undefined)return `${extracted.currency||'PEN'} ${Number(extracted.amount).toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2})}${extracted.operation_number?` · Op. ${extracted.operation_number}`:''}${extracted.date?` · ${extracted.date}`:''}`;
    return '';
  };
  const openSeparation=quote=>{
    const unit=units.find(item=>item.id===quote.unit_id||String(item.unit_number)===String(quote.unit_number));
    const lead=normalizedLeads.find(item=>item.id===(quote.lead_id||quote.leadId));
    if(!unit||isSold(unit))return alert('La unidad ya no está disponible para separación.');
    const financing=quote.financingType||quote.financing_type||'Hipotecario';if(financing==='Hipotecario'&&lead?.bank_evaluation?.status!=='Aprobada')return alert('Antes de generar una separación hipotecaria registra la evaluación GNB como Aprobada en Gestión y seguimiento.');
    const existing=blockingSeparationForUnit(unit.id);if(existing)return alert(`La unidad ya tiene la separación activa ${existing.code}.`);
    const finalPrice=Number(quote.final_price||quote.price||0),initialPct=Number(quote.initial_pct||quote.customInitialPct||10),separationAmount=Math.round(finalPrice*Number(settings.separationPct||1))/100;
    const initialAmount=Math.round(finalPrice*initialPct)/100,financedAmount=Math.max(0,Math.round((finalPrice-initialAmount)*100)/100);
    setSeparationModal({quote,unit,lead,client_name:quote.client_snapshot?.name||quote.lead_name||lead?.name||'',dni:String(quote.dni||quote.client_snapshot?.dni||lead?.dni||'').replace(/\D/g,'').slice(0,8),marital_status:'',address:quote.client_snapshot?.address||lead?.address||'',district:'',province:'Lima',department:'Lima',economic_activity:'',separation_amount:separationAmount,initial_amount:initialAmount,financed_amount:financedAmount,financing_type:quote.financingType||'Hipotecario',refund_condition:'Según acuerdo firmado',signers:(lead?.bank_evaluation?.applicants||[]).map((item,index)=>({role:index?'Coevaluado':'Titular',name:item.name||'',dni:item.dni||'',marital_status:item.marital_status||'',address:item.address||lead?.address||''})).filter(item=>item.name).length?(lead.bank_evaluation.applicants||[]).map((item,index)=>({role:index?'Coevaluado':'Titular',name:item.name||'',dni:item.dni||'',marital_status:item.marital_status||'',address:item.address||lead?.address||''})):[{role:'Titular',name:quote.client_snapshot?.name||quote.lead_name||lead?.name||'',dni:String(quote.dni||quote.client_snapshot?.dni||lead?.dni||'').replace(/\D/g,'').slice(0,8),marital_status:'',address:quote.client_snapshot?.address||lead?.address||''}]});
  };
  const handleGenerateSeparation=async event=>{
    event.preventDefault();if(!separationModal||separationBusy)return;setSeparationBusy(true);
    try{
      const {quote,unit,lead,...fields}=separationModal,requestKey=JSON.stringify({quoteId:quote.id,...fields});
      if(separationRequest.current?.key!==requestKey)separationRequest.current={key:requestKey,id:crypto.randomUUID()};
      await api.generateSeparation({requestId:separationRequest.current.id,quoteId:quote.id,...fields});
      separationRequest.current=null;for(const name of ['crm-separations','crm-quotes','crm-units'])window.dispatchEvent(new Event(name));setSeparationModal(null);
    }catch(error){alert(error.message);}finally{setSeparationBusy(false);}
  };
  const submitSeparationDecision=async event=>{
    event.preventDefault();if(!separationDecision||separationBusy)return;setSeparationBusy(true);
    try{
      await api.updateSeparation(separationDecision.separation.id,separationDecision.action,{reason:separationDecision.reason,expires_at:separationDecision.expires_at});
      for(const name of ['crm-separations','crm-quotes','crm-units','crm-leads'])window.dispatchEvent(new Event(name));setSeparationDecision(null);
      if(separationDecision.action==='confirm')alert('Separación confirmada. El lead fue movido al Kanban Separación.');
    }catch(error){alert(error.message);}finally{setSeparationBusy(false);}
  };
  const uploadSeparationDocument=async kind=>{
    if(!separationDocuments||separationBusy)return;setSeparationBusy(true);
    try{const result=await api.uploadSeparationDocument(separationDocuments.id,kind);if(!result)return;setSeparationDocuments(result.separation);if(result.autoConfirmed)alert('Los tres documentos están completos y el voucher cubre el monto mínimo. La separación quedó confirmada por 15 días y el lead pasó al Kanban Separación.'+(result.review?.status==='review'?' La lectura automática dejó este documento marcado para revisión manual.':''));else if(result.autoConfirmationBlocked){const payment=result.paymentValidation||{};alert(`Los tres documentos están completos, pero el voucher ${Number.isFinite(payment.paid)?`registra S/ ${payment.paid.toFixed(2)} y `:''}no cubre el mínimo requerido de S/ ${Number(payment.required||0).toFixed(2)}. La separación permanece en borrador. Reemplaza el voucher o confirma manualmente indicando el motivo.`);}else if(result.review?.status==='review')alert('Documento guardado. La lectura automática encontró datos que deben revisarse manualmente.');}
    catch(error){alert(error.message);}finally{setSeparationBusy(false);}
  };
  const generateMinute=async()=>{if(!separationDocuments||separationBusy)return;setSeparationBusy(true);try{const result=await api.generateMinute(separationDocuments.id,{signers:separationDocuments.signers});if(result?.separation)setSeparationDocuments(result.separation);alert('Minuta generada desde la plantilla correspondiente y guardada en la carpeta privada.');}catch(error){alert(error.message);}finally{setSeparationBusy(false);}};
  const regenerateSeparation=async()=>{
    if(!separationDocuments||separationBusy)return;setSeparationBusy(true);
    try{const result=await api.regenerateSeparation(separationDocuments.id);if(result?.separation)setSeparationDocuments(result.separation);alert('Documento actualizado con el código de cotización, los planos vinculados y el pie de página.');}
    catch(error){alert(error.message);}finally{setSeparationBusy(false);}
  };

  const confirmLostLeadDeletion=async(item)=>{
    setLostLeadDeleting(item.id);
    setLostLeadDeletion({id:item.id,message:'',error:false});
    try{
      const removed=await api.deleteLostLead(item.id);
      setLostLeadDeletion({id:'',message:`${removed.name} fue eliminado y ya no contará en los indicadores.`,error:false});
    }catch(error){
      setLostLeadDeletion({id:item.id,message:error.message||'No se pudo eliminar el lead.',error:true});
    }finally{setLostLeadDeleting('');}
  };

  const [studioCampaign, setStudioCampaign] = useState('');
  const handleTabChange = (tab) => {
    tab = canonicalTab(tab); // R42 · las pestañas antiguas de Marketing llevan a su nuevo lugar
    if (currentUser?.role !== 'Gerente' && moduleOf(tab) !== 'crm') tab = 'dashboard'; // R33b/R34 · Evaluador y Contabilidad son solo de Gerencia
    setActiveTab(tab);
    if (tab === 'settings' || tab === 'comisiones') {
      setLocalSettings(settings);
    }
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    await api.updateSettings({ 
      ...localSettings, 
      projectTotalValue: Number(localSettings.projectTotalValue),
      globalCommissionPct: Number(localSettings.globalCommissionPct),
      marketingPct: Number(localSettings.marketingPct),
      separationPct: Number(localSettings.separationPct),
      sellerCommissionPct: Number(localSettings.sellerCommissionPct),
      broker1Pct: Number(localSettings.broker1Pct),
      broker2Pct: Number(localSettings.broker2Pct),
      broker3Pct: Number(localSettings.broker3Pct),
      exchangeRate: Number(localSettings.exchangeRate),
      campaignBudget: Number(localSettings.campaignBudget),
      targetCpl: Number(localSettings.targetCpl),
      directCreditMonths: Number(localSettings.directCreditMonths || 12)
    });
    alert('Configuración guardada exitosamente.');
  }

  const handleAddLead = async (e) => {
    e.preventDefault();
    try{await api.addLead({ ...newLead, budget: Number(newLead.budget), contact_attempts: 0, broker_paid: false, seller_paid: false, reminders: {h2:false, h24:false, h48:false}, selectedBrokers:[], comments: newLead.comments ? `Interés: ${newLead.unit_interest} ${newLead.dpto_number}\n${newLead.comments}` : `Interés: ${newLead.unit_interest} ${newLead.dpto_number}` });}
    catch(error){const duplicate=parseDuplicateLeadError(error.message);if(duplicate){alert(`Ya existe ${duplicate.name} (${duplicate.lead_number||duplicate.id}) en ${duplicate.status}. Coincide por ${duplicate.reason}.`);return;}throw error;}
    setNewLead({ name: '', dni: '', address: '', email: '', phone: '', budget: '', source: 'Facebook', status: 'Lead Inicial', unit_interest: 'Flat', dpto_number: '', comments: '' });
    alert('Prospecto registrado exitosamente.');
    setActiveTab('kanban');
  }
  
  const handleClearUnits = async () => {
    if (confirm("¿Estás seguro de que deseas ELIMINAR TODO EL INVENTARIO? Esto no se puede deshacer.")) {
        setSyncing(true);
        if (api.isNative) {
            await window.crmDB.clearUnits();
        }
        alert("Inventario vaciado.");
        setSyncing(false);
    }
  };

  const handleClearLeads = async () => {
    if (confirm("¿Estás seguro de que deseas ELIMINAR TODOS LOS LEADS? Esto borrará el Kanban por completo.")) {
        setSyncing(true);
        if (api.isNative) {
            await window.crmDB.clearLeads();
        }
        alert("Leads eliminados.");
        setSyncing(false);
    }
  };

  const handleSyncSheets = async (index) => {
    const sheetUrl=leadUrls[index].trim();
    if (!sheetUrl) return alert("Ingresa URL de Google Sheets o OneDrive CSV.");
    // The saved shared link is reused by automatic synchronization.
    setSyncing(true);
    try {
      await tools.save();
      const res = await api.fetchSheet(sheetUrl);
      if (res.error) {
        if(res.error.includes("401") || res.error.includes("Privado")) {
          alert("ERROR DE ACCESO: El archivo de Google Sheets está en modo 'Privado'. Por favor, cámbialo a 'Cualquier persona con el enlace' o usa el botón 'Subir CSV Local'.");
        } else {
          throw new Error(res.error);
        }
      } else {
        if (useAILeads && (settings.geminiApiKey || settings.geminiConfigured)) {
            const jsonArray = await window.crmAPI.parseWithGemini({ csvData: res.data, type: 'leads', apiKey: settings.geminiApiKey });
            const {added, deleted} = await api.syncLeadsAI({jsonArray, isStrict: strictSync, sourceUrl: sheetUrl});
            alert(`Sincronización OK (IA).\nNuevos Leads Extraídos: ${added} \nLeads Eliminados (Sync Estricta): ${deleted}`); 
        } else {
            const {added, deleted} = await api.syncLeadsRaw({csv: res.data, isStrict: strictSync, sourceUrl: sheetUrl});
            alert(`Sincronización OK.\nNuevos Leads Extraídos: ${added} \nLeads Eliminados (Sync Estricta): ${deleted}`); 
        }
        setActiveTab('kanban');
      }
    } catch(e) { alert("Error: "+e.message); } 
    setSyncing(false);
  }

  const handleSyncUnits = async () => {
    if (!unitSheetUrl) return alert("Ingresa URL de Inventario");
    localStorage.setItem('crm_units_sheet_url', unitSheetUrl); setSyncing(true);
    try {
      await tools.save();
      const res = await api.fetchSheet(unitSheetUrl);
      if (res.error) {
        if(res.error.includes("401") || res.error.includes("Privado")) {
          alert("ERROR DE ACCESO: El archivo de Google Sheets está en modo 'Privado'. Por favor, cámbialo a 'Cualquier persona con el enlace' o usa el botón 'Subir CSV Local'.");
        } else {
          throw new Error(res.error);
        }
      } else {
        if (useAIInventory && (settings.geminiApiKey || settings.geminiConfigured)) {
            const jsonArray = await window.crmAPI.parseWithGemini({ csvData: res.data, type: 'inventory', apiKey: settings.geminiApiKey });
            const {added, updated} = await api.syncUnitsAI(jsonArray);
            alert(`Inventario Sincronizado vía IA.\nNuevos: ${added}, Actualizados: ${updated}`);
        } else {
            const {added, updated} = await api.syncUnits(res.data);
            if (added===0 && updated===0) alert('No se importó nada. Activa el Mapeo de Inteligencia Artificial (Casilla Morada).');
            else alert(`Inventario Sincronizado.\nNuevos: ${added}, Actualizados: ${updated}`);
        }
        setActiveTab('inventory');
      }
    } catch(e) { alert("Error procesando: " + e.message); } 
    setSyncing(false);
  }

  const handleSyncPlansUrls = async (isExt) => {
    const url = isExt ? plansExtUrl : plansIntUrl;
    if (!url) return alert("Ingresa URL de Planos");
    if (isExt) localStorage.setItem('crm_plans_ext_url', url);
    else localStorage.setItem('crm_plans_int_url', url);
    
    setSyncing(true);
    try {
      await tools.save();
      const res = await api.fetchSheet(url);
      if (res.error) {
        if(res.error.includes("401") || res.error.includes("Privado")) {
          alert("ERROR DE ACCESO: El archivo de Google Sheets está en modo 'Privado'. Por favor, cámbialo a 'Cualquier persona con el enlace' o usa el botón 'Subir CSV Local'.");
        } else {
          throw new Error(res.error);
        }
      } else {
        if (useAIPlans && (settings.geminiApiKey || settings.geminiConfigured)) {
            const jsonArray = await window.crmAPI.parseWithGemini({ csvData: res.data, type: 'plans', apiKey: settings.geminiApiKey });
            const updated = await api.syncPlansAI(jsonArray, isExt);
            alert(`Links Actualizados exitosamente en ${updated} departamentos usando IA.`);
        } else {
            const updated = await api.syncPlansUrl({csv: res.data, isExt});
            if (updated===0) alert('No se encontraron coincidencias. Activa el Mapeo de Inteligencia Artificial (Casilla Morada).');
            else alert(`Links Actualizados exitosamente en ${updated} departamentos.`);
        }
        setActiveTab('inventory');
      }
    } catch(e) { alert("Error procesando: " + e.message); } 
    setSyncing(false);
  }

  const handleSyncLocalFolder = async (isExt) => {
      const p = await window.crmAPI.selectDirectory();
      if (p) {
          setSyncing(true);
          try {
              const count = await api.syncLocalFolder({folderPath: p, isExt});
              alert(`Escaneo completado. Se enlazaron ${count} planos seleccionados.`);
              setActiveTab('inventory');
          } catch(e) { alert("Error: " + e.message); }
          setSyncing(false);
      }
  }

  const handleLocalUploadUnits = async () => {
      const fp = await window.crmAPI.selectExcel();
      if (!fp) return;
      setSyncing(true);
      try {
          const csvData = await api.readLocalFile(fp);
          if (!csvData) throw new Error("No se pudo leer el archivo local.");
          if (useAIInventory && (settings.geminiApiKey || settings.geminiConfigured)) {
              const jsonArray = await window.crmAPI.parseWithGemini({ csvData, type: 'inventory', apiKey: settings.geminiApiKey });
              const {added, updated} = await api.syncUnitsAI(jsonArray);
              alert(`Inventario Sincronizado vía Archivo Local e IA.\nNuevos: ${added}, Actualizados: ${updated}`);
          } else {
              const {added, updated} = await api.syncUnits(csvData);
              alert(`Inventario Sincronizado vía Archivo Local.\nNuevos: ${added}, Actualizados: ${updated}`);
          }
          setActiveTab('inventory');
      } catch(e) { alert("Error: " + e.message); }
      setSyncing(false);
  };

  const handleLocalUploadLeads = async () => {
      const fp = await window.crmAPI.selectExcel();
      if (!fp) return;
      setSyncing(true);
      try {
          const csvData = await api.readLocalFile(fp);
          if (!csvData) throw new Error("No se pudo leer el archivo local.");
          if (useAILeads && (settings.geminiApiKey || settings.geminiConfigured)) {
              const jsonArray = await window.crmAPI.parseWithGemini({ csvData, type: 'leads', apiKey: settings.geminiApiKey });
              const {added, deleted} = await api.syncLeadsAI({jsonArray, isStrict: strictSync});
              alert(`Sincronización OK vía Archivo Local (IA).\nNuevos Leads Extraídos: ${added} \nLeads Eliminados: ${deleted}`); 
          } else {
              const {added, deleted} = await api.syncLeadsRaw({csv: csvData, isStrict: strictSync});
              alert(`Sincronización OK vía Archivo Local.\nNuevos Leads Extraídos: ${added} \nLeads Eliminados: ${deleted}`); 
          }
          setActiveTab('kanban');
      } catch(e) { alert("Error: " + e.message); }
      setSyncing(false);
  };

  const handleLocalUploadPlans = async (isExt) => {
      const fp = await window.crmAPI.selectExcel();
      if (!fp) return;
      setSyncing(true);
      try {
          const csvData = await api.readLocalFile(fp);
          if (!csvData) throw new Error("No se pudo leer el archivo local.");
          if (useAIPlans && (settings.geminiApiKey || settings.geminiConfigured)) {
              const jsonArray = await window.crmAPI.parseWithGemini({ csvData, type: 'plans', apiKey: settings.geminiApiKey });
              const updated = await api.syncPlansAI(jsonArray, isExt);
              alert(`Links Actualizados en ${updated} departamentos usando IA.`);
          } else {
              const updated = await api.syncPlansUrl({csv: csvData, isExt});
              alert(`Links Actualizados en ${updated} departamentos.`);
          }
          setActiveTab('inventory');
      } catch(e) { alert("Error: " + e.message); }
      setSyncing(false);
  };

  const handleSaveAcabadosUrl = async () => {
    try{await tools.save();}catch(e){alert(e.message);}
  };

  const handleGenerateQuote = async (e) => {
    e.preventDefault();
    if (!api.isNative) return alert("No se pudo conectar al generador de PDF.");
    const selectedLead = normalizedLeads.find(l => l.id === quoteModal.leadId);
    
    if(!selectedLead||CLOSED_LOST_STAGES.includes(selectedLead.status))return alert('Selecciona un lead habilitado.');
    if(!units.find(u=>u.id===quoteModal.unit.id&&!isSold(u)))return alert('El departamento ya está vendido o no está disponible.');
    if(quoteModal.financingType==='Directo'&&(!Number.isInteger(Number(quoteModal.directCreditMonths))||Number(quoteModal.directCreditMonths)<1))return alert('Ingresa un plazo entero de al menos un mes.');
    if(quoteBusy)return;
    setQuoteBusy(true);
    try {
      const {open,unit,leadSearch,...quoteData}=quoteModal;
      const requestKey=JSON.stringify(quoteData);
      if(quoteRequest.current?.key!==requestKey)quoteRequest.current={key:requestKey,id:crypto.randomUUID()};
      try{localStorage.setItem('orok-tea',String(Number(quoteModal.teaPct)));}catch{}
      await window.crmPDF.generateQuote({requestId:quoteRequest.current.id,unitId:quoteModal.unit.id,leadId:selectedLead.id,dni:quoteModal.dni,leadProfile:{name:quoteModal.clientName,phone:quoteModal.phone,email:quoteModal.email,address:quoteModal.address,unit_interest:quoteModal.unitInterest,budget:quoteModal.budget},discountPct:Number(quoteModal.discountPct),financingType:quoteModal.financingType,directCreditMonths:Number(quoteModal.directCreditMonths),customInitialPct:Number(quoteModal.customInitialPct)||10,teaPct:Number(quoteModal.teaPct),parking:quoteModal.parking,brokerName:quoteModal.brokerName,recontactAt:quoteModal.recontactAt,feriaOferta:quoteModal.feriaOferta||'',aprobacionPrecio:quoteModal.feriaOferta?'':(quoteModal.aprobacionPrecio||'')});
      quoteRequest.current=null;
      for(const event of ['crm-quotes','crm-leads','crm-units'])window.dispatchEvent(new Event(event));
    }catch(error){alert(error.message);return;}finally{setQuoteBusy(false);}
    setQuoteModal({ open: false, unit: null, leadId: '', leadSearch: '', clientName:'', dni: '', phone:'', email:'', address:'', unitInterest:'', budget:'', discountPct: 0, teaPct: lastTea(), financingType: 'Hipotecario', customInitialPct: 10, parking: 'Ninguno', brokerName: '', directCreditMonths: settings.directCreditMonths || 12, recontactAt: '' });
  }

  const toggleReminder = (lead, type) => {
    const updated = { ...lead, reminders: { ...lead.reminders, [type]: !lead.reminders?.[type] } };
    api.updateLeadAdvanced(lead.id, updated);
  }
  
  const toggleBroker = (lead, brokerName) => {
    let current = lead.selectedBrokers || [];
    if(current.includes(brokerName)) current = current.filter(b => b !== brokerName);
    else current.push(brokerName);
    api.updateLeadAdvanced(lead.id, { ...lead, selectedBrokers: current });
  }

  const navBtnStyle = (tab) => ({ padding: '12px 20px', cursor: 'pointer', border: 'none', borderRadius: '16px 16px 4px 16px', fontWeight: '700', background: activeTab === tab ? 'var(--orok-brand)' : 'transparent', color: activeTab === tab ? 'white' : '#78716c', transition: 'all 0.3s ease', display: 'flex', alignItems: 'center', gap: '8px' });
  const inputStyle = {width: '100%', padding: '14px 16px', margin: '6px 0 16px 0', borderRadius: '16px 16px 4px 16px', border: '1px solid #e7dfd8', background: '#faf7f5', fontFamily: 'inherit', fontSize: '14px', color: '#292524', transition: 'all 0.3s ease'};

  const isKanban = activeTab === 'kanban';
  useEffect(()=>{
    if(!isKanban){
      setKanbanStickyOffsets({header:0,toolbar:0});
      return;
    }
    const update=()=>setKanbanStickyOffsets({
      header:appHeaderRef.current?.getBoundingClientRect().height||0,
      toolbar:kanbanToolbarRef.current?.getBoundingClientRect().height||0
    });
    update();
    const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(update);
    if(appHeaderRef.current)observer?.observe(appHeaderRef.current);
    if(kanbanToolbarRef.current)observer?.observe(kanbanToolbarRef.current);
    window.addEventListener('resize',update);
    return ()=>{observer?.disconnect();window.removeEventListener('resize',update);};
  },[isKanban]);
  const setAllKanbanExpanded=expanded=>{setKanbanExpanded(expanded);setKanbanCardExpanded({});};
  const toggleKanbanCard=leadId=>setKanbanCardExpanded(current=>{
    const expanded=Object.prototype.hasOwnProperty.call(current,leadId)?current[leadId]:kanbanExpanded;
    return {...current,[leadId]:!expanded};
  });
  const syncKanbanScroll=(source,target)=>{if(target&&Math.abs(target.scrollLeft-source.scrollLeft)>1)target.scrollLeft=source.scrollLeft;};
  const visibleStages=funnelGroup==='Todos'?FUNNEL_STAGES:FUNNEL_GROUPS[funnelGroup];
  const kanbanColumns=funnelGroup==='Seguimiento'?FOLLOW_UP_COLUMNS:visibleStages.map(stage=>({key:stage,status:stage,label:stage==='Cita'?'Cita agendada':stage}));
  const normalizeKanbanSearchValue=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es-PE').replace(/[^\p{L}\p{N}]+/gu,'');
  const normalizedSearch=normalizeKanbanSearchValue(kanbanSearch.trim());
  const quoteLeadSearch=normalizeKanbanSearchValue(quoteModal.leadSearch||'');
  const quoteCandidates=normalizedLeads.filter(lead=>!CLOSED_LOST_STAGES.includes(lead.status)&&(!quoteLeadSearch||[lead.lead_number,lead.name,lead.last_name,lead.phone,lead.email].some(value=>normalizeKanbanSearchValue(value).includes(quoteLeadSearch))));
  const kanbanMatchIds=normalizedSearch?new Set(searchLeads(normalizedLeads,kanbanSearch,{social:socialHandles(chatThreads)}).map(r=>r.lead.id)):null;
  const quoteNeedle=normalizeKanbanSearchValue(quoteFilter),leadNumberById=new Map(leads.map(l=>[l.id,l.lead_number||'']));
  const visibleQuotes=quotes.slice().reverse().filter(q=>!quoteNeedle||[q.quote_code,q.lead_name,q.unit_number,q.seller,leadNumberById.get(q.lead_id)].some(v=>normalizeKanbanSearchValue(v).includes(quoteNeedle)));
  const kanbanLeads=normalizedLeads.filter(lead=>!kanbanMatchIds||kanbanMatchIds.has(lead.id));
  const dailyQueue=normalizedLeads.filter(lead=>![...CLOSED_LOST_STAGES,'Venta'].includes(lead.status)).map(lead=>{
    const due=lead.next_action_at?new Date(lead.next_action_at).getTime():0;
    const scheduled=(lead.appointments||[]).find(a=>a.status==='scheduled');
    const appointmentAt=scheduled?new Date(scheduled.scheduled_at).getTime():0;
    const now=Date.now();
    const fallback=lead.status==='Seguimiento'&&lead.substatus==='No-show'?'Recuperar no-show':due&&due<now?'Acción vencida':appointmentAt&&appointmentAt<now+24*3600000?'Confirmar cita':lead.status==='Lead Inicial'?'Primer contacto':'Seguimiento programado';
    const severity=lead.sla?.severity||null;
    const semaphoreRank={Crítico:0,Rojo:1,Amarillo:2,Verde:3}[severity]??4;
    const category=severity?severity+' · '+(lead.sla?.reason||fallback):fallback;
    return {...lead,category,severity,semaphoreRank,due:due||appointmentAt||Date.parse(lead.sla?.first_due_at||'')||now,overdue:severity==='Crítico'||severity==='Rojo'||!!due&&due<now};
  }).sort((a,b)=>a.semaphoreRank-b.semaphoreRank||(b.overdue-a.overdue)||a.due-b.due);
  const lostLeads=normalizedLeads.filter(lead=>CLOSED_LOST_STAGES.includes(lead.status)).sort((a,b)=>String(b.lost_at||'').localeCompare(String(a.lost_at||'')));

  return (
    <div style={{ maxWidth: '100%', margin: '0 auto', transition: 'all 0.3s ease', boxSizing: 'border-box', position: 'relative' }}>
      
      {/* MODALS */}
      {quoteModal.open && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} className="no-print">
          <div role="dialog" aria-modal="true" aria-label="Generar Cotización Avanzada" className="orok-card" style={{ width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ marginTop: 0, fontSize:'20px', fontWeight:'800', color:'var(--orok-brand)', display:'flex', alignItems:'center', gap:'8px' }}><FileText size={20}/> Generar Cotización Avanzada</h3>
            <p style={{ fontSize: '13px', color: '#78716c' }}>Unidad {quoteModal.unit.unit_number} - {formatMoneyPEN(quoteModal.unit.price)}</p>
            <p style={{fontSize:'12px',color:'#57534e',background:'#faf7f5',border:'1px solid #e7dfd8',borderRadius:'8px',padding:'9px 10px'}}>El descuento se calcula sobre el total del precio de lista. Los precios incluyen impuestos.</p>
            <form onSubmit={handleGenerateQuote}>
              <label style={{fontWeight:'600', fontSize:'14px'}}>Asignar Lead (Obligatorio)</label>
              <input aria-label="Buscar lead para cotización" className="orok-input" style={{margin:'6px 0 8px'}} value={quoteModal.leadSearch||''} onChange={e=>setQuoteModal({...quoteModal,leadSearch:e.target.value})} placeholder="Buscar por código, nombre, teléfono o correo" autoComplete="off" />
              <select aria-label="Asignar Lead" className="orok-select" style={inputStyle} required value={quoteModal.leadId} onChange={e => {const lead=normalizedLeads.find(item=>item.id===e.target.value);setQuoteModal({...quoteModal,leadId:e.target.value,clientName:lead?.name||'',dni:lead?.dni||'',phone:lead?.phone||'',email:lead?.email||'',address:lead?.address||'',unitInterest:lead?.unit_interest||'',budget:lead?.budget||''});}}>
                <option value="">-- Seleccionar Prospecto --</option>
              {quoteCandidates.map(l => <option key={l.id} value={l.id}>{l.lead_number} - {l.name}</option>)}
              </select>
              {quoteLeadSearch&&quoteCandidates.length===0&&<p style={{fontSize:12,color:'#78716c',margin:'4px 0 0'}}>No se encontró un lead activo con esa búsqueda.</p>}
              {quoteModal.leadId&&<div data-responsive-grid="true" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,padding:12,marginTop:10,border:'1px solid #e7dfd8',borderRadius:10,background:'#fffdfb'}}>
                <label>Nombre completo<input aria-label="Nombre del cliente" className="orok-input" value={quoteModal.clientName||''} onChange={e=>setQuoteModal({...quoteModal,clientName:e.target.value})}/></label>
                <label>DNI opcional<input aria-label="DNI del cliente" className="orok-input" inputMode="numeric" pattern="[0-9]{8}" maxLength="8" value={quoteModal.dni||''} onChange={e=>setQuoteModal({...quoteModal,dni:e.target.value.replace(/\D/g,'').slice(0,8)})} placeholder="8 dígitos" /></label>
                <label>Teléfono<input aria-label="Teléfono del cliente" className="orok-input" value={quoteModal.phone||''} onChange={e=>setQuoteModal({...quoteModal,phone:e.target.value})}/></label>
                <label>Correo<input aria-label="Correo del cliente" className="orok-input" type="email" value={quoteModal.email||''} onChange={e=>setQuoteModal({...quoteModal,email:e.target.value})}/></label>
                <label style={{gridColumn:'1/-1'}}>Dirección<input aria-label="Dirección del cliente" className="orok-input" value={quoteModal.address||''} onChange={e=>setQuoteModal({...quoteModal,address:e.target.value})}/></label>
                <label>Interés<input aria-label="Interés del cliente" className="orok-input" value={quoteModal.unitInterest||''} onChange={e=>setQuoteModal({...quoteModal,unitInterest:e.target.value})}/></label>
                <label>Presupuesto S/<input aria-label="Presupuesto del cliente" className="orok-input" type="number" min="0" value={quoteModal.budget||''} onChange={e=>setQuoteModal({...quoteModal,budget:e.target.value})}/></label>
                <p style={{gridColumn:'1/-1',fontSize:11,color:'#57534e',margin:0}}>Los datos se cargan desde la ficha. Al generar la cotización, cualquier corrección se guarda también en el lead.</p>
              </div>}
              <label style={{display:'block',fontWeight:'600',fontSize:'14px',margin:'12px 0 4px'}}>Fecha de recontacto por llamada (se incluye en la cotización)</label>
              <input aria-label="Fecha de recontacto por llamada" type="datetime-local" className="orok-input" value={quoteModal.recontactAt||''} onChange={e=>setQuoteModal({...quoteModal,recontactAt:e.target.value})} />
              
              <div data-responsive-grid="true" style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'16px'}}>
                  <div>
                      {feriaOferta.vigente&&feriaOferta.ofertas.length>0&&<label style={{display:'grid',gap:4,fontWeight:600,fontSize:14,marginBottom:10}}>Oferta de feria
                        <select aria-label="Oferta de feria" className="orok-input" value={quoteModal.feriaOferta||''} onChange={e=>setQuoteModal({...quoteModal,feriaOferta:e.target.value,aprobacionPrecio:e.target.value?'':quoteModal.aprobacionPrecio,discountPct:e.target.value?0:quoteModal.discountPct})}>
                          <option value="">Sin oferta de feria</option>
                          {feriaOferta.ofertas.map(o=><option key={o.modalidad} value={o.modalidad}>{o.nombre} · −S/ {Number(o.descuento).toLocaleString('es-PE')}{o.cupos_restantes!=null?' · quedan '+o.cupos_restantes+' cupos':''}</option>)}
                        </select>
                        {quoteModal.feriaOferta&&<span style={{fontSize:12,fontWeight:400}}>{feriaOferta.ofertas.find(o=>o.modalidad===quoteModal.feriaOferta)?.condicion}. El descuento lo fija el ERP y el cupo se usa al confirmar la separación.</span>}
                      </label>}
                      {currentUser.role==='Gerente'?<>
                      <label style={{fontWeight:'600', fontSize:'14px'}}>Descuento Comercial (%)</label>
                      <div style={{display: 'flex', alignItems: 'center', gap: '16px', margin:'12px 0 24px 0'}}>
                        <input aria-label="Descuento Comercial (%)" disabled={!!quoteModal.feriaOferta} type="range" min="0" max="7" step="0.1" value={quoteModal.discountPct} onChange={e => setQuoteModal({...quoteModal, discountPct: e.target.value})} style={{flex: 1, accentColor:'var(--orok-brand)'}} />
                        <span style={{fontWeight: '800', fontSize:'18px', color:'var(--orok-brand)', width:'40px'}}>{quoteModal.discountPct}%</span>
                      </div></>
                      :<PrecioEspecial unit={quoteModal.unit} leadId={quoteModal.leadId} value={quoteModal.aprobacionPrecio} disabled={!!quoteModal.feriaOferta} onChange={id=>setQuoteModal({...quoteModal,aprobacionPrecio:id,discountPct:0})}/>}
                      <div style={{marginBottom:16}}>
                        <label htmlFor="quote-months" style={{fontWeight:600,fontSize:13}}>Plazo Crédito Directo (meses)</label>
                        <input aria-label="Ajustar plazo de crédito directo" type="range" min="1" max="36" step="1" value={Math.min(36,Math.max(1,Number(quoteModal.directCreditMonths)||1))} onChange={e=>setQuoteModal({...quoteModal,directCreditMonths:e.target.value})} style={{display:'block',width:'100%',margin:'10px 0',accentColor:'var(--orok-brand)'}}/>
                        <div style={{display:'flex',gap:8,alignItems:'center'}}>
                          <input id="quote-months" className="orok-input" type="text" inputMode="numeric" pattern={quoteModal.financingType==='Directo'?'[0-9]+':undefined} required={quoteModal.financingType==='Directo'} value={quoteModal.directCreditMonths} onChange={e=>setQuoteModal({...quoteModal,directCreditMonths:e.target.value})} style={{width:64,padding:'8px',margin:0}}/>
                          <span style={{fontSize:12}}>Meses</span>
                        </div>
                        <p style={{fontSize:10,color:'#78716c',margin:'6px 0 0'}}>Se aplica al seleccionar Crédito Directo.</p>
                      </div>
                  </div>
                  <div>
                      <label style={{fontWeight:'600', fontSize:'14px', color:'#991b1b'}}>Incluir Estacionamiento</label>
                      <select className="orok-input orok-select" value={quoteModal.parking} onChange={e => setQuoteModal({...quoteModal, parking: e.target.value})}>
                          <option value="Ninguno">Ninguno</option>
                          {cocheras.map(c=><option key={c.codigo} value={c.codigo} disabled={!c.disponible}>Estacionamiento {c.codigo} (+ S/ {Number(c.precio).toLocaleString('es-PE')}){c.disponible?'':' · separado'}</option>)}
                      </select>
                  </div>
                  <div>
                      <label style={{fontWeight:'600', fontSize:'14px', color:'#3b82f6'}}>Broker (Opcional)</label>
                      <select className="orok-input orok-select" value={quoteModal.brokerName} onChange={e => setQuoteModal({...quoteModal, brokerName: e.target.value})}>
                          <option value="">Ninguno</option>
                          {settings.broker1Name && <option value={settings.broker1Name}>{settings.broker1Name} ({settings.broker1Pct || 1}%)</option>}
                          {settings.broker2Name && <option value={settings.broker2Name}>{settings.broker2Name} ({settings.broker2Pct || 1}%)</option>}
                          {settings.broker3Name && <option value={settings.broker3Name}>{settings.broker3Name} ({settings.broker3Pct || 1}%)</option>}
                      </select>
                  </div>
              </div>
              
              <h4 style={{borderBottom:'1px solid #e7dfd8', paddingBottom:'8px', color:'#292524', marginTop:'10px'}}>Estructura de Financiamiento (PDF)</h4>
              <div style={{display:'flex', gap:'12px', marginBottom:'16px'}}>
                 <label style={{flex:1, display:'flex', alignItems:'center', gap:'6px', padding:'10px', border:'1px solid #e7dfd8', borderRadius:'8px', cursor:'pointer', background: quoteModal.financingType === 'Hipotecario' ? '#faf7f5' : 'white'}}>
                    <input type="radio" name="finType" checked={quoteModal.financingType === 'Hipotecario'} onChange={() => setQuoteModal({...quoteModal, financingType: 'Hipotecario'})} style={{accentColor:'var(--orok-brand)'}} />
                    Crédito Hipotecario (GNB)
                 </label>
                 <label style={{flex:1, display:'flex', alignItems:'center', gap:'6px', padding:'10px', border:'1px solid #e7dfd8', borderRadius:'8px', cursor:'pointer', background: quoteModal.financingType === 'Directo' ? '#faf7f5' : 'white'}}>
                    <input type="radio" name="finType" checked={quoteModal.financingType === 'Directo'} onChange={() => setQuoteModal({...quoteModal, financingType: 'Directo'})} style={{accentColor:'var(--orok-brand)'}} />
                    Crédito Directo (Hitos)
                 </label>
              </div>


              {quoteModal.financingType === 'Hipotecario' && (
                <div style={{marginBottom:'24px', background:'#faf7f5', padding:'12px', borderRadius:'8px'}}>
                  <label style={{fontWeight:'600', fontSize:'12px', color:'#57534e'}}>Porcentaje de Inicial Personalizado (%)</label>
                  <p style={{fontSize:'10px', color:'#78716c', margin:'4px 0 8px 0'}}>El PDF mostrará la cuota para 10%, 20% y el valor que indiques aquí.</p>
                  <input type="number" min="0" max="90" className="orok-input" style={{margin:0}} value={quoteModal.customInitialPct} onChange={e => setQuoteModal({...quoteModal, customInitialPct: e.target.value})} />
                  <label style={{fontWeight:'600', fontSize:'12px', color:'#57534e', display:'block', marginTop:14}}>TEA autorizada por el banco (%)</label>
                  <p style={{fontSize:'10px', color:'#78716c', margin:'4px 0 8px 0'}}>Se usa para calcular la cuota mensual del PDF (20 años). Elige una opción o escribe la tasa exacta.</p>
                  <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:8}}>{[7.5,7.8,8,8.5,9,9.5,10].map(v=><button type="button" key={v} className={'orok-btn '+(Number(quoteModal.teaPct)===v?'orok-btn-primary':'orok-btn-secondary')} style={{padding:'6px 10px',minHeight:32,fontSize:12}} onClick={()=>setQuoteModal({...quoteModal,teaPct:v})}>{v.toFixed(2).replace('.',',')}%</button>)}</div>
                  <input aria-label="TEA autorizada por el banco" type="number" min="1" max="30" step="0.01" className="orok-input" style={{margin:0}} value={quoteModal.teaPct} onChange={e => setQuoteModal({...quoteModal, teaPct: e.target.value})} />
                  {!(Number(quoteModal.teaPct)>=1&&Number(quoteModal.teaPct)<=30)&&<p role="alert" style={{fontSize:11,color:'#b91c1c',margin:'6px 0 0'}}>Indica una TEA entre 1% y 30%.</p>}
                </div>
              )}

              <div style={{ display: 'flex', gap: '12px', marginTop:'20px' }}>
                <button type="button" onClick={() => setQuoteModal({ open: false, unit: null, leadId: '', leadSearch: '', clientName:'', dni: '', phone:'', email:'', address:'', unitInterest:'', budget:'', discountPct: 0, teaPct: lastTea(), financingType: 'Hipotecario', customInitialPct: 10, parking: 'Ninguno', brokerName: '', directCreditMonths: settings.directCreditMonths || 12, recontactAt: '' })} className="orok-btn orok-btn-secondary" style={{ flex: 1 }}>Cancelar</button>
                <button type="submit" disabled={quoteBusy} className="orok-btn orok-btn-primary" style={{ flex: 1 }}><FileText size={16}/> {quoteBusy?'Generando PDF…':'Generar Documento'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {separationModal && (
        <div style={{position:'fixed',inset:0,background:'rgba(15,23,42,.62)',backdropFilter:'blur(4px)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1100,padding:16}} className="no-print">
          <form onSubmit={handleGenerateSeparation} role="dialog" aria-modal="true" aria-label="Generar Separación" className="orok-card" style={{width:'100%',maxWidth:720,maxHeight:'92vh',overflowY:'auto'}}>
            <h3 style={{marginTop:0,color:'var(--orok-brand)',display:'flex',alignItems:'center',gap:8}}><FileText size={20}/> Generar Separación</h3>
            <p style={{fontSize:13,color:'#57534e'}}>Cotización <strong>{separationModal.quote.quote_code}</strong> · Dpto {separationModal.unit.unit_number} · {formatMoneyPEN(separationModal.quote.final_price)}</p>
            <p style={{fontSize:12,padding:10,borderRadius:9,background:'#fff7ed',border:'1px solid #fdba74'}}>El PDF se guardará como <strong>borrador</strong>: no bloqueará el departamento ni moverá el lead. La reserva comenzará por confirmación manual o cuando estén cargados el DNI, la separación firmada y el voucher.</p>
            <div data-responsive-grid="true" style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:12}}>
              <label>Nombre completo<input required className="orok-input" value={separationModal.client_name} onChange={e=>setSeparationModal({...separationModal,client_name:e.target.value})}/></label>
              <label>DNI<input required className="orok-input" inputMode="numeric" pattern="[0-9]{8}" maxLength="8" value={separationModal.dni} onChange={e=>setSeparationModal({...separationModal,dni:e.target.value.replace(/\D/g,'').slice(0,8)})}/></label>
              <label>Estado civil<input required className="orok-input" value={separationModal.marital_status} onChange={e=>setSeparationModal({...separationModal,marital_status:e.target.value})}/></label>
              <label>Actividad económica<input required className="orok-input" value={separationModal.economic_activity} onChange={e=>setSeparationModal({...separationModal,economic_activity:e.target.value})}/></label>
              <label style={{gridColumn:'1/-1'}}>Domicilio<input required className="orok-input" value={separationModal.address} onChange={e=>setSeparationModal({...separationModal,address:e.target.value})}/></label>
              <label>Distrito<input required className="orok-input" value={separationModal.district} onChange={e=>setSeparationModal({...separationModal,district:e.target.value})}/></label>
              <label>Provincia<input required className="orok-input" value={separationModal.province} onChange={e=>setSeparationModal({...separationModal,province:e.target.value})}/></label>
              <label>Departamento<input required className="orok-input" value={separationModal.department} onChange={e=>setSeparationModal({...separationModal,department:e.target.value})}/></label>
              <label>Financiamiento<select className="orok-input" value={separationModal.financing_type} onChange={e=>setSeparationModal({...separationModal,financing_type:e.target.value})}><option>Hipotecario</option><option>Directo</option><option>Contado</option></select></label>
              <label>Monto de separación (S/)<input required min="0.01" step="0.01" type="number" className="orok-input" value={separationModal.separation_amount} onChange={e=>setSeparationModal({...separationModal,separation_amount:e.target.value})}/></label>
              <label>Cuota inicial (S/)<input required min="0" step="0.01" type="number" className="orok-input" value={separationModal.initial_amount} onChange={e=>{const value=e.target.value,financedAmount=Math.max(0,Math.round((Number(separationModal.quote.final_price||0)-Number(value||0))*100)/100);setSeparationModal({...separationModal,initial_amount:value,financed_amount:financedAmount});}}/></label>
              <label>Saldo por financiar (S/)<input readOnly type="number" step="0.01" className="orok-input" value={Number(separationModal.financed_amount||0).toFixed(2)}/></label>
              <label>Condición de reembolso<input required maxLength="250" className="orok-input" value={separationModal.refund_condition} onChange={e=>setSeparationModal({...separationModal,refund_condition:e.target.value})}/></label>
            </div>
            <section style={{marginTop:16,padding:12,border:'1px solid #e7dfd8',borderRadius:10}}><strong>Firmantes adicionales de la separación y minuta</strong><p style={{fontSize:12,color:'#57534e'}}>El titular es la persona indicada arriba. Agrega aquí al cónyuge o coevaluado que también firmará.</p>{(separationModal.signers||[]).slice(1).map((signer,offset)=>{const index=offset+1,update=(field,value)=>setSeparationModal(current=>({...current,signers:current.signers.map((item,i)=>i===index?{...item,[field]:value}:item)}));return <fieldset key={index} style={{margin:'10px 0',border:'1px solid #ddd',borderRadius:8}}><legend>Firmante adicional {index}</legend><div data-responsive-grid="true" style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:8}}><label>Nombre completo<input required className="orok-input" value={signer.name||''} onChange={e=>update('name',e.target.value)}/></label><label>DNI<input required pattern="[0-9]{8}" maxLength="8" className="orok-input" value={signer.dni||''} onChange={e=>update('dni',e.target.value.replace(/\D/g,'').slice(0,8))}/></label><label>Estado civil<input required className="orok-input" value={signer.marital_status||''} onChange={e=>update('marital_status',e.target.value)}/></label><label>Domicilio<input required className="orok-input" value={signer.address||''} onChange={e=>update('address',e.target.value)}/></label></div><button type="button" className="orok-btn orok-btn-secondary" onClick={()=>setSeparationModal(current=>({...current,signers:current.signers.filter((_,i)=>i!==index)}))}>Retirar firmante</button></fieldset>;})}<button type="button" className="orok-btn orok-btn-secondary" onClick={()=>setSeparationModal(current=>({...current,signers:[...(current.signers||[]),{role:'Coevaluado',name:'',dni:'',marital_status:'',address:current.address||''}]}))}>Agregar firmante</button></section>
            <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:18}}><button type="button" disabled={separationBusy} className="orok-btn orok-btn-secondary" onClick={()=>setSeparationModal(null)}>Cancelar</button><button disabled={separationBusy} className="orok-btn orok-btn-primary"><FileText size={16}/>{separationBusy?'Generando PDF…':'Generar Separación'}</button></div>
          </form>
        </div>
      )}

      {separationDocuments && (
        <div style={{position:'fixed',inset:0,background:'rgba(15,23,42,.62)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1140,padding:16}} className="no-print">
          <div role="dialog" aria-modal="true" aria-label="Documentos de separación" className="orok-card" style={{width:620,maxWidth:'95vw',maxHeight:'92vh',overflowY:'auto'}}>
            <h3 style={{marginTop:0}}>Documentos · {separationDocuments.code}</h3>
            <p><strong>{separationDocuments.client_name}</strong> · Dpto {separationDocuments.unit_number}</p>
            <p style={{fontSize:13,background:'#fff7ed',padding:10,borderRadius:8}}>Avance: <strong>{separationDocumentProgress(separationDocuments)}/3</strong>. La confirmación automática requiere los tres documentos y un voucher que cubra como mínimo el 1% del precio del inmueble. El plazo será de 15 días calendario.</p>
            <p style={{fontSize:12,color:'#57534e'}}>La lectura automática de DNI y voucher es orientativa: muestra coincidencias o alertas, pero no mueve leads ni cambia por sí sola el estado de la unidad.</p>
            {separationDocumentProgress(separationDocuments)===3&&!separationPaymentStatus(separationDocuments).covers&&['DRAFT','ACTIVE'].includes(String(separationDocuments.status||'').toUpperCase())&&<p role="alert" style={{fontSize:13,background:'#fef2f2',color:'#991b1b',padding:10,borderRadius:8,border:'1px solid #fecaca'}}>El voucher no cubre o no permite verificar el mínimo de <strong>S/ {separationPaymentStatus(separationDocuments).required.toFixed(2)}</strong>. La unidad continúa disponible. Reemplaza el voucher o usa la confirmación manual indicando el motivo.</p>}
            {!['67.1.0','67.6.11-r28'].includes(separationDocuments.document_version)&&<p style={{fontSize:13,background:'#fef2f2',padding:10,borderRadius:8,border:'1px solid #fecaca'}}>Este borrador fue creado con la versión anterior. Regenera el PDF antes de cargar documentos; no se moverá el lead ni se bloqueará la unidad.</p>}
            <div style={{display:'grid',gap:10}}>{[
              ...[['dni','01-DNI'],['signed_separation','02-Separación firmada'],['reservation_voucher','03-Voucher de reserva']],...(separationDocuments.minute?[['signed_sale_minutes','06-Minuta firmada por las partes'],['notary_voucher','07-Voucher de notaría']]:[])
            ].map(([kind,label])=>{const document=separationDocuments.documents?.[kind],review=document?.review,reviewColor=review?.status==='match'?'#166534':review?.status==='review'?'#b45309':'#57534e',reviewDetail=separationReviewDetail(kind,review);return <div key={kind} style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,padding:12,border:'1px solid #e7dfd8',borderRadius:10}}><div><strong>{label}</strong><div style={{fontSize:12,color:document?'#166534':'#78716c'}}>{document?`Cargado por ${document.uploaded_by}`:'Pendiente'}</div>{review&&<div style={{fontSize:12,color:reviewColor,marginTop:3}}><strong>{review.label}:</strong> {review.summary}{reviewDetail&&<div style={{color:'#57534e',marginTop:2}}>{reviewDetail}</div>}</div>}</div><div style={{display:'flex',gap:7}}>{document?.drive_url&&<a className="orok-btn orok-btn-secondary" href={document.drive_url} target="_blank" rel="noopener noreferrer">Abrir</a>}<button className="orok-btn orok-btn-primary" disabled={separationBusy||!['67.1.0','67.6.11-r28'].includes(separationDocuments.document_version)} onClick={()=>uploadSeparationDocument(kind)}>{document?'Reemplazar':'Cargar'}</button></div></div>;})}</div>
            {separationDocuments.minute&&<div style={{marginTop:14,padding:12,border:'1px solid #bfdbfe',background:'#f8fbff',borderRadius:10}}><strong>Minuta: {separationDocuments.minute.status}</strong><p style={{fontSize:12,margin:'5px 0'}}>Tipo: {separationDocuments.minute.type==='bank_minute'?'Compraventa bancaria':'Compraventa directa'} · Firmantes: {separationDocuments.minute.signers?.length||0}</p>{separationDocuments.minute.drive_url&&<a className="orok-btn orok-btn-secondary" href={separationDocuments.minute.drive_url} target="_blank" rel="noopener noreferrer">Abrir minuta generada</a>}</div>}
            {separationDocuments.drive_folder_url&&<p style={{marginTop:14}}><a className="orok-btn orok-btn-secondary" href={separationDocuments.drive_folder_url} target="_blank" rel="noopener noreferrer"><FolderOpen size={15}/> Abrir carpeta privada</a></p>}
            <div style={{display:'flex',gap:8,justifyContent:'flex-end',flexWrap:'wrap',marginTop:16}}>{['DRAFT','ACTIVE'].includes(String(separationDocuments.status||'').toUpperCase())&&<button className="orok-btn orok-btn-secondary" disabled={separationBusy} onClick={()=>{setSeparationDecision({separation:separationDocuments,action:'release',reason:'',expires_at:''});setSeparationDocuments(null);}}>Cancelar borrador</button>}{['DRAFT','ACTIVE'].includes(String(separationDocuments.status||'').toUpperCase())&&<button className="orok-btn orok-btn-secondary" disabled={separationBusy} onClick={regenerateSeparation}>Regenerar PDF actualizado</button>}{['DRAFT','ACTIVE'].includes(String(separationDocuments.status||'').toUpperCase())&&<button className="orok-btn orok-btn-primary" disabled={separationBusy||!['67.1.0','67.6.11-r28'].includes(separationDocuments.document_version)} onClick={()=>{setSeparationDecision({separation:separationDocuments,action:'confirm',reason:'',expires_at:''});setSeparationDocuments(null);}}>Confirmar manualmente</button>}{['CONFIRMED','RESERVED'].includes(String(separationDocuments.status||'').toUpperCase())&&!separationDocuments.minute&&<button className="orok-btn orok-btn-primary" disabled={separationBusy} onClick={generateMinute}>Generar minuta</button>}{['CONFIRMED','RESERVED'].includes(String(separationDocuments.status||'').toUpperCase())&&separationDocuments.minute&&['signed_sale_minutes','notary_voucher'].every(kind=>separationDocuments.documents?.[kind]?.drive_file_id)&&<button className="orok-btn orok-btn-primary" disabled={separationBusy} onClick={()=>{setSeparationDecision({separation:separationDocuments,action:'sold',reason:'Cierre de venta con minuta firmada y voucher de notaría',expires_at:''});setSeparationDocuments(null);}}>Cerrar venta</button>}<button className="orok-btn orok-btn-secondary" disabled={separationBusy} onClick={()=>setSeparationDocuments(null)}>Cerrar</button></div>
          </div>
        </div>
      )}

      {separationDecision && (
        <div style={{position:'fixed',inset:0,background:'rgba(15,23,42,.62)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1150,padding:16}} className="no-print">
          <form onSubmit={submitSeparationDecision} role="dialog" aria-modal="true" aria-label="Gestionar separación" className="orok-card" style={{width:520,maxWidth:'95vw'}}>
            <h3 style={{marginTop:0}}>Gestionar {separationDecision.separation.code}</h3>
            <p><strong>{separationDecision.separation.client_name}</strong> · Dpto {separationDecision.separation.unit_number}</p>
            {separationDecision.action==='confirm'&&<p style={{fontSize:13,background:'#ecfdf5',padding:10,borderRadius:8}}>Esta confirmación manual inicia el plazo de <strong>15 días calendario</strong>, bloquea el departamento y mueve el lead al Kanban <strong>Separación</strong>. Documentos cargados: {separationDocumentProgress(separationDecision.separation)}/3.</p>}
            {separationDecision.action==='release'&&<p style={{fontSize:13}}>La unidad quedará disponible para una nueva separación. El historial se conserva.</p>}
            {separationDecision.action==='reserve'&&<label>Nueva fecha de vencimiento<input required type="date" min={new Date(Date.now()+86400000).toISOString().slice(0,10)} className="orok-input" value={separationDecision.expires_at||''} onChange={e=>setSeparationDecision({...separationDecision,expires_at:e.target.value})}/></label>}
            {separationDecision.action==='sold'&&<p style={{fontSize:13,background:'#fef2f2',padding:10,borderRadius:8}}>La venta quedará cerrada, la unidad se bloqueará y el lead pasará a Venta. El CRM exige minuta firmada y voucher de notaría.</p>}
            <label>{separationDecision.action==='confirm'&&separationDecision.separation.documents?.reservation_voucher&&!separationPaymentStatus(separationDecision.separation).covers?'Motivo obligatorio por excepción':separationDecision.action==='confirm'?'Nota opcional':'Motivo obligatorio'}<textarea required={separationDecision.action!=='confirm'||Boolean(separationDecision.action==='confirm'&&separationDecision.separation.documents?.reservation_voucher&&!separationPaymentStatus(separationDecision.separation).covers)} className="orok-input" rows="3" value={separationDecision.reason||''} onChange={e=>setSeparationDecision({...separationDecision,reason:e.target.value})}/></label>
            <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}><button type="button" disabled={separationBusy} className="orok-btn orok-btn-secondary" onClick={()=>setSeparationDecision(null)}>Cancelar</button><button disabled={separationBusy} className="orok-btn orok-btn-primary">{separationBusy?'Guardando…':'Confirmar acción'}</button></div>
          </form>
        </div>
      )}

      {apptModalLead&&<div className="no-print" style={{position:'fixed',inset:0,background:'rgba(15,23,42,.6)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:16}}><section role="dialog" aria-modal="true" aria-label="Agenda compartida" className="orok-card" style={{width:850,maxWidth:'95vw',maxHeight:'90vh',overflowY:'auto'}}><button type="button" className="orok-btn orok-btn-secondary" onClick={()=>{setApptModalLead(null);window.dispatchEvent(new Event('crm-leads'));}}>Cerrar</button><h2>{apptModalLead.name}</h2><CrmLolaPanel leadId={apptModalLead.id}/></section></div>}

      {/* STICKY HEADER & NAV */}
      <div ref={appHeaderRef} className="app-header" style={{ position: 'sticky', top: 0, zIndex: 50, background: 'var(--orok-bg)', padding: isKanban ? '20px 40px 10px 40px' : '40px 40px 10px 40px', transition: 'all 0.3s ease', borderBottom: '1px solid #f5ebe6', boxShadow: '0 4px 20px rgba(133, 68, 42, 0.05)' }}>
        <div className="app-brand-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', borderBottom: '2px solid var(--orok-brand)', paddingBottom: '15px' }}>
          <div style={{display: 'flex', alignItems: 'center', gap: '15px', minWidth: 0, maxWidth: '100%'}}>
             {settings.companyLogoUrl ? <h1 className="orok-identity-slot" style={{margin:0}}><img className="orok-logo" src={settings.companyLogoUrl} alt="ÖRÖK"/></h1> : <h1 className="orok-wordmark">ÖRÖK</h1>}
             <div style={{ borderLeft: '2px solid #e7dfd8', paddingLeft: '15px', minWidth: 0 }}>
                 {currentUser.role==='Gerente'
                   ? <div className="module-switch no-print" role="group" aria-label="Módulo de ÖRÖK">{modulesFor(currentUser.role).map(m=><button key={m.id} type="button" title={m.hint} aria-pressed={appModule===m.id} onClick={()=>appModule!==m.id&&handleTabChange(m.home)}>{m.label}</button>)}</div>
                   : <h2 style={{ color: '#57534e', margin: '0', fontSize:'16px', fontWeight:'600' }}>CRM Inmobiliario</h2>}
                 <span style={{fontSize:'10px', background:'#e0f2fe', color:'#0369a1', padding:'2px 8px', borderRadius:'12px', fontWeight:'700', display:'inline-flex', alignItems:'center', gap:'4px', marginTop:'4px'}}><div style={{width:'6px',height:'6px',borderRadius:'50%',background:'#0ea5e9'}}></div> Nube conectada</span>
                 <ProyectoSelector/>
             </div>
          </div>
          <div className="app-account" style={{textAlign: 'right', display:'flex', flexDirection:'column', alignItems:'flex-end', gap:'8px'}}>
            <button className="mobile-only orok-btn orok-btn-secondary" aria-expanded={accountOpen} aria-controls="account-actions" onClick={()=>setAccountOpen(!accountOpen)}>Mi cuenta</button>
            {settings.projectLogoUrl ? <img className="project-logo" src={settings.projectLogoUrl} alt={settings.projectName || 'Infinity 224'}/> : <h2 className="project-wordmark">{settings.projectName || 'Infinity 224'}</h2>}
            <div id="account-actions" className={'account-actions'+(accountOpen?' is-open':'')} style={{display:'flex', alignItems:'center', gap:'12px'}}>
              <div style={{textAlign:'right'}}>
                <div style={{fontSize:'12px', fontWeight:'bold', color:'var(--orok-brand)'}}>{currentUser.name} ({currentUser.role})</div>
                <div style={{fontSize:'10px', color:'#78716c'}}>Sesión: {sessionMinutes} min.</div>
              </div>
              <button onClick={handleLogout} className="orok-btn orok-btn-secondary no-print" style={{padding:'6px 10px',fontSize:'11px'}}><Users size={14}/> Cambiar usuario</button>
              <button onClick={changePassword} className="orok-btn orok-btn-secondary no-print" style={{padding:'6px 10px',fontSize:'11px'}}><Lock size={14}/> Contraseña</button>
              <button onClick={() => window.print()} className="orok-btn orok-btn-secondary no-print" style={{padding:'6px 10px', fontSize:'11px'}}><Printer size={14}/> Imprimir Pantalla</button>
              <button onClick={handleLogout} className="orok-btn orok-btn-secondary no-print" style={{padding:'6px 10px', fontSize:'11px'}}><LogOut size={14}/> Salir</button>
            </div>
          </div>
        </div>

        <div className="erp-navigation"><GroupedNav role={currentUser.role} module={appModule} active={activeTab} onChange={handleTabChange} onSearch={()=>setSearchOpen(true)}/><AppearanceMenu/></div>
      </div>
      {appModule==='crm'&&<LolaAssistant user={currentUser}/>}
      {appModule==='marketing'&&<GretaAssistant user={currentUser} tab={activeTab} onGo={handleTabChange}/>}{/* R42 · G.R.E.T.A actúa como las otras IA asistenciales */}

      {/* CONTENT AREA */}
      <div className="app-content" style={{ '--kanban-toolbar-top': `${kanbanStickyOffsets.header}px`, '--kanban-stage-top': `${kanbanStickyOffsets.header}px`, padding: isKanban ? '10px 40px 40px 40px' : '20px 16px 40px', maxWidth: isKanban ? '100%' : '1400px', margin: '0 auto', transition: 'all 0.3s ease' }}>
        {searchOpen&&<LeadSearchPalette leads={leads} onClose={()=>setSearchOpen(false)} onOpenLead={id=>{setSearchOpen(false);openLifecycle(id,'full');}} quotes={quotes} onOpenQuotes={lead=>{setSearchOpen(false);setQuoteFilter(lead.lead_number||lead.name||'');setQuotesOpen(true);handleTabChange('quotes');}} onShowInKanban={q=>{setSearchOpen(false);setKanbanSearch(q);handleTabChange('kanban');}} openChat={args=>{setSearchOpen(false);openChat({...args,origin:'busqueda'});}}/>}
        {/* RESTORED_V37_TABS_START */}
      {activeTab === 'kanban' && (<><div ref={kanbanToolbarRef} className="kanban-toolbar no-print" style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>{['Todos',...Object.keys(FUNNEL_GROUPS)].map(g=><button key={g} className={'orok-btn orok-btn-'+(funnelGroup===g?'primary':'secondary')} onClick={()=>setFunnelGroup(g)}>{g}</button>)}</div>
          <div style={{display:'flex',gap:6,alignItems:'center'}}>
            <button aria-label="Expandir todas las fichas" title="Expandir todas" className="orok-btn orok-btn-secondary" onClick={()=>setAllKanbanExpanded(true)}><ChevronsDown size={17}/> <span className="kanban-control-label">Expandir</span></button>
            <button aria-label="Contraer todas las fichas" title="Contraer todas" className="orok-btn orok-btn-secondary" onClick={()=>setAllKanbanExpanded(false)}><ChevronsUp size={17}/> <span className="kanban-control-label">Contraer</span></button>
            <button aria-expanded={showDailyQueue} className="orok-btn orok-btn-secondary" onClick={()=>setShowDailyQueue(!showDailyQueue)}><Clock size={17}/> <span className="kanban-control-label">Cola diaria ({dailyQueue.length})</span></button>
            <button aria-expanded={showLostLeads} className="orok-btn orok-btn-secondary" onClick={()=>setShowLostLeads(!showLostLeads)}><Trash2 size={17}/> <span className="kanban-control-label">Perdidos ({lostLeads.length})</span></button>
            {currentUser.role==='Gerente'&&<LeadExportMenu visible={kanbanLeads.filter(l=>funnelGroup==='Todos'||visibleStages.includes(l.status))} all={leads} scopeLabel={(funnelGroup==='Todos'?'Todas las etapas':'Grupo '+funnelGroup)+(normalizedSearch?' · búsqueda «'+kanbanSearch.trim()+'»':'')}/>}
            {duplicateDeletionLog.length>0&&<button aria-expanded={showDuplicateRegistry} className="orok-btn orok-btn-secondary" onClick={()=>setShowDuplicateRegistry(!showDuplicateRegistry)}><FileText size={17}/> <span className="kanban-control-label">Registro duplicados ({duplicateDeletionLog.length})</span></button>}
          </div>
        </div>
        {normalizedSearch&&<p role="status" style={{fontSize:12,marginTop:-8,display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>Mostrando {kanbanLeads.length} lead{kanbanLeads.length===1?'':'s'} que coinciden con «{kanbanSearch.trim()}». <button type="button" className="orok-btn orok-btn-secondary" style={{padding:'3px 8px',fontSize:11}} onClick={()=>setKanbanSearch('')}>Quitar filtro</button></p>}
        {showDailyQueue&&<section className="orok-card no-print" aria-label="Cola diaria de acciones" style={{marginBottom:16,padding:16}}><div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center'}}><div><h3 style={{margin:0}}>Cola diaria / SLA</h3><p style={{fontSize:12,marginBottom:0}}>Ordena el único semáforo de control: Crítico, Rojo, Amarillo y Verde.</p></div><strong>{dailyQueue.filter(item=>item.overdue).length} vencidas</strong></div><div className="table-scroll" style={{marginTop:10}}><table style={{width:'100%',fontSize:12,borderCollapse:'collapse'}}><thead><tr><th style={{textAlign:'left',padding:8}}>Semáforo / motivo</th><th style={{textAlign:'left',padding:8}}>Lead</th><th style={{textAlign:'left',padding:8}}>Acción</th><th style={{textAlign:'left',padding:8}}>Fecha</th><th style={{padding:8}}>Gestión</th></tr></thead><tbody>{dailyQueue.slice(0,50).map(item=><tr key={item.id} style={{borderTop:'1px solid #eee'}}><td style={{padding:8,color:item.overdue?'#b91c1c':'#57534e'}}>{item.category}</td><td style={{padding:8}}>{item.name}</td><td style={{padding:8}}>{item.next_action||'Sin próxima acción'}</td><td style={{padding:8}}>{item.next_action_at?formatLeadReceivedAt(item.next_action_at):'Sin fecha'}</td><td style={{padding:8,textAlign:'center'}}><button className="orok-btn orok-btn-secondary" onClick={()=>openLifecycle(item.id)}>Gestionar</button></td></tr>)}</tbody></table></div>{!dailyQueue.length&&<p>Sin acciones pendientes.</p>}</section>}
        {showLostLeads&&<section className="orok-card no-print" aria-label="Leads perdidos fuera del Kanban" style={{marginBottom:16,padding:16}}><div><h3 style={{margin:0}}>Perdidos / Desestimados</h3><p style={{fontSize:12,marginBottom:0}}>Fuera del Kanban operativo. Puedes reactivarlos con un recontacto, conservando su motivo e historial.{currentUser.role==='Gerente'?' Para retirar una prueba, usa “Eliminar lead” en la fila específica y confirma.':''}</p></div>{lostLeadDeletion.message&&<p role="status" style={{margin:'10px 0 0',fontSize:13,color:lostLeadDeletion.error?'#b91c1c':'#166534'}}>{lostLeadDeletion.message}</p>}<div className="table-scroll" style={{marginTop:10}}><table style={{width:'100%',fontSize:12,borderCollapse:'collapse'}}><thead><tr><th style={{textAlign:'left',padding:8}}>Lead</th><th style={{textAlign:'left',padding:8}}>Motivo</th><th style={{textAlign:'left',padding:8}}>Fecha</th><th style={{padding:8}}>Acciones</th></tr></thead><tbody>{lostLeads.map(item=>{const confirming=lostLeadDeletion.id===item.id&&!lostLeadDeletion.error;const deleting=lostLeadDeleting===item.id;return <tr key={item.id} style={{borderTop:'1px solid #eee'}}><td style={{padding:8}}>{item.name}</td><td style={{padding:8}}>{item.loss_reason||'Sin motivo'}</td><td style={{padding:8}}>{item.lost_at?formatLeadReceivedAt(item.lost_at):'Sin fecha'}</td><td style={{padding:8,textAlign:'center'}}><div style={{display:'flex',justifyContent:'center',gap:6,flexWrap:'wrap',alignItems:'center'}}><button type="button" className="orok-btn orok-btn-secondary" onClick={()=>openLifecycle(item.id)}>Reactivar</button>{currentUser.role==='Gerente'&&!confirming&&<button type="button" className="orok-btn orok-btn-secondary" style={{color:'#991b1b',borderColor:'#fecaca'}} onClick={()=>setLostLeadDeletion({id:item.id,message:'Confirma la eliminación definitiva de este lead de prueba y de sus cotizaciones vinculadas.',error:false})}>Eliminar lead</button>}{currentUser.role==='Gerente'&&confirming&&<><span style={{fontWeight:600,color:'#991b1b'}}>¿Eliminar definitivamente?</span><button type="button" className="orok-btn orok-btn-secondary" disabled={deleting} onClick={()=>setLostLeadDeletion({id:'',message:'',error:false})}>Cancelar</button><button type="button" className="orok-btn orok-btn-primary" disabled={deleting} onClick={()=>confirmLostLeadDeletion(item)}>{deleting?'Eliminando…':'Sí, eliminar'}</button></>}</div></td></tr>})}</tbody></table></div>{!lostLeads.length&&<p>Sin leads perdidos.</p>}</section>}
        {showDuplicateRegistry&&<section className="orok-card no-print" aria-label="Registro transparente de duplicados" style={{marginBottom:16,padding:16}}><h3 style={{margin:0}}>Registro transparente de duplicados ({duplicateDeletionLog.length})</h3><p style={{fontSize:12}}>Cada eliminación conserva quién la hizo, cuándo y el registro que permaneció.</p><div className="table-scroll"><table style={{width:'100%',fontSize:12,borderCollapse:'collapse'}}><thead><tr><th>Fecha</th><th>Usuario</th><th>Lead retirado</th><th>Lead conservado</th><th>Coincidencia</th><th>Cotizaciones</th></tr></thead><tbody>{duplicateDeletionLog.map(row=><tr key={row.id}><td>{formatLeadReceivedAt(row.deleted_at)}</td><td>{row.deleted_by||'Usuario registrado'}</td><td>{row.deleted_lead_number} · {row.deleted_lead_name}</td><td>{row.kept_lead_number} · {row.kept_lead_name}</td><td>{row.reason}</td><td>{row.quotes_archived??row.quote_count??0}</td></tr>)}</tbody></table></div></section>}
        <div ref={kanbanStageStripRef} className="kanban-stage-strip" onScroll={e=>syncKanbanScroll(e.currentTarget,kanbanBoardRef.current)}>
          {kanbanColumns.map(column=>{
            const stageLeads=kanbanLeads.filter(l=>l.status===column.status&&(!column.substatus?!(column.key==='followup-active'&&['No contesta','Seguimiento futuro'].includes(l.substatus)):l.substatus===column.substatus));
            return <div key={column.key} className="kanban-stage-header"><strong style={{color:'#292524', fontSize:'15px'}}>{column.label}</strong><span style={{background:'white', borderRadius:'12px', padding:'2px 8px', fontSize:'12px', fontWeight:'bold'}}>{stageLeads.length}</span></div>;
          })}
        </div>
        <div ref={kanbanBoardRef} className="kanban-board" onScroll={e=>syncKanbanScroll(e.currentTarget,kanbanStageStripRef.current)} style={{ display: 'flex', overflowX: 'auto', gap: '20px', paddingBottom:'20px' }}>
          {kanbanColumns.map(column => {
            const stage=column.status;
            const stageLeads = kanbanLeads.filter(l => l.status===stage&&(!column.substatus?!(column.key==='followup-active'&&['No contesta','Seguimiento futuro'].includes(l.substatus)):l.substatus===column.substatus));
            return (
              <div key={column.key} className={'kanban-col'+(dragOverStage===column.key?' is-drag-target':'')}
                   onDragEnter={e => { e.preventDefault(); setDragOverStage(column.key); }}
                   onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect='move'; setDragOverStage(column.key); }}
                   onDragLeave={e => { if(!e.currentTarget.contains(e.relatedTarget)) setDragOverStage(''); }}
                   onDrop={e => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('leadId'); setDragOverStage(''); if(id&&stage==='Seguimiento')openLifecycle(id);else if(id)handleLeadStageChange(id, stage); }}>
                {!stageLeads.length&&<p className="mobile-only">No hay leads en esta etapa.</p>}
                {stageLeads.map(l => {
                  const isLeadInicial = l.status === 'Lead Inicial';
                  const isAdvanced = ['Separación', 'Inicial', 'Venta'].includes(l.status);
                  const isContactadoO = ['Contactado', 'MQL', 'Cita Asistida', 'Calificado', 'Separación', 'Inicial', 'Venta', 'Cita'].includes(l.status);
                  const canScheduleAppointment = ['Contactado', 'Información enviada', 'MQL', 'Cita', 'Cita Asistida', 'Calificado', 'Separación', 'Inicial', 'Venta'].includes(l.status);
                  const isNoContesta = l.status === 'Seguimiento' && l.substatus === 'No contesta';
                  const isFollowUpStage = FOLLOW_UP_STAGES.includes(l.status);
                  const availableBrokers = [settings.broker1Name, settings.broker2Name, settings.broker3Name].filter(Boolean);
                  const leadDuplicates=duplicateCandidates(l,normalizedLeads);
                  const selectedDuplicate=leadDuplicates.find(match=>match.lead.id===duplicateKeepByLead[l.id])||leadDuplicates[0];
                  
                   const semaphore=l.sla?.severity||(l.status==='Lead Inicial'?'Verde':null);
                   const semaphoreAutomatic=l.sla?.control_mode!=='manual';
                   const semaphoreCol=semaphoreColor(semaphore);
                   const cardExpanded=Object.prototype.hasOwnProperty.call(kanbanCardExpanded,l.id)?kanbanCardExpanded[l.id]:kanbanExpanded;
                   
                   return (
                    <div key={l.id} draggable onDragStart={e => { if(e.target.closest('.kanban-contact-details')) { e.preventDefault(); return; } e.dataTransfer.effectAllowed='move'; e.dataTransfer.setData('text/plain', l.id); e.dataTransfer.setData('leadId', l.id); setDragOverStage(''); }} onDragEnd={() => setDragOverStage('')} onClick={e=>{if(!e.target.closest('button,input,select,textarea,label,summary,a,[contenteditable="true"],.kanban-contact-details'))toggleKanbanCard(l.id);}} className={'kanban-card'+(cardExpanded?'':' is-collapsed')} title={cardExpanded?'Clic en una zona libre para contraer esta ficha':'Clic para ver el detalle de esta ficha'} style={{ borderLeft: `4px solid ${semaphoreCol}` }}>
                      <div className="kanban-card-summary">
                       <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'4px'}}>
                          <div style={{ color: '#a8a29e', fontSize: '11px', fontWeight:'700' }}>{l.lead_number} · {formatLeadReceivedAt(l.received_at)} · {l.source||'Sin procedencia'}</div>
                          <div style={{display:'grid',gap:3,justifyItems:'end'}}>
                            <span title={semaphoreAutomatic?'Calculado según la fase y los plazos SLA':'Definido manualmente durante la gestión'} style={{fontSize:'10px',fontWeight:'800',background:semaphoreCol,color:'white',borderRadius:7,padding:'5px 8px',minWidth:92,textAlign:'center',boxShadow:'0 1px 2px rgba(0,0,0,.14)'}}>{semaphoreText(semaphore)}{semaphore?' · '+(semaphoreAutomatic?'SLA':'Manual'):''}</span>
                            <select aria-label={'Cambiar semáforo de '+l.name} value={semaphore||'Verde'} onClick={e=>e.stopPropagation()} onChange={e=>{e.stopPropagation();requestSemaphore(l,e.target.value);}} style={{fontSize:'10px',fontWeight:'bold',border:'1px solid '+semaphoreCol,borderRadius:6,padding:'2px 4px',outline:'none',background:'white',color:'#292524'}}><option>Verde</option><option>Amarillo</option><option>Rojo</option><option>Crítico</option></select>
                          </div>
                        </div>
                        <div className="kanban-card-title"><strong style={{ fontSize: '16px', fontWeight:'800', color:'#292524', display:'block' }}>{l.name}<LeadScoreBadge lead={l}/></strong><span aria-hidden="true">{cardExpanded?'⌃':'⌄'}</span></div>
                        <div className="kanban-contact-details" style={{fontSize:12,color:'#57534e',marginBottom:8,overflowWrap:'anywhere'}} onPointerDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}>
                          <div>Teléfono: <span className="kanban-copyable" draggable={false}>{l.phone||'Sin teléfono'}</span></div>
                          <div>Correo: <span className="kanban-copyable" draggable={false}>{l.email||'Sin correo'}</span></div>
                          {l.substatus&&<div><strong>{l.status==='Cita'?'Cita showroom':'Seguimiento'}:</strong> {l.substatus}</div>}
                          <div><strong>Próxima acción:</strong> {l.next_action||'Sin definir'}{l.next_action_at?' · '+formatLeadReceivedAt(l.next_action_at):''}</div>
                          {channelsForLead(l,chatIndex).length>0&&<div className="ch-row no-print" style={{marginTop:8}} aria-label={'Chats de '+l.name}>{channelsForLead(l,chatIndex).map(c=><button key={c.channel+c.thread_id} className="ch-btn no-print" style={{'--ch':CHANNELS[c.channel].color}} aria-label={'Abrir chat de '+CHANNELS[c.channel].label+' · '+l.name} title={'Abrir chat de '+CHANNELS[c.channel].label+(c.has_messages?'':' (sin mensajes aún)')} onClick={()=>openChat({channel:c.channel,leadId:l.id,threadId:c.thread_id,origin:'kanban'})}><ChannelIcon channel={c.channel} size={15}/>{c.has_messages&&<span className="dot" aria-hidden="true"/>}</button>)}</div>}
                        </div>
                      </div>
                       
                      <button onClick={()=>openLifecycle(l.id,'full')} className="orok-btn orok-btn-secondary no-print" style={{width:'100%',fontSize:11,marginBottom:8}}>Gestión y seguimiento</button>
                      {leadDuplicates.length>0&&<div className="no-print" style={{marginBottom:10,padding:9,borderRadius:8,border:'1px solid #fecaca',background:'#fff7f7'}}><div style={{fontSize:11,fontWeight:800,color:'#9f1239',marginBottom:6}}>Duplicado detectado por {selectedDuplicate?.reason}</div><select aria-label={'Conservar lead duplicado · '+l.name} className="orok-input" style={{margin:'0 0 6px',padding:6,fontSize:11}} value={selectedDuplicate?.lead.id||''} onChange={e=>setDuplicateKeepByLead(current=>({...current,[l.id]:e.target.value}))}>{leadDuplicates.map(match=><option key={match.lead.id} value={match.lead.id}>Conservar {match.lead.lead_number||match.lead.id} · {match.lead.name}</option>)}</select><button type="button" disabled={duplicateDeleteBusy===l.id} onClick={()=>deleteDuplicateLead(l,selectedDuplicate)} className="orok-btn orok-btn-secondary" style={{width:'100%',padding:6,fontSize:11,color:'#be123c',borderColor:'#fecaca',background:'white'}}><Trash2 size={13}/> {duplicateDeleteBusy===l.id?'Eliminando…':'Eliminar duplicado'}</button></div>}
                      {settings.aiIntegration?.summaryEnabled!==false&&<button onClick={()=>openLifecycle(l.id,'gemini')} className="orok-btn orok-btn-secondary no-print" style={{width:'100%',fontSize:11,marginBottom:8,borderColor:'#c4b5fd',color:'#6d28d9'}}>Gemini · resumen de conversación</button>}
                      <button className="orok-btn orok-btn-secondary kanban-followup-move no-print" onClick={()=>openLifecycle(l.id,'followup')} style={{width:'100%',fontSize:11,marginBottom:8}}>{isFollowUpStage?'Actualizar seguimiento':'Enviar a seguimiento con subestado'}</button>
                      {isFollowUpStage?<div className="kanban-move-stage">El seguimiento se actualiza únicamente con el botón anterior.</div>:<label className="kanban-move-stage no-print">Mover a etapa
                        <select aria-label={'Mover a etapa · '+l.name} className="orok-input" value={l.status} onChange={e=>handleLeadStageChange(l.id,e.target.value)}>{FUNNEL_STAGES.filter(stage=>stage!=='Seguimiento').map(stage=><option key={stage} value={stage}>{stage==='Cita'?'Cita agendada':stage}</option>)}</select>
                      </label>}

                      {(l.campaign_name || l.ad_name) && (
                        <div style={{ fontSize: '10px', color: '#78716c', marginBottom: '8px', background: '#faf7f5', padding: '6px', borderRadius: '6px', border: '1px solid #e7dfd8' }}>
                           {l.campaign_name && <div style={{marginBottom:'2px'}}>📢 <b>Campaña:</b> {l.campaign_name} </div>}
                           {l.ad_name && <div>🏷️ <b>Anuncio:</b> {l.ad_name}</div>}
                        </div>
                      )}
                      
                      {isLeadInicial ? (
                        <div style={{ background: '#f5ebe6', padding: '10px', borderRadius: '8px', border: '1px solid #e7dfd8', marginTop: '10px', textAlign:'center' }}>
                           <span style={{ fontSize: '11px', color:'#85442A', fontWeight:'bold' }}>NUEVO PROSPECTO</span>
                           <p style={{ fontSize: '10px', color:'#78716c', margin:'4px 0 0 0' }}>Requiere contacto inicial para activar información.</p>
                        </div>
                      ) : (
                        <div style={{ background: '#faf7f5', padding: '10px', borderRadius: '8px', border: '1px solid #e7dfd8', marginTop: '10px' }}>
                           
                           <div style={{ fontSize: '11px', color:'#78716c', fontWeight:'700', marginBottom: '6px' }}>💰 Interés y Presupuesto</div>
                           <input className="orok-input" type="number" placeholder="Presupuesto S/ (Ej. 300000)" style={{padding:'6px 8px', fontSize:'11px', margin:'0 0 6px 0'}} value={l.budget||''} onChange={e=>api.updateLeadAdvanced(l.id, {budget: e.target.value})} />
                           
                        </div>
                      )}

                      <LeadComments lead={l}/>

                      {(isNoContesta || isContactadoO) && (
                          <div style={{display:'flex', gap:'5px', marginTop:'5px'}}>
                            {['h2','h24','h48'].map(rt => (
                               <button key={rt} onClick={() => toggleReminder(l, rt)} style={{flex:1, padding:'4px', fontSize:'10px', fontWeight:'bold', borderRadius:'6px', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:'4px', background: l.reminders?.[rt] ? 'var(--orok-brand)':'#faf7f5', color: l.reminders?.[rt] ? 'white':'#78716c'}}>
                                 <Clock size={12}/> {rt.replace('h','')}H
                               </button>
                            ))}
                          </div>
                      )}

                      {isNoContesta && (
                        <div style={{ marginTop: '10px', background: '#fff7ed', padding: '8px', borderRadius: '6px', textAlign:'center' }}>
                          <span style={{ fontSize: '11px', color: '#c2410c', fontWeight: 'bold', display:'block', marginBottom:'5px' }}>Intentos: {l.contact_attempts || 0}/7</span>
                          <button onClick={() => api.leadAction(l.id,{type:'attempt'}).catch(e=>alert(e.message))} disabled={(l.contact_attempts||0) >= 7} className="orok-btn" style={{ background: '#c2410c', color: 'white', padding:'4px 8px', fontSize: '11px', width:'100%' }}>+ Registrar Intento</button>
                        </div>
                      )}

                      {/* Locked Commissions & Brokers */}
                      <details style={{ marginTop: '12px', background: '#faf7f5', padding: '10px', borderRadius: '12px', border: '1px solid #e7dfd8' }}>
                        <summary style={{ fontSize: '11px', fontWeight: '800', cursor: 'pointer', color:'var(--orok-brand)', display:'flex', alignItems:'center', gap:'4px' }}><Settings size={12}/> Comercial</summary>
                        <div style={{ marginTop: '10px' }}>
                          {availableBrokers.length > 0 && (
                            <div style={{marginBottom:'10px'}}>
                              <div style={{fontSize:'11px', fontWeight:'bold', color:'#57534e'}}>Brokers Asignados:</div>
                              {availableBrokers.map(bn => (
                                <label key={bn} style={{ fontSize:'11px', display:'flex', alignItems:'center', gap:'4px', marginTop:'4px', color:'#292524' }}>
                                  <input type="checkbox" checked={l.selectedBrokers?.includes(bn)} onChange={()=>toggleBroker(l, bn)} style={{accentColor:'var(--orok-brand)'}} /> {bn}
                                </label>
                              ))}
                            </div>
                          )}
                          <div style={{ fontSize: '11px', color: '#78716c' }}>% Vendedor: <strong>{settings.sellerCommissionPct||0}%</strong> (Fijo)</div>
                          <label style={{ fontSize: '11px', display: 'flex', gap: '5px', marginTop: '5px', color:'#292524' }}><input type="checkbox" checked={l.seller_paid||false} onChange={e => api.updateLeadAdvanced(l.id, {...l, seller_paid: e.target.checked})} style={{accentColor:'var(--orok-brand)'}}/> Vendedor Pagado</label>
                          
                          <div style={{ fontSize: '11px', color: '#78716c', marginTop:'8px' }}>% Broker: <strong>{[1,2,3].reduce((sum,n)=>sum+(l.selectedBrokers?.includes(settings['broker'+n+'Name']) ? Number(settings['broker'+n+'Pct']||0) : 0),0)}%</strong> (Fijo)</div>
                          <label style={{ fontSize: '11px', display: 'flex', gap: '5px', marginTop: '5px', color:'#292524' }}><input type="checkbox" checked={l.broker_paid||false} onChange={e => api.updateLeadAdvanced(l.id, {...l, broker_paid: e.target.checked})} style={{accentColor:'var(--orok-brand)'}}/> Broker Pagado</label>
                        </div>
                      </details>
                      
                      {isAdvanced && (
                        <div style={{position:'relative'}}>
                           <Gift size={14} style={{position:'absolute', left:'10px', top:'20px', color:'#ca8a04'}}/>
                           <input className="orok-input" style={{padding:'8px 8px 8px 30px', marginTop:'10px', marginBottom:0, fontSize:'12px', background:'#fef08a', borderColor:'#ca8a04'}} defaultValue={l.prize || ''} onBlur={(e) => api.updateLeadPrize(l.id, e.target.value)} placeholder="Premio Asignado" />
                        </div>
                      )}

                      {l.status==='Venta'&&<div style={{marginTop:12,fontSize:12,color:'#166534'}}>{l.sold_unit_id?<strong>Venta confirmada · Dpto {l.sold_unit_number} bloqueado</strong>:<button className="orok-btn orok-btn-secondary" onClick={()=>handleLeadStageChange(l.id,'Venta')}>Confirmar departamento vendido</button>}</div>}
                      {l.status === 'Venta' && settings.acabadosSheetUrl && (
                        <div style={{ marginTop: '16px', padding: '16px', background: '#dcfce7', borderRadius: '16px 16px 4px 16px' }}>
                          <strong style={{ fontSize: '14px', color: '#166534', display:'block', marginBottom:'8px' }}>✅ Venta Confirmada</strong>
                          <button onClick={() => api.openExternal(settings.acabadosSheetUrl)} className="orok-btn" style={{ background: '#16a34a', color: 'white', width:'100%' }}><FileSpreadsheet size={16}/> Cuadro de Acabados</button>
                        </div>
                      )}

                      <div className={'kanban-card-actions'+(canScheduleAppointment ? ' has-schedule' : '')}>
                        {canScheduleAppointment && (
                          <button onClick={() => setApptModalLead(l)} className="orok-btn orok-btn-secondary" style={{padding:'6px', fontSize:'11px', color:'#4f46e5', background:'#e0e7ff'}}><Calendar size={14}/> Agendar cita</button>
                        )}
                        
                        <button aria-label={'Llamar · '+l.name} onClick={() => {api.logChatAccess(l.id,{channel:'phone',origin:'kanban',action:'call'}).catch(()=>{});api.openExternal(`tel:${l.phone}`);}} className="orok-btn" style={{padding:'6px', fontSize:'11px', background:'#3b82f6', color:'white', borderColor:'#3b82f6'}}><Phone size={14}/> Llamar</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div></>
      )}


      {activeTab === 'integrations' && api.isNative && (
        <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          
          <div className="orok-card" style={{gridColumn:'1 / -1'}}>
            <h2 style={{marginTop:0,color:'var(--orok-brand)'}}>Enlaces compartidos</h2>
            <p>Todos los usuarios pueden guardar y usar estos enlaces desde PC o celular. Registra cada hoja una vez; el servidor revisa los leads cada hora mientras la aplicación nube esté en funcionamiento.</p>
            <label style={{display:'flex',gap:8,alignItems:'center'}}><input type="checkbox" checked={tools.draft.autoSync} onChange={e=>tools.change('autoSync',e.target.checked)}/>Actualizar automáticamente las hojas de leads guardadas</label>
            <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:16}}>
              <button className="orok-btn orok-btn-primary" disabled={tools.busy||syncing} onClick={()=>tools.save().catch(()=>{})}>Guardar enlaces compartidos</button>
              <button className="orok-btn orok-btn-secondary" disabled={tools.busy||syncing} onClick={syncSavedLeads}>Actualizar leads ahora</button>
              <button className="orok-btn orok-btn-secondary" disabled={tools.busy||syncing} onClick={tools.reload}>Recuperar enlaces compartidos</button>
              <button className="orok-btn orok-btn-secondary" disabled={tools.busy||syncing} onClick={tools.recover}>Recuperar enlaces de este navegador</button>
            </div>
            {tools.dirty&&<p style={{fontSize:12}}>Hay cambios de enlaces sin guardar.</p>}
            {tools.message&&<p role="status">{tools.message}</p>}{toolSyncMessage&&<p role="status">{toolSyncMessage}</p>}
            <p style={{fontSize:12}}>La lectura automática agrega y actualiza leads sin borrarlos y sin usar IA. Un enlace nuevo o cambiado debe registrarse manualmente. Guarda una columna de fecha de ingreso en la hoja para incluir los leads en el embudo por período.</p>
            <div style={{marginTop:18,paddingTop:16,borderTop:'1px dashed #e7dfd8'}}>
              <label htmlFor="legalTemplatesFolder" style={{fontWeight:700,fontSize:13}}>Carpeta privada de plantillas legales · Google Drive</label><p style={{fontSize:12,color:'#57534e',margin:'5px 0 8px'}}>Debe contener exactamente «01 - Acuerdo de reserva preferente», «02A - Minuta de compraventa bancaria» y «02B - Minuta de compraventa directa». El CRM lee la versión vigente al generar; no guarda el texto legal en la base de datos.</p><input id="legalTemplatesFolder" className="orok-input" type="url" placeholder="https://drive.google.com/drive/folders/..." value={legalTemplatesFolder||''} onChange={e=>setLegalTemplatesFolder(e.target.value)}/></div><div style={{marginTop:18,paddingTop:16,borderTop:'1px dashed #e7dfd8'}}><label htmlFor="separationTemplate" style={{fontWeight:700,fontSize:13}}>Plantilla de separación · Google Docs público (compatibilidad)</label>
              <p style={{fontSize:12,color:'#57534e',margin:'5px 0 8px'}}>Pega aquí el enlace del texto legal editable. Si el campo queda vacío, el CRM usa la plantilla interna basada en el Word aprobado.</p>
              <input id="separationTemplate" className="orok-input" type="url" placeholder="https://docs.google.com/document/d/.../edit" value={separationTemplateUrl||''} onChange={e=>setSeparationTemplateUrl(e.target.value)}/>
            </div>
            <div style={{marginTop:18,paddingTop:16,borderTop:'1px dashed #e7dfd8'}}>
              <label htmlFor="separationFilesFolder" style={{fontWeight:700,fontSize:13}}>Carpeta privada de separaciones · Google Drive</label>
              <p style={{fontSize:12,color:'#57534e',margin:'5px 0 8px'}}>Los archivos no se guardarán dentro de la base de datos. Comparte esta carpeta únicamente con la cuenta de servicio del CRM y pega aquí su enlace.</p>
              <input id="separationFilesFolder" className="orok-input" type="url" placeholder="https://drive.google.com/drive/folders/..." value={separationFilesFolder||''} onChange={e=>setSeparationFilesFolder(e.target.value)}/>
            </div>
          </div>
          {/* 1. IMPORTAR INVENTARIO */}
          <div className="orok-card">
            <h2 style={{ marginTop: 0, fontSize:'20px', fontWeight:'800', display:'flex', alignItems:'center', gap:'8px', color:'var(--orok-brand)' }}><Building2 size={24}/> 1. Importar Inventario</h2>
            <p style={{fontSize:'14px', color:'#78716c', marginBottom:'20px'}}>Carga el Cuadro de Áreas Vendibles. El CRM detectará automáticamente el departamento, piso, tipo y precio (PVP).</p>
            
            <label style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', color:'#5b21b6', background:'#ede9fe', padding:'12px', borderRadius:'8px' }}>
               <input type="checkbox" checked={useAIInventory} onChange={e => setUseAIInventory(e.target.checked)} style={{accentColor:'#8b5cf6', width:'18px', height:'18px'}} /> 
               <span><Sparkles size={14} style={{verticalAlign:'middle'}}/> <strong>Usar IA de Gemini para la extracción</strong><br/><span style={{fontSize:'10px', color:'#6d28d9'}}>(Evita errores por celdas combinadas en tu Excel)</span></span>
            </label>

            <div style={{display:'flex', gap:'8px', marginBottom:'16px'}}>
              <input id="unitInput" name="unitUrl" autoComplete="off" className="orok-input" style={{margin:0}} placeholder="https://docs.google.com/spreadsheets/..." value={unitSheetUrl} onChange={e => setUnitSheetUrl(e.target.value)} />
              <button onClick={handleSyncUnits} disabled={syncing} className="orok-btn orok-btn-primary"><Cloud size={16}/> Ligar</button>
            </div>
            
            <div style={{borderTop:'1px dashed #e7dfd8', paddingTop:'16px'}}>
              <label style={{fontWeight:'600', fontSize:'13px', color: '#57534e', display:'block', marginBottom:'10px'}}>O carga un archivo CSV desde tu PC:</label>
              <div style={{display:'flex', gap:'8px'}}>
                <button onClick={handleLocalUploadUnits} disabled={syncing} className="orok-btn orok-btn-secondary" style={{flex: 1}}><Upload size={16}/> Subir CSV Local</button>
                {currentUser.role==='Gerente'&&<button onClick={handleClearUnits} disabled={syncing} className="orok-btn" style={{background:'#fee2e2', color:'#991b1b', border:'none'}}><Trash2 size={16}/> Vaciar</button>}
              </div>
            </div>
          </div>
          
          {/* 2. IMPORTAR LEADS */}
          <div className="orok-card" style={{gridRow: 'span 2'}}>
            <h2 style={{ marginTop: 0, fontSize:'20px', fontWeight:'800', display:'flex', alignItems:'center', gap:'8px', color:'var(--orok-brand)' }}><Users size={24}/> 2. Importar Leads de Campañas</h2>
            <p style={{fontSize:'14px', color:'#78716c', marginBottom:'20px'}}>Sube tu Excel de campañas. El sistema extraerá plataformas (Fb/Ig/Tk), Campaña, Anuncio y Estatus.</p>
            
            <label style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', color:'#5b21b6', background:'#ede9fe', padding:'12px', borderRadius:'8px' }}>
               <input type="checkbox" checked={useAILeads} onChange={e => setUseAILeads(e.target.checked)} style={{accentColor:'#8b5cf6', width:'18px', height:'18px'}} /> 
               <span><Sparkles size={14} style={{verticalAlign:'middle'}}/> <strong>Usar IA de Gemini para la extracción</strong><br/><span style={{fontSize:'10px', color:'#6d28d9'}}>(Lectura flexible de columnas)</span></span>
            </label>

            {leadUrls.map((url,index)=><React.Fragment key={index}>
              <label htmlFor={'leadInput'+index} style={{fontWeight:'600',fontSize:'13px',color:'#57534e'}}>Link Público de Google Sheets · Fuente {index+1}</label>
              <div style={{display:'flex',gap:'8px',marginBottom:'16px'}}>
                <input id={'leadInput'+index} name={'leadUrl'+index} autoComplete="off" className="orok-input" style={{margin:0}} placeholder="https://docs.google.com/spreadsheets/d/..." value={url} onChange={e=>setLeadUrl(index,e.target.value)}/>
                <button aria-label={'Ligar fuente '+(index+1)} onClick={()=>handleSyncSheets(index)} disabled={syncing} className="orok-btn orok-btn-primary"><Cloud size={16}/> Ligar</button>
              </div>
              {settings.leadSheetSync?.[url]&&<p style={{fontSize:12,color:settings.leadSheetSync[url].error?'#991b1b':'#57534e'}}>Última revisión: {new Date(settings.leadSheetSync[url].checked_at).toLocaleString('es-PE',{timeZone:'America/Lima'})} · {settings.leadSheetSync[url].error||'Sincronización correcta'}</p>}
            </React.Fragment>)}
            {leadUrls.length<10&&<button className="orok-btn orok-btn-secondary" onClick={()=>tools.change('leads',[...leadUrls,''])}>Agregar otra fuente</button>}

            <label style={{ fontSize: '13px', display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '16px', color:'#991b1b', background:'#fee2e2', padding:'12px', borderRadius:'8px' }}>
               <input type="checkbox" disabled={currentUser.role!=='Gerente'} checked={strictSync} onChange={e => setStrictSync(e.target.checked)} style={{accentColor:'#991b1b', marginTop:'3px'}} /> 
               <span><strong>Sincronización Estricta (Gerencia):</strong> Retirar solo los leads que desaparezcan de la fuente importada. Se conservan los de otras fuentes, los manuales y las ventas confirmadas.</span>
            </label>

            <div style={{borderTop:'1px dashed #e7dfd8', paddingTop:'16px'}}>
              <label style={{fontWeight:'600', fontSize:'13px', color: '#57534e', display:'block', marginBottom:'10px'}}>O carga un archivo CSV desde tu PC:</label>
              <div style={{display:'flex', gap:'8px'}}>
                <button onClick={handleLocalUploadLeads} disabled={syncing} className="orok-btn orok-btn-secondary" style={{flex: 1}}><Upload size={16}/> Subir CSV Local</button>
                {currentUser.role==='Gerente'&&<button onClick={handleClearLeads} disabled={syncing} className="orok-btn" style={{background:'#fee2e2', color:'#991b1b', border:'none'}}><Trash2 size={16}/> Vaciar</button>}
              </div>
            </div>
          </div>

          {/* 3. IMPORTAR LINKS DE PLANOS */}
          <div className="orok-card">
            <h2 style={{ marginTop: 0, fontSize:'20px', fontWeight:'800', display:'flex', alignItems:'center', gap:'8px', color:'var(--orok-brand)' }}><ImageIcon size={24}/> 3. Enlazar Planos Nube (Opcional)</h2>
            <p style={{fontSize:'14px', color:'#78716c', marginBottom:'20px'}}>Pega los Google Sheets que contengan la columna "Dpt" y una columna con el link HTTP del Plano.</p>
            
            <label style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', color:'#5b21b6', background:'#ede9fe', padding:'12px', borderRadius:'8px' }}>
               <input type="checkbox" checked={useAIPlans} onChange={e => setUseAIPlans(e.target.checked)} style={{accentColor:'#8b5cf6', width:'18px', height:'18px'}} /> 
               <span><Sparkles size={14} style={{verticalAlign:'middle'}}/> <strong>Usar IA de Gemini para la extracción</strong><br/><span style={{fontSize:'10px', color:'#6d28d9'}}>(Aísla el link correcto automáticamente)</span></span>
            </label>

            <label style={{fontWeight:'600', fontSize:'13px', color: '#57534e'}}>Archivo de Planos Exteriores (Link Google Sheets)</label>
            <div style={{display:'flex', gap:'8px', marginBottom:'16px'}}>
              <input className="orok-input" style={{margin:0}} placeholder="https://docs.google.com..." value={plansExtUrl} onChange={e => setPlansExtUrl(e.target.value)} />
              <button onClick={() => handleSyncPlansUrls(true)} disabled={syncing} className="orok-btn orok-btn-secondary"><Cloud size={16}/> Ligar</button>
            </div>

            <label style={{fontWeight:'600', fontSize:'13px', color: '#57534e'}}>Archivo de Planos Interiores (Link Google Sheets)</label>
            <div style={{display:'flex', gap:'8px', marginBottom:'16px'}}>
              <input className="orok-input" style={{margin:0}} placeholder="https://docs.google.com..." value={plansIntUrl} onChange={e => setPlansIntUrl(e.target.value)} />
              <button onClick={() => handleSyncPlansUrls(false)} disabled={syncing} className="orok-btn orok-btn-secondary"><Cloud size={16}/> Ligar</button>
            </div>

            <div style={{borderTop:'1px dashed #e7dfd8', paddingTop:'16px'}}>
              <label style={{fontWeight:'600', fontSize:'13px', color: '#57534e', display:'block', marginBottom:'10px'}}>O cargar desde CSV Local:</label>
              <div style={{display:'flex', gap:'8px'}}>
                <button onClick={() => handleLocalUploadPlans(true)} disabled={syncing} className="orok-btn orok-btn-secondary" style={{flex:1, fontSize:'12px'}}><Upload size={14}/> CSV Exteriores</button>
                <button onClick={() => handleLocalUploadPlans(false)} disabled={syncing} className="orok-btn orok-btn-secondary" style={{flex:1, fontSize:'12px'}}><Upload size={14}/> CSV Interiores</button>
              </div>
            </div>
          </div>

          {/* 4. IMPORTAR ACABADOS */}
          <div className="orok-card" style={{gridColumn: '1 / -1'}}>
            <h2 style={{ marginTop: 0, fontSize:'20px', fontWeight:'800', display:'flex', alignItems:'center', gap:'8px', color:'var(--orok-brand)' }}><FileSpreadsheet size={24}/> Cuadro de Acabados Oficial</h2>
            <p style={{fontSize:'14px', color:'#78716c', marginBottom:'20px'}}>Pega el enlace del Excel de Acabados compartido en Google Drive. Este botón le aparecerá a los vendedores en el Kanban únicamente cuando un Lead pase a estado "Venta".</p>
            <input className="orok-input" placeholder="https://docs.google.com/spreadsheets/..." value={acabadosUrl} onChange={e => setAcabadosUrl(e.target.value)} />
            <button onClick={handleSaveAcabadosUrl} className="orok-btn orok-btn-secondary" style={{ width: '100%', marginTop: '16px' }}><Cloud size={16}/> Guardar Enlace Principal</button>
          </div>
        </div>
      )}
        {/* RESTORED_V37_TABS_END */}
        {activeTab==='social'&&<SocialInbox leads={leads} openChat={openChat}/>}
        {activeTab === 'weekly' && <WeeklyAnalysis selection={weeklySelection} revision={JSON.stringify([leads,units,marketingExpenses,settings])} onLead={openLifecycle} onBack={()=>setActiveTab('dashboard')} leads={leads} units={units} expenses={marketingExpenses} separations={separations}/>}
        {activeTab === 'proyectos' && <Proyectos user={currentUser}/>}
        {activeTab === 'dashboard' && (dashboardClassic?<><div style={{textAlign:'right',marginBottom:8}}><button className="orok-btn orok-btn-secondary" onClick={()=>setDashboardClassic(false)}>Volver al panel interactivo</button></div><BusinessDashboard initialFilters={dashboardFilters} onFilters={setDashboardFilters} onMonth={openWeekly} revision={JSON.stringify([leads,units,marketingExpenses,settings])} onLead={openLifecycle}/></>:<PowerDashboard leads={leads} units={units} expenses={marketingExpenses} onClassic={()=>setDashboardClassic(true)}/>)}
        {activeTab === 'help' && <HelpCenter/>}
        {currentUser.role==='Gerente'&&(activeTab==='mora'||activeTab==='moraAdmin')&&<MoraPanel section={activeTab}/>}
        {currentUser.role==='Gerente'&&activeTab==='contabilidad'&&<section className="evaluador-frame" aria-label="Contabilidad y Finanzas D.I.A.V.A"><iframe src="/contabilidad/" title="Contabilidad y Finanzas · D.I.A.V.A" style={{width:'100%',height:'calc(100vh - 210px)',minHeight:640,border:'1px solid rgba(255,255,255,.65)',borderRadius:20,background:'transparent',boxShadow:'inset 0 1px 0 rgba(255,255,255,.85),0 22px 50px -24px rgba(70,35,20,.45)',display:'block'}}/></section>}
        {currentUser.role!=='Gerente'&&activeTab==='ordenesErp'&&<section className="evaluador-frame" aria-label="Órdenes OC/OS y aprobaciones"><iframe src="/contabilidad/" title="Órdenes OC/OS y aprobaciones" style={{width:'100%',height:'calc(100vh - 210px)',minHeight:640,border:'1px solid rgba(255,255,255,.65)',borderRadius:20,background:'transparent',boxShadow:'inset 0 1px 0 rgba(255,255,255,.85),0 22px 50px -24px rgba(70,35,20,.45)',display:'block'}}/></section>}
        {currentUser.role==='Gerente'&&activeTab==='evaluador'&&<section className="evaluador-frame" aria-label="Evaluador Inmobiliario M.O.R.A"><iframe src="/evaluador/" title="Evaluador Inmobiliario · M.O.R.A" style={{width:'100%',height:'calc(100vh - 210px)',minHeight:640,border:'1px solid rgba(255,255,255,.65)',borderRadius:20,background:'transparent',boxShadow:'inset 0 1px 0 rgba(255,255,255,.85),0 22px 50px -24px rgba(70,35,20,.45)',display:'block'}}/></section>}
        {activeTab === 'ai' && currentUser.role === 'Gerente' && <><AIIntegrationMenu settings={settings}/><SocialConnections/></>}
        {activeTab === 'marketing' && <><BusinessDashboard onMonth={openWeekly} initialView="marketing" revision={JSON.stringify([leads,units,marketingExpenses,settings])} onLead={openLifecycle}/>{currentUser.role==='Gerente'&&<><AdsDashboard leads={leads} onLead={openLifecycle}/><MarketingExpenses expenses={marketingExpenses} leads={leads}/></>}</>}

        {activeTab==='campaigns'&&currentUser.role==='Gerente'&&<CampaignStudio key={studioCampaign} initialCampaign={studioCampaign}/>}
        {currentUser.role==='Gerente'&&<>{/* R42 · Marketing con G.R.E.T.A */}
          {activeTab==='mkHome'&&<GretaHoy onGo={handleTabChange}/>}
          {activeTab==='mkForms'&&<GretaFormularios/>}{/* R43 · formularios instantáneos */}
          {activeTab==='mkTrends'&&<GretaTendencias onOpenCampaign={id=>{setStudioCampaign(id);handleTabChange('campaigns');}}/>}
          {activeTab==='mkPublish'&&<><GretaPublicar onGo={handleTabChange}/><MarketingAssistant section="mkConnections"/></>}
          {activeTab==='mkKpis'&&<><GretaKpis onGo={handleTabChange}/><MarketingAssistant section="mkVariants"/><MarketingAssistant section="mkBudget"/></>}
          {activeTab==='mkBrand'&&<><MarketingAssistant section="mkBrand"/><GretaConfig/><MarketingAssistant section="mkBrief"/></>}
          {['mkVariants','mkBudget','mkConnections','mkBrief'].includes(activeTab)&&<MarketingAssistant section={activeTab}/>}
        </>}
        {activeTab === 'newLead' && (
          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <div className="orok-card">
              <h2 style={{ marginTop: 0, fontSize:'22px', fontWeight:'800', color:'var(--orok-brand)', display:'flex', alignItems:'center', gap:'8px' }}><UserPlus size={24}/> Registrar Lead Manual</h2>
              <form onSubmit={handleAddLead}>
                <div data-responsive-grid="true" style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', marginTop: '16px'}}>
                  <div><label style={{fontSize:'12px', fontWeight:'600', color:'#57534e'}}>Nombres y Apellidos</label><input className="orok-input" required value={newLead.name} onChange={e => setNewLead({...newLead, name: e.target.value})} /></div>
                  <div><label style={{fontSize:'12px',fontWeight:600}}>DNI (opcional)</label><input aria-label="DNI opcional" className="orok-input" inputMode="numeric" pattern="[0-9]{8}" maxLength="8" value={newLead.dni} onChange={e=>setNewLead({...newLead,dni:e.target.value.replace(/\D/g,'').slice(0,8)})} placeholder="8 dígitos"/></div>
                  <div><label style={{fontSize:'12px', fontWeight:'600', color:'#57534e'}}>Email</label><input className="orok-input" type="email" value={newLead.email} onChange={e => setNewLead({...newLead, email: e.target.value})} /></div>
                  <div><label style={{fontSize:'12px', fontWeight:'600', color:'#57534e'}}>Teléfono</label><input className="orok-input" required value={newLead.phone} onChange={e => setNewLead({...newLead, phone: e.target.value})} /></div>
                  <div style={{gridColumn:'1/-1'}}><label style={{fontSize:'12px', fontWeight:'600', color:'#57534e'}}>Dirección</label><input className="orok-input" required value={newLead.address} onChange={e => setNewLead({...newLead, address: e.target.value})} /></div>
                  
                  <div>
                    <label style={{fontSize:'12px', fontWeight:'600', color:'#57534e'}}>Semáforo inicial</label>
                    <div className="orok-input" style={{background:'#f5f5f4',color:'#57534e'}}>Verde · pendiente de primera gestión</div>
                  </div>
                  
                  <div>
                    <label style={{fontSize:'12px', fontWeight:'600', color:'#57534e'}}>Fuente Externa</label>
                    <select className="orok-input orok-select" value={newLead.source} onChange={e => setNewLead({...newLead, source: e.target.value})}>{LEAD_SOURCES.map(s=><option key={s}>{s}</option>)}</select>
                  </div>

                  <div style={{display:'flex', gap:'10px', gridColumn:'1/-1', background:'#faf7f5', padding:'16px', borderRadius:'12px', border:'1px solid #e7dfd8'}}>
                    <div style={{flex: 1}}>
                      <label style={{fontSize:'12px', fontWeight:'800', color:'var(--orok-brand)'}}>Tipo de Inmueble (Interés)</label>
                      <select className="orok-input orok-select" style={{background:'white'}} value={newLead.unit_interest} onChange={e => setNewLead({...newLead, unit_interest: e.target.value})}>
                        <option value="Flat">Flat</option><option value="Dúplex">Dúplex</option><option value="Loft Garden">Loft Garden</option><option value="Local Comercial">Local Comercial</option><option value="Estacionamiento">Estacionamiento</option>
                      </select>
                    </div>
                    <div style={{flex: 1}}>
                      <label style={{fontSize:'12px', fontWeight:'800', color:'var(--orok-brand)'}}>Nro Dpto (Obligatorio)</label>
                      <input className="orok-input" style={{background:'white'}} placeholder="Ej. 201" required value={newLead.dpto_number} onChange={e => setNewLead({...newLead, dpto_number: e.target.value})} />
                    </div>
                  </div>

                  <div style={{gridColumn:'1/-1', marginTop:'10px'}}>
                    <label style={{fontSize:'12px', fontWeight:'600', color:'#57534e'}}>Comentarios Iniciales</label>
                    <textarea className="orok-input" rows="3" placeholder="Información relevante del cliente..." value={newLead.comments} onChange={e => setNewLead({...newLead, comments: e.target.value})}></textarea>
                  </div>
                </div>
                <button type="submit" className="orok-btn orok-btn-primary" style={{ width: '100%', marginTop: '16px' }}><UploadCloud size={18}/> Subir Prospecto a Nube</button>
              </form>
            </div>
          </div>
        )}

        {activeTab === 'finanzas' && currentUser.role === 'Gerente' && <MarketingExpenses expenses={marketingExpenses} leads={leads}/>}

        {activeTab === 'comisiones' && currentUser.role === 'Gerente' && (
          <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="orok-card">
               <h2 style={{ marginTop: 0, fontSize:'22px', fontWeight:'800', color:'var(--orok-brand)', display:'flex', alignItems:'center', gap:'8px' }}><DollarSign size={24}/> Gestión de Comisiones de Venta</h2><p style={{fontSize:12}}>Se calcula sobre el importe real confirmado. {normalizedLeads.filter(l=>l.status==='Venta'&&!Number(l.sale_amount)).length} ventas sin importe registrado están excluidas de los montos.</p>
               
               {(() => {
                  const totalProj = Number(settings.projectTotalValue) || 1000000;
                  const pctGlobal = Number(settings.globalCommissionPct) || 5;
                  const poolGlobal = totalProj * (pctGlobal/100);
                  
                  const sales = normalizedLeads.filter(l => l.status === 'Venta');
                  const sellerPct = Number(settings.sellerCommissionPct)||0;
                  
                  const getBrokerStats = (bName, bPct) => {
                      if(!bName) return null;
                      const bSales = sales.filter(l => l.selectedBrokers?.includes(bName));
                      const bTotal = bSales.reduce((sum, l) => sum + Number(l.sale_amount || 0), 0);
                      return { name: bName, type: 'Broker', count: bSales.length, volume: bTotal, comm: bTotal * ((Number(bPct)||0)/100) };
                  };
                  const brokers = [
                      getBrokerStats(settings.broker1Name, settings.broker1Pct), 
                      getBrokerStats(settings.broker2Name, settings.broker2Pct), 
                      getBrokerStats(settings.broker3Name, settings.broker3Pct)
                  ].filter(Boolean);
                  
                  // Vendedor de planta earns from ALL direct sales (or we assume all sales pass through them)
                  const vTotal = sales.reduce((sum, l) => sum + Number(l.sale_amount || 0), 0);
                  const vendedor = { name: settings.agentName || 'Vendedor Interno', type: 'Planta', count: sales.length, volume: vTotal, comm: vTotal * (sellerPct/100) };
                  
                  const allAgents = [vendedor, ...brokers];
                  const commEarned = allAgents.reduce((s, a) => s + a.comm, 0);

                  return (
                     <div style={{marginTop:'10px'}}>
                         <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-end', borderBottom:'2px solid #e7dfd8', paddingBottom:'10px', marginBottom:'20px'}}>
                             <div>
                                <div style={{fontSize:'13px', color:'#78716c', fontWeight:'700'}}>BOLSA GLOBAL DE COMISIONES ({pctGlobal}%)</div>
                                <div style={{fontSize:'28px', fontWeight:'900', color:'var(--orok-brand)'}}>{formatMoneyPEN(poolGlobal)}</div>
                             </div>
                             <div style={{textAlign:'right'}}>
                                <div style={{fontSize:'13px', color:'#78716c', fontWeight:'700'}}>COMISIONES ASIGNADAS</div>
                                <div style={{fontSize:'28px', fontWeight:'900', color:'#16a34a'}}>{formatMoneyPEN(commEarned)}</div>
                             </div>
                         </div>
                         
                         <div className="table-scroll" role="region" aria-label="Tabla desplazable" tabIndex={0}><table style={{width:'100%', borderCollapse:'collapse', fontSize:'13px'}}>
                             <thead>
                                <tr style={{background:'#faf7f5', borderBottom:'2px solid #e7dfd8'}}>
                                    <th style={{padding:'12px', textAlign:'left', color:'#57534e'}}>Asesor / Broker</th>
                                    <th style={{padding:'12px', textAlign:'center', color:'#57534e'}}>Tipo</th>
                                    <th style={{padding:'12px', textAlign:'center', color:'#57534e'}}>Ventas Cerradas</th>
                                    <th style={{padding:'12px', textAlign:'right', color:'#57534e'}}>Volumen de Venta</th>
                                    <th style={{padding:'12px', textAlign:'right', color:'#57534e'}}>Comisión Ganada</th>
                                </tr>
                             </thead>
                             <tbody>
                                {allAgents.map((ag, i) => (
                                    <tr key={i} style={{borderBottom:'1px solid #f5ebe6'}}>
                                        <td style={{padding:'12px', fontWeight:'700', color:'#292524'}}>{ag.name}</td>
                                        <td style={{padding:'12px', textAlign:'center'}}><span style={{background: ag.type==='Broker'?'#e0e7ff':'#fef08a', color: ag.type==='Broker'?'#3730a3':'#854d0e', padding:'4px 8px', borderRadius:'6px', fontSize:'11px', fontWeight:'bold'}}>{ag.type}</span></td>
                                        <td style={{padding:'12px', textAlign:'center'}}>{ag.count}</td>
                                        <td style={{padding:'12px', textAlign:'right', fontWeight:'600'}}>{formatMoneyPEN(ag.volume)}</td>
                                        <td style={{padding:'12px', textAlign:'right', fontWeight:'800', color:'var(--orok-brand)'}}>{formatMoneyPEN(ag.comm)}</td>
                                    </tr>
                                ))}
                             </tbody>
                         </table></div>
                     </div>
                  );
               })()}
            </div>
          </div>
        )}

        {activeTab === 'quotes' && (
          <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="orok-card">
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap:12, flexWrap:'wrap', marginBottom: quotesOpen?'20px':0 }}>
                   <button type="button" aria-expanded={quotesOpen} onClick={()=>setQuotesOpen(!quotesOpen)} style={{background:'none',border:0,padding:0,cursor:'pointer',textAlign:'left'}}><h2 style={{ margin: 0, fontSize:'22px', fontWeight:'800', color:'var(--orok-brand)', display:'flex', alignItems:'center', gap:'8px' }}><FileText size={24}/> Resumen de Cotizaciones Enviadas <span style={{fontSize:13,fontWeight:600,opacity:.7}}>({visibleQuotes.length}{quoteNeedle?' de '+quotes.length:''})</span>{quotesOpen?<ChevronsUp size={20}/>:<ChevronsDown size={20}/>}</h2></button>
                   <label style={{display:'flex',alignItems:'center',gap:6,flex:'1 1 240px',maxWidth:360}}><Search size={16} aria-hidden="true"/><input aria-label="Buscar cotizaciones por lead, código o departamento" className="orok-input" style={{margin:0}} placeholder="Lead, LD-…, código o dpto" value={quoteFilter} onChange={e=>{setQuoteFilter(e.target.value);setQuotesOpen(true);}}/>{quoteFilter&&<button type="button" className="orok-btn orok-btn-secondary" onClick={()=>setQuoteFilter('')}>Quitar filtro</button>}</label>
               </div>
               {quotesOpen&&<>
               <div style={{display:'flex',gap:'10px',alignItems:'center',marginBottom:'16px',flexWrap:'wrap'}}>
                 <button className="orok-btn orok-btn-secondary" disabled={!selectedQuoteIds.length||quoteActionBusy} onClick={exportSelectedQuotes}><FileSpreadsheet size={16}/> Exportar seleccionadas (CSV)</button>
                 <button className="orok-btn orok-btn-secondary" disabled={!selectedQuoteIds.length||quoteActionBusy} onClick={()=>deleteSelectedQuotes(selectedQuoteIds)}><Trash2 size={16}/> Borrar seleccionadas</button>
                 <span style={{fontSize:'12px',color:'#78716c'}}>{selectedQuoteIds.length} seleccionadas</span>
               </div>
               {quotes.length === 0 ? (
                   <div style={{padding:'40px', textAlign:'center', color:'#78716c'}}>No hay cotizaciones registradas aún. Genera una desde la pestaña Inventario.</div>
               ) : (
                   <div className="table-scroll" role="region" aria-label="Tabla desplazable" tabIndex={0}><table style={{width:'100%', borderCollapse:'collapse', fontSize:'13px'}}>
                       <thead>
                          <tr style={{background:'var(--orok-brand)', color:'white'}}>
                              <th style={{padding:'12px'}}><input type="checkbox" aria-label="Seleccionar todas las cotizaciones" disabled={quoteActionBusy} checked={quotes.length>0&&selectedQuoteIds.length===quotes.length} onChange={e=>setSelectedQuoteIds(e.target.checked?quotes.map(q=>q.id):[])} /></th>
                              <th style={{padding:'12px', textAlign:'left'}}>Fecha y Hora</th>
                              <th style={{padding:'12px', textAlign:'left'}}>Código</th>
                              <th style={{padding:'12px', textAlign:'left'}}>Prospecto</th>
                              <th style={{padding:'12px', textAlign:'center'}}>Dpto</th>
                              <th style={{padding:'12px', textAlign:'right'}}>Precio Lista</th>
                              <th style={{padding:'12px', textAlign:'right'}}>Monto Cierre (Final)</th>
                              <th style={{padding:'12px', textAlign:'right'}}>Asesor Emisor</th><th style={{padding:'12px'}}>Acciones</th>
                          </tr>
                       </thead>
                       <tbody>
                          {visibleQuotes.map(q => (
                              <tr key={q.id} id={'cotizacion-'+q.id} style={{borderBottom:'1px solid #e7dfd8',...(quoteNeedle?{background:'rgba(181,101,74,.08)'}:{})}}>
                                  <td style={{padding:'12px'}}><input type="checkbox" aria-label={'Seleccionar cotización '+q.quote_code} disabled={quoteActionBusy} checked={selectedQuoteIds.includes(q.id)} onChange={()=>toggleQuote(q.id)} /></td>
                                  <td style={{padding:'12px', color:'#57534e'}}>{new Date(q.date).toLocaleString('es-PE')}</td>
                                  <td style={{padding:'12px', fontWeight:'700', color:'var(--orok-brand)'}}>{q.quote_code}</td>
                                  <td style={{padding:'12px', fontWeight:'600'}}>{q.lead_name}</td>
                                  <td style={{padding:'12px', textAlign:'center'}}>{q.unit_number}</td>
                                  <td style={{padding:'12px', textAlign:'right'}}>{formatMoneyPEN(q.price)}</td>
                                  <td style={{padding:'12px', textAlign:'right', fontWeight:'700', color:'#16a34a'}}>{formatMoneyPEN(q.final_price)}</td>
                                  <td style={{padding:'12px', textAlign:'right', color:'#78716c'}}>{q.seller}</td>
                                  <td style={{padding:'12px'}}><div style={{display:'flex',gap:5,flexWrap:'wrap'}}>{/^\/files\/[a-zA-Z0-9-]+\.pdf$/.test(q.pdf_path||'')&&<a className="orok-btn orok-btn-secondary" href={q.pdf_path} target="_blank" rel="noopener noreferrer" aria-label={'Abrir PDF '+q.quote_code}><FileText size={14}/> Abrir PDF</a>}{(()=>{const separation=blockingSeparationForUnit(q.unit_id)||[...separations].reverse().find(item=>item.quote_id===q.id&&['DRAFT','ACTIVE','CONFIRMED','RESERVED'].includes(String(item.status||'').toUpperCase()));return separation?<><a className="orok-btn orok-btn-secondary" href={separation.pdf_path} target="_blank" rel="noopener noreferrer"><FileText size={14}/> Abrir Separación</a><button className="orok-btn orok-btn-secondary" style={{padding:'8px',fontSize:'12px'}} onClick={()=>setSeparationDocuments(separation)}><FolderOpen size={14}/> Documentos {separationDocumentProgress(separation)}/3</button></>:<button className="orok-btn orok-btn-primary" style={{padding:'8px',fontSize:'12px'}} disabled={quoteActionBusy||isSold(units.find(unit=>unit.id===q.unit_id)||{})} onClick={()=>openSeparation(q)}><FileText size={14}/> Generar Separación</button>;})()}<button className="orok-btn orok-btn-secondary" style={{padding:'8px',fontSize:'12px'}} disabled={quoteActionBusy} aria-label={'Sincronizar ficha '+q.quote_code} onClick={()=>syncQuoteProfile(q.id)}><Users size={14}/> Actualizar ficha</button><button className="orok-btn orok-btn-secondary" style={{padding:'8px',fontSize:'12px'}} disabled={quoteActionBusy} aria-label={'Borrar cotización '+q.quote_code} onClick={()=>deleteSelectedQuotes([q.id])}><Trash2 size={14}/> Borrar</button></div></td>
                              </tr>
                          ))}
                       </tbody>
                   </table></div>
               )}
               {quoteNeedle&&quotes.length>0&&!visibleQuotes.length&&<p style={{padding:16,textAlign:'center',color:'#78716c'}}>Ninguna cotización coincide con «{quoteFilter}».</p>}
               </>}
            </div>
          </div>
        )}

        {activeTab==='settings'&&currentUser.role==='Gerente'&&<><OperacionesLola/><ConexionesIA/></>}
        {activeTab === 'settings' && currentUser.role === 'Gerente' && (
          <div style={{ maxWidth: '900px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="orok-card">
              <h2 style={{ marginTop: 0, fontSize:'22px', fontWeight:'800', color:'var(--orok-brand)', display:'flex', alignItems:'center', gap:'8px' }}><Settings size={24}/> Configuración del Proyecto</h2>
              <form onSubmit={handleSaveSettings}>
                
                <div style={{marginTop:'10px'}}>
                  <h3 style={{fontSize:'16px', color:'#292524', fontWeight:'700', borderBottom:'1px solid #e7dfd8', paddingBottom:'8px'}}>1. Presupuestos y Metas Globales</h3>
                  
                  <div style={{display:'flex', gap:'20px', padding:'20px', background:'#faf7f5', borderRadius:'16px', border:'1px solid #e7dfd8', alignItems:'flex-end', flexWrap:'wrap', marginTop:'16px'}}>
                     <div style={{flex:'1 1 200px'}}>
                        <label style={{fontWeight:'600', fontSize:'13px'}}>Valor Venta del Proyecto (inc IGV)</label>
                        <input className="orok-input" type="number" min="0" value={localSettings.projectTotalValue !== undefined ? localSettings.projectTotalValue : ''} onChange={e => setLocalSettings({...localSettings, projectTotalValue: e.target.value})} style={{margin:0, marginTop:'8px'}} />
                     </div>
                     <div style={{flex:'1 1 200px'}}>
                        <label style={{fontWeight:'600', fontSize:'13px'}}>% Valor Venta (Bolsa Comisiones)</label>
                        <div style={{display:'flex', gap:'10px', alignItems:'center', marginTop:'8px'}}>
                          <input type="range" min="1" max="10" step="0.1" value={localSettings.globalCommissionPct||5} onChange={e => setLocalSettings({...localSettings, globalCommissionPct: e.target.value})} style={{flex: 1, accentColor:'var(--orok-brand)'}} />
                          <input className="orok-input" type="number" step="0.1" value={localSettings.globalCommissionPct !== undefined ? localSettings.globalCommissionPct : 5} onChange={e => setLocalSettings({...localSettings, globalCommissionPct: e.target.value})} style={{width:'80px', margin:0}} />
                        </div>
                     </div>
                     <div style={{flex:'1 1 200px'}}>
                        <label style={{fontWeight:'600', fontSize:'13px'}}>% Valor Marketing (Bolsa Mkt)</label>
                        <div style={{display:'flex', gap:'10px', alignItems:'center', marginTop:'8px'}}>
                          <input type="range" min="0" max="10" step="0.1" value={localSettings.marketingPct||0} onChange={e => setLocalSettings({...localSettings, marketingPct: e.target.value})} style={{flex: 1, accentColor:'#3b82f6'}} />
                          <input className="orok-input" type="number" step="0.1" value={localSettings.marketingPct !== undefined ? localSettings.marketingPct : 0} onChange={e => setLocalSettings({...localSettings, marketingPct: e.target.value})} style={{width:'80px', margin:0}} />
                        </div>
                     </div>
                  </div>

                  <div data-responsive-grid="true" style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px', marginTop:'16px'}}>
                    <div>
                      <label style={{fontWeight:'600', fontSize:'13px'}}>Costo Campaña Mensual en Meta (S/)</label>
                      <div style={{display:'flex', gap:'10px', alignItems:'center', marginTop:'8px'}}>
                         <input type="range" min="0" max="10000" step="50" value={localSettings.campaignBudget||0} onChange={e=>setLocalSettings({...localSettings, campaignBudget: e.target.value})} style={{flex:1, accentColor:'var(--orok-brand)'}}/>
                         <input className="orok-input" type="number" value={localSettings.campaignBudget||0} onChange={e=>setLocalSettings({...localSettings, campaignBudget: e.target.value})} style={{width:'80px', margin:0}}/>
                      </div>
                    </div>
                    
                    <div>
                      <label style={{fontWeight:'600', fontSize:'13px'}}>Meta CPL Optimo (S/)</label>
                      <div style={{display:'flex', gap:'10px', alignItems:'center', marginTop:'8px'}}>
                         <input type="range" min="1" max="100" step="1" value={localSettings.targetCpl||0} onChange={e=>setLocalSettings({...localSettings, targetCpl: e.target.value})} style={{flex:1, accentColor:'var(--orok-brand)'}}/>
                         <input className="orok-input" type="number" value={localSettings.targetCpl||0} onChange={e=>setLocalSettings({...localSettings, targetCpl: e.target.value})} style={{width:'80px', margin:0}}/>
                      </div>
                    </div>
                  </div>
                  
                  <div data-responsive-grid="true" style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'16px', marginTop:'16px'}}>
                    <div>
                      <label style={{fontWeight:'600', fontSize:'13px'}}>Etapa del Proyecto</label>
                      <select className="orok-input orok-select" value={localSettings.projectStage || ''} onChange={e => setLocalSettings({...localSettings, projectStage: e.target.value})}>{PROJECT_STAGES.map(s => <option key={s} value={s}>{s==='Cita'?'Cita agendada':s}</option>)}</select>
                    </div>
                    
                    <div>
                      <label style={{fontWeight:'600', fontSize:'13px'}}>% Monto Separación Requerido</label>
                      <div style={{display:'flex', gap:'10px', alignItems:'center', marginTop:'8px'}}>
                         <input type="range" min="0.1" max="10" step="0.1" value={localSettings.separationPct||1} onChange={e=>setLocalSettings({...localSettings, separationPct: e.target.value})} style={{flex:1, accentColor:'var(--orok-brand)'}}/>
                         <input className="orok-input" type="number" step="0.1" value={localSettings.separationPct !== undefined ? localSettings.separationPct : 1} onChange={e=>setLocalSettings({...localSettings, separationPct: e.target.value})} style={{width:'80px', margin:0}}/>
                         <span style={{fontWeight:'bold', color:'#78716c'}}>%</span>
                      </div>
                    </div>


                  </div>
                </div>

                <div style={{marginTop:'24px'}}>
                  <h3 style={{fontSize:'16px', color:'#292524', fontWeight:'700', borderBottom:'1px solid #e7dfd8', paddingBottom:'8px'}}>2. Reglas Comerciales Fijas</h3>
                  <div style={{display:'flex', gap:'16px', marginTop:'12px', alignItems:'flex-start'}}>
                    <div style={{flex:1}}>
                      <label style={{fontWeight:'600', fontSize:'13px'}}>% Vendedor Planta (Interno)</label>
                      <div style={{display:'flex', gap:'10px', alignItems:'center', marginTop:'8px'}}>
                        <input type="range" min="0" max="2" step="0.05" value={localSettings.sellerCommissionPct||0} onChange={e => setLocalSettings({...localSettings, sellerCommissionPct: e.target.value})} style={{flex: 1, accentColor: 'var(--orok-brand)'}} />
                        <input className="orok-input" type="number" step="0.05" value={localSettings.sellerCommissionPct||0} onChange={e => setLocalSettings({...localSettings, sellerCommissionPct: e.target.value})} style={{width:'60px', margin:0}} />
                      </div>
                      <input className="orok-input" placeholder="Nombre Vendedor" value={localSettings.agentName||''} onChange={e=>setLocalSettings({...localSettings, agentName:e.target.value})} style={{marginTop:'8px'}} />
                      
                      <label style={{fontWeight:'600', fontSize:'13px', display:'block', marginTop:'16px'}}>TC SUNAT (Automático)</label>
                      <input className="orok-input" type="number" step="0.001" value={localSettings.exchangeRate||3.75} onChange={e => setLocalSettings({...localSettings, exchangeRate: e.target.value})} readOnly style={{background:'#faf7f5', color:'#78716c', marginTop:'4px', marginBottom:0}} />
                    </div>

                    <div style={{flex:1.5, background:'#faf7f5', padding:'16px', borderRadius:'12px', border:'1px solid #e7dfd8'}}>
                      <label style={{fontWeight:'600', fontSize:'13px', color:'var(--orok-brand)'}}>Brokers Externos Autorizados y % Comisión Asignada</label>
                      <div style={{display:'flex', flexDirection:'column', gap:'12px', marginTop:'12px'}}>
                        {[1, 2, 3].map(n => (
                          <div key={n} style={{display:'flex', gap:'8px', alignItems:'center', borderBottom: n===3 ? 'none':'1px dashed #e7dfd8', paddingBottom: n===3 ? '0':'8px'}}>
                            <input className="orok-input" style={{margin:0, flex:1.5}} placeholder={`Nombre Broker ${n}`} value={localSettings[`broker${n}Name`]||''} onChange={e=>setLocalSettings({...localSettings, [`broker${n}Name`]:e.target.value})} />
                            <input type="range" min="0" max="5" step="0.1" value={localSettings[`broker${n}Pct`] !== undefined ? localSettings[`broker${n}Pct`] : 1} onChange={e=>setLocalSettings({...localSettings, [`broker${n}Pct`]:e.target.value})} style={{flex:1, accentColor:'var(--orok-brand)'}} />
                            <input type="number" step="0.1" className="orok-input" style={{width:'60px', margin:0}} value={localSettings[`broker${n}Pct`] !== undefined ? localSettings[`broker${n}Pct`] : 1} onChange={e=>setLocalSettings({...localSettings, [`broker${n}Pct`]:e.target.value})} />
                            <span style={{fontSize:'12px', fontWeight:'bold', color:'#78716c'}}>%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{marginTop:'24px'}}>
                  <h3 style={{fontSize:'16px', color:'#292524', fontWeight:'700', borderBottom:'1px solid #e7dfd8', paddingBottom:'8px'}}>3. Datos Empresa (PDF Cotización)</h3>
                  <div data-responsive-grid="true" style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'16px', marginTop:'12px'}}>
                    <div><label style={{fontWeight:'600', fontSize:'13px'}}>Nombre Proyecto</label><input className="orok-input" value={localSettings.projectName||''} onChange={e => setLocalSettings({...localSettings, projectName: e.target.value})} /></div>
                    <div><label style={{fontWeight:'600', fontSize:'13px'}}>Razón Social</label><input className="orok-input" value={localSettings.companyName||''} onChange={e => setLocalSettings({...localSettings, companyName: e.target.value})} /></div>
                    <div><label style={{fontWeight:'600', fontSize:'13px'}}>RUC</label><input className="orok-input" value={localSettings.companyRuc||''} onChange={e => setLocalSettings({...localSettings, companyRuc: e.target.value})} /></div>
                  </div>
                </div>

                <div style={{marginTop:'24px'}}>
                  <h3 style={{fontSize:'16px', color:'#292524', fontWeight:'700', borderBottom:'1px solid #e7dfd8', paddingBottom:'8px'}}>4. Branding y Redes (PDF Cotización)</h3>
                  <div data-responsive-grid="true" style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px', marginTop:'12px'}}>
                    <div style={{gridColumn:'1 / -1'}}><label style={{fontWeight:'600',fontSize:'13px'}}>Combinaciones de colores</label><p style={{fontSize:11,color:'#78716c',margin:'4px 0 10px'}}>Elige una combinación completa. Puedes modificar después únicamente el color principal.</p><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(145px,1fr))',gap:8}}>{BRAND_PALETTES.map(palette=><button key={palette.id} type="button" aria-pressed={localSettings.brandPalette===palette.id} onClick={()=>setLocalSettings({...localSettings,brandPalette:palette.id,brandColor:palette.brand,brandAccentColor:palette.accent,brandBackgroundColor:palette.background,brandSurfaceColor:palette.surface,brandTextColor:palette.text,brandSoftColor:palette.soft,brandBorderColor:palette.border})} style={{padding:10,borderRadius:10,border:localSettings.brandPalette===palette.id?'2px solid '+palette.brand:'1px solid '+palette.border,background:palette.surface,color:palette.text,cursor:'pointer',fontFamily:'inherit',fontWeight:700,textAlign:'left'}}><span style={{display:'flex',gap:4,marginBottom:7}}>{[palette.brand,palette.accent,palette.soft,palette.background].map(color=><span key={color} aria-hidden="true" style={{width:24,height:18,borderRadius:5,background:color,border:'1px solid #0002'}}/>)}</span>{palette.name}</button>)}</div></div>
                    <div><label style={{fontWeight:'600', fontSize:'13px'}}>Color principal libre</label><div style={{display:'flex',gap:10,alignItems:'center'}}><input aria-label="Color principal libre" className="orok-input" type="color" value={localSettings.brandColor||'#85442A'} onChange={e => setLocalSettings({...localSettings,brandPalette:'personalizado',brandColor:e.target.value})} style={{height:'48px',padding:'4px 8px',marginBottom:8}}/><code style={{fontSize:12}}>{localSettings.brandColor||'#85442A'}</code></div></div>
                    <div><label style={{fontWeight:'600', fontSize:'13px'}}>Logo del proyecto (URL)</label><input className="orok-input" placeholder="https://..." value={localSettings.projectLogoUrl||''} onChange={e => setLocalSettings({...localSettings, projectLogoUrl: e.target.value})} /><p style={{fontSize:11,color:'#78716c',margin:'4px 0 0'}}>Aparece en el encabezado, a la derecha. Sin logo se muestra el nombre del proyecto en el color de identidad.</p></div>
                    <div><label style={{fontWeight:'600', fontSize:'13px'}}>Logo de ÖRÖK (URL)</label><input className="orok-input" placeholder="https://..." value={localSettings.companyLogoUrl||''} onChange={e => setLocalSettings({...localSettings, companyLogoUrl: e.target.value})} /><p style={{fontSize:11,color:'#78716c',margin:'4px 0 0'}}>Encabezado, a la izquierda. ÖRÖK e Infinity conservan siempre su color de identidad (rojo y marrón rojizo), sin importar la combinación de colores elegida.</p></div>
                    <div><label style={{fontWeight:'600', fontSize:'13px'}}>Web Proyecto</label><input className="orok-input" value={localSettings.webUrl||''} onChange={e => setLocalSettings({...localSettings, webUrl: e.target.value})} /></div>
                    <div><label style={{fontWeight:'600', fontSize:'13px'}}>Link Facebook</label><input className="orok-input" value={localSettings.facebookUrl||''} onChange={e => setLocalSettings({...localSettings, facebookUrl: e.target.value})} /></div>
                    <div><label style={{fontWeight:'600', fontSize:'13px'}}>Link Instagram</label><input className="orok-input" value={localSettings.instagramUrl||''} onChange={e => setLocalSettings({...localSettings, instagramUrl: e.target.value})} /></div>
                    <div><label style={{fontWeight:'600', fontSize:'13px'}}>Link WhatsApp</label><input className="orok-input" value={localSettings.whatsappUrl||''} onChange={e => setLocalSettings({...localSettings, whatsappUrl: e.target.value})} /></div>
                  </div>
                </div>
                
                <div style={{marginTop:'24px'}}>
                  <h3 style={{fontSize:'16px', color:'#292524', fontWeight:'700', borderBottom:'1px solid #e7dfd8', paddingBottom:'8px', display:'flex', alignItems:'center', gap:'6px'}}><Sparkles size={16}/> 5. Inteligencia Artificial (Gemini)</h3>
                  <div style={{marginTop:'12px'}}>
                    <label style={{fontWeight:'600', fontSize:'13px'}}>Google Gemini API Key</label>
                    <p style={{fontSize:'11px', color:'#78716c', margin:'4px 0 8px 0'}}>Genera tu clave gratuita en <a href="#" onClick={(e)=>{e.preventDefault(); api.openExternal('https://aistudio.google.com/');}} style={{color:'#8b5cf6'}}>Google AI Studio</a> para activar los resúmenes automáticos de WhatsApp en el Kanban.</p>
                    <input className="orok-input" type="password" placeholder={settings.geminiConfigured?"Configurada: escribe solo para reemplazar":"Clave de Gemini"} value={localSettings.geminiApiKey||''} onChange={e => setLocalSettings({...localSettings, geminiApiKey: e.target.value})} />
                  </div>
                </div>
                

                <button type="submit" className="orok-btn orok-btn-primary" style={{ width: '100%', marginTop: '24px', padding:'16px', fontSize:'16px' }}><Cloud size={18}/> Guardar Configuración</button>
              </form>
            </div>

            {currentUser.role==='Gerente'&&<UserManagement currentUser={currentUser} settings={settings} onSettings={api.updateSettings}/> }
            {api.isNative && (
              <div className="orok-card">
                  <h2 style={{ marginTop: 0, fontSize:'18px', fontWeight:'800', display:'flex', alignItems:'center', gap:'8px' }}><FolderOpen size={20}/> Rutas y Carpetas Locales (PC)</h2>
                  <p style={{fontSize:'13px', color:'#78716c'}}>En el celular puedes seleccionar varios planos desde Archivos o Drive. En computadora, selecciona la carpeta donde tienes los planos. El CRM buscará archivos que contengan el número del departamento (Ej. "D 201_2.pdf") y los asociará automáticamente al inventario.</p>
                  <div style={{display:'flex', gap:'12px', marginTop:'16px'}}>
                      <button onClick={() => handleSyncLocalFolder(true)} disabled={syncing} className="orok-btn orok-btn-secondary" style={{flex:1}}><FolderOpen size={16}/> Escanear Planos Ext.</button>
                      <button onClick={() => handleSyncLocalFolder(false)} disabled={syncing} className="orok-btn orok-btn-secondary" style={{flex:1}}><FolderOpen size={16}/> Escanear Planos Int.</button>
                  </div>
              </div>
            )}
          </div>
        )}

        {activeTab==='precios'&&currentUser.role==='Gerente'&&<EstrategiaPrecios/>}
        {activeTab === 'inventory' && (
          <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '24px' }}>
            {units.map(u => (
              <div key={u.id} className="orok-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start'}}>
                    <strong style={{fontSize: '24px', fontWeight:'800', color:'var(--orok-brand)'}}>Dpto {u.unit_number}</strong>
                    {(()=>{const badge=inventoryBadgeForUnit(u);return <span style={{ padding: '6px 12px', background:badge.background,color:badge.color,borderRadius:'12px',fontSize:'12px',fontWeight:'800' }}>{badge.label}</span>;})()}
                  </div>
                  <div style={{ fontSize: '14px', color: '#78716c', marginTop:'8px', fontWeight:'500' }}>
                     <span style={{color: 'var(--orok-brand)', fontWeight:'700'}}>{u.unit_type}</span> • Piso {u.floor}
                  </div>
                  
                  <div style={{background: '#faf7f5', padding: '12px', borderRadius: '8px', marginTop: '12px', border: '1px solid #e7dfd8'}}>
                     <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#57534e', marginBottom: '4px' }}>
                        <span>Área Techada:</span> <strong>{u.covered_area || 0} m²</strong>
                     </div>
                     <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#57534e', marginBottom: '8px', borderBottom: '1px solid #e7dfd8', paddingBottom: '8px' }}>
                        <span>Área Libre:</span> <strong>{u.free_area || 0} m²</strong>
                     </div>
                     <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '15px', color: 'var(--orok-brand)', fontWeight: '900' }}>
                        <span>ÁREA TOTAL:</span> <span>{((Number(u.covered_area) || 0) + (Number(u.free_area) || 0)).toFixed(2)} m²</span>
                     </div>
                  </div>

                  <div style={{ fontSize: '11px', color: '#78716c', marginTop: '16px', fontWeight: '700', textTransform: 'uppercase' }}>PVP (Precio Venta Público)</div>
                  <div style={{ fontSize: '26px', fontWeight: '900', color: '#292524', margin: '2px 0 16px 0' }}>{formatMoneyPEN(u.price)}</div>

                  {(()=>{const separation=blockingSeparationForUnit(u.id);if(!separation)return null;const expired=Date.parse(separation.expires_at)<=separationClock,status={ACTIVE:'PDF generado',CONFIRMED:'Separación realizada',RESERVED:'Unidad reservada'}[separation.status]||separation.status;return <div style={{padding:13,borderRadius:12,border:`2px solid ${expired?'#dc2626':'#f59e0b'}`,background:expired?'#fef2f2':'#fff7ed',margin:'10px 0'}}>
                    <div style={{display:'flex',justifyContent:'space-between',gap:8,alignItems:'center'}}><strong style={{color:expired?'#991b1b':'#9a3412'}}>⚠ {expired?'SEPARACIÓN VENCIDA':'UNIDAD EN SEPARACIÓN'}</strong><span style={{fontSize:11,fontWeight:800}}>{status}</span></div>
                    <div style={{fontSize:12,marginTop:8,lineHeight:1.55}}><div><strong>{separation.code}</strong></div><div>Cliente: {separation.client_name}</div><div>Generó: {separation.generated_by}</div><div>Vence: {new Date(separation.expires_at).toLocaleDateString('es-PE',{timeZone:'America/Lima'})}</div></div>
                    <div style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:10}}>
                      {separation.status==='ACTIVE'&&<button className="orok-btn orok-btn-primary" style={{padding:'7px 9px',fontSize:11}} onClick={()=>setSeparationDecision({separation,action:'confirm',reason:'',expires_at:''})}>Confirmar separación realizada</button>}
                      <button className="orok-btn orok-btn-secondary" style={{padding:'7px 9px',fontSize:11}} onClick={()=>setSeparationDecision({separation,action:'release',reason:'',expires_at:''})}>Liberar unidad</button>
                      <button className="orok-btn orok-btn-secondary" style={{padding:'7px 9px',fontSize:11}} onClick={()=>setSeparationDecision({separation,action:'reserve',reason:'',expires_at:''})}>Mantener reservada</button>
                      <button className="orok-btn orok-btn-secondary" style={{padding:'7px 9px',fontSize:11}} onClick={()=>setSeparationDocuments(separation)}>Documentos y cierre</button>
                    </div>
                  </div>;})()}
                  
                  {api.isNative && !settings.plansDrivePath && (
                     <div style={{display:'flex', gap:'8px', marginTop:'16px'}}>
                       <button onClick={async () => { const f = await window.crmAPI.selectImage(); if(f) await api.updateUnitPlan(u.id, f, undefined); }} className="orok-btn orok-btn-secondary" style={{ padding:'8px 12px', fontSize:'11px', flex:1 }}><ImageIcon size={14}/> {u.plan_image_ext ? 'Ext OK' : 'Plano Ext Local'}</button>
                       <button onClick={async () => { const f = await window.crmAPI.selectImage(); if(f) await api.updateUnitPlan(u.id, undefined, f); }} className="orok-btn orok-btn-secondary" style={{ padding:'8px 12px', fontSize:'11px', flex:1 }}><ImageIcon size={14}/> {u.plan_image_int ? 'Int OK' : 'Plano Int Local'}</button>
                     </div>
                  )}
                  
                  {(u.plan_image_ext || u.plan_image_int) && (u.plan_image_ext.startsWith('http') || u.plan_image_int.startsWith('http')) && (
                     <div style={{ fontSize: '12px', color: 'var(--orok-brand)', fontWeight: '700', background:'#f5ebe6', padding:'8px 12px', borderRadius:'8px', display:'flex', alignItems:'center', gap:'6px', marginTop:'16px' }}><Cloud size={14}/> Planos Nube Conectados</div>
                  )}
                </div>
                <div style={{ marginTop:'24px' }}>
                  {api.isNative && <button disabled={isSold(u)} onClick={() => setQuoteModal({ open: true, unit: u, leadId: '', leadSearch: '', clientName:'', dni: '', phone:'', email:'', address:'', unitInterest:'', budget:'', discountPct: 0, teaPct: lastTea(), financingType: 'Hipotecario', customInitialPct: 10, parking: 'Ninguno', brokerName: '', directCreditMonths: settings.directCreditMonths || 12, recontactAt: '' })} className="orok-btn orok-btn-primary" style={{ width:'100%' }}><FileText size={16}/> {isSold(u)?'Departamento vendido':'Generar Cotización PDF'}</button>}
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  )
}

