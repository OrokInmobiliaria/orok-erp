const lifecycle=require('./lifecycle');
const {randomUUID}=require('node:crypto');
const {appendComment}=require('./leadComments');
const {importChannelHistory}=require('./channelHistory');
const {updateToolLinks}=require('./toolLinks');
const {updateSeparation}=require('./separationService');
const {saveEvaluation,transitionEvaluation,conversationGuidance}=require('./bankEvaluationService');
const {updateMinuteStatus}=require('./minuteService');
const {analytics}=require('./analyticsService');
const {statusInfo,leadDefaults,parseLeadCSV,syncLeads}=require('./leadImport');
const {selectedQuotes}=require('./quoteRecords');
const {exportURL}=require('./sheetAccess');
const {createHash}=require('crypto');
function leadSourceKey(value){if(!value)return 'csv-local';const u=new URL(exportURL(value));if(u.hostname==='docs.google.com'&&!u.searchParams.has('gid'))u.searchParams.set('gid','0');u.searchParams.sort();return 'sheet:'+createHash('sha256').update(u.href).digest('hex');}
const {sold,confirmSale,reconcileSales,assertQuotable}=require('./salesService');
const {planRows,resolvePlanRows,applyPlans,folderPlans}=require('./planService');
const {removeUndefinedFirestoreValues}=require('./firestoreValueGuard');
function createQueries(readDB, save){
function writeDB(data){if(data.settings)data.settings.salesAccessEmail="soportetecnologico@orok.com.pe";reconcileSales(data);removeUndefinedFirestoreValues(data);save(data);}
function parseCSV(str) {
  if (!str) return [];
  str = str.replace(/^\uFEFF/, ''); 
  str = str.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  
  let delimiter = ',';
  if (str.indexOf('\t') !== -1) delimiter = '\t';
  else if (str.indexOf(';') !== -1 && (str.indexOf(',') === -1 || str.indexOf(';') < str.indexOf(','))) delimiter = ';';
  
  const rows = []; let currentRow = []; let currentCell = ''; let inQuotes = false;
  for (let i = 0; i < str.length; i++) {
    const c = str[i]; const nextC = str[i+1];
    if (c === '"') {
      if (inQuotes && nextC === '"') { currentCell += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (c === delimiter && !inQuotes) {
      currentRow.push(currentCell.trim()); currentCell = '';
    } else if (c === '\n' && !inQuotes) {
      currentRow.push(currentCell.trim()); currentCell = '';
      if (currentRow.length > 0 || currentCell !== '') rows.push(currentRow);
      currentRow = [];
    } else { currentCell += c; }
  }
  if (currentCell !== '' || currentRow.length > 0) {
    currentRow.push(currentCell.trim()); rows.push(currentRow);
  }
  return rows.filter(r => r.some(cell => cell.trim() !== ''));
}

function parseNumber(val) {
  if(!val) return 0;
  let s = String(val).trim();
  if(s.includes(',') && s.includes('.')) {
      if(s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
      else s = s.replace(/,/g, '');
  } else if(s.includes(',')) {
      if(s.split(',').length > 2) s = s.replace(/,/g, '');
      else s = s.replace(',', '.');
  }
  return parseFloat(s.replace(/[^0-9.-]/g, '')) || 0;
}

function actorName(actor){return typeof actor==='object'?String(actor.actor||actor.name||''):String(actor||'');}
function normalizeLeadText(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es-PE').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');}
function normalizeLeadPhone(value){return String(value||'').replace(/\D/g,'').replace(/^51(?=9\d{8}$)/,'');}
function duplicateReason(first,second){
 const dni=String(first?.dni||'').replace(/\D/g,''),otherDni=String(second?.dni||'').replace(/\D/g,'');
 const phone=normalizeLeadPhone(first?.phone),otherPhone=normalizeLeadPhone(second?.phone);
 const email=String(first?.email||'').trim().toLowerCase(),otherEmail=String(second?.email||'').trim().toLowerCase();
 const name=normalizeLeadText(first?.name),otherName=normalizeLeadText(second?.name);
 if(dni&&dni===otherDni)return 'DNI';if(phone&&phone===otherPhone)return 'teléfono';if(email&&email===otherEmail)return 'correo';if(name&&name.split(' ').length>=2&&name===otherName)return 'nombre y apellidos';return '';
}
function findDuplicateLead(rows,item,excludeId=''){for(const lead of rows||[]){if(lead.id===excludeId)continue;const reason=duplicateReason(item,lead);if(reason)return {lead,reason};}return null;}
function duplicateLeadError(match){const lead=match.lead||{},details={id:lead.id||'',lead_number:lead.lead_number||'',name:lead.name||'',status:lead.status||'Sin estado',reason:match.reason};return new Error('DUPLICATE_LEAD:'+Buffer.from(JSON.stringify(details),'utf8').toString('base64'));}
function assignResponsibility(lead,assignment,source,isNew=false){
 const owner=String(assignment?.sales_owner||'').trim();
 if(!owner||String(lead.sales_owner||'').trim())return false;
 lead.sales_owner=owner;lead.assigned_by=actorName(assignment);lead.assigned_at=new Date().toISOString();
 if(assignment?.broker_name)lead.selectedBrokers=[...new Set([...(lead.selectedBrokers||[]),assignment.broker_name])];
 lead._assignment_event={owner,actor:actorName(assignment),source,isNew};return true;
}
function legacyReceivedAt(lead,now=new Date().toISOString()){
 const dates=[];
 const add=(value,source)=>{const at=lifecycle.iso(value);if(at&&at<=now)dates.push({at,source});};
 for(const key of ['imported_at','created_at','createdAt','registered_at','registration_date','fecha_ingreso','fecha_registro'])add(lead[key],key==='imported_at'?'Importación previa':'Registro previo');
 for(const event of lead.events||[])add(event?.at,'Primer evento registrado');
 for(const comment of lead.comment_history||[])add(comment?.at,'Primer comentario registrado');
 for(const stage of lead.stage_history||[])add(stage?.at,'Primer cambio de etapa registrado');
 dates.sort((a,b)=>a.at.localeCompare(b.at));return dates[0]||null;
}
function saveImport(d,imported,assignment){
 const old=new Map((d.leads||[]).map(l=>[l.id,l]));
 for(const l of imported.leads){l.project ||= d.settings?.projectName||'Proyecto principal';if(old.has(l.id))lifecycle.transition(l,old.get(l.id).status,'Hoja de origen',{observed:true});const assigned=l._assignment_event;if(assigned){lifecycle.event(l,assigned.isNew?'received':'assigned',assigned.actor||'Sin asignar',{assigned_owner:assigned.owner,ingress_source:assigned.source});delete l._assignment_event;}}
 const kept=new Set(imported.leads.map(l=>l.id));d.archived_leads=[...(d.archived_leads||[]),...(d.leads||[]).filter(l=>!kept.has(l.id)).map(l=>({...l,archived_at:new Date().toISOString()}))];
 d.leads=imported.leads;writeDB(d);return imported.result;
}
const queries = {
  importChannelHistory:(input,actor)=>{const d=readDB(),result=importChannelHistory(d,input,actor);if(result.conversations)writeDB(d);return result;},
  updateToolLinks:(input,actor)=>{const d=readDB(),links=updateToolLinks(d,input,actor);writeDB(d);return links;},
  logChatAccess:(id,input,actor)=>{
    // R32 · Trazabilidad de chats: evento en el historial y, al abrir, un comentario visible (máx. uno cada 30 min por usuario y red).
    const NAMES={whatsapp:'WhatsApp',instagram:'Instagram',messenger:'Messenger',tiktok:'TikTok',phone:'Teléfono'},ORIGINS={kanban:'el Kanban',bandeja:'la Bandeja social',ficha:'la ficha del lead',busqueda:'el buscador'};
    const channel=String(input?.channel||''),origin=String(input?.origin||''),action=String(input?.action||'open');
    if(!NAMES[channel]||!ORIGINS[origin]||!['open','reply','call'].includes(action)||(channel==='phone')!==(action==='call'))throw Error('Registro de chat no válido.');
    const d=readDB(),lead=(d.leads||[]).find(l=>l.id===id);if(!lead)throw Error('Lead no encontrado.');
    const now=new Date(),at=now.toISOString(),result=NAMES[channel]+' · desde '+ORIGINS[origin];
    // Llamadas: cada intento deja comentario, salvo doble clic (2 min). Chats: un comentario cada 30 min por persona y red.
    const type=action==='call'?'phone_call':'chat_'+action,windowMs=action==='call'?2*60000:30*60000;
    const recent=action!=='reply'&&(lead.events||[]).some(e=>e.type===type&&e.channel===channel&&e.actor===(actor||'Sin asignar')&&now-Date.parse(e.at)<windowMs);
    if(action==='call'&&recent)return {ok:true,commented:false,throttled:true};
    lifecycle.event(lead,type,actor,{channel,origin,result,thread_id:String(input?.thread_id||'').slice(0,100)},at);
    let commented=false;
    if(action!=='reply'&&!recent){const text=action==='call'?'📞 Llamó por teléfono'+(lead.phone?' al '+String(lead.phone).slice(0,20):'')+' desde '+ORIGINS[origin]+'.':'💬 Abrió el chat de '+NAMES[channel]+' desde '+ORIGINS[origin]+'.';appendComment(lead,{text,requestId:'chat-'+randomUUID()},actor,at);commented=true;}
    writeDB(d);return {ok:true,commented,throttled:recent};
  },
  addLeadComment:(id,input,actor)=>{const d=readDB(),lead=(d.leads||[]).find(l=>l.id===id);if(!lead)throw Error('Lead no encontrado.');const entry=appendComment(lead,input,actor);lifecycle.event(lead,'comment',actor,{comment_id:entry.id});writeDB(d);return entry;},
  getAnalytics: filters=>analytics(readDB(),filters),
  leadAction:(id,action,actor)=>{
    const d=readDB(),l=(d.leads||[]).find(l=>l.id===id);if(!l)throw Error('Lead no encontrado.');
    if(l.sold_unit_id&&action.type!=='profile')throw Error('La venta ya está confirmada.');
    const before=l.status;lifecycle.applyAction(l,action,actor);
    const managementNote=String(action?.payload?.management_note||'').trim();
    if(managementNote){
      const requestId=String(action?.payload?.management_request_id||'').trim()||'gestion-'+randomUUID();
      const entry=appendComment(l,{text:managementNote,requestId},actor);
      lifecycle.event(l,'comment',actor,{comment_id:entry.id,source:'Gestión guiada'});
    }
    if(before!==l.status)l.stage_history=[...(l.stage_history||[]),{from:before,to:l.status,at:new Date().toISOString(),actor,observed:false}];
    writeDB(d);return l;
  },
  getSettings: () => {const {managerPin,...settings}=readDB().settings||{};return {...settings,salesAccessEmail:'soportetecnologico@orok.com.pe'};},
  getDuplicateDeletionLog: () => (readDB().duplicate_deletion_log||[]).slice().sort((a,b)=>String(b.deleted_at||'').localeCompare(String(a.deleted_at||''))),
  updateSettings: (s) => { const d = readDB(); d.settings = s; writeDB(d); },
  incrementQuoteSequence: () => { const d = readDB(); const c = d.quote_sequence || 1473; d.quote_sequence = c + 1; writeDB(d); return c; },
  getUnits: () => { const d=readDB(); const before=JSON.stringify(d); reconcileSales(d); if(before!==JSON.stringify(d))writeDB(d); return (d.units || []).map(u=>({...u,plan_image_ext:String(u.plan_image_ext||''),plan_image_int:String(u.plan_image_int||'')})); },
  addUnit: (u) => { const d = readDB(); if(!d.units) d.units=[]; d.units.push(u); writeDB(d); },
  updateUnitStatus: (id, s) => { const d = readDB(); const u = d.units.find(x => x.id === id); if(u){ if(sold(u)&&s!==u.status)throw new Error("El departamento está vendido y bloqueado."); u.status = s; writeDB(d); } },
  updateUnitPlan: (id, pExt, pInt) => { const d = readDB(); const u = d.units.find(x => x.id === id); if(u){ if(pExt !== undefined) u.plan_image_ext = pExt; if(pInt !== undefined) u.plan_image_int = pInt; writeDB(d); } },
  clearUnits: () => { const d = readDB(); if(d.units.some(sold))throw new Error("No se puede vaciar un inventario con ventas confirmadas."); d.units = []; writeDB(d); return true; },
  clearLeads: () => { const d = readDB(); d.leads = []; writeDB(d); return true; },
  deleteLostLead: id => {
    const d=readDB(),index=(d.leads||[]).findIndex(lead=>lead.id===id);
    if(index<0)throw Error('Lead no encontrado.');
    const lead=d.leads[index];
    if(!['Perdido','Desestimado'].includes(lead.status))throw Error('Solo se pueden eliminar leads perdidos o desestimados.');
    if(lead.sold_unit_id||lead.status==='Venta')throw Error('Una venta confirmada no se puede eliminar.');
    d.leads.splice(index,1);
    // A test lead can have generated quotations. Remove those linked records
    // too so neither dashboards nor sales reports retain a phantom lead.
    const quoteIds=new Set([...(d.quotes||[]),...(d.deleted_quotes||[])].filter(quote=>quote.lead_id===id||quote.leadId===id).map(quote=>quote.id));
    d.quotes=(d.quotes||[]).filter(quote=>!quoteIds.has(quote.id));
    d.deleted_quotes=(d.deleted_quotes||[]).filter(quote=>!quoteIds.has(quote.id));
    writeDB(d);
    return {id:lead.id,name:lead.name||'Lead',removed_quotes:quoteIds.size};
  },
  getQuotes: () => readDB().quotes || [],
  getSeparations: () => readDB().separations || [],
  getBankEvaluationGuidance: id => {const lead=(readDB().leads||[]).find(item=>item.id===id);if(!lead)throw Error('Lead no encontrado.');return conversationGuidance(lead);},
  saveBankEvaluation: (id,input,actor) => {const d=readDB(),evaluation=saveEvaluation(d,id,input,actor),lead=(d.leads||[]).find(item=>item.id===id);writeDB(d);return {evaluation,lead};},
  transitionBankEvaluation: (id,status,input,actor) => {const d=readDB(),evaluation=transitionEvaluation(d,id,status,input,actor),lead=(d.leads||[]).find(item=>item.id===id);writeDB(d);return {evaluation,lead};},
  updateMinuteStatus: (id,status,input,actor) => {const d=readDB(),result=updateMinuteStatus(d,id,status,input,actor);writeDB(d);return result;},
  updateSeparation: (id,action,payload,actor) => {const d=readDB(),result=updateSeparation(d,id,action,payload,actor),quote=(d.quotes||[]).find(item=>item.id===result.quote_id);if(quote){quote.separation_status=result.status;quote.separation_updated_at=new Date().toISOString();}writeDB(d);return result;},
  syncQuoteLeadProfile: (id,actor) => {
    const d=readDB(),quote=(d.quotes||[]).find(item=>item.id===id);if(!quote)throw Error('Cotización no encontrada.');
    const lead=(d.leads||[]).find(item=>item.id===(quote.lead_id||quote.leadId));if(!lead)throw Error('La cotización no está vinculada a una ficha activa.');
    const before=JSON.stringify({lead,quote}),snapshot={...(quote.client_snapshot||{})};
    for(const key of ['name','phone','email','address','source','project','unit_interest']){const leadValue=String(lead[key]||'').trim(),quoteValue=String(snapshot[key]||'').trim();if(!leadValue&&quoteValue)lead[key]=quoteValue;else if(leadValue&&!quoteValue)snapshot[key]=leadValue;}
    const dni=String(lead.dni||quote.dni||snapshot.dni||'').replace(/\D/g,'').slice(0,8);if(dni.length===8){lead.dni=dni;quote.dni=dni;snapshot.dni=dni;}
    const budget=Number(lead.budget||snapshot.budget||quote.final_price||0);if(budget>0){lead.budget=budget;snapshot.budget=budget;}
    quote.lead_id=lead.id;quote.lead_name=lead.name;snapshot.name=lead.name;quote.client_snapshot=snapshot;
    const changed=before!==JSON.stringify({lead,quote});if(changed){lifecycle.event(lead,'quote_profile_reconciled',actor,{quote_code:quote.quote_code,history_count:1});writeDB(d);}return {changed,lead_id:lead.id,quote_id:quote.id};
  },
  reconcileQuoteProfiles: actor => {
    const d=readDB(),normal=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLocaleLowerCase('es-PE'),unitNumber=value=>String(value||'').match(/\d{3,4}/)?.[0]||'';
    const units=new Map((d.units||[]).map(unit=>[unit.id,unit])),unitsByNumber=new Map((d.units||[]).map(unit=>[String(unit.unit_number),unit]));
    const leadsByName=new Map();for(const lead of d.leads||[]){const key=normal(lead.name);if(key)leadsByName.set(key,[...(leadsByName.get(key)||[]),lead.id]);}
    const quotesByLead=new Map();
    for(const quote of d.quotes||[]){
      let leadId=quote.lead_id||quote.leadId||quote.prospect_id||quote.prospectId;
      if(!leadId){const matches=leadsByName.get(normal(quote.lead_name||quote.leadName));if(matches?.length===1)leadId=matches[0];}
      if(!leadId)continue;const rows=quotesByLead.get(leadId)||[];rows.push(quote);quotesByLead.set(leadId,rows);
    }
    let updated=0,summaries=0;const now=Date.now();
    for(const lead of d.leads||[]){
      const quotes=(quotesByLead.get(lead.id)||[]).slice().sort((a,b)=>String(a.date||'').localeCompare(String(b.date||'')));
      if(!quotes.length)continue;
      const latest=quotes[quotes.length-1],unit=units.get(latest.unit_id||latest.unitId)||unitsByNumber.get(unitNumber(latest.unit_number)),next={id:latest.id,code:latest.quote_code,delivered_at:latest.date,unit_number:latest.unit_number,price:latest.price,final_price:latest.final_price,financing_type:latest.financingType||latest.financing_type||null,direct_credit_months:latest.directCreditMonths||latest.direct_credit_months||null,recontact_at:latest.recontact_at||null,pdf_path:latest.pdf_path};
      let changed=JSON.stringify(lead.last_quote||null)!==JSON.stringify(next);
      lead.last_quote=next;
      if(!String(lead.project||'').trim()&&String(d.settings?.projectName||'').trim()){lead.project=d.settings.projectName;changed=true;}
      if(!String(lead.sales_owner||'').trim()&&String(latest.seller||'').trim()){lead.sales_owner=latest.seller;changed=true;}
      for(const key of ['name','phone','email','address','source','project'])if(!String(lead[key]||'').trim()&&String(latest.client_snapshot?.[key]||'').trim()){lead[key]=String(latest.client_snapshot[key]).trim();changed=true;}
      if(!String(lead.dni||'').trim()&&/^\d{8}$/.test(String(latest.dni||''))){lead.dni=String(latest.dni);changed=true;}
      if(!String(lead.unit_interest||'').trim()){lead.unit_interest=unit?.unit_type||('Departamento '+(unitNumber(latest.unit_number)||latest.unit_number||'')).trim();changed=!!lead.unit_interest;}
      const quotedUnits=[...new Map(quotes.map(q=>[String(q.unit_number||''),q])).values()].filter(q=>String(q.unit_number||'').trim());
      const fillDepartment=(field,priceField,quote)=>{if(!quote||String(lead[field]||'').trim())return;lead[field]=quote.unit_number;lead[priceField]=Number(quote.final_price||quote.price)||0;changed=true;};
      fillDepartment('dpto1','dpto1_price',quotedUnits.at(-1));
      fillDepartment('dpto2','dpto2_price',quotedUnits.filter(q=>String(q.unit_number)!==String(lead.dpto1)).at(-1));
      if(!(Number(lead.budget)>0)&&Number(latest.final_price)>0){lead.budget=Number(latest.final_price);changed=true;}
      if(!String(lead.next_action||'').trim()&&latest.recontact_at&&Date.parse(latest.recontact_at)>now){lead.next_action='Llamar para confirmar recepción de cotización '+latest.quote_code;lead.next_action_at=latest.recontact_at;changed=true;}
      const pending=lifecycle.qualificationPending?lifecycle.qualificationPending(lead):[];
      if(pending.length){if(JSON.stringify(lead.qualification_pending||[])!==JSON.stringify(pending)){lead.qualification_pending=pending;changed=true;}}
      else if(lead.qualification_pending){delete lead.qualification_pending;changed=true;}
      if(quotes.length>1){
        const summary=quotes.slice(0,-1).map(q=>`${q.quote_code||'Sin código'} · ${q.unit_number||'Unidad no indicada'} · S/ ${Number(q.final_price||0).toLocaleString('es-PE')}`).join(' | ');
        const before=(lead.comment_history||[]).length;
        appendComment(lead,{requestId:'quote-history-'+latest.id,text:'Resumen de cotizaciones anteriores: '+summary},actor);
        if((lead.comment_history||[]).length>before){lifecycle.event(lead,'comment',actor,{source:'Resumen de cotizaciones históricas'});summaries++;changed=true;}
      }
      if(changed){lifecycle.event(lead,'quote_profile_reconciled',actor,{quote_code:latest.quote_code,history_count:quotes.length});updated++;}
    }
    if(updated)writeDB(d);
    return {updated,summaries,reviewed:quotesByLead.size};
  },
  deleteQuotes: ids => {
    const d=readDB(),rows=selectedQuotes(d.quotes||[],ids),selected=new Set(rows.map(q=>q.id));
    d.deleted_quotes=[...(d.deleted_quotes||[]),...rows.map(q=>({...q,deleted_at:new Date().toISOString()}))];
    d.quotes=d.quotes.filter(q=>!selected.has(q.id));writeDB(d);return {deleted:rows.length};
  },
  addQuote: (q) => { const d = readDB(); if(q.unit_id)assertQuotable(d.units||[],{id:q.unit_id}); if(!d.quotes) d.quotes=[]; d.quotes.push(q); writeDB(d); },
  
  getMarketingExpenses: () => readDB().marketing_expenses || [],
  addMarketingExpense: (exp,actor) => {
    const amount=Number(exp.amount),concept=String(exp.concept||'').trim();
    if(!concept||concept.length>500||!Number.isFinite(amount)||amount<=0||!/^\d{4}-\d{2}-\d{2}$/.test(exp.date||'')||!lifecycle.iso(exp.date))throw Error('Completa concepto, fecha válida y monto mayor a cero.');
    if(!['campaign','other'].includes(exp.spend_type))throw Error('Selecciona el tipo de gasto.');
    const entry={id:randomUUID(),concept,amount,date:exp.date,spend_type:exp.spend_type,created_at:new Date().toISOString(),created_by:actor||'Sin asignar'};
    for(const key of ['project','agency','source','campaign_name'])entry[key]=String(exp[key]||'').trim().slice(0,250);
    const d=readDB();d.marketing_expenses=[...(d.marketing_expenses||[]),entry];writeDB(d);return entry;
  },
  deleteMarketingExpense: (id) => { const d = readDB(); if(d.marketing_expenses) { d.marketing_expenses = d.marketing_expenses.filter(x => x.id !== id); writeDB(d); } },

  applyPlanRows: (rows,isExt) => {
    const d=readDB(),result=applyPlans(d.units||[],rows,isExt);
    if(!result.report.matched)throw new Error('No se encontraron departamentos coincidentes en el inventario.');
    if(result.report.updated){d.units=result.units;writeDB(d);}return result.report;
  },
  syncLocalFolder: async ({folderPath,isExt}) => {
    const result=await folderPlans(folderPath,queries.getUnits(),isExt);
    if(result.skipped.length)throw new Error(result.skipped.join(' '));
    return queries.applyPlanRows(result.rows,isExt).matched;
  },
  syncPlansUrl: async ({csv,isExt}) => {
    const rows=await resolvePlanRows(planRows(csv,isExt),isExt);
    return queries.applyPlanRows(rows,isExt).matched;
  },

  syncUnitsAI: (jsonArray) => {
    const d = readDB(); let added = 0; let updated = 0;
    if(!Array.isArray(jsonArray)) return {added, updated};
    jsonArray.forEach(item => {
        if(!item.unit_number || !item.price) return;
        const exists = d.units.find(u => String(u.unit_number) === String(item.unit_number));
        if (exists) { const lock=sold(exists)?{status:exists.status,sold_lead_id:exists.sold_lead_id,sold_at:exists.sold_at}:{}; Object.assign(exists, item, lock, {id:exists.id}); updated++; } 
        else { d.units.push({ id:'u-'+Date.now()+Math.random(), floor: parseInt(String(item.unit_number).charAt(0)) || 1, status: 'AVAILABLE', plan_image_ext: '', plan_image_int: '', ...item }); added++; }
    });
    writeDB(d); return {added, updated};
  },

  syncPlansAI: async ({jsonArray,isExt}) => {
    if(!Array.isArray(jsonArray))throw new Error('La IA no devolvió una lista de planos.');
    const rows=await resolvePlanRows(jsonArray.map(r=>({...r,label:r.label||String(r.unit_number)})),isExt);
    return queries.applyPlanRows(rows,isExt).matched;
  },
  syncLeadsRaw: ({csv,isStrict,sourceUrl},assignment) => {
    const d=readDB();const imported=syncLeads(d.leads||[],parseLeadCSV(csv),isStrict,leadSourceKey(sourceUrl),assignment);
    return saveImport(d,imported,assignment);
  },
  syncLeadsAI: ({jsonArray,isStrict,sourceUrl},assignment) => {
    const d=readDB();const imported=syncLeads(d.leads||[],jsonArray,isStrict,leadSourceKey(sourceUrl),assignment);
    return saveImport(d,imported,assignment);
  },
  getLeads: () => {
    // Opening or refreshing Kanban must never change commercial data.  Lifecycle
    // transitions are only applied by an explicit user action, never by a read.
    const d=readDB();
    return (d.leads||[]).map(l=>({...l,phone:String(l.phone||''),status:statusInfo(l.status).status}));
  },
  backfillLeadReceivedDates: () => {
    const d=readDB(),now=new Date().toISOString();let updated=0,pending=0;
    for(const lead of d.leads||[]){
      if(String(lead.received_at||'').trim())continue;
      const found=legacyReceivedAt(lead,now);
      if(!found){pending++;continue;}
      lead.received_at=found.at;lead.received_date_source='Migración automática · '+found.source;updated++;
    }
    if(updated)writeDB(d);return {updated,pending};
  },
  addLead: (item,actor) => {
    const d=readDB();if(!d.leads)d.leads=[];
    const duplicate=findDuplicateLead([...(d.leads||[]),...(d.archived_leads||[])],item);if(duplicate)throw duplicateLeadError(duplicate);
    const lead=leadDefaults(item,d.leads),at=new Date().toISOString(),actorLabel=actorName(actor);
    assignResponsibility(lead,actor,'Registro manual',true);
    lead.ingressed_by=actorLabel;lead.received_at=at;lead.received_date_source='Registro manual';lead.history_complete=lead.status==='Lead Inicial';lead.project ||= d.settings?.projectName||'Proyecto principal';lead.events=[];lead.milestones={};lead.appointments=[];lead.separations=[];lead.stage_history=[];
    lead.comment_history=[];
    if(String(lead.comments||'').trim()){appendComment(lead,{text:lead.comments,requestId:'initial'},actorLabel,at);lead.comments='';}
    lifecycle.event(lead,'received',actorLabel,{assigned_owner:lead.sales_owner||'Sin asignar',ingress_source:'Registro manual'},at);delete lead._assignment_event;d.leads.push(lead);writeDB(d);return lead;
  },
  deleteDuplicateLead: (id,keepId,actor) => {
    const d=readDB(),leads=d.leads||[],lead=leads.find(item=>item.id===id),kept=leads.find(item=>item.id===keepId);
    if(!lead||!kept)throw Error('Actualiza el Kanban y vuelve a seleccionar ambos leads.');if(lead.id===kept.id)throw Error('Selecciona el lead que se conservará.');if(lead.sold_unit_id||lead.status==='Venta')throw Error('No se puede eliminar un lead con venta confirmada.');
    const reason=duplicateReason(lead,kept);if(!reason)throw Error('Los leads no comparten DNI, teléfono, correo ni nombre completo.');
    const deletedAt=new Date().toISOString(),deletedBy=actorName(actor)||'Usuario registrado',quoteCount=(d.quotes||[]).filter(q=>String(q.lead_id||q.leadId||'')===String(lead.id)).length;
    d.deleted_duplicate_leads=[...(d.deleted_duplicate_leads||[]),{...lead,duplicate_of_id:kept.id,duplicate_of_lead_number:kept.lead_number||'',duplicate_reason:reason,deleted_at:deletedAt,deleted_by:deletedBy,deleted_from_status:lead.status||'Lead Inicial'}];
    d.duplicate_deletion_log=[...(d.duplicate_deletion_log||[]),{id:randomUUID(),action:'Eliminación de duplicado',deleted_at:deletedAt,deleted_by:deletedBy,reason,deleted_lead_id:lead.id,deleted_lead_number:lead.lead_number||'',deleted_lead_name:lead.name||'',deleted_lead_status:lead.status||'Lead Inicial',kept_lead_id:kept.id,kept_lead_number:kept.lead_number||'',kept_lead_name:kept.name||'',quote_count:quoteCount}];
    d.leads=leads.filter(item=>item.id!==id);writeDB(d);return {deletedId:id,keptId:kept.id,reason};
  },
  assignUnassignedLeads: (owner,actor) => {const d=readDB(),name=String(owner||'').trim();if(!name)return {assigned:0};let assigned=0;for(const lead of d.leads||[]){if(String(lead.sales_owner||'').trim())continue;lead.sales_owner=name;lead.assigned_by=actorName(actor);lead.assigned_at=new Date().toISOString();lifecycle.event(lead,'assigned',actorName(actor)||'Sin asignar',{assigned_owner:name,ingress_source:'Asignación inicial'});assigned++;}if(assigned)writeDB(d);return {assigned};},
  updateLeadStatus: (id,status,actor) => queries.updateLeadAdvanced(id,{status:statusInfo(status).status},actor),
  updateLeadAppointment: (id,appointment,actor) => queries.leadAction(id,{type:'schedule',payload:{scheduled_at:appointment.date+'T'+appointment.time}},actor),
  updateLeadPrize: (id,prize) => queries.updateLeadAdvanced(id,{prize}),
  updateLeadAdvanced: (id,fields,actor) => {
    const d=readDB();const lead=(d.leads||[]).find(l=>l.id===id);
    if(!lead)throw new Error('No se encontró el lead. Actualiza el Kanban.');
    const {id:ignoredId,lead_number:ignoredNumber,...changes}=fields;
    const semaphoreReason=String(changes.semaphore_override_reason||'').trim();delete changes.semaphore_override_reason;
    for(const key of ['events','milestones','stage_history','appointments','separations','history_complete','tracking_started_at','received_at','sale_confirmed_at','last_activity_at','sql_status','comment_history','assigned_by','assigned_at','ingressed_by','substatus','loss_reason','lost_at','reactivated_at','last_quote','qualification_pending'])delete changes[key];
    if('comments' in changes&&changes.comments!==lead.comments)throw Error('Añade un comentario nuevo para conservar el historial.');
    const next={...lead,...changes};next.status=statusInfo(next.status).status;
    if(next.status==='Seguimiento'&&lead.status!=='Seguimiento')throw Error('Define el subestado y la próxima acción desde Gestión y seguimiento.');
    if(next.status==='Perdido')throw Error('Registra el motivo obligatorio desde Gestión y seguimiento.');
    if(next.status!==lead.status){
      if(next.status==='MQL'&&(!(Number(next.budget)>0)||!next.unit_interest||!next.purchase_horizon))throw Error('Abre Gestión y seguimiento y completa los requisitos MQL.');
      if(next.status==='Cita'&&!(next.appointments||[]).some(a=>a.status==='scheduled'))throw Error('Agenda la cita desde Gestión y seguimiento.');
      if(next.status==='Cita Asistida'&&!(next.appointments||[]).some(a=>a.status==='attended'))throw Error('Registra la asistencia desde Gestión y seguimiento.');
      if(next.status==='Calificado'&&!['Aprobado','Crédito directo viable'].includes(next.finance_status))throw Error('Registra la viabilidad financiera desde Gestión y seguimiento.');
    }
    if(lead.milestones?.sale&&changes.sale_amount!==undefined&&Number(changes.sale_amount)!==Number(lead.sale_amount))throw Error('El importe confirmado ya está registrado.');
    if(lead.sold_unit_id&&next.sold_unit_id!==lead.sold_unit_id)throw new Error('No se puede sustituir una venta confirmada.');
    if(next.status==='Venta'&&(lead.status!=='Venta'||changes.sold_unit_id)){
      confirmSale(d,next,next.sold_unit_id,{at:lead.status==='Venta'&&!lead.milestones?.sale?null:new Date().toISOString()});
      if(!(Number(next.sale_amount)>0)||!Number.isFinite(Number(next.sale_amount)))throw Error('Indica el importe real de venta en soles.');
      next.sale_amount=Number(next.sale_amount);
    }
    lifecycle.transition(next,lead.status,actor);
    const changedFields=Object.keys(changes).filter(key=>JSON.stringify(lead[key])!==JSON.stringify(next[key]));
    const manualSemaphore=changes.sla?.control_mode==='manual'||changes.sla?.manual_adjustment===true;
    if(manualSemaphore&&!semaphoreReason)throw Error('Indica el motivo del ajuste manual del semáforo.');
    Object.assign(lead,next);
    if(changedFields.length)lifecycle.event(lead,'updated',actor,{fields:changedFields});
    if(manualSemaphore)lifecycle.event(lead,'semaphore_manual',actor,{severity:lead.sla?.severity,reason:semaphoreReason,temporary:false});
    if(changes.sla?.control_mode==='automatic'&&lead.sla?.control_mode==='automatic')lifecycle.event(lead,'semaphore_automatic',actor,{severity:lead.sla?.automatic_severity||lead.sla?.severity});
    writeDB(d);return lead;
  },
  syncUnits: (csvData) => { 
     const d = readDB(); let added = 0; let updated = 0; 
     const rows = parseCSV(csvData);
     if (rows.length < 2) throw new Error("El archivo está vacío o tiene un formato no válido.");
     
     let headerIdx = -1;
     for(let i=0; i<Math.min(10, rows.length); i++) {
        const rowStr = rows[i].join(' ').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        if((rowStr.includes('precio') || rowStr.includes('pvp') || rowStr.includes('venta')) && 
           (rowStr.includes('dpt') || rowStr.includes('nro') || rowStr.includes('num') || rowStr.includes('tipo'))) { 
            headerIdx = i; break; 
        }
     }
     
     if (headerIdx === -1) throw new Error("No se detectaron las columnas 'Dpto', 'Precio', 'PVP' o 'Tipo' en el archivo.");

     const headers = rows[headerIdx].map(h => h.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase());
     for(let i = headerIdx + 1; i < rows.length; i++) {
        const cols = rows[i];
        if (!cols || cols.length === 0 || (cols.length===1 && !cols[0])) continue;
        let rowData = {}; headers.forEach((h, idx) => rowData[h] = cols[idx] || '');
        const getCol = (searchTerms) => { const key = Object.keys(rowData).find(k => searchTerms.some(term => k.includes(term))); return key ? rowData[key] : ''; };
        
        const dptoRaw = getCol(['dpto', 'departamento', 'nro', 'num']); let unit_number = '';
        if (dptoRaw) { const dptoMatch = String(dptoRaw).match(/\d{3,4}/); if (dptoMatch) unit_number = dptoMatch[0]; }
        if (!unit_number) { for (let c of cols) { const m = String(c).match(/\d{3,4}/); if (m && String(c).length < 10) { unit_number = m[0]; break; } } }
        
        if (unit_number) {
            const priceRaw = getCol(['pvp', 'precio', 'venta']);
            let price = parseNumber(priceRaw);
            if (!price || isNaN(price) || price < 1000) {
               const nums = cols.map(c => parseNumber(c)).filter(n => !isNaN(n));
               price = Math.max(...nums.filter(n => n > 1000), 0);
            }

            if (price > 1000) { 
                const floorRaw = getCol(['piso', 'nivel']);
                let floor = parseInt(String(floorRaw).replace(/[^0-9]/g, ''));
                if (isNaN(floor) || !floor) floor = parseInt(String(unit_number).match(/\d/)?.[0]) || 1;

                const typeRaw = getCol(['tipo', 'tipologia', 'modelo']); const unit_type = typeRaw ? typeRaw.trim() : 'Flat';
                const areaT_raw = getCol(['techada', 'area t', 'área t', 'tech']);
                const areaL_raw = getCol(['libre', 'area l', 'área l', 'balcon', 'terraza']);
                
                const covered_area = parseNumber(areaT_raw);
                const free_area = parseNumber(areaL_raw);

                const exists = d.units.find(u => String(u.unit_number) === String(unit_number));
                if (exists) { Object.assign(exists, { price: price, unit_type, covered_area, free_area, floor }); updated++; } 
                else { d.units.push({ id:'u-'+Date.now()+Math.random(), unit_number: String(unit_number), floor, unit_type, covered_area, free_area, price, status: 'AVAILABLE', plan_image_ext: '', plan_image_int: '' }); added++; }
            }
        }
     }
     d.units = d.units.filter(u => u.unit_number && !String(u.unit_number).includes('undefined') && String(u.unit_number).trim() !== ''); writeDB(d); return {added,updated}; 
  },
  
  saveSession: (sessionData) => { const d = readDB(); if(!d.sessions) d.sessions=[]; d.sessions.push(sessionData); writeDB(d); }
};

return queries;
}
module.exports={createQueries};
