import React, {useEffect, useRef, useState} from 'react';
import {Sparkles, Mic, Square, Volume2, VolumeX, Send, X, Settings, RotateCcw} from 'lucide-react';
import {api} from './dataService';

// R33c · Asistente L.O.L.A para el equipo: botón flotante, consultas por voz o por escrito.
// El servidor arma el contexto según el rol de la sesión y llama al proveedor elegido por Gerencia.
const SUGGEST = {
  Gerente: ['¿Cuántos leads tienen acción vencida?', '¿Qué unidades siguen disponibles?', '¿Dónde configuro el resumen diario?'],
  Vendedor: ['¿Cómo registro una visita directa al showroom?', '¿Qué departamentos de 2 dormitorios hay disponibles?', 'Redacta un WhatsApp de seguimiento después de una cita'],
  Broker: ['¿Cómo registro un lead nuevo?', '¿Qué unidades siguen disponibles?', '¿Cómo funciona la separación?']
};
const SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
const plain = t => String(t || '').replace(/\*\*|__|`|#+\s/g, '').replace(/^\s*[-•]\s+/gm, '').replace(/\s+/g, ' ').trim();
const readPref = () => { try { return localStorage.getItem('lola-asistente-voz') === '1'; } catch { return false; } };

function Bubble({m}) {
  if (m.role === 'user') return <div className="lola-msg lola-user">{m.text}</div>;
  if (m.role === 'error') return <div className="lola-msg lola-error" role="alert">{m.text}</div>;
  return <div className="lola-msg lola-bot">{String(m.text).split('\n').map((l, i) => <p key={i}>{l.replace(/\*\*(.+?)\*\*/g, '$1')}</p>)}{m.provider && <small>{m.provider}</small>}</div>;
}

function Config({onClose, onSaved}) {
  const [c, setC] = useState(null), [key, setKey] = useState(''), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { api.getLolaAssistant().then(setC).catch(e => setMsg(e.message)); }, []);
  if (!c) return <div className="lola-config"><p>{msg || 'Cargando…'}</p></div>;
  const run = async (fn, ok) => { setBusy(true); setMsg(''); try { const r = await fn(); setMsg(ok(r)); } catch (e) { setMsg(e.message); } finally { setBusy(false); } };
  return <div className="lola-config">
    <h4>Configurar L.O.L.A</h4>
    <label><input type="checkbox" checked={c.enabled} onChange={e => setC({...c, enabled: e.target.checked})}/> Asistente activo para todo el equipo</label>
    <label>Proveedor<select className="orok-input" value={c.provider} onChange={e => setC({...c, provider: e.target.value, model: ''})}>{c.providers.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
    <label>Modelo<input className="orok-input" value={c.model} placeholder={c.providers.find(p => p.id === c.provider)?.default_model} onChange={e => setC({...c, model: e.target.value})}/></label>
    <label>Clave API {c.key_source && !c.own_key ? <small>(hoy se usa la de {c.key_source})</small> : null}
      <input className="orok-input" type="password" autoComplete="off" value={key} placeholder={c.own_key ? 'Guardada · escribe otra para reemplazarla' : 'Pega la clave del proveedor'} onChange={e => setKey(e.target.value)}/></label>
    <label>Consultas por persona al día<input className="orok-input" type="number" min={5} max={500} value={c.max_per_day} onChange={e => setC({...c, max_per_day: e.target.value})}/></label>
    <p className="lola-note">La clave se guarda en el servidor y nunca vuelve al navegador. Si eliges Claude sin clave propia, se usa la de Campañas IA; con Gemini, la de Ajustes. Vendedores y brokers solo reciben datos de su alcance: sin nombres ni teléfonos de clientes, márgenes ni comisiones.</p>
    <div className="lola-row">
      <button className="orok-btn orok-btn-primary" disabled={busy} onClick={() => run(async () => { const r = await api.saveLolaAssistant({...c, apiKey: key}); setKey(''); setC(r); onSaved(); return r; }, r => 'Guardado' + (r.enabled ? ' · activo con ' + r.provider_label : ' · apagado'))}>Guardar</button>
      <button className="orok-btn orok-btn-secondary" disabled={busy} onClick={() => run(() => api.testLolaAssistant(), r => 'Conexión correcta: ' + r.provider + ' · ' + r.model)}>Probar conexión</button>
      <button className="orok-btn orok-btn-secondary" onClick={onClose}>Volver</button>
    </div>
    {msg && <p className="lola-note" role="status">{msg}</p>}
  </div>;
}

export default function LolaAssistant({user}) {
  const [open, setOpen] = useState(false), [status, setStatus] = useState(null), [msgs, setMsgs] = useState([]), [input, setInput] = useState('');
  const [busy, setBusy] = useState(false), [listening, setListening] = useState(false), [speak, setSpeak] = useState(readPref), [config, setConfig] = useState(false);
  const rec = useRef(null), media = useRef(null), log = useRef(null), viaVoice = useRef(false);
  const g = user.role === 'Gerente';
  const refresh = () => api.getLolaAssistant().then(setStatus).catch(() => setStatus({enabled: false}));
  useEffect(() => { if (open && !status) refresh(); }, [open]);
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [msgs, busy]);
  useEffect(() => { try { localStorage.setItem('lola-asistente-voz', speak ? '1' : '0'); } catch {} if (!speak) window.speechSynthesis?.cancel(); }, [speak]);
  useEffect(() => () => { rec.current?.abort?.(); window.speechSynthesis?.cancel(); }, []);
  const enabled = status && (status.enabled && (g ? status.key_configured : true));

  function say(t) {
    if (!speak || !window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(plain(t)), voices = window.speechSynthesis.getVoices();
    u.voice = voices.find(v => /es[-_]PE/i.test(v.lang)) || voices.find(v => /es[-_](US|MX|419)/i.test(v.lang)) || voices.find(v => /^es/i.test(v.lang)) || null;
    u.lang = u.voice?.lang || 'es-PE'; u.rate = 1.02; window.speechSynthesis.cancel(); window.speechSynthesis.speak(u);
  }
  async function send(text, voice = false) {
    const q = String(text || '').trim(); if (!q || busy) return;
    const next = [...msgs.filter(m => m.role !== 'error'), {role: 'user', text: q}];
    setMsgs(next); setInput(''); setBusy(true);
    try {
      const r = await api.askLolaAssistant({messages: next.slice(-10).map(({role, text}) => ({role, text})), voice});
      setMsgs(m => [...m, {role: 'assistant', text: r.reply, provider: r.provider}]); say(r.reply);
    } catch (e) { setMsgs(m => [...m, {role: 'error', text: e.message}]); }
    finally { setBusy(false); }
  }
  async function serverDictation() {
    if (media.current) { media.current.stop(); return; }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { setMsgs(m => [...m, {role: 'error', text: 'Este navegador no permite dictar. Escribe tu consulta.'}]); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({audio: true}), chunks = [];
      const type = ['audio/webm', 'audio/mp4', 'audio/ogg'].find(t => MediaRecorder.isTypeSupported?.(t)) || '';
      const mr = new MediaRecorder(stream, type ? {mimeType: type} : undefined); media.current = mr; setListening(true);
      const stopAt = setTimeout(() => mr.state === 'recording' && mr.stop(), 60000);
      mr.ondataavailable = e => e.data.size && chunks.push(e.data);
      mr.onstop = async () => {
        clearTimeout(stopAt); stream.getTracks().forEach(t => t.stop()); media.current = null; setListening(false);
        const blob = new Blob(chunks, {type: mr.mimeType || type || 'audio/webm'}), buf = new Uint8Array(await blob.arrayBuffer());
        let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        setBusy(true);
        try { const r = await api.transcribeLolaAssistant({audio: btoa(bin), mime: blob.type}); setBusy(false); if (r.text) send(r.text, true); }
        catch (e) { setBusy(false); setMsgs(m => [...m, {role: 'error', text: e.message}]); }
      };
      mr.start();
    } catch { setListening(false); setMsgs(m => [...m, {role: 'error', text: 'No se pudo usar el micrófono. Revisa el permiso del navegador.'}]); }
  }
  function dictate() {
    if (listening) { rec.current?.stop?.(); media.current?.stop?.(); return; }
    if (!SR) { if (status?.voice_server) serverDictation(); else setMsgs(m => [...m, {role: 'error', text: 'Este navegador no reconoce voz. Usa Chrome, Edge o Safari, o escribe tu consulta.'}]); return; }
    window.speechSynthesis?.cancel();
    const r = new SR(); rec.current = r; r.lang = 'es-PE'; r.interimResults = true; r.continuous = false; viaVoice.current = true;
    let finalText = '';
    r.onresult = e => { let t = ''; for (const res of e.results) t += res[0].transcript; setInput(t); if (e.results[e.results.length - 1].isFinal) finalText = t; };
    r.onerror = e => { setListening(false); if (e.error === 'not-allowed') setMsgs(m => [...m, {role: 'error', text: 'Permite el micrófono en el navegador para hablar con L.O.L.A.'}]); };
    r.onend = () => { setListening(false); if (finalText.trim()) send(finalText, true); };
    setListening(true); r.start();
  }

  return <>
    {!open && <button className="lola-fab no-print" onClick={() => setOpen(true)} aria-label="Abrir el asistente L.O.L.A"><Sparkles size={18} aria-hidden="true"/><span>L.O.L.A</span></button>}
    {open && <section className="lola-panel no-print" role="dialog" aria-label="Asistente L.O.L.A">
      <header className="lola-head">
        <div><b>L.O.L.A</b><small>{status?.enabled ? 'Asistente del CRM · ' + (status.provider_label || '') : 'Asistente del CRM'}</small></div>
        <div className="lola-row">
          <button className="lola-icon" onClick={() => setSpeak(s => !s)} aria-pressed={speak} title={speak ? 'Respuestas en voz alta: sí' : 'Respuestas en voz alta: no'}>{speak ? <Volume2 size={17}/> : <VolumeX size={17}/>}</button>
          <button className="lola-icon" onClick={() => { setMsgs([]); window.speechSynthesis?.cancel(); }} title="Nueva conversación"><RotateCcw size={16}/></button>
          {g && <button className="lola-icon" onClick={() => setConfig(c => !c)} aria-pressed={config} title="Configurar"><Settings size={16}/></button>}
          <button className="lola-icon" onClick={() => { setOpen(false); window.speechSynthesis?.cancel(); rec.current?.abort?.(); }} aria-label="Cerrar"><X size={17}/></button>
        </div>
      </header>
      {config ? <Config onClose={() => setConfig(false)} onSaved={refresh}/> : <>
        <div className="lola-log" ref={log} aria-live="polite">
          {!msgs.length && <div className="lola-empty">
            {status && !enabled ? <p>{g ? 'El asistente está apagado. Usa el engranaje para elegir proveedor (Claude, ChatGPT o Gemini), registrar la clave y activarlo.' : 'El asistente aún no está activado. Pídeselo a Gerencia.'}</p>
              : <><p>Hola, {String(user.name || '').split(' ')[0]}. Pregúntame por escrito o con el micrófono sobre el CRM, el proceso comercial o el inventario.</p>
                <div className="lola-chips">{(SUGGEST[user.role] || SUGGEST.Vendedor).map(q => <button key={q} onClick={() => send(q)} disabled={!enabled}>{q}</button>)}</div></>}
          </div>}
          {msgs.map((m, i) => <Bubble key={i} m={m}/>)}
          {busy && <div className="lola-msg lola-bot lola-typing">L.O.L.A está pensando…</div>}
        </div>
        <form className="lola-input" onSubmit={e => { e.preventDefault(); send(input); }}>
          <button type="button" className={'lola-mic' + (listening ? ' on' : '')} onClick={dictate} disabled={!enabled || busy} aria-pressed={listening} title={listening ? 'Detener' : 'Hablar'}>{listening ? <Square size={16}/> : <Mic size={18}/>}</button>
          <textarea rows={1} value={input} placeholder={listening ? 'Escuchando…' : 'Escribe tu duda'} disabled={!enabled} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}/>
          <button type="submit" className="lola-send" disabled={!enabled || busy || !input.trim()} aria-label="Enviar"><Send size={17}/></button>
        </form>
      </>}
    </section>}
  </>;
}
