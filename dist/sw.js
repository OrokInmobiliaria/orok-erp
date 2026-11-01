// R36 · ERP ÖRÖK instalable (PC, Mac, celular) y siempre actualizado.
// Versión: 67.6.87-r100-23de446e53 (se reemplaza al compilar; cada versión nueva cambia este archivo y el navegador la detecta).
// Reglas: nunca guarda en caché datos ni API (/api, /files, medios), ni las apps /evaluador y /contabilidad.
// Solo guarda la «cáscara» de la app para abrir rápido y mostrar un aviso si no hay internet.
const VERSION = '67.6.87-r100-23de446e53', SHELL = 'erp-orok-shell-' + VERSION, ASSETS = 'erp-orok-assets-' + VERSION;
const PASAR = /^\/(api|files|campaign-media|whatsapp-media|evaluador|contabilidad)(\/|$)/;
self.addEventListener('install', e => { e.waitUntil(caches.open(SHELL).then(c => c.addAll(['/', '/manifest.webmanifest', '/icons/icon-192.png']).catch(() => {}))); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(n => n.startsWith('erp-orok-') && n !== SHELL && n !== ASSETS).map(n => caches.delete(n)))).then(() => self.clients.claim())); });
self.addEventListener('message', e => { if (e.data === 'activar') self.skipWaiting(); if (e.data === 'version' && e.source) e.source.postMessage({ tipo: 'version', version: VERSION }); });
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || PASAR.test(url.pathname)) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(r => { const copy = r.clone(); if (r.ok) caches.open(SHELL).then(c => c.put('/', copy)); return r; }).catch(() => caches.match('/').then(r => r || new Response('<h1>Sin conexión</h1><p>El ERP ÖRÖK necesita internet para trabajar con los datos. Vuelve a intentarlo.</p>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } }))));
    return;
  }
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    e.respondWith(caches.open(ASSETS).then(c => c.match(req).then(hit => hit || fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; }))));
  }
});
