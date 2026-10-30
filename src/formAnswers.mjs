// R65 · Respuestas del formulario (Meta Lead Ads, hojas de LeadCenter, Google Ads) en el Kanban y en el puntaje.
// Muestra la condición declarada por el cliente (inicial, presupuesto, tipología, financiamiento) para contrastarla con la
// clasificación del lead. Solo lee lo que el propio cliente respondió; no usa datos sensibles.
const norm = v => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const REGLAS = [
  ['Inicial', /inicial|cuota inicial|ahorro/],
  ['Presupuesto', /presupuesto|precio|s\/ ?\d|soles/],
  ['Tipología', /dorm|tipolog|depa|m2|m²|metraje/],
  ['Financiamiento', /banco|credito|hipotec|financ|bono|mivivienda|techo propio/],
  ['Plazo de compra', /cuando|plazo|mudar|tiempo|meses/],
  ['Uso', /vivir|invertir|inversion|uso/],
];
export function etiqueta(pregunta) { const n = norm(pregunta); const r = REGLAS.find(([, re]) => re.test(n)); return r ? r[0] : String(pregunta || '').replace(/[¿?]/g, '').slice(0, 40); }
export function respuestas(lead) {
  const a = Array.isArray(lead?.form_answers) ? lead.form_answers : [];
  return a.filter(x => x && x.k && x.v).map(x => ({ etiqueta: etiqueta(x.k), pregunta: x.k, valor: String(x.v) }));
}
const SI = v => /^(si|sí|yes|claro|ok|correcto|dentro)\b/.test(norm(v).trim());
const NO = v => /^(no|ninguna|nada|0|cero|sin)\b/.test(norm(v).trim());
// Señales para el puntaje: [puntos, texto].
export function senales(lead) {
  const out = [], vistas = new Set();
  for (const r of respuestas(lead)) {
    if (vistas.has(r.etiqueta)) continue;
    if (r.etiqueta === 'Inicial') { vistas.add(r.etiqueta); if (NO(r.valor)) out.push([-4, 'Formulario: sin inicial declarada']); else out.push([6, 'Formulario: declaró inicial (' + r.valor.slice(0, 30) + ')']); }
    else if (r.etiqueta === 'Presupuesto') { if (SI(r.valor)) { vistas.add(r.etiqueta); out.push([4, 'Formulario: el precio está dentro de su presupuesto']); } else if (NO(r.valor)) { vistas.add(r.etiqueta); out.push([-8, 'Formulario: el precio no está dentro de su presupuesto']); } }
    else if (r.etiqueta === 'Tipología') { if (SI(r.valor)) { vistas.add(r.etiqueta); out.push([3, 'Formulario: busca la tipología ofrecida']); } else if (NO(r.valor)) { vistas.add(r.etiqueta); out.push([-4, 'Formulario: no busca la tipología ofrecida']); } }
    else if (r.etiqueta === 'Financiamiento' && !NO(r.valor)) { vistas.add(r.etiqueta); out.push([2, 'Formulario: indicó financiamiento (' + r.valor.slice(0, 30) + ')']); }
  }
  return out;
}
