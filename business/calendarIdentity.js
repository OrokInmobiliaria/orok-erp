"use strict";
const DEFAULT_CALENDAR_ID='ventas@orok.com.pe';
const secondary=id=>/^[A-Za-z0-9_-]+@group\.calendar\.google\.com$/.test(id);
function calendarId(setup={}){
 const id=String(setup.calendarId||DEFAULT_CALENDAR_ID).trim();
 if(id!=='primary'&&!/^[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+$/.test(id))throw Error('Indica un identificador de calendario válido.');
 if(setup.environment!=='production'&&setup.agendaEnabled===true&&!secondary(id))throw Error('Para habilitar la agenda de ensayo, selecciona un calendario exclusivo de pruebas.');
 return id;
}
module.exports={DEFAULT_CALENDAR_ID,calendarId,secondary};
