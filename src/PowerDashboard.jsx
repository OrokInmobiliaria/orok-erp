import React, {useEffect, useMemo, useRef, useState} from 'react';
import './bi.css';
import {buildModel, options, preset, FUNNEL} from './biModel.mjs';

const nf = new Intl.NumberFormat('es-PE');
const num = v => v === null || v === undefined ? '—' : nf.format(Math.round(v));
const pct = v => v === null || v === undefined ? '—' : (v * 100).toLocaleString('es-PE', {maximumFractionDigits: 1}) + '%';
const sol = v => v === null || v === undefined ? '—' : 'S/ ' + Math.round(v).toLocaleString('es-PE');
const short = d => { const [y, m, day] = d.split('-'); return day + '/' + m; };
const PRESETS = [['7d', '7 días'], ['30d', '30 días'], ['month', 'Este mes'], ['90d', '90 días'], ['year', 'Año'], ['all', 'Todo']];
const DIM_LABEL = {source: 'Fuente', project: 'Proyecto', owner: 'Responsable', campaign: 'Campaña', stage: 'Etapa'};

function Delta({value, inverse}) {
  if (value === null || value === undefined) return <div className="d">Sin período anterior</div>;
  const good = inverse ? value < 0 : value > 0, flat = value === 0;
  return <div className={'d ' + (flat ? '' : good ? 'up' : 'down')}>{flat ? '＝' : value > 0 ? '▲' : '▼'} {pct(Math.abs(value))} <span style={{fontWeight: 400}}>vs. anterior</span></div>;
}
function Kpi({title, value, delta, inverse}) { return <div className="bi-kpi"><div className="t">{title}</div><div className="v">{value}</div>{delta !== false && <Delta value={delta} inverse={inverse}/>}</div>; }

function Card({title, sub, span, table, children, note}) {
  const [asTable, setAsTable] = useState(false);
  return <section className={'bi-card c-' + span} aria-label={title}>
    <div className="bi-head"><div><h3>{title}</h3>{sub && <p className="sub">{sub}</p>}</div>{table && <button className="bi-link" onClick={() => setAsTable(v => !v)} aria-pressed={asTable}>{asTable ? 'Ver gráfico' : 'Ver tabla'}</button>}</div>
    {asTable ? table : children}{note && <p className="bi-note">{note}</p>}
  </section>;
}

function Bars({rows, value, label = r => r.name, fmt = num, selected, onPick, cls = ''}) {
  const max = Math.max(1, ...rows.map(value));
  if (!rows.length) return <div className="bi-empty">Sin datos para estos filtros.</div>;
  return <div className={'bi-bars ' + cls}>{rows.map(r => {
    const sel = selected === r.name;
    return <button key={r.name} className={'bi-bar' + (sel ? ' sel' : selected ? ' dim' : '')} onClick={() => onPick && onPick(r.name)} aria-pressed={sel} title={onPick ? 'Filtrar por ' + r.name : undefined}>
      <span className="lab">{label(r)}</span><span className="track"><span className="fill" style={{display: 'block', width: (value(r) / max * 100) + '%'}}/></span><span className="num">{fmt(value(r))}</span></button>;
  })}</div>;
}

function Trend({rows}) {
  const box = useRef(null), wrap = useRef(null), [hover, setHover] = useState(null), [W, setW] = useState(640);
  useEffect(() => { if (!wrap.current || typeof ResizeObserver === 'undefined') return; const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width)))); ro.observe(wrap.current); return () => ro.disconnect(); }, [rows.length > 0]);
  if (!rows.length) return <div ref={wrap} className="bi-empty">Sin leads con fecha en el período.</div>;
  const H = W < 480 ? 200 : 240, L = 34, R = 24, T = 12, B = 26, max = Math.max(1, ...rows.map(r => r.leads));
  const nice = Math.ceil(max / 4) * 4 || 4, x = i => L + (rows.length === 1 ? (W - L - R) / 2 : i * (W - L - R) / (rows.length - 1)), y = v => T + (H - T - B) * (1 - v / nice);
  const path = k => rows.map((r, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(r[k]).toFixed(1)).join(' ');
  const ticks = [0, nice / 4, nice / 2, nice * 3 / 4, nice];
  const step = Math.max(1, Math.ceil(rows.length / (W < 480 ? 4 : 8)));
  function move(e) { const rect = box.current.getBoundingClientRect(), px = (e.clientX - rect.left) / rect.width * W; let best = 0; rows.forEach((_, i) => { if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i; }); setHover(best); }
  const h = hover !== null ? rows[hover] : null;
  return <div ref={wrap} style={{position: 'relative'}}>
    <div className="bi-legend"><span><i style={{background: 'var(--s1)'}}/>Leads</span><span><i style={{background: 'var(--s2)'}}/>Citas</span></div>
    <svg ref={box} viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Leads y citas por semana" onMouseMove={move} onMouseLeave={() => setHover(null)} onTouchStart={e => move(e.touches[0])} style={{display: 'block', touchAction: 'pan-y'}}>
      {ticks.map(t => <g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--bi-grid)"/><text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize="10" fill="var(--bi-ink-3)">{t}</text></g>)}
      {rows.map((r, i) => i % step === 0 && <text key={r.week} x={x(i)} y={H - 8} textAnchor={i === rows.length - 1 && rows.length > 1 ? 'end' : i === 0 && rows.length > 1 ? 'start' : 'middle'} fontSize="10" fill="var(--bi-ink-3)">{short(r.week)}</text>)}
      <path d={path('leads')} fill="none" stroke="var(--s1)" strokeWidth="2" strokeLinejoin="round"/>
      <path d={path('appointments')} fill="none" stroke="var(--s2)" strokeWidth="2" strokeLinejoin="round"/>
      {rows.length <= 20 && rows.map((r, i) => <g key={'p' + i}><circle cx={x(i)} cy={y(r.leads)} r="4" fill="var(--s1)" stroke="#fff" strokeWidth="2"/><circle cx={x(i)} cy={y(r.appointments)} r="4" fill="var(--s2)" stroke="#fff" strokeWidth="2"/></g>)}
      <text x={x(rows.length - 1)} y={y(rows.at(-1).leads) - 8} textAnchor="end" fontSize="11" fontWeight="700" fill="var(--bi-ink)">{rows.at(-1).leads}</text>
      {h && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="var(--bi-ink-3)" strokeDasharray="3 3"/>}
    </svg>
    {h && <div className="bi-tip" style={{left: Math.min(Math.max(x(hover) / W * 100, 22), 78) + '%', top: 30}}>Semana del {short(h.week)} · {h.leads} leads · {h.appointments} citas · {h.sales} ventas</div>}
  </div>;
}

function Funnel({rows, selected, onPick}) {
  const max = Math.max(1, rows[0]?.count || 0);
  return <div className="bi-bars bi-funnel">{rows.map((r, i) => <button key={r.stage} className={'bi-bar' + (selected === r.stage ? ' sel' : selected ? ' dim' : '')} onClick={() => onPick(r.stage)} aria-pressed={selected === r.stage} title={'Filtrar leads que llegaron a ' + r.stage}>
    <span className="lab">{r.stage}</span><span className="track"><span className="fill" style={{display: 'block', width: (r.count / max * 100) + '%'}}/></span><span className="num">{num(r.count)} <small style={{fontWeight: 500, color: 'var(--bi-ink-3)'}}>{i ? pct(r.step) : ''}</small></span></button>)}</div>;
}

function Heat({matrix, onPick}) {
  const max = Math.max(1, ...matrix.flatMap(r => r.cells));
  const shade = v => { const t = v / max; const a = [205, 226, 251], b = [13, 54, 107]; const c = a.map((x, i) => Math.round(x + (b[i] - x) * t)); return {background: `rgb(${c.join(',')})`, color: t > .5 ? '#fff' : 'var(--bi-ink)'}; };
  if (!matrix.length) return <div className="bi-empty">Sin datos.</div>;
  return <div className="bi-scroll"><table className="bi-table bi-heat"><thead><tr><th>Fuente</th>{FUNNEL.map(s => <th key={s}>{s}</th>)}</tr></thead>
    <tbody>{matrix.map(r => <tr key={r.name} className="click" onClick={() => onPick(r.name)}><td>{r.name}</td>{r.cells.map((v, i) => <td key={i} className="cell" style={{...shade(v), textAlign: 'center'}}>{v}</td>)}</tr>)}</tbody></table></div>;
}

function GroupTable({rows, onPick, spend}) {
  return <div className="bi-scroll"><table className="bi-table"><thead><tr><th>Nombre</th><th>Leads</th><th>Citas</th><th>Asistidas</th><th>Ventas</th><th>Conversión</th>{spend && <><th>Inversión</th><th>CPL</th></>}</tr></thead>
    <tbody>{rows.map(r => <tr key={r.name} className={onPick ? 'click' : ''} onClick={() => onPick && onPick(r.name)}><td>{r.name}</td><td>{num(r.leads)}</td><td>{num(r.appointments)}</td><td>{num(r.attended)}</td><td>{num(r.sales)}</td><td>{pct(r.conversion)}</td>{spend && <><td>{sol(r.spend)}</td><td>{sol(r.cpl)}</td></>}</tr>)}</tbody></table></div>;
}

function csv(model) {
  const cell = v => '"' + String(v ?? '').replace(/^[=+@-]/, "'$&").replace(/"/g, '""') + '"';
  const rows = [['Dimensión', 'Nombre', 'Leads', 'Citas', 'Asistidas', 'Ventas', 'Conversión', 'Inversión', 'CPL']];
  for (const [label, list] of [['Fuente', model.bySource], ['Responsable', model.byOwner], ['Campaña', model.byCampaign]]) for (const r of list) rows.push([label, r.name, r.leads, r.appointments, r.attended, r.sales, r.conversion ?? '', r.spend ?? '', r.cpl ?? '']);
  return '﻿' + rows.map(r => r.map(cell).join(';')).join('\r\n');
}

export default function PowerDashboard({leads = [], units = [], expenses = [], onClassic}) {
  const [range, setRange] = useState(() => ({name: 'month', ...preset('month')}));
  const [f, setF] = useState({source: '', project: '', owner: '', campaign: '', stage: ''}), [openFilters, setOpenFilters] = useState(false);
  const filters = {...f, from: range.from, to: range.to};
  const model = useMemo(() => buildModel({leads, units, expenses}, filters), [leads, units, expenses, JSON.stringify(filters)]);
  const opts = useMemo(() => options(leads), [leads]);
  const toggle = (k, v) => setF(x => ({...x, [k]: x[k] === v ? '' : v}));
  const active = Object.entries(f).filter(([, v]) => v);
  const k = model.kpis;
  function download() { const b = new Blob([csv(model)], {type: 'text/csv;charset=utf-8'}), u = URL.createObjectURL(b), a = document.createElement('a'); a.href = u; a.download = `panel-${range.from || 'todo'}-${range.to || ''}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1000); }

  return <div className="bi-root">
    <button className="bi-filter-toggle glass" aria-expanded={openFilters} onClick={() => setOpenFilters(v => !v)}>Filtros · {range.name === 'custom' ? `${range.from} a ${range.to}` : (PRESETS.find(p => p[0] === range.name) || [])[1]}{active.length ? ` · ${active.length} activo(s)` : ''} <span aria-hidden="true">{openFilters ? '▴' : '▾'}</span></button>
    <div className={'bi-slicers glass' + (openFilters ? ' open' : '')} role="region" aria-label="Filtros del panel">
      <div><div style={{fontSize: 11, fontWeight: 600, color: 'var(--bi-ink-2)', marginBottom: 4}}>Período</div>
        <div className="bi-seg" role="group" aria-label="Período">{PRESETS.map(([id, label]) => <button key={id} aria-pressed={range.name === id} onClick={() => setRange({name: id, ...preset(id)})}>{label}</button>)}</div></div>
      <label>Desde<input type="date" value={range.from} onChange={e => setRange(r => ({...r, name: 'custom', from: e.target.value}))}/></label>
      <label>Hasta<input type="date" value={range.to} onChange={e => setRange(r => ({...r, name: 'custom', to: e.target.value}))}/></label>
      {['source', 'project', 'owner', 'campaign'].map(key => <label key={key}>{DIM_LABEL[key]}<select value={f[key]} onChange={e => setF(x => ({...x, [key]: e.target.value}))}><option value="">Todos</option>{opts[key].map(o => <option key={o}>{o}</option>)}</select></label>)}
      <div style={{display: 'flex', gap: 6}}>
        <button className="bi-link" onClick={download}>Exportar CSV</button>
        {onClassic && <button className="bi-link" onClick={onClassic}>Vista clásica</button>}
      </div>
      {active.length > 0 && <div className="bi-chips">{active.map(([key, v]) => <button key={key} className="bi-chip" onClick={() => setF(x => ({...x, [key]: ''}))} aria-label={'Quitar filtro ' + DIM_LABEL[key]}>{DIM_LABEL[key]}: <strong>{v}</strong> ✕</button>)}<button className="bi-chip" onClick={() => setF({source: '', project: '', owner: '', campaign: '', stage: ''})}>Limpiar todo</button></div>}
    </div>

    <div className="bi-kpis">
      <Kpi title="Leads" value={num(k.leads.value)} delta={k.leads.delta}/>
      <Kpi title="Citas agendadas" value={num(k.appointments.value)} delta={k.appointments.delta}/>
      <Kpi title="Citas asistidas" value={num(k.attended.value)} delta={k.attended.delta}/>
      <Kpi title="Ventas" value={num(k.sales.value)} delta={k.sales.delta}/>
      <Kpi title="Conversión lead → venta" value={pct(k.conversion.value)} delta={false}/>
      <Kpi title="Inversión registrada" value={sol(k.spend.value)} delta={k.spend.delta} inverse/>
      <Kpi title="Costo por lead" value={sol(k.cpl.value)} delta={false}/>
      <Kpi title="Costo por cita" value={sol(k.cost_per_appointment.value)} delta={false}/>
    </div>

    <div className="bi-grid">
      <Card span={8} title="Leads y citas por semana" sub="Semanas de lunes a domingo (hora de Lima)" table={<div className="bi-scroll"><table className="bi-table"><thead><tr><th>Semana</th><th>Leads</th><th>Citas</th><th>Ventas</th></tr></thead><tbody>{model.trend.map(r => <tr key={r.week}><td>{r.week}</td><td>{r.leads}</td><td>{r.appointments}</td><td>{r.sales}</td></tr>)}</tbody></table></div>}
        note={model.undated_excluded ? `${model.undated_excluded} lead(s) sin fecha de ingreso quedan fuera al filtrar por período.` : null}><Trend rows={model.trend}/></Card>
      <Card span={4} title="Embudo" sub="Leads que llegaron a cada etapa · % sobre la etapa anterior" table={<table className="bi-table"><thead><tr><th>Etapa</th><th>Leads</th><th>% del total</th><th>% paso</th></tr></thead><tbody>{model.funnel.map(r => <tr key={r.stage}><td>{r.stage}</td><td>{r.count}</td><td>{pct(r.of_total)}</td><td>{pct(r.step)}</td></tr>)}</tbody></table>}>
        <Funnel rows={model.funnel} selected={f.stage} onPick={v => toggle('stage', v)}/></Card>
      <Card span={6} title="Leads por fuente" sub="Toca una barra para filtrar todo el panel" table={<GroupTable rows={model.bySource} onPick={v => toggle('source', v)} spend/>}>
        <Bars rows={model.bySource} value={r => r.leads} selected={f.source} onPick={v => toggle('source', v)}/></Card>
      <Card span={6} title="Ventas y citas por responsable" sub="Barras: citas agendadas · toca para filtrar" table={<GroupTable rows={model.byOwner} onPick={v => toggle('owner', v)}/>}>
        <Bars rows={model.byOwner} value={r => r.appointments} label={r => `${r.name} · ${r.sales} venta(s)`} selected={f.owner} onPick={v => toggle('owner', v)}/></Card>
      <Card span={8} title="Matriz fuente × etapa" sub="Intensidad = cantidad de leads · toca una fila para filtrar"><Heat matrix={model.matrix} onPick={v => toggle('source', v)}/></Card>
      <Card span={4} title="Inventario" sub="Unidades del proyecto (no depende de los filtros de leads)">
        <div style={{display: 'flex', gap: 18, flexWrap: 'wrap'}}><div><div style={{fontSize: 26, fontWeight: 800}}>{model.inventory.available}</div><div className="sub">disponibles · {sol(model.inventory.available_value)}</div></div><div><div style={{fontSize: 26, fontWeight: 800}}>{model.inventory.sold}</div><div className="sub">vendidas · {sol(model.inventory.sold_value)}</div></div></div>
        <div className="bi-inv" role="img" aria-label={`${pct(model.inventory.sold_rate)} vendido`}><span style={{flex: model.inventory.sold || 0, background: 'var(--accent)'}}/><span style={{flex: model.inventory.available || 1, background: 'var(--seq-1)'}}/></div>
        <div className="bi-legend"><span><i style={{background: 'var(--accent)'}}/>Vendido {pct(model.inventory.sold_rate)}</span><span><i style={{background: 'var(--seq-1)'}}/>Disponible</span></div></Card>
      <Card span={12} title="Campañas" sub="Inversión y costo por lead según gastos registrados en Gastos Mkt.">
        <GroupTable rows={model.byCampaign} onPick={v => toggle('campaign', v)} spend/></Card>
    </div>
  </div>;
}
