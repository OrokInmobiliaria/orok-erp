import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Search, X, FileText, KanbanSquare} from 'lucide-react';
import {api} from './dataService';
import {searchLeads, socialHandles} from './leadSearch.mjs';
import {indexByLead, channelsForLead, CHANNELS} from './chatChannels.mjs';
import ChannelIcon from './ChannelIcon';

// R32c · Buscador global (Ctrl/Cmd + K): busca en todos los leads y abre ficha, Kanban o chat.
export default function LeadSearchPalette({leads = [], onClose, onOpenLead, onShowInKanban, openChat}) {
  const [q, setQ] = useState(''), [threads, setThreads] = useState([]), [active, setActive] = useState(0), input = useRef(null);
  useEffect(() => { input.current?.focus(); api.getChatIndex().then(r => setThreads(r.threads || [])).catch(() => {}); const esc = e => e.key === 'Escape' && onClose(); document.addEventListener('keydown', esc); return () => document.removeEventListener('keydown', esc); }, []);
  const social = useMemo(() => socialHandles(threads), [threads]), index = useMemo(() => indexByLead(threads), [threads]);
  const results = useMemo(() => searchLeads(leads, q, {social}, 30), [leads, q, social]);
  useEffect(() => setActive(0), [q]);
  const key = e => { if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, results.length - 1)); } if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); } if (e.key === 'Enter' && results[active]) onOpenLead(results[active].lead.id); };
  return <div className="search-veil no-print" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <section className="search-palette glass" role="dialog" aria-modal="true" aria-label="Buscar leads">
      <div className="search-input"><Search size={20} aria-hidden="true"/><input ref={input} value={q} onChange={e => setQ(e.target.value)} onKeyDown={key} aria-label="Buscar leads" placeholder="Código, nombre, apellido, DNI, teléfono, correo, @instagram, cotización…" role="combobox" aria-expanded={results.length > 0} aria-controls="search-results"/><button className="search-close" onClick={onClose} aria-label="Cerrar buscador"><X size={18}/></button></div>
      <div id="search-results" role="listbox" className="search-results">
        {!q.trim() && <p className="search-hint">Escribe varias palabras para afinar: «pérez 302», «LD-0171», «999 111 222», «@usuario». Atajo: Ctrl/⌘ + K.</p>}
        {q.trim() && !results.length && <p className="search-hint">Sin resultados. Prueba con menos palabras o con el teléfono.</p>}
        {results.map(({lead, matched}, i) => <div key={lead.id} role="option" aria-selected={i === active} className={'search-row' + (i === active ? ' on' : '')} onMouseEnter={() => setActive(i)}>
          <button className="search-main" onClick={() => onOpenLead(lead.id)}>
            <strong>{lead.name || 'Sin nombre'}</strong>
            <span>{[lead.lead_number || lead.code, lead.status, lead.source, lead.sales_owner].filter(Boolean).join(' · ')}</span>
            <small>Coincide en: {matched.join(', ')}</small>
          </button>
          <div className="search-actions">
            {channelsForLead(lead, index).map(c => <button key={c.channel + c.thread_id} className="ch-btn" style={{'--ch': CHANNELS[c.channel].color}} aria-label={'Abrir chat de ' + CHANNELS[c.channel].label + ' · ' + lead.name} title={'Chat de ' + CHANNELS[c.channel].label} onClick={() => openChat({channel: c.channel, leadId: lead.id, threadId: c.thread_id})}><ChannelIcon channel={c.channel} size={14}/></button>)}
            <button className="ch-btn" style={{'--ch': '#57534e'}} title="Ver en el Kanban" aria-label={'Ver en el Kanban · ' + lead.name} onClick={() => onShowInKanban(lead.lead_number || lead.code || lead.name)}><KanbanSquare size={14}/></button>
            <button className="ch-btn" style={{'--ch': '#35190f'}} title="Abrir ficha" aria-label={'Abrir ficha · ' + lead.name} onClick={() => onOpenLead(lead.id)}><FileText size={14}/></button>
          </div>
        </div>)}
      </div>
      {results.length > 0 && <p className="search-foot">{results.length === 30 ? 'Mostrando los 30 más relevantes' : results.length + ' resultado(s)'} · ↑↓ para moverte · Enter abre la ficha</p>}
    </section>
  </div>;
}
