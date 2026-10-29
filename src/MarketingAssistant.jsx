import React, {useEffect, useState} from 'react';
import {api} from './dataService';

const today = () => new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Lima'}).format(new Date());
const monthStart = () => today().slice(0, 7) + '-01';
const money = (v, c) => v === null || v === undefined ? 'Sin datos' : new Intl.NumberFormat('es-PE', {style: 'currency', currency: c || 'PEN'}).format(v);
const ACTION = {aumentar: ['Aumentar', '#166534'], reducir: ['Reducir', '#b91c1c'], mantener: ['Mantener', '#475569'], sin_datos: ['Sin datos suficientes', '#92400e']};
const card = {marginTop: 16};


const blank = () => ({id: '', name: '', project: '', address: '', city: 'Lima', color: '#85442a', tone: '', forbidden_words: [], hashtags: [], business_line: 'venta_departamentos'});
function BrandLibrary() {
  const [brands, setBrands] = useState([]), [err, setErr] = useState(''), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { api.getCreativeBrand().then(r => setBrands(r.brands)).catch(e => setErr(e.message)); }, []);
  const set = (i, k, v) => setBrands(list => list.map((b, n) => n === i ? {...b, [k]: v} : b));
  async function save() {
    setBusy(true); setErr(''); setMsg('');
    try { const r = await api.saveCreativeBrand({brands}); setBrands(r.brands); setMsg('Biblioteca de marca guardada. Las campañas nuevas la usan; las existentes conservan la suya.'); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  return <div className="orok-card" style={card}>
    <h3 style={{marginTop: 0}}>Biblioteca de marca y proyectos</h3>
    <p style={{fontSize: 13}}>Define cada proyecto con su tono, palabras prohibidas y hashtags. Claude los recibe en cada propuesta y el CRM rechaza piezas que usen una palabra prohibida.</p>
    {brands.map((b, i) => <fieldset key={i} style={{border: '1px solid #e7dcd5', borderRadius: 12, padding: 14, marginTop: 12}}><legend>{b.project || 'Proyecto nuevo'}</legend>
      <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 10}}>
        {[['name', 'Empresa'], ['project', 'Proyecto'], ['address', 'Dirección'], ['city', 'Ciudad']].map(([k, label]) => <label key={k}>{label}<input className="orok-input" maxLength={160} value={b[k]} onChange={e => set(i, k, e.target.value)}/></label>)}
        <label>Color de marca<input className="orok-input" type="color" value={b.color} onChange={e => set(i, 'color', e.target.value)}/></label>
      </div>
      <label>Tono de voz<textarea className="orok-input" rows={2} maxLength={300} value={b.tone} onChange={e => set(i, 'tone', e.target.value)} placeholder="Ej.: cálido, cercano y profesional; trato de usted"/></label>
      <label>Palabras prohibidas (separadas por coma)<input className="orok-input" value={(b.forbidden_words || []).join(', ')} onChange={e => set(i, 'forbidden_words', e.target.value.split(',').map(x => x.trim()).filter(Boolean))}/></label>
      <label>Hashtags (separados por espacio)<input className="orok-input" value={(b.hashtags || []).join(' ')} onChange={e => set(i, 'hashtags', e.target.value.split(/\s+/).filter(Boolean))}/></label>
      <button type="button" className="orok-btn orok-btn-secondary" style={{marginTop: 8}} disabled={brands.length <= 1} onClick={() => setBrands(l => l.filter((_, n) => n !== i))}>Quitar proyecto</button>
    </fieldset>)}
    <div style={{display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12}}>
      <button className="orok-btn orok-btn-secondary" disabled={brands.length >= 20} onClick={() => setBrands(l => [...l, blank()])}>Añadir proyecto</button>
      <button className="orok-btn orok-btn-primary" disabled={busy} onClick={save}>Guardar biblioteca</button></div>
    {err && <p role="alert" style={{color: '#b91c1c'}}>{err}</p>}{msg && <p role="status">{msg}</p>}
  </div>;
}

const STATE = {queued: 'en cola', leased: 'en proceso', done: 'listo', failed: 'falló', cancelled: 'cancelado', published: 'publicado', dry_run_done: 'ensayo completado'};
function Connections() {
  const [voice, setVoice] = useState(null), [pub, setPub] = useState(null), [cycle, setCycle] = useState(null), [jobs, setJobs] = useState({voice: [], publication: []}), [campaigns, setCampaigns] = useState([]), [pieces, setPieces] = useState([]), [err, setErr] = useState(''), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false);
  const [form, setForm] = useState({campaign_id: '', piece_id: '', channel: 'instagram', when: '', variant_label: ''});
  const load = () => Promise.all([api.getVoiceConfig(), api.getPublishConfig(), api.getCycleConfig(), api.getPipelineJobs()]).then(([v, p, c, j]) => { setVoice(v); setPub(p); setCycle(c); setJobs(j); }).catch(e => setErr(e.message));
  useEffect(() => { load(); api.getCreativeCampaigns().then(r => setCampaigns(r.campaigns)).catch(e => setErr(e.message)); }, []);
  const run = async (fn, ok) => { setBusy(true); setErr(''); setMsg(''); try { await fn(); if (ok) setMsg(ok); await load(); } catch (e) { setErr(e.message); } finally { setBusy(false); } };
  async function pick(id) { setForm(f => ({...f, campaign_id: id, piece_id: ''})); setPieces([]); if (!id) return; try { const c = await api.getCreativeCampaign(id); setPieces(c.proposal?.creatives || []); } catch (e) { setErr(e.message); } }
  if (!voice || !pub || !cycle) return <div className="orok-card" style={card}><h3 style={{marginTop: 0}}>Conexiones: voz, publicación y ciclo</h3>{err ? <p role="alert" style={{color: '#b91c1c'}}>{err}</p> : <p>Cargando…</p>}</div>;
  const piece = pieces.find(p => p.id === form.piece_id);
  const list = (rows, kind) => rows.length ? <ul style={{fontSize: 12, paddingLeft: 18}}>{rows.slice(0, 8).map(j => <li key={j.id}>{kind === 'voice' ? 'Voz' : j.channel} · {j.piece_id} · {STATE[j.state] || j.state}{j.reason ? ' · ' + j.reason : ''}{j.state === 'queued' && <> <button className="orok-btn orok-btn-secondary" disabled={busy} onClick={() => run(() => api.cancelPipelineJob(kind, j.id), 'Trabajo cancelado.')}>Cancelar</button></>}</li>)}</ul> : <p style={{fontSize: 12}}>Sin trabajos.</p>;
  return <div className="orok-card" style={card}>
    <h3 style={{marginTop: 0}}>Conexiones: voz, publicación y ciclo</h3>
    <p style={{fontSize: 13}}>Todo está apagado hasta que lo actives aquí <strong>y</strong> conectes las credenciales en n8n. Las claves de Meta, TikTok y del proveedor de voz viven solo en n8n, nunca en el CRM.</p>
    {err && <p role="alert" style={{color: '#b91c1c'}}>{err}</p>}{msg && <p role="status">{msg}</p>}
    <fieldset style={{border: '1px solid #e7dcd5', borderRadius: 12, padding: 14}}><legend>Voz sintética para reels e historias</legend>
      <label><input className="switch" type="checkbox" checked={voice.enabled} onChange={e => setVoice({...voice, enabled: e.target.checked})}/> Activar</label>
      <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10}}>
        <label>Proveedor<input className="orok-input" maxLength={40} value={voice.provider} onChange={e => setVoice({...voice, provider: e.target.value})} placeholder="Ej.: elevenlabs"/></label>
        <label>Nombre de la voz<input className="orok-input" maxLength={80} value={voice.voice_label} onChange={e => setVoice({...voice, voice_label: e.target.value})}/></label>
        <label>Máximo de voces por día<input className="orok-input" type="number" min={1} max={50} value={voice.max_jobs_per_day} onChange={e => setVoice({...voice, max_jobs_per_day: Number(e.target.value)})}/></label></div>
      <button className="orok-btn orok-btn-secondary" style={{marginTop: 8}} disabled={busy} onClick={() => run(async () => setVoice(await api.saveVoiceConfig(voice)), 'Voz guardada.')}>Guardar voz</button>
      {list(jobs.voice, 'voice')}
    </fieldset>
    <fieldset style={{border: '1px solid #e7dcd5', borderRadius: 12, padding: 14, marginTop: 12}}><legend>Publicación en redes</legend>
      <label><input className="switch" type="checkbox" checked={pub.enabled} onChange={e => setPub({...pub, enabled: e.target.checked})}/> Activar la cola de publicación</label><br/>
      <label><input className="switch" type="checkbox" checked={pub.dry_run} onChange={e => setPub({...pub, dry_run: e.target.checked})}/> Modo ensayo (n8n recibe el trabajo pero no publica)</label>
      <div style={{display: 'flex', gap: 16, flexWrap: 'wrap', margin: '8px 0'}}>{['facebook', 'instagram', 'tiktok'].map(k => <label key={k}><input className="switch" type="checkbox" checked={pub.channels[k]} onChange={e => setPub({...pub, channels: {...pub.channels, [k]: e.target.checked}})}/> {k}</label>)}
        <label>Máximo por día <input className="orok-input" style={{width: 80}} type="number" min={1} max={30} value={pub.max_per_day} onChange={e => setPub({...pub, max_per_day: Number(e.target.value)})}/></label></div>
      <button className="orok-btn orok-btn-secondary" disabled={busy} onClick={() => run(async () => setPub(await api.savePublishConfig(pub)), 'Publicación guardada.')}>Guardar publicación</button>
      <details style={{marginTop: 12}}><summary style={{cursor: 'pointer', fontWeight: 600}}>Programación avanzada: variantes A/B y voz</summary>{/* R42 · lo cotidiano se hace en Publicar (arriba); aquí quedan variantes y voz */}
      <p style={{fontSize: 12}}>La campaña debe estar aprobada y la pieza exportada sin marca de borrador. Publica la pieza orgánica; el anuncio pagado se crea en el administrador de anuncios y su ID se vincula en Variantes A/B.</p>
      <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10}}>
        <label>Campaña<select className="orok-input" value={form.campaign_id} onChange={e => pick(e.target.value)}><option value="">Elegir</option>{campaigns.map(c => <option key={c.id} value={c.id}>{c.title} · {c.status}</option>)}</select></label>
        <label>Pieza<select className="orok-input" value={form.piece_id} onChange={e => setForm({...form, piece_id: e.target.value})}><option value="">Elegir</option>{pieces.map(p => <option key={p.id} value={p.id}>{p.id} · {p.format}</option>)}</select></label>
        <label>Canal<select className="orok-input" value={form.channel} onChange={e => setForm({...form, channel: e.target.value})}>{['facebook', 'instagram', 'tiktok'].map(k => <option key={k}>{k}</option>)}</select></label>
        <label>Fecha y hora (Lima)<input className="orok-input" type="datetime-local" value={form.when} onChange={e => setForm({...form, when: e.target.value})}/></label>
        <label>Variante<select className="orok-input" value={form.variant_label} onChange={e => setForm({...form, variant_label: e.target.value})}><option value="">Sin variante</option>{['A', 'B', 'C', 'D'].map(l => <option key={l}>{l}</option>)}</select></label></div>
      <div style={{display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8}}>
        <button className="orok-btn orok-btn-primary" disabled={busy || !form.campaign_id || !form.piece_id || !form.when} onClick={() => run(() => api.requestPublication({campaign_id: form.campaign_id, piece_id: form.piece_id, channel: form.channel, variant_label: form.variant_label, scheduled_at: new Date(form.when + ':00-05:00').toISOString(), request_id: crypto.randomUUID()}), 'Publicación programada.')}>Programar publicación</button>
        <button className="orok-btn orok-btn-secondary" disabled={busy || !piece || !['reel', 'story'].includes(piece.format)} onClick={() => run(() => api.requestVoice({campaign_id: form.campaign_id, piece_id: form.piece_id, request_id: crypto.randomUUID()}), 'Voz solicitada.')}>Pedir voz de esta pieza</button></div>
      </details>
      <h4>Cola de publicación</h4>
      {list(jobs.publication, 'publication')}
    </fieldset>
    <fieldset style={{border: '1px solid #e7dcd5', borderRadius: 12, padding: 14, marginTop: 12}}><legend>Ciclo creativo automático</legend>
      <p style={{fontSize: 12, margin: '0 0 8px'}}>Cada cierto tiempo crea una campaña nueva en <strong>borrador</strong> copiando el brief de las campañas base, con las métricas recientes, y pide a Claude una propuesta. Nunca aprueba ni publica: tú revisas.</p>
      <label><input className="switch" type="checkbox" checked={cycle.enabled} onChange={e => setCycle({...cycle, enabled: e.target.checked})}/> Activar</label>
      <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10}}>
        <label>Repetir cada (días)<input className="orok-input" type="number" min={3} max={30} value={cycle.every_days} onChange={e => setCycle({...cycle, every_days: Number(e.target.value)})}/></label>
        <label>Métricas de los últimos (días)<input className="orok-input" type="number" min={7} max={60} value={cycle.window_days} onChange={e => setCycle({...cycle, window_days: Number(e.target.value)})}/></label></div>
      <p style={{fontSize: 12}}>Campañas base (hasta 5):</p>
      <div style={{display: 'flex', flexDirection: 'column', gap: 4}}>{campaigns.slice(0, 40).map(c => <label key={c.id}><input type="checkbox" checked={cycle.campaign_ids.includes(c.id)} onChange={e => setCycle({...cycle, campaign_ids: e.target.checked ? [...cycle.campaign_ids, c.id].slice(0, 5) : cycle.campaign_ids.filter(x => x !== c.id)})}/> {c.title}</label>)}</div>
      <button className="orok-btn orok-btn-secondary" style={{marginTop: 8}} disabled={busy} onClick={() => run(async () => setCycle(await api.saveCycleConfig(cycle)), 'Ciclo guardado.')}>Guardar ciclo</button>
    </fieldset>
  </div>;
}

function DailyBrief() {
  const [cfg, setCfg] = useState({enabled: false, recipients: []}), [emails, setEmails] = useState(''), [preview, setPreview] = useState(null), [msg, setMsg] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { api.getDailyBriefConfig().then(c => { setCfg(c); setEmails(c.recipients.join(', ')); }).catch(e => setErr(e.message)); }, []);
  const run = async fn => { setBusy(true); setErr(''); setMsg(''); try { await fn(); } catch (e) { setErr(e.message); } finally { setBusy(false); } };
  const save = enabled => run(async () => {
    const recipients = emails.split(/[\s,;]+/).filter(Boolean);
    const next = await api.saveDailyBriefConfig({enabled, recipients});
    setCfg(next); setMsg(enabled ? 'Resumen diario activado. n8n lo enviará cada mañana si el flujo está activo.' : 'Configuración guardada.');
  });
  return <div className="orok-card" style={card}>
    <h3 style={{marginTop: 0}}>Resumen diario de gestión</h3>
    <p style={{fontSize: 13}}>Cada mañana n8n envía por correo a Gerencia: visitas del día, leads sin gestión, citas sin resultado, seguimientos vencidos y leads con interés alto. No incluye teléfonos ni documentos.</p>
    <label>Correos de destino (hasta 5, separados por coma)<input className="orok-input" value={emails} maxLength={400} onChange={e => setEmails(e.target.value)}/></label>
    <div style={{display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10}}>
      <button className="orok-btn orok-btn-primary" disabled={busy} onClick={() => save(true)}>{cfg.enabled ? 'Guardar' : 'Activar resumen'}</button>
      {cfg.enabled && <button className="orok-btn orok-btn-secondary" disabled={busy} onClick={() => save(false)}>Desactivar</button>}
      <button className="orok-btn orok-btn-secondary" disabled={busy} onClick={() => run(async () => setPreview(await api.previewDailyBrief()))}>Ver resumen de hoy</button>
    </div>
    <p role="status" style={{fontSize: 12}}>Estado: <strong>{cfg.enabled ? 'activo' : 'desactivado'}</strong></p>
    {err && <p role="alert" style={{color: '#b91c1c'}}>{err}</p>}{msg && <p role="status">{msg}</p>}
    {preview && <pre style={{whiteSpace: 'pre-wrap', fontSize: 12, background: '#faf7f5', padding: 12, borderRadius: 10}}>{preview.text}</pre>}
  </div>;
}

function Budget() {
  const [filters, setFilters] = useState({from: monthStart(), to: today()}), [list, setList] = useState([]), [err, setErr] = useState(''), [busy, setBusy] = useState(false), [note, setNote] = useState({});
  const load = () => api.getBudgetRecommendations().then(r => setList(r.recommendations)).catch(e => setErr(e.message));
  useEffect(() => { load(); }, []);
  const run = async fn => { setBusy(true); setErr(''); try { await fn(); await load(); } catch (e) { setErr(e.message); } finally { setBusy(false); } };
  return <div className="orok-card" style={card}>
    <h3 style={{marginTop: 0}}>Recomendaciones de presupuesto</h3>
    <p style={{fontSize: 13}}>Compara el costo por lead del CRM entre anuncios y sugiere subir, mantener o reducir hasta 20%. No cambia nada en Meta ni TikTok: tú decides y lo aplicas en la plataforma.</p>
    <div style={{display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap'}}>
      {['from', 'to'].map((k, i) => <label key={k}>{i ? 'Hasta' : 'Desde'}<input className="orok-input" type="date" value={filters[k]} onChange={e => setFilters(f => ({...f, [k]: e.target.value}))}/></label>)}
      <button className="orok-btn orok-btn-primary" disabled={busy} onClick={() => run(() => api.createBudgetRecommendation(filters))}>Generar recomendación</button>
    </div>
    {err && <p role="alert" style={{color: '#b91c1c'}}>{err}</p>}
    {list.map(r => <details key={r.id} style={{marginTop: 12, border: '1px solid #e7dcd5', borderRadius: 10, padding: 12}} open={r.status === 'pending' && list[0]?.id === r.id}>
      <summary style={{cursor: 'pointer'}}><strong>{r.from} a {r.to}</strong> · {r.status === 'pending' ? 'pendiente de decisión' : r.status === 'approved' ? 'aprobada por ' + r.decided_by : 'rechazada por ' + r.decided_by}</summary>
      <div style={{overflowX: 'auto'}}><table style={{width: '100%', fontSize: 12, marginTop: 8}}><thead><tr><th align="left">Anuncio</th><th>Inversión</th><th>Leads CRM</th><th>Costo/lead</th><th align="left">Sugerencia</th></tr></thead>
        <tbody>{r.items.map((it, i) => <tr key={i}><td>{it.name}</td><td align="center">{money(it.spend, it.currency)}</td><td align="center">{it.crm_leads}</td><td align="center">{money(it.cpl, it.currency)}</td>
          <td><strong style={{color: (ACTION[it.action] || ACTION.mantener)[1]}}>{(ACTION[it.action] || ACTION.mantener)[0]}{it.change_pct ? ' ' + (it.change_pct > 0 ? '+' : '') + it.change_pct + '%' : ''}</strong><br/><span>{it.reason}</span></td></tr>)}</tbody></table></div>
      <p style={{fontSize: 12}}>{r.notice}</p>
      {r.decision_note && <p style={{fontSize: 12}}>Nota: {r.decision_note}</p>}
      {r.status === 'pending' && <div style={{display: 'flex', gap: 10, flexWrap: 'wrap'}}>
        <input aria-label="Nota de decisión" className="orok-input" style={{flex: 1, minWidth: 200}} maxLength={400} placeholder="Nota opcional" value={note[r.id] || ''} onChange={e => setNote(n => ({...n, [r.id]: e.target.value}))}/>
        <button className="orok-btn orok-btn-primary" disabled={busy} onClick={() => run(() => api.decideBudgetRecommendation(r.id, {decision: 'approved', note: note[r.id]}))}>Aprobar</button>
        <button className="orok-btn orok-btn-secondary" disabled={busy} onClick={() => run(() => api.decideBudgetRecommendation(r.id, {decision: 'rejected', note: note[r.id]}))}>Rechazar</button></div>}
    </details>)}
    {!list.length && <p style={{fontSize: 13}}>Aún no hay recomendaciones.</p>}
  </div>;
}

function Variants() {
  const [filters, setFilters] = useState({from: monthStart(), to: today()}), [report, setReport] = useState(null), [campaigns, setCampaigns] = useState([]), [pieces, setPieces] = useState([]), [form, setForm] = useState({campaign_id: '', piece_id: '', provider: 'meta', ad_id: '', label: 'A'}), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const load = () => api.getVariantReport(filters).then(setReport).catch(e => setErr(e.message));
  useEffect(() => { api.getCreativeCampaigns().then(r => setCampaigns(r.campaigns)).catch(e => setErr(e.message)); load(); }, []);
  const run = async fn => { setBusy(true); setErr(''); try { await fn(); await load(); } catch (e) { setErr(e.message); } finally { setBusy(false); } };
  async function pick(id) { setForm(f => ({...f, campaign_id: id, piece_id: ''})); setPieces([]); if (!id) return; try { const c = await api.getCreativeCampaign(id); setPieces(c.proposal?.creatives || []); } catch (e) { setErr(e.message); } }
  return <div className="orok-card" style={card}>
    <h3 style={{marginTop: 0}}>Variantes A/B por anuncio</h3>
    <p style={{fontSize: 13}}>Vincula cada anuncio publicado con la pieza de la campaña. El CRM mide los leads y citas de cada variante por el ID del anuncio. No declara ganador con menos de 10 leads por variante.</p>
    <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10}}>
      <label>Campaña<select className="orok-input" value={form.campaign_id} onChange={e => pick(e.target.value)}><option value="">Elegir</option>{campaigns.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
      <label>Pieza<select className="orok-input" value={form.piece_id} onChange={e => setForm(f => ({...f, piece_id: e.target.value}))}><option value="">Elegir</option>{pieces.map(p => <option key={p.id} value={p.id}>{p.id} · {p.format}</option>)}</select></label>
      <label>Plataforma<select className="orok-input" value={form.provider} onChange={e => setForm(f => ({...f, provider: e.target.value}))}><option value="meta">Meta</option><option value="tiktok">TikTok</option></select></label>
      <label>ID del anuncio<input className="orok-input" inputMode="numeric" value={form.ad_id} onChange={e => setForm(f => ({...f, ad_id: e.target.value.replace(/\D/g, '')}))}/></label>
      <label>Variante<select className="orok-input" value={form.label} onChange={e => setForm(f => ({...f, label: e.target.value}))}>{['A', 'B', 'C', 'D'].map(l => <option key={l}>{l}</option>)}</select></label>
    </div>
    <div style={{display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end', marginTop: 10}}>
      <button className="orok-btn orok-btn-primary" disabled={busy || !form.campaign_id || !form.piece_id || !form.ad_id} onClick={() => run(() => api.linkCreativeVariant(form))}>Vincular anuncio</button>
      {['from', 'to'].map((k, i) => <label key={k}>{i ? 'Hasta' : 'Desde'}<input className="orok-input" type="date" value={filters[k]} onChange={e => setFilters(f => ({...f, [k]: e.target.value}))}/></label>)}
      <button className="orok-btn orok-btn-secondary" disabled={busy} onClick={() => run(async () => {})}>Actualizar</button>
    </div>
    {err && <p role="alert" style={{color: '#b91c1c'}}>{err}</p>}
    {report?.campaigns.map(c => <div key={c.key} style={{marginTop: 14, border: '1px solid #e7dcd5', borderRadius: 10, padding: 12}}>
      <strong>{c.title}</strong> · {c.piece_id} ({c.piece_format})
      <div style={{overflowX: 'auto'}}><table style={{width: '100%', fontSize: 12, marginTop: 8}}><thead><tr><th>Variante</th><th>Anuncio</th><th>Inversión</th><th>Leads CRM</th><th>Citas</th><th>Costo/lead</th><th/></tr></thead>
        <tbody>{c.rows.map(r => { const v = c.variants.find(x => x.label === r.label); return <tr key={r.label}><td align="center"><strong>{r.label}{c.winner === r.label ? ' ★' : ''}</strong></td><td align="center">{r.ad_id}{v && !v.found ? ' (sin datos en el período)' : ''}</td><td align="center">{money(r.spend, r.currency)}</td><td align="center">{r.crm_leads}</td><td align="center">{r.appointments}</td><td align="center">{money(r.cpl, r.currency)}</td><td><button className="orok-btn orok-btn-secondary" disabled={busy} onClick={() => run(() => api.unlinkCreativeVariant(v.link_id))}>Quitar</button></td></tr>; })}</tbody></table></div>
      <p role="status" style={{margin: '8px 0 0'}}><strong>{c.verdict}</strong></p>
      {c.warnings.map((w, i) => <p key={i} style={{fontSize: 12, color: '#92400e', margin: '2px 0'}}>{w}</p>)}
    </div>)}
    {report && !report.campaigns.length && <p style={{fontSize: 13}}>{report.notice}</p>}
    {report?.campaigns.length > 0 && <p style={{fontSize: 12}}>{report.notice}</p>}
  </div>;
}

const SECTIONS = {
  mkBrand: ['Biblioteca de marca', 'Proyectos, tono de voz, palabras prohibidas y hashtags que Claude debe respetar.', BrandLibrary],
  mkConnections: ['Publicación, voz y ciclo automático', 'Colas listas para conectar. Todo inicia apagado.', Connections],
  mkBrief: ['Resumen diario', 'Correo de gestión que n8n envía cada mañana a Gerencia.', DailyBrief],
  mkBudget: ['Presupuesto', 'Recomendaciones por anuncio para decisión de Gerencia.', Budget],
  mkVariants: ['Variantes A/B', 'Compara piezas por anuncio con leads, citas y costo por lead.', Variants],
};
export default function MarketingAssistant({section}) {
  const s = SECTIONS[section];
  if (s) { const [title, sub, Comp] = s; return <section className="mk-section" aria-label={title} style={{maxWidth: 1100, margin: '0 auto'}}><h2 style={{margin: '8px 0 2px', fontSize: 26, letterSpacing: '-.02em'}}>{title}</h2><p style={{margin: '0 0 4px', color: 'var(--ink-3,#8a817c)'}}>{sub}</p><Comp/></section>; }
  return <section aria-label="Asistente de marketing"><h2 style={{color: 'var(--orok-brand)', margin: '24px 0 0'}}>Asistente de marketing</h2><BrandLibrary/><Connections/><DailyBrief/><Budget/><Variants/></section>;
}
