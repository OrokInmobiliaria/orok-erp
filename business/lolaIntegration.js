'use strict';

const { randomUUID } = require('node:crypto');
const { leadDefaults, phoneKey, source: normalizeSource } = require('./leadImport');
const lifecycle = require('./lifecycle');
const { appendComment } = require('./leadComments');

const ACTIONS = new Set([
  'lead_upsert',
  'seller_requested',
  'appointment_interest',
  'showroom_interest',
  'follow_up',
  'opt_out',
  'appointment_scheduled',
  'appointment_rescheduled',
  'appointment_cancelled',
]);

const clean = (value, max = 300) => String(value ?? '').trim().slice(0, max);
const validEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(value, 320));
const validPhone = value => {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15 ? digits : '';
};
const requestKey = value => clean(value, 100).replace(/[^\w-]/g, '_');

function profileFields(payload) {
  const profile = payload?.profile && typeof payload.profile === 'object' ? payload.profile : {};
  const phone = validPhone(profile.phone);
  const email = validEmail(profile.email) ? clean(profile.email, 320).toLowerCase() : '';
  const fields = {};
  if (clean(profile.name, 200)) fields.name = clean(profile.name, 200);
  if (phone) fields.phone = phone;
  if (email) fields.email = email;
  if (clean(profile.interest, 300)) fields.unit_interest = clean(profile.interest, 300);
  if (clean(profile.purchase_method, 100)) fields.purchase_method = clean(profile.purchase_method, 100);
  if (clean(profile.initial_payment, 100)) fields.initial_payment = clean(profile.initial_payment, 100);
  return fields;
}

function findLead(data, payload, fields) {
  if(payload.lead_id){const lead=(data.leads||[]).find(l=>l.id===payload.lead_id);if(!lead)throw Error('Lead indicado no encontrado.');return lead;}
  const channel = clean(payload.channel, 40).toLowerCase();
  const chatId = clean(payload.chat_id, 100);
  const email = clean(fields.email, 320).toLowerCase();
  const phone = phoneKey(fields.phone);
  return (data.leads || []).find(lead =>
    (channel && chatId && clean(lead.external_ids?.[channel], 100) === chatId) ||
    (phone && phoneKey(lead.phone) === phone) ||
    (email && clean(lead.email, 320).toLowerCase() === email)
  );
}

function setStage(lead, status, actor, at, substatus = '') {
  const before = lead.status;
  if (before === status && String(lead.substatus || '') === substatus) return;
  lead.status = status;
  lead.substatus = substatus;
  if (before !== status) {
    lead.stage_history = [...(lead.stage_history || []), { from: before, to: status, at, actor, observed: false }];
  }
}

function setAppointment(lead, payload, actor, action, at) {
  const start = lifecycle.iso(payload.appointment_start);
  if (!start || start <= at) throw new Error('La cita debe tener una fecha futura válida.');
  const calendarId = clean(payload.calendar_event_id, 300);
  if (!calendarId) throw new Error('Falta el identificador del evento de Calendar.');
  const existing = (lead.appointments || []).find(item => item.calendar_event_id === calendarId);
  if (existing) {
    const previousStart = existing.scheduled_at;
    existing.scheduled_at = start;
    existing.status = 'scheduled';
    existing.updated_at = at;
    if (action === 'appointment_rescheduled' && previousStart !== start) {
      lifecycle.event(lead, 'rescheduled', actor, {
        appointment_id: existing.id,
        calendar_event_id: calendarId,
        previous_start: previousStart,
      }, at);
    }
  } else {
    const pending = (lead.appointments || []).find(item => item.status === 'scheduled');
    if (pending) {
      pending.status = 'rescheduled';
      pending.resolved_at = at;
      lifecycle.event(lead, 'rescheduled', actor, { appointment_id: pending.id }, at);
    }
    const appointment = {
      id: randomUUID(),
      calendar_event_id: calendarId,
      scheduled_at: start,
      created_at: at,
      status: 'scheduled',
      owner: lead.sales_owner || actor,
      replaces_id: pending?.id || null,
    };
    lead.appointments = [...(lead.appointments || []), appointment];
    lifecycle.event(lead, action === 'appointment_rescheduled' ? 'rescheduled' : 'scheduled', actor, {
      appointment_id: appointment.id,
      calendar_event_id: calendarId,
    }, at);
  }
  setStage(lead, 'Cita', actor, at);
  const lima = new Date(new Date(start).getTime() - 5 * 3600000).toISOString();
  lead.appointment = { date: lima.slice(0, 10), time: lima.slice(11, 16) };
}

function cancelAppointment(lead, payload, actor, at) {
  const calendarId = clean(payload.calendar_event_id, 300);
  const appointment = (lead.appointments || []).find(item =>
    (calendarId && item.calendar_event_id === calendarId) || (!calendarId && item.status === 'scheduled')
  );
  if (appointment && appointment.status === 'scheduled') {
    appointment.status = 'cancelled';
    appointment.resolved_at = at;
    lifecycle.event(lead, 'cancelled', actor, {
      appointment_id: appointment.id,
      calendar_event_id: appointment.calendar_event_id || calendarId,
    }, at);
  }
  setStage(lead, 'Seguimiento', actor, at, 'Cita cancelada');
  lead.next_action = 'Retomar contacto y ofrecer nueva visita';
}

function applyLolaEvent(data, payload, actor = 'Lola IA') {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Evento de Lola no válido.');
  const action = clean(payload.action, 60);
  if (!ACTIONS.has(action)) throw new Error('Acción de Lola no reconocida.');
  const eventId = clean(payload.event_id, 160);
  if (!/^[A-Za-z0-9:_-]{1,160}$/.test(eventId)) throw new Error('Identificador de evento no válido.');
  const fields = profileFields(payload);
  const channel = clean(payload.channel || 'whatsapp', 40).toLowerCase();
  const chatId = clean(payload.chat_id, 100);
  if (!fields.phone && !fields.email && !chatId) throw new Error('El lead no tiene teléfono, correo ni identificador de canal.');
  if (!Array.isArray(data.leads)) data.leads = [];

  let lead = findLead(data, payload, fields);
  const atCandidate = lifecycle.iso(payload.received_at);
  const now = new Date().toISOString();
  const at = atCandidate && atCandidate <= now ? atCandidate : now;
  let created = false;

  if (lead) {
    const processed = Array.isArray(lead.lola_event_ids) ? lead.lola_event_ids : [];
    if (processed.includes(eventId)) {
      return { ok: true, duplicate: true, created: false, lead_id: lead.id, lead_number: lead.lead_number, status: lead.status };
    }
    Object.assign(lead, fields);
    if (clean(payload.source, 100)) lead.source = normalizeSource(payload.source);
    if (clean(payload.campaign_name, 300)) lead.campaign_name = clean(payload.campaign_name, 300);
    if (clean(payload.adset_name, 300)) lead.adset_name = clean(payload.adset_name, 300);
    if (clean(payload.ad_name, 300)) lead.ad_name = clean(payload.ad_name, 300);
    if (clean(payload.creative_name, 300)) lead.creative_name = clean(payload.creative_name, 300);
  } else {
    lead = leadDefaults({
      ...fields,
      name: fields.name || fields.phone || fields.email || `${channel} ${chatId}`,
      source: normalizeSource(payload.source || channel),
      campaign_name: clean(payload.campaign_name, 300),
      adset_name: clean(payload.adset_name, 300),
      ad_name: clean(payload.ad_name, 300),
      creative_name: clean(payload.creative_name, 300),
      project: clean(payload.project, 200) || data.settings?.projectName || 'Infinity 224',
      status: 'Lead Inicial',
      received_at: at,
      received_date_source: 'Lola · n8n',
      ingressed_by: actor,
      history_complete: true,
      tracking_started_at: at,
      events: [],
      milestones: {},
      appointments: [],
      separations: [],
      stage_history: [],
      comment_history: [],
      external_ids: {},
    }, data.leads);
    const defaultOwner = clean(data.settings?.defaultSalesOwner || data.settings?.agentName, 200);
    if (defaultOwner) lead.sales_owner = defaultOwner;
    lifecycle.event(lead, 'received', actor, {
      assigned_owner: lead.sales_owner || 'Sin asignar',
      ingress_source: `Lola · ${channel}`,
    }, at);
    data.leads.push(lead);
    created = true;
  }

  lead.external_ids = { ...(lead.external_ids || {}) };
  if (channel && chatId) lead.external_ids[channel] = chatId;
  const processed = Array.isArray(lead.lola_event_ids) ? lead.lola_event_ids : [];
  lead.lola_event_ids = [...processed.slice(-199), eventId];
  lead.last_channel = channel;
  lead.last_activity_at = at;

  if (action === 'appointment_scheduled' || action === 'appointment_rescheduled') {
    setAppointment(lead, payload, actor, action, at);
  } else if (action === 'appointment_cancelled') {
    cancelAppointment(lead, payload, actor, at);
  } else if (action === 'seller_requested') {
    if (lead.status === 'Lead Inicial') setStage(lead, 'Contactado', actor, at);
    lead.next_action = 'Contactar al lead: solicitó hablar con un asesor';
    lead.next_action_at = at;
    lead.lola_paused = true;
    lead.handoff_status = 'accepted';
    lifecycle.event(lead, 'seller_requested', actor, { channel }, at);
  } else if (action === 'appointment_interest') {
    lead.next_action = 'Coordinar fecha y hora de visita al showroom';
    lead.next_action_at = at;
    lead.handoff_status = 'appointment_interest';
    lifecycle.event(lead, 'appointment_interest', actor, { channel }, at);
  } else if (action === 'showroom_interest') {
    lead.next_action = 'Contactar al lead interesado en visitar el showroom';
    lead.next_action_at = at;
    lead.handoff_status = 'showroom_interest';
    lifecycle.event(lead, 'showroom_interest', actor, { channel }, at);
  } else if (action === 'follow_up') {
    setStage(lead, 'Seguimiento', actor, at, clean(payload.substatus, 120) || 'Sin respuesta 24 horas');
    lead.next_action = clean(payload.next_action, 300) || 'Retomar contacto comercial';
    lead.next_action_at = lifecycle.iso(payload.next_action_at) || null;
    lifecycle.event(lead, 'follow_up', actor, { channel }, at);
  } else if (action === 'opt_out') {
    if(lead.customer_care?.birthday_consent)lead.customer_care.birthday_consent={...lead.customer_care.birthday_consent,granted:false,revoked_at:at};
    if(lead.whatsapp_followup_consent)lead.whatsapp_followup_consent={...lead.whatsapp_followup_consent,granted:false,revoked_at:at};
    lead.opt_out = true;
    lead.opt_out_at = at;
    lead.lola_paused = true;
    lead.handoff_status = 'opt_out';
    lead.next_action = '';
    lead.next_action_at = null;
    lifecycle.event(lead, 'opt_out', actor, { channel }, at);
  } else {
    lifecycle.event(lead, 'lola_ingress', actor, { channel }, at);
  }

  const note = clean(payload.note || payload.text, 10000);
  if (note) appendComment(lead, { text: note, requestId: requestKey(eventId) }, actor, at);
  return {
    ok: true,
    duplicate: false,
    created,
    lead_id: lead.id,
    lead_number: lead.lead_number,
    status: lead.status,
    lola_paused: lead.lola_paused === true,
  };
}

module.exports = { ACTIONS, applyLolaEvent };
