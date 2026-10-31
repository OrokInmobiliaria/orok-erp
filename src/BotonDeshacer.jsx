import React, {useEffect, useState} from 'react';
import {deshacer, suscribirDeshacer} from './deshacer';
// R81 · Botón «↶ Deshacer» arriba a la derecha (y Ctrl/⌘+Z fuera de un campo). Solo aparece si hay algo que deshacer.
export default function BotonDeshacer() {
  const [n, setN] = useState(0), [ult, setUlt] = useState(''), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => suscribirDeshacer((c, e) => { setN(c); setUlt(e); }), []);
  const run = async () => { if (busy) return; setBusy(true); try { const e = await deshacer(); if (e) setMsg('Deshecho: ' + e); } catch (x) { setMsg('No se pudo deshacer: ' + x.message); } finally { setBusy(false); setTimeout(() => setMsg(''), 3000); } };
  useEffect(() => { const k = e => { if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') { const t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return; e.preventDefault(); run(); } }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); });
  if (!n && !msg) return null;
  return <div className="deshacer-erp no-print">
    {n > 0 && <button className="orok-btn" onClick={run} disabled={busy} title={'Deshacer: ' + ult + ' (Ctrl+Z)'}>↶ Deshacer{n > 1 ? ' (' + n + ')' : ''}</button>}
    {msg && <small role="status">{msg}</small>}
  </div>;
}
