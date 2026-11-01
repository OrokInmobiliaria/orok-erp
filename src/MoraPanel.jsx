import React, {useEffect, useRef, useState} from 'react';
import {api} from './dataService';

// M.O.R.A · Evaluador Inmobiliario dentro del CRM.
// "Consultas" (todos los roles): preguntas a M.O.R.A sobre una evaluación. El alcance lo decide el servidor.
// "Administración" (solo Gerencia): activar, cargar evaluaciones, aprobar propuestas, editores y lecturas semanales.
const card = {marginTop: 16};
const TIERS = [['quick', 'Rápida'], ['default', 'Analista'], ['complex', 'Experta']];
const money = v => new Intl.NumberFormat('es-PE', {style: 'currency', currency: 'PEN', maximumFractionDigits: 0}).format(v || 0);
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => (Math.random() * 16 | 0).toString(16)));

function Summary({ev}) {
  const s = ev?.summary || {};
  const items = [['Unidades', s.unidades_total], ['Vendidas', s.vendidas], ['Separadas', s.separadas], ['Disponibles', s.disponibles], ['Avance comercial', (s.avance_ventas_pct ?? 0) + '%']];
  return <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 10, marginTop: 10}}>
    {items.map(([l, v]) => <div key={l} className="orok-card" style={{padding: 10}}><div style={{fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', opacity: .7}}>{l}</div><div style={{fontSize: 20, fontWeight: 700}}>{v ?? '—'}</div></div>)}
    {(ev?.current || ev?.kpis) && (() => { // R100 · se muestra la última versión guardada; la línea base queda como referencia
      const k = ev.current || ev.kpis, b = ev.kpis, tir = x => x ? (x.tir_accionista_pct ?? x.tir_accionista_anual ?? '—') + '%' : '—';
      const fecha = ev.updated_at ? new Date(ev.updated_at).toLocaleDateString('es-PE') : '';
      return [['Utilidad neta', money(k.utilidad_neta), b && ev.current ? 'Línea base ' + money(b.utilidad_neta) : ''], ['TIR accionista', tir(k), b && ev.current ? 'Línea base ' + tir(b) : '']].map(([l, v, sub]) =>
        <div key={l} className="orok-card" style={{padding: 10}}><div style={{fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', opacity: .7}}>{l}</div><div style={{fontSize: 20, fontWeight: 700}}>{v}</div><div style={{fontSize: 11, opacity: .7}}>{sub}{sub && ' · '}rev. {ev.revision}{fecha && ' · ' + fecha}</div></div>);
    })()}
  </div>;
}

function Chat() {
  const [evs, setEvs] = useState([]), [evId, setEvId] = useState(''), [thread, setThread] = useState(null), [q, setQ] = useState(''), [tier, setTier] = useState('default');
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false), timer = useRef(null);
  const ev = evs.find(e => e.id === evId);
  useEffect(() => { api.getMoraEvaluations().then(l => { setEvs(l); if (l[0]) setEvId(l[0].id); }).catch(e => setErr(e.message)); return () => clearTimeout(timer.current); }, []);
  const threadId = useRef({});
  async function load(tid, polls = 0) {
    try {
      const t = await api.getMoraThread({thread_id: tid}); setThread(t);
      if (t.pending.some(p => p.state !== 'failed') && polls < 80) timer.current = setTimeout(() => load(tid, polls + 1), 3000);
    } catch (e) { setErr(e.message); }
  }
  useEffect(() => { clearTimeout(timer.current); setThread(null); const tid = threadId.current[evId]; if (tid) load(tid); }, [evId]);
  async function send(text) {
    const question = (text ?? q).trim(); if (!question || !evId) return;
    setBusy(true); setErr('');
    try {
      const r = await api.askMora({evaluation_id: evId, question, tier, request_id: uuid(), thread_id: threadId.current[evId]});
      threadId.current[evId] = r.thread_id; setQ(''); clearTimeout(timer.current); await load(r.thread_id);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  const waiting = thread?.pending?.some(p => p.state !== 'failed'), failed = thread?.pending?.some(p => p.state === 'failed');
  return <div className="orok-card" style={card}>
    <h3 style={{marginTop: 0}}>M.O.R.A · Evaluador Inmobiliario</h3>
    <p style={{fontSize: 13, marginTop: 0}}>Pregunta por la evaluación de un proyecto: avance comercial, escenarios, precios o riesgos. Lo que puedes ver depende de tu rol; Gerencia y los editores asignados acceden al análisis financiero completo. Las sugerencias de cambio quedan pendientes de aprobación de Gerencia.</p>
    {!evs.length && !err && <p style={{fontSize: 13}}>Aún no hay evaluaciones cargadas. Guárdalas desde Evaluador Inmobiliario con «Guardar en el CRM», o cárgalas en Administración M.O.R.A.</p>}
    {!!evs.length && <label>Evaluación<select className="orok-input" value={evId} onChange={e => setEvId(e.target.value)}>{evs.map(e => <option key={e.id} value={e.id}>{e.project?.nombre || e.id}{e.scope === 'completo' ? ' · análisis completo' : ' · resumen'}</option>)}</select></label>}
    {ev && <Summary ev={ev}/>}
    <div aria-live="polite" style={{display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14, maxHeight: 460, overflowY: 'auto'}}>
      {(thread?.messages || []).map((m, i) => <div key={i} style={{alignSelf: m.role === 'user' ? 'flex-end' : 'stretch', maxWidth: m.role === 'user' ? '80%' : '100%', background: m.role === 'user' ? 'rgba(11,110,91,.10)' : 'transparent', border: m.role === 'user' ? 'none' : '1px solid rgba(0,0,0,.08)', borderRadius: 12, padding: '8px 12px', whiteSpace: 'pre-wrap', fontSize: 14}}>
        {m.role !== 'user' && <div style={{fontSize: 11, fontWeight: 700, letterSpacing: '.08em', opacity: .7, marginBottom: 4}}>M.O.R.A</div>}
        {m.text}
        {!!m.proposals?.length && <div style={{marginTop: 8, fontSize: 12.5}}><b>Cambios sugeridos (pendientes de Gerencia):</b><ul style={{margin: '4px 0 0 18px'}}>{m.proposals.map(p => <li key={p.id}>{p.ruta} → {String(p.valor)}{p.motivo ? ' · ' + p.motivo : ''}</li>)}</ul></div>}
        {!!m.follow_ups?.length && <div style={{display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8}}>{m.follow_ups.map(f => <button key={f} type="button" className="orok-btn orok-btn-secondary" style={{fontSize: 12, padding: '4px 10px'}} disabled={busy || waiting} onClick={() => send(f)}>{f}</button>)}</div>}
      </div>)}
      {waiting && <p role="status" style={{fontSize: 13, opacity: .75}}>M.O.R.A está analizando la consulta…</p>}
      {failed && <p role="alert" style={{fontSize: 13, color: '#b45309'}}>Una consulta no pudo completarse. Vuelve a enviarla en unos minutos.</p>}
    </div>
    <label style={{display: 'block', marginTop: 12}}>Tu consulta<textarea className="orok-input" rows={3} maxLength={2000} value={q} onChange={e => setQ(e.target.value)} placeholder="Ej.: ¿Cómo vamos frente a la línea base? · ¿Qué precio por m² necesito para 18% de margen?" onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}/></label>
    <div style={{display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 8}}>
      <label style={{display: 'flex', gap: 6, alignItems: 'center'}}>Profundidad<select className="orok-input" value={tier} onChange={e => setTier(e.target.value)}>{TIERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <button className="orok-btn orok-btn-primary" disabled={busy || !evId || !q.trim()} onClick={() => send()}>{busy ? 'Enviando…' : 'Consultar a M.O.R.A'}</button>
    </div>
    {err && <p role="alert" style={{color: '#b91c1c'}}>{err}</p>}
  </div>;
}

function Admin() {
  const [cfg, setCfg] = useState(null), [props, setProps] = useState([]), [weekly, setWeekly] = useState([]), [evs, setEvs] = useState([]);
  const [json, setJson] = useState(''), [err, setErr] = useState(''), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false), [feed, setFeed] = useState('');
  const refresh = async () => {
    const [c, p, w, e] = await Promise.all([api.getMoraConfig(), api.getMoraProposals(), api.getMoraWeekly(), api.getMoraEvaluations()]);
    setCfg(c); setProps(p); setWeekly(w); setEvs(e);
  };
  useEffect(() => { refresh().catch(e => setErr(e.message)); }, []);
  async function run(fn, ok) { setBusy(true); setErr(''); setMsg(''); try { await fn(); setMsg(ok); await refresh(); } catch (e) { setErr(e.message); } finally { setBusy(false); } }
  const setTh = (k, v) => setCfg(c => ({...c, thresholds: {...c.thresholds, [k]: v}}));
  function importEvaluation() {
    let o; try { o = JSON.parse(json); } catch { throw Error('El texto no es un JSON válido.'); }
    if (o?.p && o?.units) {
      const slug = String(o.p.nombre || 'proyecto').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      o = {id: slug, inputs: Object.fromEntries(['p', 'units', 'vu', 'inm', 'leg', 'fin', 'com', 'gg', 'part'].map(k => [k, o[k]])), analysis: {estrategia: o.estr || null, baseline: {nombre: o.base?.nombre || 'Línea base', fecha: o.base?.fecha || null}}};
    }
    return api.saveMoraEvaluation(o);
  }
  if (!cfg) return <div className="orok-card" style={card}>{err ? <p role="alert" style={{color: '#b91c1c'}}>{err}</p> : 'Cargando…'}</div>;
  return <>
    <div className="orok-card" style={card}>
      <h3 style={{marginTop: 0}}>Administración de M.O.R.A</h3>
      <p style={{fontSize: 13}}>Las consultas pasan por el flujo n8n de M.O.R.A. Con la función apagada, el CRM no entrega trabajos y la pantalla de consultas avisa que está desactivada.</p>
      <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 10}}>
        <label style={{display: 'flex', gap: 8, alignItems: 'center'}}><input type="checkbox" checked={cfg.enabled} onChange={e => setCfg({...cfg, enabled: e.target.checked})}/>Consultas activadas</label>
        <label style={{display: 'flex', gap: 8, alignItems: 'center'}}><input type="checkbox" checked={cfg.weekly_enabled} onChange={e => setCfg({...cfg, weekly_enabled: e.target.checked})}/>Lectura semanal (lunes 8:10)</label>
        <label>Consultas por persona y hora<input className="orok-input" type="number" min={1} max={200} value={cfg.max_questions_per_hour} onChange={e => setCfg({...cfg, max_questions_per_hour: e.target.value})}/></label>
        <label>Alerta: caída de utilidad (%)<input className="orok-input" type="number" value={cfg.thresholds.utilidad_pct} onChange={e => setTh('utilidad_pct', e.target.value)}/></label>
        <label>Alerta: atraso de ventas (und)<input className="orok-input" type="number" value={cfg.thresholds.unidades} onChange={e => setTh('unidades', e.target.value)}/></label>
        <label>Alerta: retraso de última venta (meses)<input className="orok-input" type="number" value={cfg.thresholds.meses} onChange={e => setTh('meses', e.target.value)}/></label>
      </div>
      <button className="orok-btn orok-btn-primary" style={{marginTop: 10}} disabled={busy} onClick={() => run(() => api.saveMoraConfig(cfg), 'Configuración guardada.')}>Guardar configuración</button>
    </div>
    <div className="orok-card" style={card}>
      <h3 style={{marginTop: 0}}>Cargar o actualizar una evaluación</h3>
      <p style={{fontSize: 13}}>Lo habitual es usar «Guardar en el CRM» dentro de Evaluador Inmobiliario. También puedes pegar aquí la "Evaluación para el CRM" (o el respaldo del proyecto) que exporta el Evaluador fuera del CRM. Si el identificador ya existe, se guarda como nueva revisión.</p>
      <textarea className="orok-input" rows={6} value={json} onChange={e => setJson(e.target.value)} placeholder='{"id":"infinity224-rev9","project":{...},"inputs":{...},"analysis":{...}}'/>
      <button className="orok-btn orok-btn-primary" style={{marginTop: 8}} disabled={busy || !json.trim()} onClick={() => run(importEvaluation, 'Evaluación guardada.')}>Guardar evaluación</button>
      {!!evs.length && <ul style={{fontSize: 13}}>{evs.map(e => <li key={e.id}><b>{e.project?.nombre}</b> · {e.id} · revisión {e.revision} · {e.summary?.vendidas} vendidas, {e.summary?.separadas} separadas de {e.summary?.unidades_total}
        {' '}<button type="button" className="orok-btn orok-btn-secondary" style={{fontSize: 12, padding: '2px 8px'}} onClick={() => run(async () => setFeed(JSON.stringify(await api.getMoraSalesFeed(e.id), null, 1)), 'Ventas del CRM listas para el Evaluador.')}>Ventas para el Evaluador</button></li>)}</ul>}
      {feed && <><label>Ventas registradas (contrato crm.ventas@1) · dentro del CRM, Evaluador Inmobiliario las trae con «Traer ventas del CRM»<textarea className="orok-input" rows={6} readOnly value={feed}/></label></>}
    </div>
    <div className="orok-card" style={card}>
      <h3 style={{marginTop: 0}}>Propuestas de M.O.R.A pendientes</h3>
      {!props.length && <p style={{fontSize: 13}}>No hay propuestas pendientes.</p>}
      {props.map(p => <div key={p.id} style={{borderTop: '1px solid rgba(0,0,0,.08)', padding: '8px 0', fontSize: 13}}>
        <b>{p.ruta}</b> → {String(p.valor)} · {p.evaluation_id}<br/><span style={{opacity: .8}}>{p.motivo}</span><br/><span style={{opacity: .6}}>Pedido por {p.solicitado_por || '—'} · {new Date(p.propuesto_at).toLocaleString('es-PE')}</span>
        <div style={{display: 'flex', gap: 8, marginTop: 6}}><button className="orok-btn orok-btn-primary" disabled={busy} onClick={() => run(() => api.decideMoraProposal(p.id, {decision: 'aprobar'}), 'Propuesta aprobada: la evaluación quedó en una nueva revisión.')}>Aprobar</button><button className="orok-btn orok-btn-secondary" disabled={busy} onClick={() => run(() => api.decideMoraProposal(p.id, {decision: 'rechazar'}), 'Propuesta rechazada.')}>Rechazar</button></div>
      </div>)}
    </div>
    <div className="orok-card" style={card}>
      <h3 style={{marginTop: 0}}>Lecturas semanales</h3>
      {!weekly.length && <p style={{fontSize: 13}}>Aún no hay lecturas.</p>}
      {weekly.map(w => <details key={w.week} style={{fontSize: 13, marginTop: 8}}><summary><b>{w.week}</b> · {w.alerts?.length || 0} alertas</summary>
        {w.summary && <p style={{whiteSpace: 'pre-wrap'}}>{w.summary}</p>}
        <ul>{(w.alerts || []).map((a, i) => <li key={i}>{a.level === 'alta' ? 'Alta' : 'Media'} · {a.project_id}: {a.text}</li>)}</ul></details>)}
    </div>
    {err && <p role="alert" style={{color: '#b91c1c'}}>{err}</p>}{msg && <p role="status">{msg}</p>}
  </>;
}
export default function MoraPanel({section}) { return section === 'moraAdmin' ? <Admin/> : <Chat/>; }
