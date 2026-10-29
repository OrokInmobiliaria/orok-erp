// R36 · Instalación en PC/Mac/celular y actualización automática del ERP ÖRÖK.
// - Registra el service worker y busca versión nueva al abrir, cada 30 minutos y al volver a la ventana.
// - Si hay versión nueva, muestra «Actualizar ahora»; si la persona no hace nada, se aplica sola la próxima vez que abra el ERP.
// - Ofrece «Instalar ERP» cuando el navegador lo permite (Chrome, Edge; en Safari de Mac: Archivo › Agregar al Dock).
function aviso(texto, boton, accion, id) {
  if (document.getElementById(id)) return;
  const d = document.createElement('div'); d.id = id; d.className = 'pwa-aviso no-print'; d.setAttribute('role', 'status');
  d.innerHTML = '<span></span><button type="button" class="pwa-si"></button><button type="button" class="pwa-no" aria-label="Cerrar">✕</button>';
  d.querySelector('span').textContent = texto; d.querySelector('.pwa-si').textContent = boton;
  d.querySelector('.pwa-si').onclick = () => { d.remove(); accion(); }; d.querySelector('.pwa-no').onclick = () => d.remove();
  document.body.append(d);
}
export function iniciarPWA() {
  if (!('serviceWorker' in navigator) || location.hostname === '127.0.0.1' && location.port === '5173') return;
  let recargando = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (recargando) return; recargando = true; location.reload(); });
  navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then(reg => {
    const ofrecer = w => aviso('Hay una versión nueva del ERP ÖRÖK.', 'Actualizar ahora', () => w.postMessage('activar'), 'pwa-actualizar');
    if (reg.waiting && navigator.serviceWorker.controller) ofrecer(reg.waiting);
    reg.addEventListener('updatefound', () => { const w = reg.installing; if (!w) return; w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) ofrecer(w); }); });
    const revisar = () => reg.update().catch(() => {});
    setInterval(revisar, 30 * 60 * 1000); document.addEventListener('visibilitychange', () => { if (!document.hidden) revisar(); });
  }).catch(() => {});
  let pedido = null;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); pedido = e; try { if (localStorage.getItem('erp-orok-instalar-no')) return; } catch (_) {}
    aviso('Instala el ERP ÖRÖK en este equipo: abre en su propia ventana y se actualiza solo.', 'Instalar', async () => { if (!pedido) return; pedido.prompt(); await pedido.userChoice.catch(() => null); pedido = null; }, 'pwa-instalar'); });
  window.addEventListener('appinstalled', () => { try { localStorage.setItem('erp-orok-instalar-no', '1'); } catch (_) {} document.getElementById('pwa-instalar')?.remove(); });
}

// R36 · Primera apertura del ERP INSTALADO: pide el código de instalación (lo genera Gerencia en el servidor).
// En el navegador web no se pide: se entra solo con usuario y contraseña.
const instalada = () => { try { return matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: window-controls-overlay)').matches || navigator.standalone === true; } catch (_) { return false; } };
async function post(url, data) { const r = await fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Orok-Request': '1' }, body: JSON.stringify(data || {}) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw Error(j.error || 'No se pudo completar.'); return j.value; }
export async function registroDeEquipo() {
  if (!instalada()) return;
  let estado; try { estado = await post('/api/instalacion/estado'); } catch (_) { return; }
  if (estado?.registrado) return;
  const plataforma = (navigator.userAgentData?.platform || navigator.platform || '').slice(0, 40);
  const capa = document.createElement('div'); capa.className = 'pwa-registro'; capa.setAttribute('role', 'dialog'); capa.setAttribute('aria-modal', 'true'); capa.setAttribute('aria-label', 'Registrar este equipo');
  capa.innerHTML = `<form class="pwa-registro-caja"><b class="orok-mark-reg">ÖRÖK</b><h2>Registrar este equipo</h2>
    <p>Es la primera vez que abres el ERP instalado en este equipo. Ingresa el <strong>código de instalación</strong> que te dio Gerencia. Se pide una sola vez; después entras con tu usuario y contraseña.</p>
    <label>Código de instalación<input name="codigo" autocomplete="one-time-code" placeholder="ORK-XXXX-XXXX-XXXX" required autocapitalize="characters" spellcheck="false"></label>
    <label>Nombre de este equipo<input name="equipo" placeholder="Ej.: Laptop de Martín" maxlength="60" required></label>
    <p class="pwa-err" role="alert"></p><button type="submit">Registrar equipo</button>
    <small>¿Solo quieres usarlo sin instalar? Ábrelo en el navegador: ahí basta tu contraseña.</small></form>`;
  document.body.append(capa);
  const f = capa.querySelector('form'); f.equipo.value = plataforma ? 'Equipo ' + plataforma : ''; setTimeout(() => f.codigo.focus(), 50);
  f.addEventListener('submit', async e => { e.preventDefault(); const b = f.querySelector('button'); b.disabled = true; b.textContent = 'Registrando…'; f.querySelector('.pwa-err').textContent = '';
    try { await post('/api/instalacion/registrar', { codigo: f.codigo.value, equipo: f.equipo.value, plataforma }); location.reload(); }
    catch (err) { f.querySelector('.pwa-err').textContent = err.message; b.disabled = false; b.textContent = 'Registrar equipo'; } });
}
