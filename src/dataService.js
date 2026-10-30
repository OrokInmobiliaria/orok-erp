const workspaceSpecs={
  settings:{method:'getSettings',event:'crm-settings'},
  units:{method:'getUnits',event:'crm-units'},
  leads:{method:'getLeads',event:'crm-leads'},
  quotes:{method:'getQuotes',event:'crm-quotes'},
  separations:{method:'getSeparations',event:'crm-separations'},
  marketing_expenses:{method:'getMarketingExpenses',event:'crm-marketing'},
  duplicate_deletion_log:{method:'getDuplicateDeletionLog',event:'crm-duplicate-log'}
};
const workspaceSubscribers=new Map(Object.keys(workspaceSpecs).map(kind=>[kind,new Set()]));
const methodKinds=Object.fromEntries(Object.entries(workspaceSpecs).map(([kind,spec])=>[spec.method,kind]));
// Una carga al iniciar sesión y luego una revisión consolidada cada 30 minutos.
// Las mutaciones iniciadas por el usuario conservan su refresco inmediato.
const REFRESH_MS=30*60*1000,MAX_BACKOFF_MS=2*60*60*1000;
let workspaceState={},workspaceRevision=null,workspaceRequest=null,pollTimer=null,retryMs=REFRESH_MS;
const kindRequests=new Map();
const activeSubscribers=()=>[...workspaceSubscribers.values()].reduce((total,set)=>total+set.size,0);
function emitWorkspace(kind){
  if(!(kind in workspaceState))return;
  for(const subscriber of workspaceSubscribers.get(kind)||[]){
    const value=structuredClone(workspaceState[kind]);
    Promise.resolve(subscriber.cb(value)).catch(error=>subscriber.onError(error.message));
  }
}
function reportWorkspaceError(message,kinds=Object.keys(workspaceSpecs)){
  const notified=new Set();
  for(const kind of kinds)for(const subscriber of workspaceSubscribers.get(kind)||[])if(!notified.has(subscriber)){notified.add(subscriber);subscriber.onError(message);}
}
function scheduleWorkspaceRefresh(delay=REFRESH_MS){
  clearTimeout(pollTimer);pollTimer=null;
  if(!activeSubscribers()||document.hidden)return;
  pollTimer=setTimeout(()=>void refreshWorkspace(),delay);
}
async function refreshKind(kind){
  const subscribers=workspaceSubscribers.get(kind);if(!subscribers?.size)return;
  if(kindRequests.has(kind))return kindRequests.get(kind);
  const request=(async()=>{try{
   if(!window.crmDB)throw Error('Abre el CRM desde la aplicación de escritorio.');
   const value=await window.crmDB[workspaceSpecs[kind].method]();
   if(value?.error)throw Error(value.error);
   workspaceState[kind]=value;emitWorkspace(kind);
  }catch(error){reportWorkspaceError(error.message,[kind]);}finally{kindRequests.delete(kind);}})();
  kindRequests.set(kind,request);return request;
}
async function refreshWorkspace(){
  if(!activeSubscribers())return;
  if(workspaceRequest)return workspaceRequest;
  workspaceRequest=(async()=>{
    try{
      if(!window.crmDB)throw Error('Abre el CRM desde la aplicación de escritorio.');
      if(typeof window.crmDB.getWorkspaceChanges!=='function'){
        await Promise.all(Object.keys(workspaceSpecs).filter(kind=>workspaceSubscribers.get(kind).size).map(refreshKind));
      }else{
        const result=await window.crmDB.getWorkspaceChanges(workspaceRevision);
        if(result?.error)throw Error(result.error);
        workspaceRevision=result.revision??workspaceRevision;
        for(const [kind,value] of Object.entries(result.changed||{}))if(kind in workspaceSpecs){workspaceState[kind]=value;emitWorkspace(kind);}
      }
      retryMs=REFRESH_MS;
    }catch(error){reportWorkspaceError(error.message);retryMs=Math.min(Math.max(REFRESH_MS,retryMs*2),MAX_BACKOFF_MS);}
    finally{workspaceRequest=null;scheduleWorkspaceRefresh(retryMs);}
  })();
  return workspaceRequest;
}
for(const [kind,{event}] of Object.entries(workspaceSpecs))window.addEventListener(event,()=>void refreshKind(kind));
// R50 · Al cambiar de proyecto se descarta todo lo cargado y se pide completo al servidor (sin recargar la página: recargar cierra la sesión).
window.addEventListener('orok-proyecto',()=>{workspaceState={};workspaceRevision=null;kindRequests.clear();void refreshWorkspace();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshWorkspace();else {clearTimeout(pollTimer);pollTimer=null;}});
function listen(method,event,cb,onError=message=>console.error(message)) {
  const kind=methodKinds[method];if(!kind)throw Error('Colección del CRM no reconocida.');
  const subscriber={cb,onError};workspaceSubscribers.get(kind).add(subscriber);
  if(kind in workspaceState)queueMicrotask(()=>{if(workspaceSubscribers.get(kind).has(subscriber))Promise.resolve(subscriber.cb(structuredClone(workspaceState[kind]))).catch(error=>subscriber.onError(error.message));});
  queueMicrotask(()=>void refreshWorkspace());
  return ()=>{
    workspaceSubscribers.get(kind).delete(subscriber);
    if(!activeSubscribers()){
      clearTimeout(pollTimer);pollTimer=null;workspaceState={};workspaceRevision=null;retryMs=REFRESH_MS;
    }
  };
}
async function change(method,event,...args) {
  if(!window.crmDB)throw new Error('Usa la aplicación de escritorio.');
  const result=await window.crmDB[method](...args);
  if(result?.error)throw new Error(result.error);
  window.dispatchEvent(new Event(event));if(event==='crm-leads')window.dispatchEvent(new Event('crm-units'));return result;
}
export const api = {
  ...Object.fromEntries(['getLolaAssistant','saveLolaAssistant','testLolaAssistant','askLolaAssistant','transcribeLolaAssistant','getMoraEvaluation','getMoraConfig','saveMoraConfig','saveMoraEvaluation','getMoraEvaluations','askMora','getMoraThread','getMoraProposals','decideMoraProposal','setMoraEditor','getMoraSalesFeed','getMoraWeekly'].map(n=>[n,(...a)=>window.crmDB[n](...a)])),
  getCreativeSetup:()=>window.crmDB.getCreativeSetup(),
  saveCreativeSetup:input=>window.crmDB.saveCreativeSetup(input),
  getCreativeModels:()=>window.crmDB.getCreativeModels(),
  getCreativeCampaigns:()=>window.crmDB.getCreativeCampaigns(),
  getCreativeCampaign:id=>window.crmDB.getCreativeCampaign(id),
  createCreativeCampaign:input=>window.crmDB.createCreativeCampaign(input),
  editCreativeCampaign:(id,input)=>window.crmDB.editCreativeCampaign(id,input),
  approveCreativeCampaign:(id,input)=>window.crmDB.approveCreativeCampaign(id,input),
  archiveCreativeCampaign:(id,revision)=>window.crmDB.archiveCreativeCampaign(id,revision),
  requestCreativeProposal:(id,input)=>window.crmDB.requestCreativeProposal(id,input),
  getCreativeAudit:id=>window.crmDB.getCreativeAudit(id),
  getCreativeBrand:()=>window.crmDB.getCreativeBrand(),
  saveCreativeBrand:input=>window.crmDB.saveCreativeBrand(input),
  getCreativeFactCandidates:()=>window.crmDB.getCreativeFactCandidates(),
  getVariantReport:(...a)=>window.crmDB.getVariantReport(...a),
  linkCreativeVariant:(...a)=>window.crmDB.linkCreativeVariant(...a),
  unlinkCreativeVariant:(...a)=>window.crmDB.unlinkCreativeVariant(...a),
  getBudgetRecommendations:(...a)=>window.crmDB.getBudgetRecommendations(...a),
  createBudgetRecommendation:(...a)=>window.crmDB.createBudgetRecommendation(...a),
  decideBudgetRecommendation:(...a)=>window.crmDB.decideBudgetRecommendation(...a),
  getDailyBriefConfig:(...a)=>window.crmDB.getDailyBriefConfig(...a),
  saveDailyBriefConfig:(...a)=>window.crmDB.saveDailyBriefConfig(...a),
  previewDailyBrief:(...a)=>window.crmDB.previewDailyBrief(...a),
  getVoiceConfig:(...a)=>window.crmDB.getVoiceConfig(...a),
  saveVoiceConfig:(...a)=>window.crmDB.saveVoiceConfig(...a),
  getPublishConfig:(...a)=>window.crmDB.getPublishConfig(...a),
  savePublishConfig:(...a)=>window.crmDB.savePublishConfig(...a),
  getCycleConfig:(...a)=>window.crmDB.getCycleConfig(...a),
  saveCycleConfig:(...a)=>window.crmDB.saveCycleConfig(...a),
  requestVoice:(...a)=>window.crmDB.requestVoice(...a),
  requestPublication:(...a)=>window.crmDB.requestPublication(...a),
  getPipelineJobs:(...a)=>window.crmDB.getPipelineJobs(...a),
  cancelPipelineJob:(...a)=>window.crmDB.cancelPipelineJob(...a),
  exportLeads:(...a)=>window.crmDB.exportLeads(...a),
  exportLeadsToSheet:(...a)=>window.crmDB.exportLeadsToSheet(...a),
  getLeadExportConfig:(...a)=>window.crmDB.getLeadExportConfig(...a),
  saveLeadExportConfig:(...a)=>window.crmDB.saveLeadExportConfig(...a),
  getLeadExportHistory:(...a)=>window.crmDB.getLeadExportHistory(...a),
  uploadCreativeMedia:(id,file,input)=>window.crmAPI.uploadCreativeMedia(id,file,input),
  getSocialThreads:options=>window.crmDB.getSocialThreads(options),
  getSocialConversation:(id,options)=>window.crmDB.getSocialConversation(id,options),
  getSocialSetup:()=>window.crmDB.getSocialSetup(),
  saveSocialSetup:input=>window.crmDB.saveSocialSetup(input),
  setSocialMode:(id,input)=>window.crmDB.setSocialMode(id,input),
  linkSocialLead:(id,leadId)=>window.crmDB.linkSocialLead(id,leadId),
  sendSocialMessage:(id,input)=>window.crmDB.sendSocialMessage(id,input),
  requestSocialSuggestion:id=>window.crmDB.requestSocialSuggestion(id),
  getAdsDashboard:input=>window.crmDB.getAdsDashboard(input),
  syncAdsReport:input=>window.crmDB.syncAdsReport(input),
  importAdsReport:input=>window.crmDB.importAdsReport(input),
  linkAdsAttribution:input=>window.crmDB.linkAdsAttribution(input),
  getCrmConversation:(...args)=>window.crmDB.getCrmConversation(...args),
  requestCrmConversation:(...args)=>window.crmDB.requestCrmConversation(...args),
  prepareWhatsAppRecovery:(...args)=>window.crmDB.prepareWhatsAppRecovery(...args),
  openWhatsAppRecovery:(...args)=>window.crmDB.openWhatsAppRecovery(...args),
  getPublicationSetup:(...args)=>window.crmDB.getPublicationSetup(...args),
  savePublicationSetup:(...args)=>window.crmDB.savePublicationSetup(...args),
  getPublicationDashboard:(...args)=>window.crmDB.getPublicationDashboard(...args),
  importPublications:(...args)=>window.crmDB.importPublications(...args),
  syncPublications:(...args)=>window.crmDB.syncPublications(...args),
  linkPublicationLead:(...args)=>window.crmDB.linkPublicationLead(...args),
  analyzePublications:(...args)=>window.crmDB.analyzePublications(...args),
  previewWhatsAppRecoveryTemplate:(...args)=>window.crmDB.previewWhatsAppRecoveryTemplate(...args),
  recordWhatsAppFollowupConsent:(...args)=>window.crmDB.recordWhatsAppFollowupConsent(...args),
  sendWhatsAppRecoveryTemplate:(...args)=>window.crmDB.sendWhatsAppRecoveryTemplate(...args),
  getLolaFollowupSetup:(...args)=>window.crmDB.getLolaFollowupSetup(...args),
  saveLolaFollowupSetup:(...args)=>window.crmDB.saveLolaFollowupSetup(...args),
  getLolaDriveStatus:(...args)=>window.crmDB.getLolaDriveStatus(...args),
  getLolaExperience:(...args)=>window.crmDB.getLolaExperience(...args),
  saveLolaExperience:(...args)=>window.crmDB.saveLolaExperience(...args),
  getLolaPrecios:(...args)=>window.crmDB.getLolaPrecios(...args),
  saveLolaPrecios:(...args)=>window.crmDB.saveLolaPrecios(...args),
  getLolaCustomerCare:(...args)=>window.crmDB.getLolaCustomerCare(...args),
  saveLolaCustomerCare:(...args)=>window.crmDB.saveLolaCustomerCare(...args),
  sendLolaBirthday:(...args)=>window.crmDB.sendLolaBirthday(...args),
  getWhatsAppSetup:()=>window.crmDB.getWhatsAppSetup(),
  saveWhatsAppSetup:input=>window.crmDB.saveWhatsAppSetup(input),
  setWhatsAppMode:(id,input)=>window.crmDB.setWhatsAppMode(id,input),
  sendWhatsAppMessage:(id,input)=>window.crmDB.sendWhatsAppMessage(id,input),
  applyWhatsAppProfile:(id,input)=>window.crmDB.applyWhatsAppProfile(id,input),
  requestWhatsAppSuggestion:id=>window.crmDB.requestWhatsAppSuggestion(id),
  sendWhatsAppAttachment:(id,file,requestId,caption)=>window.crmAPI.sendWhatsAppAttachment(id,file,requestId,caption),
  sendWhatsAppAudio:(id,blob,requestId)=>window.crmAPI.sendWhatsAppAudio(id,blob,requestId),
  async getWhatsAppConversation(id,options={}){if(!window.crmDB?.getWhatsAppConversation)throw Error('Actualiza el CRM para abrir la bandeja WhatsApp.');return window.crmDB.getWhatsAppConversation(id,options);},
  async updateToolLinks(links){return change('updateToolLinks','crm-settings',links);},
  async backfillLeadReceivedDates(){return change('backfillLeadReceivedDates','crm-leads');},
  async syncConfiguredLeads(){const result=await change('syncConfiguredLeads','crm-leads');window.dispatchEvent(new Event('crm-settings'));return result;},
  async refreshOnLogin(){const result=await change('refreshOnLogin','crm-leads');window.dispatchEvent(new Event('crm-settings'));return result;},
  async addLeadComment(id,input){return change('addLeadComment','crm-leads',id,input);},
  async logChatAccess(id,input){return change('logChatAccess','crm-leads',id,input);},
  getChatIndex:()=>window.crmDB.getChatIndex(),
  isNative: !!window.crmAPI,
  listenSettings: cb=>listen('getSettings','crm-settings',cb),
  listenUnits: cb=>listen('getUnits','crm-units',units=>cb([...units].sort((a,b)=>a.floor-b.floor))),
  listenLeads: (cb,onError)=>listen('getLeads','crm-leads',cb,onError),
  listenQuotes: cb=>listen('getQuotes','crm-quotes',cb),
  listenSeparations: cb=>listen('getSeparations','crm-separations',cb),
  listenDuplicateDeletionLog: cb=>listen('getDuplicateDeletionLog','crm-duplicate-log',cb),
  async updateSettings(settings) { return change('updateSettings','crm-settings',settings); },
  async saveIntegrationCredentials(credentials) { return change('saveIntegrationCredentials','crm-settings',credentials); },
  async importChannelHistory(payload){return change('importChannelHistory','crm-leads',payload);},
  async previewSla(sla){if(!window.crmDB)throw new Error('El modo de prueba SLA requiere la nube del CRM.');const result=await window.crmDB.previewSla(sla);if(result?.error)throw new Error(result.error);return result;},
  async previewAllSla(sla){if(!window.crmDB)throw new Error('La simulación requiere la nube del CRM.');const result=await window.crmDB.previewAllSla(sla);if(result?.error)throw new Error(result.error);return result;},
  async applyAllSla(){return change('applyAllSla','crm-leads');},
  async addUnit(unit) { return change('addUnit','crm-units',unit); },
  async updateUnitStatus(id, status) { return change('updateUnitStatus','crm-units',id, status); },
  async updateUnitPlan(id, pExt, pInt) { return change('updateUnitPlan','crm-units',id, pExt, pInt); },
  async getAnalytics(filters){const r=await window.crmDB.getAnalytics(filters);if(r?.error)throw Error(r.error);return r;},
  async leadAction(id,action){return change('leadAction','crm-leads',id,action);},
  async addLead(lead) { return change('addLead','crm-leads',lead); },
  async updateLeadStatus(id, status) { return change('updateLeadStatus','crm-leads',id, status); },
  async updateLeadAppt(id, appt) { return change('updateLeadAppt','crm-leads',id, appt); },
  async updateLeadPrize(id, prize) { return change('updateLeadPrize','crm-leads',id, prize); },
  async updateLeadAdvanced(id, advanced) { return change('updateLeadAdvanced','crm-leads',id, advanced); },
  async deleteDuplicateLead(id,keepId) { const result=await change('deleteDuplicateLead','crm-leads',id,keepId);window.dispatchEvent(new Event('crm-duplicate-log'));return result; },
  async incrementQuoteSequence() { return window.crmDB ? await window.crmDB.incrementQuoteSequence() : 1473; },
  async addQuote(q) { return change('addQuote','crm-quotes',q); },
  async deleteQuotes(ids){return change('deleteQuotes','crm-quotes',ids);},
  async syncQuoteLeadProfile(id){const result=await change('syncQuoteLeadProfile','crm-quotes',id);window.dispatchEvent(new Event('crm-leads'));return result;},
  async updateSeparation(id,action,payload){const result=await change('updateSeparation','crm-separations',id,action,payload);window.dispatchEvent(new Event('crm-units'));window.dispatchEvent(new Event('crm-leads'));return result;},
  async getBankEvaluationGuidance(id){return window.crmDB.getBankEvaluationGuidance(id);},
  async saveBankEvaluation(id,input){const result=await change('saveBankEvaluation','crm-leads',id,input);window.dispatchEvent(new Event('crm-separations'));return result;},
  async transitionBankEvaluation(id,status,input){const result=await change('transitionBankEvaluation','crm-leads',id,status,input);window.dispatchEvent(new Event('crm-separations'));return result;},
  async updateMinuteStatus(id,status,input){const result=await change('updateMinuteStatus','crm-separations',id,status,input);window.dispatchEvent(new Event('crm-leads'));return result;},
  async uploadSeparationDocument(id,kind){if(!window.crmAPI?.selectSeparationDocument)throw Error('Actualiza el CRM para cargar documentos.');const result=await window.crmAPI.selectSeparationDocument(id,kind);if(result){for(const event of ['crm-separations','crm-quotes','crm-units','crm-leads'])window.dispatchEvent(new Event(event));}return result;},
  async reconcileQuoteProfiles(){const result=await change('reconcileQuoteProfiles','crm-leads');window.dispatchEvent(new Event('crm-quotes'));return result;},
  async exportQuotes(ids){return window.crmDB.exportQuotes(ids);},
  openExternal(url) { if (this.isNative) window.crmAPI.openExternal(url); else window.open(url, '_blank'); },
  async fetchExchangeRate() { return this.isNative ? await window.crmAPI.fetchExchangeRate() : null; },
  async generateQuote(quoteData) {
    if (this.isNative) return await window.crmPDF.generateQuote(quoteData);
    return { error: 'La generación de PDF requiere usar la aplicación de escritorio nativa.' };
  },
  async generateSeparation(data) {
    if (this.isNative) return await window.crmPDF.generateSeparation(data);
    return { error: 'La generación de PDF requiere usar la aplicación de escritorio nativa.' };
  },
  async regenerateSeparation(id){if(!window.crmPDF?.regenerateSeparation)throw Error('Actualiza el CRM para regenerar el documento.');const result=await window.crmPDF.regenerateSeparation(id);for(const event of ['crm-separations','crm-quotes'])window.dispatchEvent(new Event(event));return result;},
  async generateMinute(id,input={}){if(!window.crmPDF?.generateMinute)throw Error('Actualiza el CRM para generar la minuta.');const result=await window.crmPDF.generateMinute(id,input);for(const event of ['crm-separations','crm-leads'])window.dispatchEvent(new Event(event));return result;},
  async generateDashboardPDF(kpiData) {
    if (this.isNative) return await window.crmPDF.generateDashboard(kpiData);
    return { error: 'La generación de PDF requiere usar la aplicación de escritorio nativa.' };
  },
  async saveSession(sessionData) { if(window.crmDB) await window.crmDB.saveSession(sessionData); },
  async fetchSheet(url) { return this.isNative ? await window.crmAPI.fetchSheet(url) : { error: "Solo en App" }; },
  async readLocalFile(path) { return this.isNative ? await window.crmAPI.readLocalFile(path) : null; },
  async syncUnits(csvData) { return change('syncUnits','crm-units',csvData); },
  async syncPlansUrl(value, isExt) { return change('syncPlansUrl','crm-units',value && typeof value==='object' && !Array.isArray(value) ? value : {csv:value,isExt}); },
  async syncLeadsRaw(value, isStrict) { return change('syncLeadsRaw','crm-leads',value && typeof value==='object' && !Array.isArray(value) ? value : {csv:value,isStrict}); },
  async syncUnitsAI(jsonArray) { return change('syncUnitsAI','crm-units',jsonArray); },
  async syncPlansAI(value, isExt) { return change('syncPlansAI','crm-units',value && typeof value==='object' && !Array.isArray(value) ? value : {jsonArray:value,isExt}); },
  async syncLeadsAI(value, isStrict) { return change('syncLeadsAI','crm-leads',value && typeof value==='object' && !Array.isArray(value) ? value : {jsonArray:value,isStrict}); },
  async syncLocalFolder(value,isExt) {return change('syncLocalFolder','crm-units',typeof value==='object'?value:{folderPath:value,isExt});},
  listenMarketingExpenses:cb=>listen('getMarketingExpenses','crm-marketing',cb),
  async addMarketingExpense(exp){return change('addMarketingExpense','crm-marketing',exp);},
  async deleteMarketingExpense(id){return change('deleteMarketingExpense','crm-marketing',id);},
  async clearUnits() { return change('clearUnits','crm-units'); },
  async clearLeads() { return change('clearLeads','crm-leads'); },
  async deleteLostLead(id) { return change('deleteLostLead','crm-leads',id); }
};
