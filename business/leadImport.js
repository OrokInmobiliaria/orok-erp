const { randomUUID } = require('crypto');
const {iso}=require('./lifecycle');

const STAGES = ['Lead Inicial', 'Contactado', 'Información enviada', 'MQL', 'Cita', 'Cita Asistida', 'Calificado', 'Evaluación GNB', 'Seguimiento', 'Separación', 'Inicial', 'Minuta', 'Venta', 'Perdido'];
const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[_\W]+/g, ' ').trim();
const aliases = {
  phone: ['telefono', 'phone', 'phone number', 'numero de telefono', 'numero de celular', 'celular', 'movil', 'whatsapp', 'telefono movil', 'tel', 'cel'],
  name: ['nombre completo', 'full name', 'nombre y apellidos', 'nombres y apellidos', 'nombre', 'nombres', 'name', 'cliente', 'prospecto', 'contacto', 'first name'],
  surname: ['apellidos', 'apellido', 'last name'],
  email: ['email', 'correo electronico', 'correo', 'e mail', 'mail'],
  status: ['status', 'estado del lead', 'estado lead', 'lead status', 'estatus', 'estado', 'etapa', 'etapa del embudo'],
  campaign_name: ['campana', 'nombre de campana', 'campaign name', 'campaign'],
  ad_name: ['anuncio', 'nombre del anuncio', 'ad name', 'ad'],
  source: ['plataforma', 'platform', 'fuente', 'origen', 'source', 'red social'],
  dni: ['dni', 'documento', 'documento de identidad'],
  address: ['direccion', 'address'],
  comments: ['comentario', 'comentarios', 'notas', 'observacion', 'observaciones', 'comments'],
  budget: ['presupuesto', 'budget'],
  project:['proyecto','project'],
  received_at:['fecha','date','timestamp','marca temporal','submission time','received at','fecha y hora','fecha hora','fecha y hora de ingreso','fecha de captacion','fecha del lead','fecha de ingreso','fecha ingreso','fecha de registro','fecha registro','hora de creacion','created time','created at','created_time','created at time','fecha de creacion'],
};
const stageAliases = new Map(STAGES.map(stage => [normalize(stage), stage]));
Object.entries({
  'Lead Inicial': ['nuevo', 'nuevo lead', 'sin contactar', 'no contactado', 'lead nuevo', 'new'],
  'Contactado': ['contactada', 'contacted'],
  'Perdido': ['desestimado', 'descartado', 'no interesado', 'no calificado', 'descalificado', 'perdido'],
  'Seguimiento': ['seguimiento'],
  'Información enviada': ['info enviada', 'informacion enviado', 'informacion'],
  'Cita': ['cita agendada', 'cita programada', 'agendado'],
  'Calificado': ['calificada', 'qualified'],
  'Separación': ['separado', 'reserva', 'reservado'],
  'Inicial': ['cuota inicial', 'pago inicial'],
  'Venta': ['vendido', 'venta cerrada', 'ganado'],
  'Seguimiento': ['no contesta', 'no contesto', 'no contesta llamada', 'no responde', 'sin respuesta', 'no contestado', 'seguimiento futuro'],
}).forEach(([stage, names]) => names.forEach(name => stageAliases.set(normalize(name), stage)));
function statusInfo(value) {
  const key = normalize(value);
  const status=stageAliases.get(key) || 'Lead Inicial';
  const substatus=key==='no contesta'||key==='no contesto'||key==='no contesta llamada'||key==='no responde'||key==='sin respuesta'||key==='no contestado'?'No contesta':key==='seguimiento futuro'?'Seguimiento futuro':'';
  return { status, substatus, unknown: !!key && !stageAliases.has(key) };
}
function phone(value) {
  const digits = String(value ?? '').replace(/^p:/i, '').replace(/\D/g, '');
  return digits.length >= 6 && digits.length <= 15 ? digits : '';
}
function phoneKey(value) {
  const digits = phone(value);
  return /^519\d{8}$/.test(digits) ? digits.slice(2) : digits;
}
function normalizedName(value) {
  return normalize(value).replace(/\s+/g, ' ');
}
function duplicateReason(first, second) {
  const firstPhone=phoneKey(first?.phone), secondPhone=phoneKey(second?.phone);
  const firstEmail=String(first?.email||'').trim().toLowerCase(), secondEmail=String(second?.email||'').trim().toLowerCase();
  const firstDni=String(first?.dni||'').replace(/\D/g,''), secondDni=String(second?.dni||'').replace(/\D/g,'');
  const firstName=normalizedName(first?.name), secondName=normalizedName(second?.name);
  if(firstPhone&&firstPhone===secondPhone)return 'teléfono';
  if(firstEmail&&firstEmail===secondEmail)return 'correo';
  if(firstDni&&firstDni===secondDni)return 'DNI';
  if(firstName&&firstName.split(' ').length>=2&&firstName===secondName)return 'nombre y apellidos';
  return '';
}
function source(value) {
  const key = normalize(value);
  if (['fb', 'facebook', 'meta'].includes(key)) return 'Facebook';
  if (['ig', 'instagram'].includes(key)) return 'Instagram';
  if (['tk', 'tt', 'tiktok', 'tik tok'].includes(key)) return 'TikTok';
  return String(value || 'Web').trim();
}
function parseDelimited(input, delimiter) {
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === '"') {
      if (quoted && input[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (c === delimiter && !quoted) { row.push(cell.trim()); cell = ''; }
    else if (c === '\n' && !quoted) { row.push(cell.trim()); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (quoted) throw new Error('El CSV contiene comillas sin cerrar. Vuelve a exportar el archivo.');
  row.push(cell.trim()); rows.push(row);
  return rows.filter(r => r.some(Boolean));
}
function columns(row) {
  const headers = row.map(normalize);
  return Object.fromEntries(Object.entries(aliases).map(([field, names]) => [field, names.map(name => headers.indexOf(name)).find(index => index >= 0) ?? -1]));
}
function findHeader(rows) {
  let best;
  rows.slice(0, 30).forEach((row, index) => {
    const map = columns(row);
    if (map.phone < 0 && map.email < 0) return;
    const score = Object.values(map).filter(i => i >= 0).length;
    if (!best || score > best.score) best = { index, map, score };
  });
  return best;
}
function parseLeadCSV(csv) {
  const input = String(csv || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  if (/^\s*<(?:!doctype|html)/i.test(input)) throw new Error('Se recibió una página web, no una hoja de leads. Revisa los permisos del enlace.');
  let best;
  for (const delimiter of [',', ';', '\t']) {
    try {
      const rows = parseDelimited(input, delimiter), header = findHeader(rows);
      if (header && (!best || header.score > best.header.score)) best = { rows, header };
    } catch (e) { /* Try other separators; reject below if none are valid. */ }
  }
  if (!best) throw new Error('No se encontraron columnas de Teléfono o Email. Usa encabezados como NOMBRE, TELÉFONO, EMAIL y STATUS.');
  const { rows, header } = best;
  // R65 · Las preguntas del formulario que no son campos del CRM (inicial, presupuesto, tipología, banco…) se conservan
  // como «respuestas del formulario» para ver la condición real de cada cliente en el Kanban.
  const usados = new Set(Object.values(header.map).filter(i => i >= 0)), titulos = rows[header.index] || [];
  return rows.slice(header.index + 1).map(row => {
    const item = {};
    Object.entries(header.map).forEach(([field, index]) => { if (index >= 0) item[field] = row[index] || ''; });
    const respuestas = titulos.map((t, i) => ({ k: String(t || '').replace(/\s+/g, ' ').trim().slice(0, 140), v: String(row[i] || '').replace(/\s+/g, ' ').trim().slice(0, 200) }))
      .filter((x, i) => !usados.has(i) && x.k && x.v && !/^\d{6,}$/.test(x.v) && !/^(?:id|lead id|ad id|adset id|campaign id|form id|is organic)$/i.test(normalize(x.k))).slice(0, 15);
    if (respuestas.length) item.form_answers = respuestas;
    if (item.surname) item.name = [item.name, item.surname].filter(Boolean).join(' ');
    delete item.surname;
    return item;
  });
}
function leadDefaults(item, leads = []) {
  const number = Math.max(0, ...leads.map(l => Number(String(l.lead_number || '').replace(/^LD-/, '')) || 0)) + 1;
  return {
    id: 'l-' + randomUUID(), lead_number: 'LD-' + String(number).padStart(4, '0'),
    name: '', phone: '', email: '', dni: '', address: '', budget: 0, source: 'Web',
    sla: {severity:'Verde',automatic_severity:'Verde',control_mode:'automatic',manual_severity:null,reason:'Pendiente de primera gestión.'},
    comments: '', contact_attempts: 0, future_delivery: false, broker_paid: false, seller_paid: false,
    reminders: { h2: false, h24: false, h48: false }, selectedBrokers: [], ...item,
    status: statusInfo(item.status).status, substatus: statusInfo(item.status).substatus,
  };
}
function syncLeads(existing, items, isStrict, sourceId, assignment, archived=[]) {
  if (!Array.isArray(items)) throw new Error('La importación de leads no devolvió una lista válida.');
  const leads = existing.map(l => ({ ...l, ...(l.import_sources?{import_sources:{...l.import_sources}}:{}) }));
  const result = { added: 0, updated: 0, deleted: 0, skipped: 0, duplicates: 0, unknownStatuses: [] };
  const seen = new Set();
  for (const item of items) {
    const cleanPhone = phone(item?.phone), email = String(item?.email || '').trim();
    if (!cleanPhone && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { result.skipped++; continue; }
    const match = leads.find(l => (cleanPhone && phoneKey(l.phone) === phoneKey(cleanPhone)) || (email && String(l.email || '').toLowerCase() === email.toLowerCase()));
    // Phone/email identify an existing record to update. DNI or full name without
    // that identity match are deliberately not imported as a second lead.
    const duplicate = !match && [...leads,...(archived||[])].find(l => duplicateReason(item,l));
    if(duplicate){if(leads.some(l=>l.id===duplicate.id))seen.add(duplicate.id);result.duplicates++;continue;}
    const state = statusInfo(item.status);
    if (state.unknown && !result.unknownStatuses.includes(String(item.status))) result.unknownStatuses.push(String(item.status));
    const fields = {};
    for (const key of ['name', 'dni', 'address', 'campaign_name', 'ad_name', 'project']) if (item[key]) fields[key] = String(item[key]).trim();
    if (cleanPhone) fields.phone = cleanPhone;
    if (email) fields.email = email;
    if (item.source) fields.source = source(item.source);
    if (item.budget !== undefined && item.budget !== '' && Number.isFinite(Number(item.budget))) fields.budget = Number(item.budget);
    if (Array.isArray(item.form_answers) && item.form_answers.length) fields.form_answers = item.form_answers.slice(0, 15).map(x => ({ k: String(x.k || '').slice(0, 140), v: String(x.v || '').slice(0, 200) })).filter(x => x.k && x.v);
    let lead = match;
    if (lead) {
      const before = JSON.stringify(lead);
      Object.assign(lead, fields);
      if(assignment?.sales_owner&&!String(lead.sales_owner||'').trim()){lead.sales_owner=assignment.sales_owner;lead.assigned_by=assignment.actor||'';lead.assigned_at=new Date().toISOString();if(assignment.broker_name)lead.selectedBrokers=[...new Set([...(lead.selectedBrokers||[]),assignment.broker_name])];lead._assignment_event={owner:assignment.sales_owner,actor:assignment.actor||'',source:'Importación manual',isNew:false};}
      if(!lead.received_at&&iso(item.received_at)&&iso(item.received_at)<=new Date().toISOString()){lead.received_at=iso(item.received_at);lead.received_date_source='Hoja de origen';}
      // A source sheet may update contact details, but it is never allowed to
      // change the commercial stage or substage of an existing lead.  Those
      // movements require an explicit action inside the CRM.
      if (item.comments && !lead.comments) lead.comments = String(item.comments);
      if (item.status) { lead.imported_status = state.status; lead.imported_status_raw = String(item.status); }
      if (JSON.stringify(lead) !== before) result.updated++;
    } else {
      lead = leadDefaults({ ...fields, name: fields.name || cleanPhone || email, comments: String(item.comments || ''), status: state.status, substatus:state.substatus,
        imported_status: item.status ? state.status : '', imported_status_raw: String(item.status || ''), imported_from_sheet: true,
        imported_at:new Date().toISOString(),tracking_started_at:new Date().toISOString(),history_complete:false,received_at:iso(item.received_at)&&iso(item.received_at)<=new Date().toISOString()?iso(item.received_at):null,received_date_source:'Hoja de origen',events:[],milestones:{},appointments:[],separations:[],
        contact_attempts: state.status === 'Seguimiento' && state.substatus === 'No contesta' ? 1 : 0 }, leads);
      if(assignment?.sales_owner){lead.sales_owner=assignment.sales_owner;lead.assigned_by=assignment.actor||'';lead.assigned_at=new Date().toISOString();if(assignment.broker_name)lead.selectedBrokers=[...new Set([...(lead.selectedBrokers||[]),assignment.broker_name])];lead._assignment_event={owner:assignment.sales_owner,actor:assignment.actor||'',source:'Importación manual',isNew:true};}
      leads.push(lead); result.added++;
    }
    if(sourceId)lead.import_sources={...(lead.import_sources||{}),[sourceId]:{status:item.status?state.status:(lead.import_sources?.[sourceId]?.status||''),raw:String(item.status||'')}};
    seen.add(lead.id);
  }
  // A file may contain only duplicates. That is a valid, non-destructive import:
  // keep the database intact and let the interface report how many were blocked.
  if (!seen.size && !result.duplicates) throw new Error('No se encontraron leads con teléfono o email válido. No se modificaron los datos.');
  if (isStrict && result.skipped) throw new Error(`Hay ${result.skipped} filas sin contacto válido. Corrígelas o desactiva la sincronización estricta. No se modificaron los datos.`);
  const kept = isStrict ? leads.filter(l => {
    if(seen.has(l.id))return true;
    if(!sourceId)return !l.imported_from_sheet||!!l.import_sources;
    // Legacy records without provenance are retained until this source sees them.
    if(!l.import_sources?.[sourceId])return true;
    delete l.import_sources[sourceId];
    return !l.imported_from_sheet||Object.keys(l.import_sources).length>0||!!l.sold_unit_id||statusInfo(l.status).status==='Venta';
  }) : leads;
  result.deleted = leads.length - kept.length;
  return { leads: kept, result };
}
module.exports = { STAGES, statusInfo, source, phoneKey, parseLeadCSV, findHeader, leadDefaults, syncLeads };
module.exports.parseDelimited = parseDelimited;
