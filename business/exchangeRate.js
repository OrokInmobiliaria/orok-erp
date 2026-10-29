'use strict';
const ENDPOINT = 'https://api.apis.net.pe/v1/tipo-cambio-sunat';
let cached = null, pending = null;
function validateRate(data, today) {
  const date = String(data?.fecha || ''), value = Number(data?.venta);
  const age = (Date.parse(today) - Date.parse(date)) / 86400000;
  if (data?.origen !== 'SUNAT' || data?.moneda !== 'USD' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(age) || age < 0 || age > 7 || !Number.isFinite(value) || value < 1 || value > 10) throw Error('La fuente no devolvió una cotización SUNAT vigente y válida. Se conserva el valor anterior.');
  return { value, date, source: 'SUNAT', provider: 'APIs.net.pe', source_url: 'https://e-consulta.sunat.gob.pe/cl-at-ittipcam/tcS01Alias', fetched_at: new Date().toISOString() };
}
async function fetchSunatRate() {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  if (cached?.day === today && Date.now() - cached.at < 3600000) return cached.rate;
  if (pending) return pending;
  pending = (async () => {
    const r = await fetch(ENDPOINT, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw Error('No se pudo consultar SUNAT mediante APIs.net.pe. Se conserva el valor anterior.');
    const rate = validateRate(await r.json(), today);
    cached = { day: today, at: Date.now(), rate };
    return rate;
  })();
  try { return await pending; } finally { pending = null; }
}
module.exports = { fetchSunatRate, validateRate };