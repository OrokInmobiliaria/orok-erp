const LIMA_TIME_ZONE = 'America/Lima';

const invitationLines = (when) => [
  'Tal como conversaste con nuestro gerente, tenemos el gusto de invitarte a nuestro Showroom INFINITY224, donde podrás conocer de primera mano nuestras novedades y descubrir nuestra propuesta.',
  '',
  'Además, durante tu visita podrás acceder a información sobre los descuentos especiales disponibles durante este mes, para que puedas aprovechar los beneficios vigentes.',
  '',
  'Si no puedes acompañarnos presencialmente, también hemos preparado una cita virtual para que puedas conocer nuestra propuesta desde donde estés.',
  '',
  `Fecha y hora: ${when}`,
  'Showroom: Calle Apacheta 224 - San Miguel',
  'https://maps.app.goo.gl/Jz6cQv6VaRFBxaYN6',
  'Cita virtual: https://meet.google.com/vrs-ntia-pfi',
  '',
  'Celular: 912971742',
  'Correo: ventas@orok.com.pe',
  'Web y redes: https://infinity224.pe/',
  'https://orok.com.pe/',
  'Facebook Orok: https://www.facebook.com/profile.php?id=61582240642705',
  'Instagram Orok: http://instagram.com/orok.inmobiliaria',
  'También te compartimos nuestro brochure haz click aquí ----> Brochure INFINITY224: https://drive.google.com/file/d/13WikSvq7gqWY7LOnwegkQCEHpXL-Uiwl/view <---- para que puedas revisarlo y conocer más detalles.',
  '',
  '¡Será un gusto recibirte y mostrarte todo lo que tenemos preparado para ti!',
  '',
  'Saludos cordiales,'
];

const firstScheduledAppointment = (lead) => {
  const appointments = Array.isArray(lead?.appointments) ? lead.appointments : [];
  return appointments
    .filter((appointment) => ['scheduled', 'attended'].includes(appointment?.status) && appointment?.scheduled_at)
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'scheduled' ? -1 : 1;
      return String(b.scheduled_at).localeCompare(String(a.scheduled_at));
    })[0] || null;
};

const partsInLima = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const values = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: LIMA_TIME_ZONE,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    }).formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );
  return values;
};

const compactLimaDateTime = (date) => {
  const parts = partsInLima(date);
  return parts ? `${parts.year}${parts.month}${parts.day}T${parts.hour}${parts.minute}${parts.second || '00'}` : null;
};

const formatInvitationDateTime = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('es-PE', {
    timeZone: LIMA_TIME_ZONE,
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true
  }).format(date);
};

export const googleCalendarUrlForLead = (lead, scheduledAt) => {
  const appointment = scheduledAt ? { scheduled_at: scheduledAt } : firstScheduledAppointment(lead);
  if (!appointment?.scheduled_at) return null;

  if(appointment.calendar_event_id){
    if(appointment.calendar_html_url){try{const u=new URL(appointment.calendar_html_url);if(u.protocol==='https:'&&u.hostname==='calendar.google.com')return u.href;}catch{}}
    return 'https://calendar.google.com/calendar/event?eid='+encodeURIComponent(btoa(appointment.calendar_event_id+' '+(appointment.calendar_id||'ventas@orok.com.pe')));
  }
  const start = new Date(appointment.scheduled_at);
  const startDateTime = compactLimaDateTime(start);
  const endDateTime = compactLimaDateTime(new Date(start.getTime() + 45 * 60 * 1000));
  if (!startDateTime || !endDateTime) return null;

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `Cita Showroom INFINITY224 - ${lead?.name || 'Cliente'}`,
    dates: `${startDateTime}/${endDateTime}`,
    details: invitationLines(formatInvitationDateTime(start)).join('\n'),
    location: 'Calle Apacheta 224 - San Miguel',
    ctz: LIMA_TIME_ZONE
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
};
