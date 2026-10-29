import React, {useEffect, useMemo, useState} from 'react';
import {RefreshCw, Search} from 'lucide-react';
import {api} from './dataService';
import ChannelIcon from './ChannelIcon';
import {CHANNELS, ORDER, inboxView} from './chatChannels.mjs';

const when = v => { if (!v) return ''; const d = new Date(v), today = new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Lima'}).format(new Date()), day = new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Lima'}).format(d); return day === today ? d.toLocaleTimeString('es-PE', {timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit'}) : d.toLocaleDateString('es-PE', {timeZone: 'America/Lima', day: '2-digit', month: 'short'}); };

// R32 · Bandeja omnicanal: pestañas por red con ícono y contador; cada chat se abre como panel lateral.
export default function SocialInbox({leads = [], openChat}) {
  const [threads, setThreads] = useState([]), [channel, setChannel] = useState(''), [query, setQuery] = useState(''), [error, setError] = useState(''), [loading, setLoading] = useState(true), [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    const load = () => api.getChatIndex().then(r => { if (live) { setThreads(r.threads || []); setError(''); } }).catch(e => live && setError(e.message)).finally(() => live && setLoading(false));
    load(); const timer = setInterval(() => { if (!document.hidden) load(); }, 20000);
    return () => { live = false; clearInterval(timer); };
  }, [tick]);
  const view = useMemo(() => inboxView(threads, leads, {channel, query}), [threads, leads, channel, query]);
  const tabs = [['', 'Todas', view.counts.all], ...ORDER.map(c => [c, CHANNELS[c].label, view.counts[c]])];
  return <section className="orok-card" aria-label="Bandeja social">
    <div style={{display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center'}}>
      <div><h2 style={{margin: 0, fontSize: 24, letterSpacing: '-.02em'}}>Bandeja de conversaciones</h2><p style={{margin: '4px 0 0', fontSize: 13, color: 'var(--ink-3)'}}>WhatsApp, Instagram, Messenger y TikTok en un solo lugar. Cada chat se abre a la derecha y queda registrado en el historial del lead.</p></div>
      <button className="orok-btn orok-btn-secondary" onClick={() => setTick(t => t + 1)} aria-label="Actualizar bandeja"><RefreshCw size={16}/> Actualizar</button>
    </div>
    <div style={{display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 16}}>
      <div className="inbox-tabs" role="tablist" aria-label="Redes">
        {tabs.map(([id, label, n]) => <button key={id || 'all'} role="tab" aria-selected={channel === id} className="inbox-tab" onClick={() => setChannel(id)}>{id ? <ChannelIcon channel={id} size={16}/> : null}{label}<span className="n">{n}</span></button>)}
      </div>
      <label style={{display: 'flex', alignItems: 'center', gap: 6, flex: '1 1 220px'}}><Search size={16} aria-hidden="true"/><span className="sr-only">Buscar conversación</span><input className="orok-input" style={{margin: 0}} placeholder="Buscar por nombre o mensaje…" value={query} onChange={e => setQuery(e.target.value)}/></label>
    </div>
    {error && <p role="alert" style={{color: '#b91c1c'}}>{error}</p>}
    <div className="inbox-list" role="tabpanel">
      {loading && <p style={{color: 'var(--ink-3)'}}>Cargando conversaciones…</p>}
      {!loading && !view.list.length && <p style={{color: 'var(--ink-3)'}}>Sin conversaciones para este filtro.</p>}
      {view.list.map(t => <button key={t.channel + t.thread_id} className="inbox-row" style={{'--ch': CHANNELS[t.channel].color}} onClick={() => openChat({channel: t.channel, leadId: t.lead_id, threadId: t.thread_id, origin: 'bandeja'})}>
        <span className="inbox-avatar"><ChannelIcon channel={t.channel} size={20}/></span>
        <span style={{minWidth: 0}}><strong>{t.display_name}{!t.linked && <span className="inbox-unlinked">Sin lead</span>}</strong><span className="p">{t.preview || 'Sin vista previa'}</span></span>
        <small>{CHANNELS[t.channel].label}<br/>{when(t.last_message_at)}</small>
      </button>)}
    </div>
  </section>;
}
