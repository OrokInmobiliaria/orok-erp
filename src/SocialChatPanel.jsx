import React, {useEffect, useRef, useState} from 'react';
import {X} from 'lucide-react';
import {api} from './dataService';
import ChannelIcon from './ChannelIcon';
import {CHANNELS} from './chatChannels.mjs';
import './whatsappInbox.css';

const date = v => v ? new Date(v).toLocaleString('es-PE', {timeZone: 'America/Lima'}) : '';

// R32 · Chat de Instagram, Messenger o TikTok como panel lateral (misma "ventana extensión" que WhatsApp).
export default function SocialChatPanel({threadId, leads = [], origin = 'bandeja', onClose, onOpenWhatsApp}) {
  const [chat, setChat] = useState(null), [text, setText] = useState(''), [leadId, setLeadId] = useState(''), [error, setError] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [refresh, setRefresh] = useState(0);
  const pending = useRef(null), panel = useRef(null), end = useRef(null);
  useEffect(() => { panel.current?.focus(); const esc = e => e.key === 'Escape' && onClose(); document.addEventListener('keydown', esc); return () => document.removeEventListener('keydown', esc); }, []);
  useEffect(() => {
    let live = true;
    const load = () => api.getSocialConversation(threadId).then(r => { if (!live) return; setChat(c => c?.id === r.id && c.messages.length > r.messages.length ? {...r, messages: [...new Map([...c.messages, ...r.messages].map(m => [m.id, m])).values()].sort((a, b) => a.sort_key.localeCompare(b.sort_key)), has_more: c.has_more, next_before: c.next_before} : r); setLeadId(id => id || r.lead_id || ''); }).catch(e => live && setError(e.message));
    load(); const timer = setInterval(() => { if (!document.hidden) load(); }, 10000);
    return () => { live = false; clearInterval(timer); };
  }, [threadId, refresh]);
  useEffect(() => { end.current?.scrollIntoView({block: 'end'}); }, [chat?.messages?.length]);
  async function act(fn, reload = true) { setBusy(true); setError(''); setMessage(''); try { await fn(); if (reload) setRefresh(v => v + 1); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  async function send() {
    if (!pending.current || pending.current.text !== text) pending.current = {text, id: crypto.randomUUID()};
    await act(async () => {
      await api.sendSocialMessage(threadId, {text: pending.current.text, request_id: pending.current.id});
      setText(''); pending.current = null; setMessage('Envío confirmado por la plataforma.');
      if (chat?.lead_id) api.logChatAccess(chat.lead_id, {channel: chat.channel, origin, action: 'reply', thread_id: threadId}).catch(() => {});
    });
  }
  const meta = CHANNELS[chat?.channel] || {label: 'Chat'}, lead = leads.find(l => l.id === chat?.lead_id);
  return <div className="whatsapp-overlay no-print" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <section ref={panel} tabIndex={-1} className="whatsapp-panel" role="dialog" aria-modal="true" aria-label={'Chat de ' + meta.label}>
      <header className="whatsapp-header">
        <div><h2>{chat ? <ChannelIcon channel={chat.channel} size={20}/> : null} {meta.label}</h2><strong>{lead?.name || chat?.contact_name || chat?.contact_id || 'Cargando…'}</strong>{lead && <p>{lead.code || lead.id} · {lead.status} · {lead.sales_owner || 'Sin asignar'}</p>}</div>
        <button className="orok-btn orok-btn-secondary" aria-label="Cerrar chat" onClick={onClose}><X size={16}/></button>
      </header>
      {chat && <div className="whatsapp-controls">
        <label style={{fontSize: 12}}>Atención <select aria-label="Atención de la conversación" className="orok-input" style={{margin: 0, padding: '6px 10px', width: 'auto'}} value={chat.mode} disabled={busy} onChange={e => act(() => api.setSocialMode(threadId, {mode: e.target.value, version: chat.control_version}))}><option value="manual">Manual</option><option value="suggest">Sugerencias de Lola</option>{chat.automatic_enabled && <option value="auto">Lola automática</option>}<option value="observer">Solo registro</option></select></label>
        {chat.mode === 'suggest' && <button className="orok-btn orok-btn-secondary" disabled={busy || chat.opt_out} onClick={() => act(async () => { await api.requestSocialSuggestion(threadId); setMessage('Sugerencia solicitada a Lola.'); })}>Pedir sugerencia</button>}
        {chat.lead_id && onOpenWhatsApp && <button className="orok-btn orok-btn-secondary" onClick={() => onOpenWhatsApp(chat.lead_id)}><ChannelIcon channel="whatsapp" size={14}/> WhatsApp del lead</button>}
      </div>}
      {error && <div className="whatsapp-error" role="alert">{error}</div>}
      <div className="whatsapp-messages" aria-live="polite">
        {!chat ? <p className="whatsapp-empty">Cargando conversación…</p> : <>
          {chat.has_more && <button className="orok-btn whatsapp-older" onClick={() => act(async () => { const older = await api.getSocialConversation(threadId, {before: chat.next_before}); setChat(c => ({...c, has_more: older.has_more, next_before: older.next_before, messages: [...older.messages, ...c.messages]})); }, false)}>Ver mensajes anteriores</button>}
          {!chat.messages.length && <p className="whatsapp-empty">Aún no hay mensajes en esta conversación.</p>}
          {chat.messages.map(m => <article key={m.id} className={'whatsapp-message ' + (m.direction === 'outbound' ? 'outbound' : '')}><strong>{m.direction === 'inbound' ? 'Cliente' : m.sender || 'Equipo'}</strong><p>{m.text}</p>{m.attachments?.map((a, i) => <div className="whatsapp-attachment" key={i}>{a.url ? <a href={a.url} target="_blank" rel="noopener noreferrer">Abrir adjunto · {a.type}</a> : <small>Adjunto no disponible</small>}</div>)}<footer><small>{date(m.at)}</small></footer></article>)}
          <div ref={end}/>
        </>}
      </div>
      {chat?.suggestion && <div className="whatsapp-notice" style={{background: '#f5ebe6', padding: 12, borderRadius: 12}}><strong>Borrador de Lola</strong><p>{chat.suggestion.text}</p><button className="orok-btn orok-btn-secondary" onClick={() => { setText(chat.suggestion.text); act(() => api.setSocialMode(threadId, {mode: 'manual', version: chat.control_version})); }}>Usar y editar</button></div>}
      {chat && <div className="whatsapp-composer">
        {chat.opt_out && <p className="whatsapp-notice">Este contacto pidió no ser contactado. Los envíos están bloqueados.</p>}
        <label htmlFor="social-reply">Respuesta por {meta.label}</label>
        <textarea id="social-reply" rows={3} maxLength={2000} value={text} onChange={e => setText(e.target.value)} placeholder="Escribe una respuesta" disabled={!chat.send_enabled || chat.opt_out}/>
        <div><small>{chat.channel === 'tiktok' ? 'TikTok: envío pendiente de autorización oficial.' : !chat.window_open ? 'La ventana estándar de respuesta está cerrada.' : !chat.send_enabled ? 'Selecciona Manual y habilita el envío en conexiones.' : 'Ventana de respuesta abierta.'}</small>
          <button className="orok-btn orok-btn-primary" disabled={busy || !text.trim() || !chat.send_enabled || chat.opt_out} onClick={send}>Enviar</button></div>
        {message && <p role="status" style={{fontSize: 12, color: '#166534'}}>{message}</p>}
        {!chat.lead_id && <div style={{marginTop: 10}}><label>Vincular a un lead<select className="orok-input" value={leadId} onChange={e => setLeadId(e.target.value)}><option value="">Selecciona el lead</option>{leads.map(l => <option key={l.id} value={l.id}>{l.name} · {l.code || l.id}</option>)}</select></label><button className="orok-btn orok-btn-secondary" disabled={!leadId || busy} onClick={() => act(() => api.linkSocialLead(threadId, leadId))}>Guardar vínculo</button></div>}
      </div>}
    </section>
  </div>;
}
