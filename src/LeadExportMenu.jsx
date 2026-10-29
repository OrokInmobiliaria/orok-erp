import React, {useEffect, useRef, useState} from 'react';
import {Download} from 'lucide-react';
import {api} from './dataService';

function save(r) {
  const bin = atob(r.base64), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], {type: r.mime})), a = document.createElement('a');
  a.href = url; a.download = r.filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1500);
}

// Botón del Kanban: exporta a Excel, CSV o directo a Google Sheets. Solo Gerencia.
export default function LeadExportMenu({visible = [], all = [], scopeLabel = ''}) {
  const [open, setOpen] = useState(false), [scope, setScope] = useState('visible'), [busy, setBusy] = useState(false), [msg, setMsg] = useState(null), [err, setErr] = useState(''), [cfg, setCfg] = useState(null), [url, setUrl] = useState('');
  const box = useRef(null);
  useEffect(() => { if (!open) return; api.getLeadExportConfig().then(c => { setCfg(c); setUrl(c.spreadsheet_url); }).catch(() => setCfg({spreadsheet_url: ''})); const close = e => { if (box.current && !box.current.contains(e.target)) setOpen(false); }; const esc = e => e.key === 'Escape' && setOpen(false); document.addEventListener('mousedown', close); document.addEventListener('keydown', esc); return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); }; }, [open]);
  const ids = (scope === 'visible' ? visible : all).map(l => l.id);
  const run = async fn => { setBusy(true); setErr(''); setMsg(null); try { await fn(); } catch (e) { setErr(e.message); } finally { setBusy(false); } };
  return <div ref={box} style={{position: 'relative'}}>
    <button className="orok-btn orok-btn-secondary" aria-label="Exportar leads" title="Exportar leads" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(v => !v)}><Download size={17}/> <span className="kanban-control-label">Exportar leads</span></button>
    {open && <div role="dialog" aria-label="Exportar leads" className="glass export-pop">
      <strong style={{fontSize: 15}}>Exportar leads</strong>
      <div className="bi-seg" role="group" aria-label="Qué exportar" style={{marginTop: 10}}>
        <button aria-pressed={scope === 'visible'} onClick={() => setScope('visible')}>Lo que veo ({visible.length})</button>
        <button aria-pressed={scope === 'all'} onClick={() => setScope('all')}>Todos ({all.length})</button>
      </div>
      {scope === 'visible' && scopeLabel && <p className="export-note">{scopeLabel}</p>}
      <div className="export-actions">
        <button className="orok-btn orok-btn-primary" disabled={busy || !ids.length} onClick={() => run(async () => { const r = await api.exportLeads({ids, format: 'xlsx'}); save(r); setMsg({text: `Excel con ${r.count} leads descargado.`}); })}>Excel (.xlsx)</button>
        <button className="orok-btn orok-btn-secondary" disabled={busy || !ids.length} onClick={() => run(async () => { const r = await api.exportLeads({ids, format: 'csv'}); save(r); setMsg({text: `CSV con ${r.count} leads descargado.`}); })}>CSV</button>
      </div>
      <div className="export-sheet">
        <label style={{fontSize: 12, fontWeight: 600}}>Hoja de Google Sheets de destino
          <input className="orok-input" style={{margin: '6px 0 0'}} placeholder="https://docs.google.com/spreadsheets/d/…" value={url} onChange={e => setUrl(e.target.value)}/></label>
        <p className="export-note">Compártela como <strong>Editor</strong> con la cuenta de servicio del CRM. Cada envío crea una pestaña nueva con fecha y hora.</p>
        <button className="orok-btn orok-btn-secondary" disabled={busy || !ids.length || !url} onClick={() => run(async () => { if (url !== cfg?.spreadsheet_url) setCfg(await api.saveLeadExportConfig({spreadsheet_url: url})); const r = await api.exportLeadsToSheet({ids}); setMsg({text: `${r.count} leads enviados a la pestaña «${r.tab}».`, link: r.url}); })}>Enviar a Google Sheets</button>
      </div>
      {busy && <p role="status" className="export-note">Preparando…</p>}
      {msg && <p role="status" className="export-ok">{msg.text} {msg.link && <a href={msg.link} target="_blank" rel="noreferrer">Abrir hoja</a>}</p>}
      {err && <p role="alert" className="export-err">{err}</p>}
      <p className="export-note">Incluye nombre, teléfono, correo, etapa, fuente, campaña y responsable. No incluye DNI ni dirección. La exportación queda registrada.</p>
    </div>}
  </div>;
}
