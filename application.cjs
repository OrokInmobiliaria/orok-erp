'use strict';
const fs=require('node:fs'),path=require('node:path'),{randomUUID,createHash}=require('node:crypto'),{Worker}=require('node:worker_threads');
const {createQueries}=require('./business/queries');
const {iso,event}=require('./business/lifecycle');
const {appendComment}=require('./business/leadComments');
const {analytics}=require('./business/analyticsService');
const {assertQuotable}=require('./business/salesService');
const {selectedQuotes,quotesCSV}=require('./business/quoteRecords');
const {fetchSheet,decodeCSV}=require('./business/sheetAccess');
const {choosePlan,publicFolderFiles,folderId}=require('./business/planService');
const {allowedURL}=require('./safe-network.cjs');
const {assets}=require('./assets.cjs');
const {activeForUnit,fetchSeparationTemplate,attachDocument,amount,text}=require('./business/separationService');
const {DriveDocumentStore}=require('./business/driveDocumentStore');
const {LegalTemplateStore}=require('./business/legalTemplateStore');
const {createMinute,minuteType}=require('./business/minuteService');
const {generateLegalPDF}=require('./business/legalDocumentPDF');
const {recognizeSeparationDocument}=require('./business/documentRecognition');
const {applyLolaEvent}=require('./business/lolaIntegration');
const {WhatsAppService}=require('./business/whatsappService');
const {Omnichannel}=require('./business/omnichannel');
const {CrmConversation}=require('./business/crmConversation');
const {SocialInbox}=require('./business/socialInbox');
const {AdsAnalytics}=require('./business/adsAnalytics');
const {CreativeCampaigns,factsFromUnits}=require('./business/creativeCampaigns');
const {MarketingAssistant}=require('./business/marketingAssistant');
const {Pipelines}=require('./business/pipelines');
const {LeadExport}=require('./business/leadExport');
const {PublicationAnalytics}=require('./business/publicationAnalytics');
const {CustomerCare}=require('./business/customerCare');
const {MoraIntegration,MORA_METHODS}=require('./business/moraIntegration');
const {PreciosEstrategia,PRECIOS_METHODS}=require('./business/preciosEstrategia'); // R48 · Ventas › Estrategia de precios
const {LolaAssistant,LOLA_ASSIST_METHODS}=require('./business/lolaAssistant');
const {ClaraErp,CLARA_METHODS}=require('./business/claraErp');
const {Greta,GRETA_METHODS,paraLola}=require('./business/greta');
const {McpConnector,MCP_METHODS}=require('./business/mcpConnector'); // R44 · conector del ERP para Claude
const {Resguardo,OPS_METHODS}=require('./business/resguardo'); // R45 · L.O.L.A Operaciones: resguardo externo cifrado // R42 · Marketing con G.R.E.T.A
const {ProjectDrive}=require('./business/projectDrive');
const {RellenarIA,IA_RELLENAR_METHODS}=require('./business/rellenarIA'); // R54 · Dictar o adjuntar
const {DeviceEnrollment,INSTALL_METHODS}=require('./business/deviceEnrollment');
const managerMethods=new Set(['aplicarPreciosEstrategia','updateSettings','saveIntegrationCredentials','addUnit','updateUnitStatus','updateUnitPlan','syncLocalFolder','clearUnits','clearLeads','deleteLostLead','deleteQuotes','addMarketingExpense','deleteMarketingExpense','reconcileQuoteProfiles','importChannelHistory']);
const readMethods={getSettings:'settings',getLeads:'leads',getUnits:'units',getQuotes:'quotes',getSeparations:'separations',getMarketingExpenses:'marketing_expenses',getDuplicateDeletionLog:'duplicate_deletion_log'};
const mutationMethods=new Set(['aplicarPreciosEstrategia','addLead','addLeadComment','logChatAccess','backfillLeadReceivedDates','updateToolLinks','leadAction','updateLeadStatus','updateLeadAppt','updateLeadPrize','updateLeadAdvanced','deleteDuplicateLead','syncQuoteLeadProfile','updateSeparation','saveBankEvaluation','transitionBankEvaluation','updateMinuteStatus','saveSession','syncUnits','syncUnitsAI','syncPlansUrl','syncPlansAI',...managerMethods]);
// Deliberately local: cotizaciones must remain available even when a legacy
// lifecycle module is still being upgraded on a hosting node.
function qualificationPending(lead){return [['budget','Presupuesto'],['unit_interest','Tipología de interés'],['purchase_horizon','Horizonte de compra']].filter(([key])=>key==='budget'?!(Number(lead[key])>0):!String(lead[key]||'').trim()).map(([,label])=>label);}
function leadAssignment(user,settings={}){const fallback=String(settings.defaultSalesOwner||settings.agentName||user.name||'').trim();if(user.role==='Broker'&&String(user.brokerName||'').trim())return {actor:user.name,sales_owner:user.brokerName,broker_name:user.brokerName};return {actor:user.name,sales_owner:fallback};}
function publicSettings(settings){const result={...settings};for(const key of Object.keys(result))if(/password|secret|token|api.?key|manager.?pin/i.test(key))delete result[key];result.geminiConfigured=!!settings.geminiApiKey;result.salesAccessEmail='soportetecnologico@orok.com.pe';return result;}
function application({store,auth,cache,authCache,config,syncer,historialIA=null,supportMail,whatsappOptions={},socialOptions={},creativeOptions={},backups={run:async()=>({skipped:true})},sla={preview:async()=>({enabled:false,eligible:0,changes:[],moves:[],assessments:[]}),run:async()=>({enabled:false,eligible:0,updated:0,moved:0})}}){
 const approvalMail=supportMail||require('./cloud-approval-mail.cjs').createCloudApprovalMail(config);
 const library=assets(path.join(config.privateDir,'files')),jobs=new Map(),analyticsCache=new Map();
 const whatsapp=new WhatsAppService(store,config,whatsappOptions);const customerCare=new CustomerCare(store,whatsapp);
 const social=new SocialInbox(store,config,socialOptions),ads=new AdsAnalytics(store,config,socialOptions);
 const creative=new CreativeCampaigns(store,config,ads,creativeOptions);const assistant=new MarketingAssistant(store,config,ads,creative);const pipelines=new Pipelines(store,config,creative);const leadExport=new LeadExport(store,config,creativeOptions.leadExport||{});const publications=new PublicationAnalytics(store,config,creativeOptions);
 const omnichannel=new Omnichannel(store,config,whatsapp,social,socialOptions);social.common=omnichannel;const crmConversation=new CrmConversation(store,config);omnichannel.crm=crmConversation;crmConversation.engine.alerts=whatsapp.alerts;
 const projectDrive=new ProjectDrive(store,config);
 // R52 · Las IA (L.O.L.A, G.R.E.T.A, M.O.R.A, D.I.A.V.A) reciben, junto a las fuentes del Drive, el historial agregado de otros proyectos si Gerencia lo permitió.
 if(historialIA){const base=projectDrive.context.bind(projectDrive);projectDrive.context=async(module,reference,user)=>{const c=await base(module,reference,user);let h=null;try{h=await historialIA(module);}catch(_){h=null;}if(!h)return c;return {...(c||{}),fuentes:c?.fuentes||[],historial_otros_proyectos:h};};}
 whatsapp.projectDrive=projectDrive;crmConversation.engine.projectDrive=projectDrive;
 const mora=new MoraIntegration(store,config);
 const precios=new PreciosEstrategia(store,{origin:config.origin});mora.precios=precios;
 mora.projectDrive=projectDrive;
 const lolaAssistant=new LolaAssistant(store,config,{fetcher:creativeOptions.assistantFetcher});
 lolaAssistant.projectDrive=projectDrive;
 const enrollment=new DeviceEnrollment(config);
 const greta=new Greta(store,config,{assistant:lolaAssistant,creative,ads,publications,pipelines,fetcher:creativeOptions.gretaFetcher});
 greta.projectDrive=projectDrive;
 creative.onMedia=media=>projectDrive.archiveMedia(media,creative);
 const clara=new ClaraErp(store,config,{assistant:lolaAssistant,fetcher:creativeOptions.claraFetcher,mailer:creativeOptions.claraMailer||approvalMail});
 // R48 · Aprobación de precios: mismos correos del directorio de Aprobaciones (D.I.A.V.A) y el mismo correo del servidor.
 precios.mailer=creativeOptions.claraMailer||approvalMail;precios.directorio=async()=>{const users=auth.snapshot?((await auth.snapshot()).users||[]):[],dir=await clara.list('aprobadores');return users.map(u=>({name:u.name,role:u.role,email:dir.find(d=>d.user_id===u.id&&!d.eliminado)?.email||''}));};
 clara.projectDrive=projectDrive;
 async function ingestLola(payload){
  if(/^project_drive_/.test(String(payload?.action||'')))return projectDrive.action(payload);
  if(/^mora_/.test(String(payload?.action||'')))return mora.action(payload,()=>cache.read());
  if(/^clara_/.test(String(payload?.action||'')))return clara.action(payload);
  if(payload?.action==='greta_para_lola')return {ok:true,...(paraLola(config.privateDir)||{campanas_activas:[]})};
  if(['lola_job_claim','lola_job_complete','lola_job_media','lola_task_begin','lola_task_complete','lola_audio_route','lola_maintenance','lola_form'].includes(payload?.action))return omnichannel.action(payload);
  if(payload?.action==='voice_job_claim')return pipelines.claimVoice();
  if(payload?.action==='voice_job_complete')return pipelines.completeVoice(payload);
  if(payload?.action==='voice_job_fail')return pipelines.failVoice(payload);
  if(payload?.action==='publication_job_claim')return pipelines.claimPublication(payload);
  if(payload?.action==='lead_form_claim')return greta.forms.claim(); // R43 · formularios instantáneos de G.R.E.T.A (flujo n8n inactivo hasta su prueba)
  if(payload?.action==='lead_form_complete')return greta.forms.complete(payload);
  if(payload?.action==='lead_form_fail')return greta.forms.fail(payload);
  if(payload?.action==='publication_job_media')return pipelines.publicationMedia(payload);
  if(payload?.action==='publication_job_complete')return pipelines.completePublication(payload);
  if(payload?.action==='publication_job_fail')return pipelines.failPublication(payload);
  if(payload?.action==='creative_cycle_tick')return pipelines.cycleTick();
  if(payload?.action==='daily_brief_get')return assistant.briefForDelivery(await cache.read());
  if(payload?.action==='daily_brief_confirm')return assistant.confirmBrief(payload);
  if(payload?.action==='creative_job_claim')return creative.claim();
  if(payload?.action==='creative_job_run'){const result=await creative.run(payload);if(result.campaign_id){try{result.drive=await projectDrive.archiveResult('propuesta',{},result,{name:'Generador de campañas'},creative);}catch(e){result.drive={state:'error',reason:e.message};}}return result;}
  if(payload?.action==='social_message')return omnichannel.ingest(payload);
  if(payload?.action==='social_job_claim')return social.claim();
  if(payload?.action==='social_job_complete')return social.complete(payload);
  if(payload?.action==='lola_birthday_maintenance')return customerCare.maintenance();
  if(payload?.action==='lola_followup_maintenance')return whatsapp.followups.maintenance();
  if(payload?.action==='whatsapp_recovery_maintenance')return whatsapp.recovery.maintenance();
  if(payload?.action==='publication_snapshot')return publications.snapshot(payload,'n8n · reporte normalizado');
  if(payload?.action==='publication_sync')return publications.sync(payload.channel,'n8n · lectura oficial');
  if(payload?.action==='publication_analysis')return publications.analyze(payload,'n8n · análisis solicitado');
  if(payload?.action==='ads_sync')return ads.sync(payload,'n8n · reportes oficiales');

  if(payload?.action==='whatsapp_message')return whatsapp.ingest(payload);
  if(payload?.action==='whatsapp_status')return whatsapp.status(payload);
  if(payload?.action==='whatsapp_audio_route'){const snapshot=await whatsapp.jobs.doc(String(payload.job_id)).get(),job=snapshot.data();if(!job||job.lease_token!==payload.lease_token)throw Error('Audio no autorizado.');return {ok:true,routed:await whatsapp.agenda.routeTranscript(job,String(payload.transcript||''))};}
  if(payload?.action==='whatsapp_task_begin')return whatsapp.agenda.begin(payload);
  if(payload?.action==='whatsapp_task_complete')return whatsapp.agenda.complete(payload);
  if(payload?.action==='whatsapp_maintenance')return whatsapp.agenda.maintenance();
  if(payload?.action==='whatsapp_job_claim')return whatsapp.claim();
  if(payload?.action==='whatsapp_job_complete')return whatsapp.complete(payload);
  if(payload?.action==='whatsapp_job_media')return whatsapp.jobMedia(payload);
  return store.run(({read,write})=>{
   const data=read(),result=applyLolaEvent(data,payload,'Lola IA');
   if(!result.duplicate)write(data);
   return result;
  });
 }
 function analyticsInWorker(data,filters){return new Promise((resolve,reject)=>{
  const worker=new Worker(path.join(__dirname,'analytics-worker.cjs'),{workerData:{data,filters:filters||{}}});
  const timer=setTimeout(()=>{void worker.terminate();reject(Error('El análisis histórico tardó demasiado. Intenta acotar el período.'));},60000);
  worker.once('message',result=>{clearTimeout(timer);void worker.terminate();if(result?.error)reject(Error(result.error));else resolve(result.value);});
  worker.once('error',error=>{clearTimeout(timer);void worker.terminate();reject(error);});
 });}
 async function cachedAnalytics(filters={}){
  const data=await cache.read(),key=String(data._state_revision||0)+':'+JSON.stringify(filters||{});
  if(analyticsCache.has(key))return structuredClone(await analyticsCache.get(key));
  const pending=analyticsInWorker(data,filters);analyticsCache.set(key,pending);
  try{const result=await pending;if(analyticsCache.size>40){const keep=analyticsCache.get(key);analyticsCache.clear();analyticsCache.set(key,keep);}return structuredClone(result);}catch(error){analyticsCache.delete(key);throw error;}
 }
 function compactSlaReport(report){
  const bySeverity={Verde:0,Amarillo:0,Rojo:0,'Crítico':0};
  for(const item of report.assessments||[])if(item.state?.severity in bySeverity)bySeverity[item.state.severity]++;
  return {enabled:report.enabled,eligible:report.eligible,updated:report.changes?.length||0,moved:report.moves?.length||0,bySeverity,leads:(report.assessments||[]).filter(item=>item.changed).slice(0,20).map(({lead,state})=>({id:lead.id,lead_number:lead.lead_number,name:lead.name,status:lead.status,severity:state.severity,reason:state.reason,manual:state.control_mode==='manual'}))};
 }
 async function reconcileHistoricalQuotes(){
  return store.run(async({read,write})=>createQueries(read,write).reconcileQuoteProfiles('Sistema'));
 }
 async function mutate(method,args,cookie){
  let preConnectionBackup=null;
  if(method==='importChannelHistory'&&args[0]?.initial_reconciliation===true){
   const manager=await authCache.require(cookie,true),current=await store.read();
   if(manager.role!=='Gerente')throw Error('Requiere Gerencia.');
   if(!current.settings?.aiIntegration?.history_reconciled_at){
    preConnectionBackup=await backups.run({reason:'Antes de primera conexión y conciliación histórica de canal',category:'connection'});
    if(!preConnectionBackup?.file)throw Error('No se pudo verificar el respaldo previo; la primera conexión no se ejecutó.');
   }
  }
  // A lost or discarded lead may be purged only by Gerencia. Create a normal
  // rolling backup first so a test cleanup never becomes an irreversible data
  // loss. The scheduler retains at most four copies.
  // R48 · Aplicar precios de la estrategia: solo Gerencia y con respaldo previo, como cualquier cambio masivo de inventario.
  let preciosDoc=null,preciosMercado=null;
  if(method==='aplicarPreciosEstrategia'){
   const manager=await authCache.require(cookie,true);
   if(manager.role!=='Gerente')throw Error('Solo Gerencia puede aplicar precios.');
   preciosDoc=await precios.config();preciosMercado=await precios.mercado(preciosDoc?.config);
   const backup=await backups.run({reason:'Antes de aplicar precios de la estrategia'});
   if(!backup?.file)throw Error('No se pudo comprobar el respaldo previo; los precios no se cambiaron.');
  }
  if(method==='deleteLostLead'){
   const manager=await authCache.require(cookie,true);
   if(manager.role!=='Gerente')throw Error('Solo Gerencia puede eliminar leads perdidos o desestimados.');
   const backup=await backups.run({reason:'Antes de eliminar lead perdido o desestimado'});
   if(!backup?.file)throw Error('No se pudo comprobar el respaldo previo; el lead no fue eliminado.');
  }
  const result=await store.run(async({tx,read,write})=>{
   const user=await auth.requireTx(tx,cookie,managerMethods.has(method));
   const q=createQueries(read,d=>{
    for(const unit of d.units||[])for(const k of ['plan_image_ext','plan_image_int'])if(unit[k])library.resolve(unit[k]);
    if(d.settings?.projectLogoUrl)library.resolve(d.settings.projectLogoUrl);
    if(d.settings?.companyLogoUrl)library.resolve(d.settings.companyLogoUrl);
    write(d);
   });
   if(method==='saveIntegrationCredentials'){
    // Keys are intentionally kept outside Firestore and are never returned to
    // the browser.  A Manager-only session can replace them, but no ordinary
    // CRM user can read or alter this private server file.
    const input=args[0]||{},text=(value,max=1000)=>String(value||'').trim().slice(0,max);
    const provider=text(input.provider,100),engine=text(input.engine,100),apiKey=text(input.apiKey,2000),webhookSecret=text(input.webhookSecret,2000);
    const secureUrl=(value,label,required=false)=>{const raw=text(value,1500);if(!raw){if(required)throw Error('Indica la '+label+'.');return '';}let parsed;try{parsed=new URL(raw);}catch{throw Error('La '+label+' no es válida.');}if(parsed.protocol!=='https:')throw Error('La '+label+' debe usar HTTPS.');return parsed.href;};
    const webhookUrl=secureUrl(input.webhookUrl,'URL de webhook',true),responseWebhookUrl=secureUrl(input.responseWebhookUrl,'URL de respuesta');
    if(!provider||!engine)throw Error('Selecciona el orquestador y el motor que responde.');
    if(!apiKey&&!webhookSecret)throw Error('Registra al menos una llave de acceso o un secreto de firma.');
    if((provider==='n8n'||webhookSecret)&&webhookSecret.length<24)throw Error('El secreto de firma debe tener al menos 24 caracteres; utiliza una clave aleatoria de 32 o más.');
    if(!config.privateDir)throw Error('No está disponible el almacenamiento privado del servidor.');
    const savedAt=new Date().toISOString(),destination=path.join(config.privateDir,'integracion-ia-webhooks.json'),temporary=destination+'.tmp-'+randomUUID();
    const privateConfig={version:1,provider,engine,webhookUrl,responseWebhookUrl:responseWebhookUrl||null,apiKey:apiKey||null,webhookSecret:webhookSecret||null,savedAt,savedBy:user.name};
    fs.mkdirSync(config.privateDir,{recursive:true,mode:0o700});fs.writeFileSync(temporary,JSON.stringify(privateConfig),{encoding:'utf8',mode:0o600});fs.renameSync(temporary,destination);try{fs.chmodSync(destination,0o600);}catch{}
    return {configured:true,saved_at:savedAt};
   }
   if(method==='updateSettings'){const previous=read().settings;const previousOwner=String(previous.defaultSalesOwner||previous.agentName||'').trim();const hadExplicitDefault=Boolean(String(previous.defaultSalesOwner||'').trim());const next={...previous,...args[0],...(previous.toolLinks?{toolLinks:previous.toolLinks,acabadosSheetUrl:previous.toolLinks.finishes}:{}),...(previous.leadSheetSync?{leadSheetSync:previous.leadSheetSync}:{})};if(args[0].geminiApiKey==='')delete next.geminiApiKey;delete next.geminiConfigured;const saved=q.updateSettings(next,user.name);const nextOwner=String(next.defaultSalesOwner||next.agentName||'').trim();if(nextOwner&&(!hadExplicitDefault||nextOwner!==previousOwner))q.assignUnassignedLeads(nextOwner,user.name);return saved;}
   if(method==='aplicarPreciosEstrategia'){const d=read();const ap=precios.aplicarEnDatos(d,preciosDoc,args[0],user,preciosMercado);write(d);return ap;}
   if(method==='importChannelHistory')return {...q.importChannelHistory(args[0],user.name),pre_connection_backup:preConnectionBackup?{file:preConnectionBackup.file,sha256:preConnectionBackup.sha256}:null};
   if(method==='addUnit'){const unit={...args[0],id:randomUUID()};if(!String(unit.unit_number||'').trim()||(read().units||[]).some(u=>String(u.unit_number)===String(unit.unit_number)))throw Error('Número de unidad vacío o duplicado.');return q.addUnit(unit);}
   if(method==='clearLeads'&&(read().leads||[]).some(l=>l.sold_unit_id))throw Error('El historial de ventas confirmadas impide vaciar los leads.');
   if(method==='addLead')return q.addLead(args[0],leadAssignment(user,read().settings));
   if(method==='reconcileQuoteProfiles')return q.reconcileQuoteProfiles(user.name);
   if(method==='syncQuoteLeadProfile')return q.syncQuoteLeadProfile(args[0],user.name);
   if(method==='updateSeparation')return q.updateSeparation(args[0],args[1],args[2],user.name);
   if(method==='saveBankEvaluation')return q.saveBankEvaluation(args[0],args[1],user.name);
   if(method==='transitionBankEvaluation')return q.transitionBankEvaluation(args[0],args[1],args[2],user.name);
   if(method==='updateMinuteStatus')return q.updateMinuteStatus(args[0],args[1],args[2],user.name);
   if(method==='deleteDuplicateLead')return q.deleteDuplicateLead(args[0],args[1],user.name);
   if(method==='addLeadComment')return q.addLeadComment(args[0],args[1],user.name);
   if(method==='logChatAccess')return q.logChatAccess(args[0],args[1],user.name);
   if(method==='updateToolLinks')return q.updateToolLinks(args[0],user.name);
   if(method==='addMarketingExpense')return q.addMarketingExpense(args[0],user.name);
   if(method==='leadAction'){
    const lead=read().leads.find(l=>l.id===args[0]),a=args[1]||{};
    if(a.type==='appointment_cancel'&&(lead?.appointments||[]).some(x=>x.id===a.payload?.id&&x.calendar_event_id))throw Error('Esta cita está vinculada a Calendar. Cancélala desde Agenda compartida.');
    if(a.type==='schedule'&&(lead?.appointments||[]).some(x=>x.status==='scheduled'&&x.calendar_event_id))throw Error('Reprograma esta cita desde Agenda compartida para actualizar Calendar e invitados.');
    return q.leadAction(args[0],a,user.name);
   }
   if(method==='updateLeadStatus')return q.updateLeadStatus(args[0],args[1],user.name);
   if(method==='updateLeadAppt')return q.updateLeadAppointment(args[0],args[1],user.name);
   if(method==='updateLeadAdvanced'){const change={...args[1]};if(user.role!=='Gerente'){const before=read().leads.find(l=>l.id===args[0]);for(const k of ['seller_paid','broker_paid','prize'])if(k in change&&JSON.stringify(change[k])!==JSON.stringify(before?.[k]))throw Error('La gestión de pagos requiere Gerencia.');}return q.updateLeadAdvanced(args[0],change,user.name);}
   if(method==='updateLeadPrize'&&user.role!=='Gerente')throw Error('La gestión de premios requiere Gerencia.');
   if(method==='saveSession')return q.saveSession({...args[0],seller:user.name,userId:user.id});
   if(method==='syncLocalFolder'){
    const {files,isExt}=args[0];if(!Array.isArray(files)||files.length>100)throw Error('Selecciona hasta 100 planos.');
    const normalized=files.map(f=>{if(!String(f.url).startsWith('/files/'))throw Error('Archivo no válido.');library.resolve(f.url);return {name:String(f.name).slice(0,200),url:f.url};});
    const rows=[];for(const unit of q.getUnits()){const n=String(unit.unit_number);if(!normalized.some(f=>f.name.includes(n)))continue;const selected=choosePlan(normalized,'D '+n+'_'+(isExt?'2':'1'),n,isExt);rows.push({unit_number:n,url:selected.url});}return q.applyPlanRows(rows,isExt).matched;
   }
   return q[method](...args);
  });
  if(method==='addLead')await backups.run({reason:'Registro manual de lead'});
  if(method==='aplicarPreciosEstrategia')await precios.registrarAplicacion(result);
  return result;
 }
 async function quote(input,cookie){
  if(!/^[0-9a-f-]{36}$/.test(input.requestId||''))throw Error('Solicitud de cotización no válida.');
  const caller=await authCache.require(cookie),jobKey=caller.id+':'+input.requestId;
  if(jobs.has(jobKey))return jobs.get(jobKey);
  const operation=(async()=>{
   const jobRef=store.ref.collection('quote_jobs').doc(input.requestId);
   const recontact_at=input.recontactAt?iso(input.recontactAt):null;
   if(input.recontactAt&&!recontact_at)throw Error('La fecha de recontacto no es válida.');
   const text=(value,max=300)=>String(value||'').trim().slice(0,max),profile=input.leadProfile||{};
   const request={unitId:input.unitId,leadId:input.leadId,dni:String(input.dni||'').replace(/\D/g,''),leadProfile:{name:text(profile.name,200),phone:text(profile.phone,50),email:text(profile.email,250),address:text(profile.address,500),unit_interest:text(profile.unit_interest,250),budget:Number(profile.budget||0)},discountPct:Number(input.discountPct||0),financingType:input.financingType,months:Number(input.directCreditMonths||12),initialPct:Number(input.customInitialPct??10),teaPct:Math.round(Number(input.teaPct??7.8)*100)/100,parking:input.parking||'Ninguno',brokerName:input.brokerName||'',recontact_at};
   if(request.financingType==='Hipotecario'&&!(Number.isFinite(request.teaPct)&&request.teaPct>=1&&request.teaPct<=30))throw Error('Indica una TEA entre 1% y 30%.');
   if(request.financingType!=='Hipotecario')delete request.teaPct;
   // R49 · El precio del estacionamiento sale de la estrategia de precios (antes S/ 56,000 fijos) y no se ofrece si ya está separado.
   request.parkingPrice=request.parking==='Ninguno'?0:await precios.precioCochera(request.parking,await cache.read());
   // R48 · Oferta de feria: el vendedor elige la modalidad (preventa en planos o reserva) y el servidor fija el descuento en soles
   // según la estrategia de precios vigente y los cupos que quedan. Sirve para cualquier unidad.
   if(input.feriaOferta){const modalidad=String(input.feriaOferta),d0=await cache.read(),u0=(d0.units||[]).find(u=>u.id===request.unitId),of=(await precios.oferta(d0)).ofertas.find(o=>o.modalidad===modalidad);if(!of)throw Error('La oferta de feria ya no está disponible (fuera de fecha o sin cupos).');const base=Number(u0?.price||0)+request.parkingPrice;if(!base)throw Error('La unidad no tiene precio de lista.');request.discountPct=Math.round(of.descuento/base*1e8)/1e6;request.feria={modalidad,descuento:of.descuento};}
   // R48 · Precio especial (rebaja o alza): Ventas solo cotiza con una aprobación vigente de Gerencia para esa unidad y cliente;
   // el precio aprobado pasa a la cotización y de ahí a la separación y la minuta. Gerencia puede cotizar directamente.
   else if(input.aprobacionPrecio){const d0=await cache.read(),u0=(d0.units||[]).find(u=>u.id===request.unitId),ap=await precios.aprobacionPara(input.aprobacionPrecio,u0,request.leadId),est=request.parkingPrice;request.discountPct=Math.round((1-(ap.precio_aprobado+est)/(Number(u0.price)+est))*1e8)/1e6;request.aprobacion={id:ap.id,precio:ap.precio_aprobado,por:ap.decidido_por};}
   else if(request.discountPct!==0){const caller=await authCache.require(cookie);if(caller.role!=='Gerente')throw Error('Los descuentos y cambios de precio necesitan aprobación de Gerencia: usa «Solicitar precio especial».');}
   if(!Number.isFinite(request.discountPct)||request.discountPct<(request.aprobacion?-50:0)||request.discountPct>100||!Number.isInteger(request.months)||request.months<1||request.months>360||!Number.isFinite(request.initialPct)||request.initialPct<0||request.initialPct>100||!['Hipotecario','Directo'].includes(request.financingType)||!/^([A-Za-z0-9 -]{1,40})$/.test(request.parking)||(request.dni&&!/^\d{8}$/.test(request.dni))||(request.leadProfile.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(request.leadProfile.email))||!Number.isFinite(request.leadProfile.budget)||request.leadProfile.budget<0)throw Error('Revisa los datos del cliente, la cotización y el DNI.');
   const fingerprint=createHash('sha256').update(JSON.stringify(request)).digest('hex');
   const job=await store.run(async({tx,read,write})=>{
    const user=await auth.requireTx(tx,cookie);const old=await tx.get(jobRef);
    if(old.exists){const j=old.data();if(j.userId!==user.id||j.fingerprint!==fingerprint)throw Error('Esta solicitud pertenece a otra cotización.');return j;}
    const d=read(),unit=assertQuotable(d.units,{id:request.unitId}),lead=d.leads.find(l=>l.id===request.leadId);
    if(!lead||lead.status==='Perdido')throw Error('Selecciona un lead habilitado.');
    const seq=d.quote_sequence||1473;d.quote_sequence=seq+1;write(d);
    const quoteLead={...lead};for(const [key,value] of Object.entries(request.leadProfile))if(key==='budget'?Number(value)>0:String(value||'').trim())quoteLead[key]=value;if(request.dni)quoteLead.dni=request.dni;
    const j={id:input.requestId,userId:user.id,fingerprint,state:'preparing',code:new Date().getFullYear()+'-'+String(seq).padStart(7,'0'),unit,lead:quoteLead,settings:{...publicSettings(d.settings),agentName:user.name},request,createdAt:new Date().toISOString(),file:input.requestId+'.pdf'};tx.create(jobRef,j);return j;
   });
   if(job.state==='complete')return {success:true,filePath:'/files/'+job.file,quote_code:job.code};
   const unit={...job.unit};for(const k of ['plan_image_ext','plan_image_int'])unit[k]=library.resolve(unit[k]);
   const settings={...job.settings};settings.projectLogoUrl=library.resolve(settings.projectLogoUrl);
   await require('./business/quotePDF').generateAndSaveQuotePDF({unit,lead:{...job.lead,dni:job.request.dni||job.lead.dni},settings,quote_code:job.code,targetFilePath:library.file(job.file),discount_pct:request.discountPct,price_note:request.aprobacion?'aprobado':request.feria?'feria':'',financingType:request.financingType,directCreditMonths:request.months,customInitialPct:request.initialPct,teaPct:request.teaPct,parkingCode:request.parking,parkingPrice:request.parkingPrice||0,recontact_at:request.recontact_at});
   await store.run(async({tx,read,write})=>{
    const user=await auth.requireTx(tx,cookie),saved=await tx.get(jobRef);if(saved.data()?.state==='complete')return;
    const d=read(),current=assertQuotable(d.units,{id:request.unitId}),lead=d.leads.find(l=>l.id===request.leadId);
    if(Number(current.price)!==Number(job.unit.price))throw Error('El precio cambió; vuelve a generar la cotización.');
    if(!lead||lead.status==='Perdido')throw Error('El lead dejó de estar habilitado.');
    const price=Number(current.price)+(request.parkingPrice||0),total=price*(1-request.discountPct/100),label=current.unit_number+(request.parking==='Ninguno'?'':' (+Est '+request.parking+')');
    const previousQuotes=d.quotes.filter(q=>q.lead_id===lead.id);
    for(const [key,value] of Object.entries(request.leadProfile))if(key==='budget'?Number(value)>0:String(value||'').trim())lead[key]=value;if(request.dni)lead.dni=request.dni;
    const client_snapshot={name:lead.name||'',dni:lead.dni||'',phone:lead.phone||'',email:lead.email||'',address:lead.address||'',source:lead.source||'',project:lead.project||'',unit_interest:lead.unit_interest||'',budget:Number(lead.budget||0)};
    d.quotes.push({id:job.id,date:job.createdAt,unit_id:current.id,lead_id:lead.id,dni:request.dni||lead.dni||null,financingType:request.financingType,directCreditMonths:request.financingType==='Directo'?request.months:null,discount_pct:request.discountPct,...(request.feria?{feria_modalidad:request.feria.modalidad,feria_descuento:request.feria.descuento}:{}),...(request.aprobacion?{aprobacion_precio:request.aprobacion}:{}),initial_pct:request.initialPct,...(request.teaPct?{tea_pct:request.teaPct}:{}),parking:request.parking,...(request.parkingPrice?{parking_price:request.parkingPrice}:{}),recontact_at:request.recontact_at,quote_code:job.code,lead_name:lead.name,unit_number:label,price,final_price:total,seller:user.name,client_snapshot,pdf_path:'/files/'+job.file});
    if(!lead.dpto1){lead.dpto1=label;lead.dpto1_price=total;}else if(!lead.dpto2){lead.dpto2=label;lead.dpto2_price=total;}
    lead.project ||= d.settings?.projectName||'Proyecto principal';
    if(request.dni)lead.dni=request.dni;
    if(!String(lead.unit_interest||'').trim())lead.unit_interest=current.unit_type||('Departamento '+current.unit_number);
    if(request.recontact_at){lead.next_action='Llamar para confirmar recepción de cotización '+job.code;lead.next_action_at=request.recontact_at;}
    lead.last_quote={id:job.id,code:job.code,delivered_at:job.createdAt,unit_number:label,final_price:total,financing_type:request.financingType,recontact_at:request.recontact_at||null,pdf_path:'/files/'+job.file};
    const visitedShowroom=(lead.appointments||[]).some(a=>a.status==='attended')||(lead.events||[]).some(entry=>entry.type==='showroom_visit'&&entry.direct===true),beforeStatus=lead.status;
    if(visitedShowroom&&!['Perdido','Venta'].includes(lead.status)){lead.status='Seguimiento';lead.substatus='Cotización';if(beforeStatus!==lead.status)lead.stage_history=[...(lead.stage_history||[]),{from:beforeStatus,to:lead.status,at:new Date().toISOString(),actor:user.name,observed:false}];}
    lead.qualification_pending=qualificationPending(lead);if(!lead.qualification_pending.length)delete lead.qualification_pending;
    if(previousQuotes.length){const summary=previousQuotes.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))).map(q=>`${q.quote_code} · ${q.unit_number} · S/ ${Number(q.final_price||0).toLocaleString('es-PE')}`).join(' | ');appendComment(lead,{requestId:'quote-summary-'+job.id,text:'Resumen de cotizaciones anteriores: '+summary},user.name,job.createdAt);event(lead,'comment',user.name,{source:'Resumen automático de cotizaciones'});}
    event(lead,'quote_delivered',user.name,{quote_code:job.code,unit_number:label,recontact_at:request.recontact_at||null,missing_qualification:lead.qualification_pending||[]});
    if(request.brokerName){const names=[d.settings.broker1Name,d.settings.broker2Name,d.settings.broker3Name];if(!names.includes(request.brokerName))throw Error('Broker no autorizado.');lead.selectedBrokers=[...new Set([...(lead.selectedBrokers||[]),request.brokerName])];}
    write(d);tx.update(jobRef,{state:'complete'});
   });
   if(request.aprobacion)try{await precios.marcarUsada(request.aprobacion.id,{id:job.id,quote_code:job.code});}catch{}
   return {success:true,filePath:'/files/'+job.file,quote_code:job.code};
  })();jobs.set(jobKey,operation);try{return await operation;}finally{jobs.delete(jobKey);}
 }
 async function generateSeparation(input,cookie){
  if(!/^[0-9a-f-]{36}$/.test(input.requestId||''))throw Error('Solicitud de separación no válida.');
  const caller=await authCache.require(cookie),jobKey=caller.id+':separation:'+input.requestId;if(jobs.has(jobKey))return jobs.get(jobKey);
  const operation=(async()=>{
   const request={quoteId:text(input.quoteId,100),client_name:text(input.client_name,200),dni:String(input.dni||'').replace(/\D/g,'').slice(0,8),marital_status:text(input.marital_status,80),address:text(input.address,500),district:text(input.district,120),province:text(input.province,120),department:text(input.department,120),economic_activity:text(input.economic_activity,250),financing_type:text(input.financing_type,40),separation_amount:amount(input.separation_amount),initial_amount:amount(input.initial_amount),financed_amount:amount(input.financed_amount),refund_condition:text(input.refund_condition||'Según acuerdo firmado',250),signers:Array.isArray(input.signers)?input.signers.slice(0,4).map((item,index)=>({role:index?'Coevaluado':'Titular',name:text(item.name,200),dni:String(item.dni||'').replace(/\D/g,'').slice(0,8),marital_status:text(item.marital_status,80),address:text(item.address,500)})):[]};
   if(!request.signers.length)request.signers=[{role:'Titular',name:request.client_name,dni:request.dni,marital_status:request.marital_status,address:request.address}];else request.signers[0]={...request.signers[0],role:'Titular',name:request.client_name,dni:request.dni,marital_status:request.marital_status,address:request.address};
   if(!request.quoteId||!request.client_name||request.dni.length!==8||!request.marital_status||!request.address||!request.district||!request.province||!request.department||!request.economic_activity||!request.refund_condition||!['Hipotecario','Directo','Contado'].includes(request.financing_type)||request.separation_amount<=0)throw Error('Completa los datos obligatorios del acuerdo de separación.');
   const snapshot=await store.run(async({tx,read,write})=>{
    const user=await auth.requireTx(tx,cookie),d=read(),quote=(d.quotes||[]).find(item=>item.id===request.quoteId);if(!quote)throw Error('La cotización ya no está disponible.');
    const unit=(d.units||[]).find(item=>item.id===quote.unit_id);if(!unit)throw Error('La unidad de la cotización ya no existe.');if(unit.sold_lead_id||['SOLD','VENDIDO','VENDIDA','VENTA'].includes(String(unit.status||'').toUpperCase()))throw Error('La unidad ya está vendida.');
    const active=activeForUnit(d.separations,unit.id);if(active)throw Error('La unidad ya tiene una separación activa: '+active.code+'.');
    const existing=(d.separations||[]).find(item=>item.quote_id===quote.id&&['DRAFT','ACTIVE'].includes(String(item.status||'').toUpperCase()));if(existing)throw Error('La cotización ya tiene una separación en borrador: '+existing.code+'.');
    const lead=(d.leads||[]).find(item=>item.id===quote.lead_id),createdAt=new Date().toISOString();
    return {user:{id:user.id,name:user.name},quote,unit,lead:lead||quote.client_snapshot||{},settings:publicSettings(d.settings),code:String(quote.quote_code),createdAt};
   });
   const finalPrice=Number(snapshot.quote.final_price||0);
   if(request.financing_type==='Hipotecario'&&snapshot.lead?.bank_evaluation?.status!=='Aprobada')throw Error('La separación hipotecaria requiere una evaluación GNB registrada como Aprobada.');if(request.initial_amount>finalPrice)throw Error('La cuota inicial no puede superar el precio final de la cotización.');request.financed_amount=Math.max(0,Math.round((finalPrice-request.initial_amount)*100)/100);
   const template=snapshot.settings.toolLinks?.legalTemplatesFolder?await new LegalTemplateStore({credentialFile:config.credential,folderUrl:snapshot.settings.toolLinks.legalTemplatesFolder}).get('separation'):await fetchSeparationTemplate(snapshot.settings.toolLinks?.separationTemplate),file=input.requestId+'.pdf',record={id:input.requestId,code:snapshot.code,quote_id:snapshot.quote.id,lead_id:snapshot.quote.lead_id,unit_id:snapshot.unit.id,unit_number:String(snapshot.unit.unit_number),client_name:request.client_name,dni:request.dni,marital_status:request.marital_status,address:request.address,district:request.district,province:request.province,department:request.department,economic_activity:request.economic_activity,financing_type:request.financing_type,final_price:Number(snapshot.quote.final_price||0),separation_amount:request.separation_amount,initial_amount:request.initial_amount,financed_amount:request.financed_amount,refund_condition:request.refund_condition,signers:request.signers,status:'DRAFT',generated_at:snapshot.createdAt,generated_by:snapshot.user.name,generated_by_id:snapshot.user.id,confirmed_at:null,expires_at:null,documents:{},document_version:'67.6.11-r28',template_source:template.source,template_file_id:template.file_id||null,template_modified_at:template.modified_at||null,pdf_path:'/files/'+file,audit:[{at:snapshot.createdAt,actor:snapshot.user.name,action:'generate',from:null,to:'DRAFT',reason:'Borrador de separación generado desde la cotización '+snapshot.quote.quote_code}]};
   const pdfUnit={...snapshot.unit};for(const key of ['plan_image_ext','plan_image_int'])pdfUnit[key]=library.resolve(pdfUnit[key]);
   if(!pdfUnit.plan_image_ext&&!pdfUnit.plan_image_int)throw Error('El departamento no tiene un plano vinculado. Asígnalo en Inventario antes de generar la separación.');
   const pdfSettings={...snapshot.settings};pdfSettings.projectLogoUrl=library.resolve(pdfSettings.projectLogoUrl);
   await require('./business/separationPDF').generateAndSaveSeparationPDF({separation:record,quote:snapshot.quote,unit:pdfUnit,lead:snapshot.lead,settings:pdfSettings,templateText:template.text,targetFilePath:library.file(file)});
   await store.run(async({tx,read,write})=>{
    const user=await auth.requireTx(tx,cookie),d=read(),quote=(d.quotes||[]).find(item=>item.id===record.quote_id),unit=(d.units||[]).find(item=>item.id===record.unit_id);if(!quote||!unit)throw Error('La cotización o la unidad cambió mientras se generaba el PDF.');
    const active=activeForUnit(d.separations,unit.id);if(active)throw Error('La unidad ya tiene una separación activa: '+active.code+'.');
    const duplicate=(d.separations||[]).find(item=>item.quote_id===quote.id&&['DRAFT','ACTIVE'].includes(String(item.status||'').toUpperCase()));if(duplicate)throw Error('La cotización ya tiene una separación en borrador: '+duplicate.code+'.');
    d.separations=[...(d.separations||[]),record];quote.separation_id=record.id;quote.separation_code=record.code;quote.separation_pdf_path=record.pdf_path;quote.separation_status=record.status;quote.separation_generated_by=user.name;write(d);
   });
   return {success:true,filePath:record.pdf_path,separation:record};
  })();jobs.set(jobKey,operation);try{return await operation;}finally{jobs.delete(jobKey);}
 }
 async function regenerateSeparation(id,cookie){
  const separationId=text(id,100),caller=await authCache.require(cookie),jobKey=caller.id+':separation-regenerate:'+separationId;if(!/^[0-9a-f-]{36}$/.test(separationId))throw Error('Separación no válida.');if(jobs.has(jobKey))return jobs.get(jobKey);
  const operation=(async()=>{
   const d=await store.read(),current=(d.separations||[]).find(item=>item.id===separationId);if(!current)throw Error('Separación no encontrada.');if(!['DRAFT','ACTIVE'].includes(String(current.status||'').toUpperCase()))throw Error('Solo se puede regenerar un borrador no confirmado.');
   const quote=(d.quotes||[]).find(item=>item.id===current.quote_id),unit=(d.units||[]).find(item=>item.id===current.unit_id),lead=(d.leads||[]).find(item=>item.id===current.lead_id)||quote?.client_snapshot||{};if(!quote||!unit)throw Error('La cotización o la unidad ya no está disponible.');
   const settings=publicSettings(d.settings),template=settings.toolLinks?.legalTemplatesFolder?await new LegalTemplateStore({credentialFile:config.credential,folderUrl:settings.toolLinks.legalTemplatesFolder}).get('separation'):await fetchSeparationTemplate(settings.toolLinks?.separationTemplate),record={...current,code:String(quote.quote_code),status:'DRAFT',confirmed_at:null,confirmed_by:null,confirmation_method:null,expires_at:null,document_version:'67.6.11-r28',template_source:template.source,template_file_id:template.file_id||null,template_modified_at:template.modified_at||null};
   const pdfUnit={...unit};for(const key of ['plan_image_ext','plan_image_int'])pdfUnit[key]=library.resolve(pdfUnit[key]);if(!pdfUnit.plan_image_ext&&!pdfUnit.plan_image_int)throw Error('El departamento no tiene un plano vinculado. Asígnalo en Inventario antes de regenerar la separación.');const pdfSettings={...settings};pdfSettings.projectLogoUrl=library.resolve(pdfSettings.projectLogoUrl);
   await require('./business/separationPDF').generateAndSaveSeparationPDF({separation:record,quote,unit:pdfUnit,lead,settings:pdfSettings,templateText:template.text,targetFilePath:library.resolve(record.pdf_path)});
   return store.run(async({tx,read,write})=>{const user=await auth.requireTx(tx,cookie),fresh=read(),saved=(fresh.separations||[]).find(item=>item.id===separationId);if(!saved||!['DRAFT','ACTIVE'].includes(String(saved.status||'').toUpperCase()))throw Error('La separación cambió durante la regeneración.');Object.assign(saved,record,{audit:[...(saved.audit||[]),{at:new Date().toISOString(),actor:user.name,action:'regenerate',from:saved.status,to:'DRAFT',reason:'Documento actualizado con código de cotización, planos y pie de página'}]});const savedQuote=(fresh.quotes||[]).find(item=>item.id===saved.quote_id);if(savedQuote){savedQuote.separation_code=saved.code;savedQuote.separation_status=saved.status;savedQuote.separation_updated_at=new Date().toISOString();}write(fresh);return {success:true,filePath:saved.pdf_path,separation:saved};});
  })();jobs.set(jobKey,operation);try{return await operation;}finally{jobs.delete(jobKey);}
 }
 async function generateMinute(separationId,input,cookie){
  const id=text(separationId,100);if(!/^[0-9a-f-]{36}$/.test(id))throw Error('Separación no válida.');
  const caller=await authCache.require(cookie),jobKey=caller.id+':minute:'+id;if(jobs.has(jobKey))return jobs.get(jobKey);
  const operation=(async()=>{
   const data=await store.read(),separation=(data.separations||[]).find(item=>item.id===id);if(!separation)throw Error('Separación no encontrada.');
   const quote=(data.quotes||[]).find(item=>item.id===separation.quote_id),unit=(data.units||[]).find(item=>item.id===separation.unit_id);if(!quote||!unit)throw Error('La cotización o la unidad ya no está disponible.');
   const type=minuteType(separation),template=await new LegalTemplateStore({credentialFile:config.credential,folderUrl:data.settings?.toolLinks?.legalTemplatesFolder}).get(type),file='minute-'+id+'.pdf',minute=createMinute(separation,caller.name,template,'/files/'+file,input?.signers);
   await generateLegalPDF({templateText:template.text,minute,separation,unit,settings:publicSettings(data.settings),targetFilePath:library.file(file)});
   const staged={...separation,minute},drive=new DriveDocumentStore({credentialFile:config.credential,parentFolderUrl:data.settings?.toolLinks?.separationFilesFolder}),saved=await drive.saveGeneratedMinute({separation:staged,separationPdfPath:library.resolve(separation.pdf_path),minutePdfPath:library.file(file)});
   return store.run(async({tx,read,write})=>{const user=await auth.requireTx(tx,cookie),d=read(),current=(d.separations||[]).find(item=>item.id===id);if(!current||!['CONFIRMED','RESERVED'].includes(String(current.status||'').toUpperCase()))throw Error('La separación cambió durante la generación.');current.minute={...minute,drive_file_id:saved.file.drive_file_id,drive_url:saved.file.drive_url};current.drive_folder_id=saved.folder.id;current.drive_folder_url=saved.folder.webViewLink||current.drive_folder_url||'';const lead=(d.leads||[]).find(item=>item.id===current.lead_id);if(lead){const from=lead.status;lead.status='Minuta';lead.substatus=minute.status;if(from!==lead.status)lead.stage_history=[...(lead.stage_history||[]),{from,to:'Minuta',at:new Date().toISOString(),actor:user.name,observed:false}];}write(d);return {success:true,filePath:minute.pdf_path,separation:current};});
  })();jobs.set(jobKey,operation);try{return await operation;}finally{jobs.delete(jobKey);}
 }
 async function uploadSeparationDocument(input,bytes,cookie){
  const caller=await authCache.require(cookie),separationId=text(input.separationId,100),kind=text(input.kind,50),fileName=text(input.fileName,200),mimeType=text(input.mimeType,100),jobKey=caller.id+':separation-document:'+separationId+':'+kind;
  if(!/^[0-9a-f-]{36}$/.test(separationId)||!['dni','signed_separation','reservation_voucher','signed_sale_minutes','notary_voucher'].includes(kind))throw Error('Documento de operación no válido.');
  if(!['application/pdf','image/png','image/jpeg'].includes(mimeType)||!bytes?.length||bytes.length>15*1024*1024)throw Error('Adjunta un PDF, PNG o JPG de hasta 15 MB.');
  if(mimeType==='application/pdf'&&bytes.subarray(0,5).toString()!=='%PDF-')throw Error('PDF no válido.');
  if(mimeType==='image/png'&&bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('PNG no válido.');
  if(mimeType==='image/jpeg'&&(bytes[0]!==255||bytes[1]!==216))throw Error('JPG no válido.');
  if(jobs.has(jobKey))return jobs.get(jobKey);
  const operation=(async()=>{
   const data=await store.read(),separation=(data.separations||[]).find(item=>item.id===separationId);if(!separation)throw Error('Separación no encontrada.');if(!['67.1.0','67.6.11-r28'].includes(separation.document_version))throw Error('Regenera primero el PDF para incorporar la versión documental vigente.');
   const recognition=['dni','signed_separation','reservation_voucher'].includes(kind)?await recognizeSeparationDocument({kind,bytes,mimeType,separation,apiKey:data.settings?.geminiApiKey}):{status:'stored',label:'Guardado',summary:'Documento de cierre guardado para revisión humana.',extracted:{}};
   const folderUrl=data.settings?.toolLinks?.separationFilesFolder,drive=new DriveDocumentStore({credentialFile:config.credential,parentFolderUrl:folderUrl});
   const saved=await drive.saveRequiredDocument({separation,pdfPath:library.resolve(separation.pdf_path),kind,fileName,bytes,mimeType});
   saved.file.review=recognition;
   return store.run(async({tx,read,write})=>{
    const user=await auth.requireTx(tx,cookie),d=read(),current=(d.separations||[]).find(item=>item.id===separationId);if(!current)throw Error('La separación cambió durante la carga.');
    current.drive_folder_id=saved.folder.id;current.drive_folder_url=saved.folder.webViewLink||current.drive_folder_url||'';
    const result=attachDocument(d,separationId,kind,saved.file,user.name),quote=(d.quotes||[]).find(item=>item.id===current.quote_id);if(quote){quote.separation_status=current.status;quote.separation_updated_at=new Date().toISOString();}
    write(d);return {...result,review:recognition,drive_folder_url:current.drive_folder_url};
   });
  })();jobs.set(jobKey,operation);try{return await operation;}finally{jobs.delete(jobKey);}
 }
 async function rpc(method,args,cookie){
  if(method.startsWith('auth.')){
   const name=method.slice(5);if(['mailSettings','configureMail'].includes(name)){
    const session=await auth.execute('requireSetupManager',[],cookie);
    return {value:name==='mailSettings'?approvalMail.publicSettings():await approvalMail.configure(args[0]||{}),cookie:session.cookie};
   }
   return auth.execute(name,args,cookie);
  }
  const user=await authCache.require(cookie);
  const name=method.split('.')[1];
  if(method.startsWith('db.')){
   if(MORA_METHODS.includes(name)){const value=await mora.rpc(name,args,user,()=>cache.read());if(name==='saveMoraEvaluation'){try{value.drive=await projectDrive.registerEvaluation(args[0]||{},user);}catch(e){value.drive={state:'error',reason:e.message};}}if(name==='getMoraEvaluation')value.drive=await projectDrive.publicProject(value.project?.nombre||args[0],user);return {value};}
   if(IA_RELLENAR_METHODS.includes(name))return {value:await new RellenarIA({assistant:lolaAssistant,projectDrive}).proponer(args[0]||{},user,await cache.read())};
   if(LOLA_ASSIST_METHODS.includes(name))return {value:await lolaAssistant.rpc(name,args,user,()=>cache.read())};
   if(INSTALL_METHODS.includes(name))return {value:await enrollment.rpc(name,args,user)};
   if(name==='getProjectDrive'){return {value:await projectDrive.publicProject(args[0],user)};}
   if(name==='getProjectDriveConfig')return {value:projectDrive.publicConfig(user)};
   if(name==='saveProjectDriveConfig')return {value:projectDrive.saveConfig(args[0]||{},user)};
   if(name==='getProjectDriveSources'){return {value:await projectDrive.context(args[0],args[1],user)};}
   if(name==='listProjectDriveSources')return {value:await projectDrive.listSources(args[0],user)};
   if(name==='approveProjectDriveSource')return {value:await projectDrive.approveSource(args[0],args[1],args[2],user)};
   if(name==='scanProjectDrive'){return {value:await projectDrive.requestScan(args[0],user)};}
   if(MCP_METHODS.includes(name))return {value:await mcp.rpc(name,args,user)};
   if(OPS_METHODS.includes(name))return {value:await resguardo.rpc(name,args,user)};
   if(PRECIOS_METHODS.includes(name))return {value:await precios.rpc(name,args,user,()=>cache.read())};
   if(GRETA_METHODS.includes(name)){const value=await greta.rpc(name,args,user,()=>cache.read());if(['gretaAsk','gretaTendencias','gretaIdea','gretaImagen','gretaKpisLectura'].includes(name)){try{value.drive=await projectDrive.archiveResult(name,args[0]||{},value,user,creative);}catch(e){value.drive={state:'error',reason:e.message};}}return {value};}
   if(CLARA_METHODS.includes(name))return {value:await clara.rpc(name,args,user,()=>cache.read(),{usuarios:async()=>((await auth.execute('info',[],cookie)).value?.users||[]).map(u=>({id:u.id,name:u.name,role:u.role}))})};
   if(['getCreativeSetup','saveCreativeSetup','getCreativeModels','getCreativeCampaigns','getCreativeCampaign','createCreativeCampaign','editCreativeCampaign','approveCreativeCampaign','archiveCreativeCampaign','requestCreativeProposal','getCreativeAudit','getCreativeBrand','saveCreativeBrand','getCreativeFactCandidates','getVariantReport','linkCreativeVariant','unlinkCreativeVariant','getBudgetRecommendations','createBudgetRecommendation','decideBudgetRecommendation','getDailyBriefConfig','saveDailyBriefConfig','previewDailyBrief','getVoiceConfig','saveVoiceConfig','getPublishConfig','savePublishConfig','getCycleConfig','saveCycleConfig','requestVoice','requestPublication','getPipelineJobs','cancelPipelineJob','exportLeads','exportLeadsToSheet','getLeadExportConfig','saveLeadExportConfig','getLeadExportHistory'].includes(name)){
    if(user.role!=='Gerente')throw Error('Requiere Gerencia.');
    if(name==='exportLeads')return {value:await leadExport.file(await cache.read(),args[0]||{},user.name)};
    if(name==='exportLeadsToSheet')return {value:await leadExport.toSheet(await cache.read(),args[0]||{},user.name)};
    if(name==='getLeadExportConfig')return {value:leadExport.config()};
    if(name==='saveLeadExportConfig')return {value:leadExport.config(args[0]||{},user.name)};
    if(name==='getLeadExportHistory')return {value:await leadExport.history()};
    if(name==='getVoiceConfig')return {value:pipelines.voiceConfig()};
    if(name==='saveVoiceConfig')return {value:pipelines.voiceConfig(args[0]||{},user.name)};
    if(name==='getPublishConfig')return {value:pipelines.publishConfig()};
    if(name==='savePublishConfig')return {value:pipelines.publishConfig(args[0]||{},user.name)};
    if(name==='getCycleConfig')return {value:pipelines.cycleConfig()};
    if(name==='saveCycleConfig')return {value:pipelines.cycleConfig(args[0]||{},user.name)};
    if(name==='requestVoice')return {value:await pipelines.requestVoice(args[0]||{},user.name)};
    if(name==='requestPublication')return {value:await pipelines.requestPublication(args[0]||{},user.name)};
    if(name==='getPipelineJobs')return {value:{voice:await pipelines.listJobs(pipelines.voiceJobs),publication:await pipelines.listJobs(pipelines.pubJobs)}};
    if(name==='cancelPipelineJob')return {value:await pipelines.cancel(args[0]==='voice'?pipelines.voiceJobs:pipelines.pubJobs,args[1],user.name)};
    if(name==='getVariantReport')return {value:await assistant.variantReport(args[0]||{},await cache.read())};
    if(name==='linkCreativeVariant')return {value:await assistant.linkVariant(args[0]||{},user.name)};
    if(name==='unlinkCreativeVariant')return {value:await assistant.unlinkVariant(args[0])};
    if(name==='getBudgetRecommendations')return {value:await assistant.listRecommendations()};
    if(name==='createBudgetRecommendation')return {value:await assistant.createRecommendation(args[0]||{},await cache.read(),user.name)};
    if(name==='decideBudgetRecommendation')return {value:await assistant.decideRecommendation(args[0],args[1]||{},user.name)};
    if(name==='getDailyBriefConfig')return {value:assistant.briefConfig()};
    if(name==='saveDailyBriefConfig')return {value:assistant.briefConfig(args[0]||{},user.name)};
    if(name==='previewDailyBrief')return {value:await assistant.previewBrief(await cache.read())};
    if(name==='getCreativeBrand')return {value:creative.brands()};
    if(name==='saveCreativeBrand')return {value:creative.brands(args[0]||{},user.name)};
    if(name==='getCreativeFactCandidates')return {value:factsFromUnits((await cache.read()).units)};
    if(name==='getCreativeSetup')return {value:creative.setup()};
    if(name==='saveCreativeSetup')return {value:creative.setup(args[0]||{},user.name)};
    if(name==='getCreativeModels')return {value:await creative.models()};
    if(name==='getCreativeCampaigns')return {value:await creative.list()};
    if(name==='getCreativeCampaign')return {value:await creative.get(args[0])};
    if(name==='createCreativeCampaign'){const value=await creative.create(args[0]||{},user.name);try{value.drive=await projectDrive.archiveResult('campaña',{campaign_id:value.id},value,user,creative);}catch(e){value.drive={state:'error',reason:e.message};}return {value};}
    if(name==='editCreativeCampaign'){const value=await creative.edit(args[0],args[1]||{},user.name);try{value.drive=await projectDrive.archiveResult('edición',{campaign_id:args[0]},value,user,creative);}catch(e){value.drive={state:'error',reason:e.message};}return {value};}
    if(name==='approveCreativeCampaign')return {value:await creative.approve(args[0],args[1]||{},user.name)};
    if(name==='archiveCreativeCampaign')return {value:await creative.archive(args[0],args[1],user.name)};
    if(name==='requestCreativeProposal')return {value:await creative.enqueue(args[0],args[1]||{},user.name)};
    if(name==='getCreativeAudit')return {value:await creative.audit(args[0])};
   }
   if(name==='getSocialThreads')return {value:await social.list(args[0]||{})};
   if(name==='getChatIndex'){const wa=(await whatsapp.threads.orderBy('last_message_at','desc').limit(300).get()).docs.map(d=>d.data()).filter(t=>t.lead_id&&Number(t.message_count)>0).map(t=>({channel:'whatsapp',lead_id:t.lead_id,thread_id:t.lead_id,last_message_at:t.last_message_at||null,preview:String(t.preview||'').slice(0,120),message_count:Number(t.message_count)||0,last_inbound_at:t.last_inbound_at||null}));const so=(await social.list({})).threads.map(t=>({channel:t.channel,lead_id:t.lead_id||null,thread_id:t.id,name:t.contact_name||t.name||'',last_message_at:t.last_message_at||null,preview:String(t.last_preview||'').slice(0,120),message_count:Number(t.message_count)||0,last_inbound_at:t.last_inbound_at||null}));return {value:{threads:[...wa,...so]}};}
   if(name==='getSocialConversation')return {value:await social.conversation(args[0],args[1]||{})};
   if(name==='setSocialMode')return {value:await social.control(args[0],args[1]||{},user.name)};
   if(name==='linkSocialLead')return {value:await social.link(args[0],args[1],user.name)};
   if(name==='sendSocialMessage')return {value:await social.send(args[0],args[1]||{},user.name)};
   if(name==='requestSocialSuggestion')return {value:await social.suggestion(args[0],user.name)};
   if(['getSocialSetup','saveSocialSetup','getAdsDashboard','syncAdsReport','importAdsReport','linkAdsAttribution'].includes(name)){
    if(user.role!=='Gerente')throw Error('Requiere Gerencia.');
    if(name==='getSocialSetup')return {value:social.setup()};
    if(name==='saveSocialSetup')return {value:social.setup(args[0]||{},user.name)};
    if(name==='getAdsDashboard')return {value:await ads.dashboard(args[0]||{},await cache.read())};
    if(name==='syncAdsReport')return {value:await ads.sync(args[0]||{},user.name)};
    if(name==='importAdsReport')return {value:await ads.snapshot(args[0]||{},user.name)};
    if(name==='linkAdsAttribution')return {value:await ads.link(args[0]||{},user.name)};
   }
   if(['getPublicationSetup','savePublicationSetup','getPublicationDashboard','importPublications','syncPublications','linkPublicationLead','analyzePublications'].includes(name)){
    if(user.role!=='Gerente')throw Error('Requiere Gerencia.');
    if(name==='getPublicationSetup')return {value:publications.setup()};
    if(name==='savePublicationSetup')return {value:publications.setup(args[0],user.name)};
    if(name==='getPublicationDashboard')return {value:await publications.dashboard(args[0]||{})};
    if(name==='importPublications')return {value:await publications.snapshot(args[0]||{},user.name)};
    if(name==='syncPublications')return {value:await publications.sync(args[0],user.name)};
    if(name==='linkPublicationLead')return {value:await publications.link(args[0]||{},user.name)};
    if(name==='analyzePublications')return {value:await publications.analyze(args[0]||{},user.name)};
   }
   if(name==='getLolaFollowupSetup'){if(user.role!=='Gerente')throw Error('Requiere Gerencia.');return {value:await whatsapp.followups.get()};}
   if(name==='saveLolaFollowupSetup'){if(user.role!=='Gerente')throw Error('Requiere Gerencia.');return {value:await whatsapp.followups.save(args[0],user.name)};}
   if(name==='getLolaDriveStatus'){if(user.role!=='Gerente')throw Error('Requiere Gerencia.');const d=await store.read(),c=await whatsapp.drive.context(d.settings,true);return {value:{...c,sources:c.sources.map(({text,...s})=>({...s,characters:text.length}))}};}
   if(name==='getLolaExperience'){if(user.role!=='Gerente')throw Error('Requiere Gerencia.');return {value:await customerCare.experience()};}
   if(name==='saveLolaExperience'){if(user.role!=='Gerente')throw Error('Requiere Gerencia.');return {value:await customerCare.saveExperience(args[0],user.name)};}
   if(name==='getLolaCustomerCare')return {value:await customerCare.get(args[0])};
   if(name==='saveLolaCustomerCare')return {value:await customerCare.profile(args[0],args[1]||{},user.name)};
   if(name==='sendLolaBirthday')return {value:await customerCare.send(args[0],user.name)};
   if(name==='getCrmConversation')return {value:await crmConversation.get(args[0])};
   if(name==='requestCrmConversation'&&String(args[1]?.text||'').trim()==='/asesor')return {value:await whatsapp.takeover(args[0],user.name)};
   if(name==='requestCrmConversation')return {value:await crmConversation.request(args[0],args[1]||{},user.name)};
   if(name==='previewWhatsAppRecoveryTemplate')return {value:await whatsapp.recovery.previewTemplate(args[0])};
   if(name==='recordWhatsAppFollowupConsent')return {value:await whatsapp.recovery.recordConsent(args[0],args[1]||{},user.name)};
   if(name==='sendWhatsAppRecoveryTemplate')return {value:await whatsapp.recovery.sendTemplate(args[0],args[1]||{},user.name)};
   if(name==='prepareWhatsAppRecovery')return {value:await whatsapp.recovery.prepare(args[0],user.name)};
   if(name==='openWhatsAppRecovery')return {value:await whatsapp.recovery.open(args[0],args[1]||{},user.name)};
   if(name==='getWhatsAppConversation'){let data;if(cache.readKind){const [leads,settings]=await Promise.all([cache.readKind('leads'),cache.readKind('settings')]);data={leads,settings};}else data=await cache.read();return {value:await whatsapp.conversation(args[0],args[1]||{},data)};}
   if(name==='getWhatsAppSetup'){if(user.role!=='Gerente')throw Error('Requiere Gerencia.');return {value:whatsapp.setup()};}
   if(name==='saveWhatsAppSetup'){if(user.role!=='Gerente')throw Error('Requiere Gerencia.');return {value:whatsapp.setup(args[0],user.name)};}
   if(name==='setWhatsAppMode')return {value:await whatsapp.mode(args[0],args[1]||{},user.name)};
   if(name==='sendWhatsAppMessage')return {value:await whatsapp.send(args[0],args[1]||{},user.name)};
   if(name==='requestWhatsAppSuggestion')return {value:await whatsapp.requestSuggestion(args[0],user.name)};
   if(name==='applyWhatsAppProfile')return {value:await whatsapp.applyProfile(args[0],args[1]||{},user.name)};
   if(name==='getWorkspaceChanges'){
    const kinds=['settings','leads','units','quotes','separations','duplicate_deletion_log'];if(user.role==='Gerente')kinds.push('marketing_expenses');
    let result;
    if(cache.changes)result=await cache.changes(args[0]||null,kinds);
    else {const full=await cache.read();result={revision:null,changed:Object.fromEntries(kinds.map(kind=>[kind,full[kind]??(kind==='settings'?{}:[])]))};}
    if(result.changed.settings)result.changed.settings=publicSettings(result.changed.settings);
    if(user.role!=='Gerente')delete result.changed.marketing_expenses;
    return {value:result};
   }
   if(name in readMethods){
    if(name==='getMarketingExpenses'&&user.role!=='Gerente')throw Error('Requiere Gerencia.');
    const key=readMethods[name],value=cache.readKind?await cache.readKind(key):(await cache.read())[key];
    return {value:name==='getSettings'?publicSettings(value):value||[]};
   }
   if(name==='getAnalytics')return {value:await cachedAnalytics(args[0])};
   if(name==='previewSla'){if(user.role!=='Gerente')throw Error('Requiere Gerencia.');return {value:compactSlaReport(await sla.preview(args[0]))};}
   if(name==='previewAllSla'){if(user.role!=='Gerente')throw Error('Requiere Gerencia.');return {value:compactSlaReport(await sla.preview(args[0],{includeHistorical:true,allowMoves:false}))};}
   if(name==='applyAllSla'){if(user.role!=='Gerente')throw Error('Requiere Gerencia.');const result=await sla.run({includeHistorical:true,allowMoves:false});return {value:{...result,moved:0}};}
   if(name==='syncConfiguredLeads'){if(!syncer)throw Error('Sincronizador no disponible.');const data=await cache.read();return {value:await syncer.run({force:true,assignment:leadAssignment(user,data.settings)})};}
   if(name==='refreshOnLogin'){const data=await cache.read(),sync=syncer?await syncer.run({force:true,assignment:leadAssignment(user,data.settings)}):{skipped:true},backup=await backups.run({reason:'Inicio de sesión y actualización inicial'});return {value:{sync,backup}};}
   if(name==='exportQuotes'){const d=await cache.read(),rows=selectedQuotes(d.quotes,args[0]);const url=await library.add('Cotizaciones.csv',Buffer.from(quotesCSV(rows)));return {value:{success:true,filePath:url,count:rows.length}};}
   if(name==='exportBackup'){if(user.role!=='Gerente')throw Error('Requiere Gerencia.');const d=await store.read();d.settings=publicSettings(d.settings);return {value:{backup:d}};}
   if(mutationMethods.has(name))return {value:await mutate(name,args,cookie)};
   if(name==='syncLeadsRaw'||name==='syncLeadsAI'){const strict=!!args[0]?.isStrict;await authCache.require(cookie,strict);const value=await store.run(async({tx,read,write})=>{const actor=await auth.requireTx(tx,cookie,strict);return createQueries(read,write)[name](...args,leadAssignment(actor,read().settings));});if(value.added>0)await backups.run({reason:'Importación manual de '+value.added+' lead(s) nuevo(s)'});return {value};}
  }
  if(method==='api.fetchSheet')return {value:await fetchSheet(allowedURL(args[0]))};
  if(method==='api.fetchExchangeRate')return {value:(await require('./business/exchangeRate').fetchSunatRate()).value};
  if(method==='api.findPlan'){const data=await cache.read(),folder=args[0]?.folder||data.settings.plansDrivePath;if(!folder)return {value:null};allowedURL(folder);if(!folderId(folder))throw Error('Usa una carpeta pública de Google Drive.');const response=await fetch(folder,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('No se pudo leer la carpeta.');const files=publicFolderFiles(await response.text()),n=String(args[0]?.unit_number||args[0]?.unitNumber),isExt=args[0]?.isExt!==false;return {value:choosePlan(files,'D '+n+'_'+(isExt?'2':'1'),n,isExt).url};}
  if(['api.parseWithGemini','api.summarizeChat'].includes(method)){const d=await store.read();const fn=method.endsWith('parseWithGemini')?'parseWithGemini':'summarizeChat';if(fn==='summarizeChat'&&d.settings.aiIntegration?.summaryEnabled===false)throw Error('El resumen IA está desactivado por Gerencia.');return {value:await require('./business/geminiService')[fn]({...args[0],apiKey:d.settings.geminiApiKey,prompt:d.settings.aiIntegration?.summaryPrompt})};}
  if(method==='pdf.generateQuote')return {value:await quote(args[0],cookie)};
  if(method==='pdf.generateSeparation')return {value:await generateSeparation(args[0],cookie)};
  if(method==='pdf.regenerateSeparation')return {value:await regenerateSeparation(args[0],cookie)};
  if(method==='pdf.generateMinute')return {value:await generateMinute(args[0],args[1]||{},cookie)};
  if(method==='pdf.generateAnalytics'||method==='pdf.generateDashboard'){
   const d=await cache.read(),filters=method==='pdf.generateAnalytics'?args[0]||{}:{},report=await cachedAnalytics(filters),token=randomUUID()+'.pdf';
   const render=filters.weekly?require('./business/weeklyAnalyticsPDF').weeklyAnalyticsPDF:require('./business/analyticsPDF').analyticsPDF;
   await render(report,filters,publicSettings(d.settings),library.file(token));return {value:{success:true,filePath:'/files/'+token}};
  }
  throw Error('Operación no disponible.');
 }
 // R44 · Conector MCP: usa el mismo despachador rpc() con una sesión breve de la persona que autorizó.
 const mcp=new McpConnector(store,config,{rpc:(m,a,c)=>rpc(m,a,c),issueSession:(id,v)=>auth.issueFor?auth.issueFor(id,v):null,version:require('./package.json').version});
 const resguardo=new Resguardo(store,config,{authSnapshot:auth.snapshot?()=>auth.snapshot():null});
 return {mcp,resguardo,rpc,library,reconcileHistoricalQuotes,uploadSeparationDocument,ingestLola,whatsapp,social,ads,creative,assistant,pipelines,omnichannel,mora,enrollment,projectDrive,clara};
}
module.exports={application,publicSettings};
