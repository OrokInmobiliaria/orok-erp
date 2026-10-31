// R81 · Deshacer general del ERP (CRM y Marketing). Cada cambio que se puede revertir registra cómo volver atrás.
// Se puede deshacer: datos de la ficha y próxima acción de un lead, y ediciones o aprobaciones de piezas del Plan semanal.
// Los comentarios y el historial no se borran nunca (el CRM los conserva como evidencia).
const pila = [], subs = new Set();
const avisar = () => subs.forEach(f => { try { f(pila.length, pila[pila.length - 1]?.etiqueta || ''); } catch {} });
export function registrarDeshacer(etiqueta, revertir) { pila.push({etiqueta, revertir}); if (pila.length > 60) pila.shift(); avisar(); }
export async function deshacer() { const p = pila.pop(); avisar(); if (!p) return null; await p.revertir(); return p.etiqueta; }
export function suscribirDeshacer(f) { subs.add(f); f(pila.length, pila[pila.length - 1]?.etiqueta || ''); return () => subs.delete(f); }
