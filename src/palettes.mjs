// R32c · Paletas de color. Se guardan por navegador (preferencia personal); la marca ÖRÖK es la predeterminada.
export const PALETTES = [
  {id: 'terracota', name: 'Terracota ÖRÖK', note: 'Marca del proyecto', swatches: ['#85442a', '#35190f', '#eb6834', '#f3e6dc']},
  {id: 'oceano', name: 'Océano', note: 'Azul y turquesa', swatches: ['#1d5fa8', '#0b2a4a', '#19b3a6', '#dcecf7']},
  {id: 'lavanda', name: 'Lavanda', note: 'Violeta suave', swatches: ['#5b4bc4', '#2a2163', '#c05bd6', '#e7e4fb']},
  {id: 'esmeralda', name: 'Esmeralda', note: 'Verde y arena', swatches: ['#1f7a5a', '#0f3b2c', '#d6a33a', '#e3f1ea']},
];
const KEY = 'orok-palette';
export function savedPalette() { try { const v = localStorage.getItem(KEY); return PALETTES.some(p => p.id === v) ? v : 'terracota'; } catch { return 'terracota'; } }
export function applyPalette(id) {
  const v = PALETTES.some(p => p.id === id) ? id : 'terracota';
  document.documentElement.dataset.palette = v;
  try { localStorage.setItem(KEY, v); } catch {}
  return v;
}
