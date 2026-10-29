import React, {useMemo, useState} from 'react';
import './bi.css';
import {options} from './biModel.mjs';
import {weeklyModel, WEEKDAYS} from './weeklyBiModel.mjs';

// R33 · Tablero semanal tipo Power BI: semana elegida frente a la anterior y al promedio de 4 semanas.
const nf = new Intl.NumberFormat('es-PE');
const num = v => v === null || v === undefined ? '—' : nf.format(Math.round(v));
const pct = v => v === null || v === undefined ? '—' : (v * 100).toLocaleString('es-PE', {maximumFractionDigits: 1}) + '%';
const sol = v => v === null || v === undefined ? '—' : 'S/ ' + Math.round(v).toLocaleString('es-PE');

function Delta({value, inverse, points}) {
  if (value === null || value === undefined) return <div className="d">Sin semana anterior</div>;
  const good = inverse ? value < 0 : value > 0, flat = Math.abs(value) < 1e-9;
  const txt = points ? (Math.abs(value) * 100).toLocaleString('es-PE', {maximumFractionDigits: 1}) + ' pp' : pct(Math.abs(value));
  return <div className={'d ' + (flat ? '' : good ? 'up' : 'down')}>{flat ? '＝' : value > 0 ? '▲' : '▼'} {txt} <span style={{fontWeight: 400}}>vs. semana anterior</span></div>;
}
function Kpi({title, value, k, fmt = num, inverse, points}) {
  return <div className="bi-kpi"><div className="t">{title}</div><div className="v">{value}</div><Delta value={k.delta} inverse={inverse} points={points}/>
    {k.avg4 !== null && k.avg4 !== undefined && <div className="d">Promedio 4 semanas: {fmt(k.avg4)}</div>}</div>;
}
function Card({title, sub, span, children, note}) {
  return <section className={'bi-card c-' + span} aria-label={title}><div className="bi-head"><div><h3>{title}</h3>{sub && <p className="sub">{sub}</p>}</div></div>{children}{note && <p className="bi-note">{note}</p>}</section>;
}

// Barras por semana con líneas superpuestas; clic en una barra elige la semana.
function Combo({weeks, bar, lines, selected, onPick, fmtBar = num, fmtLine = num, label}) {
  const W = 720, H = 240, pl = 44, pr = 44, pt = 14, pb = 34, n = weeks.length, bw = (W - pl - pr) / n;
  const mb = Math.max(1, ...weeks.map(w => w[bar.key] || 0)), ml = Math.max(1e-9, ...lines.flatMap(l => weeks.map(w => w[l.key] ?? 0)));
  const yb = v => pt + (H - pt - pb) * (1 - v / mb), yl = v => pt + (H - pt - pb) * (1 - v / ml);
  const [hover, setHover] = useState(null);
  return <div style={{position: 'relative'}}>
    <div className="bi-legend"><span><i style={{background: bar.color}}/>{bar.name}</span>{lines.map(l => <span key={l.key}><i style={{background: l.color}}/>{l.name}</span>)}</div>
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={label}>
      {[0, .5, 1].map(f => <g key={f}><line x1={pl} x2={W - pr} y1={yb(mb * f)} y2={yb(mb * f)} stroke="var(--bi-grid)"/><text x={pl - 6} y={yb(mb * f) + 4} fontSize="10" textAnchor="end" fill="var(--bi-ink-3)">{fmtBar(mb * f)}</text>
        {lines.length > 0 && <text x={W - pr + 6} y={yl(ml * f) + 4} fontSize="10" fill="var(--bi-ink-3)">{fmtLine(ml * f)}</text>}</g>)}
      {weeks.map((w, i) => <g key={w.week} style={{cursor: 'pointer'}} onClick={() => onPick(i)} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
        <rect x={pl + bw * i} y={pt} width={bw} height={H - pt - pb} fill={i === selected ? 'rgba(42,120,214,.08)' : 'transparent'}/>
        <rect x={pl + bw * i + bw * .18} y={yb(w[bar.key] || 0)} width={bw * .64} height={Math.max(0, H - pb - yb(w[bar.key] || 0))} rx="3" fill={bar.color} opacity={i === selected ? 1 : .55}/>
        {(i % Math.ceil(n / 8) === 0 || i === selected) && <text x={pl + bw * (i + .5)} y={H - 12} fontSize="10" textAnchor="middle" fill={i === selected ? 'var(--bi-ink)' : 'var(--bi-ink-3)'} fontWeight={i === selected ? 700 : 400}>{w.label}</text>}
      </g>)}
      {lines.map(l => <g key={l.key}><polyline fill="none" stroke={l.color} strokeWidth="2.2" points={weeks.map((w, i) => `${pl + bw * (i + .5)},${yl(w[l.key] ?? 0)}`).join(' ')}/>
        {weeks.map((w, i) => <circle key={i} cx={pl + bw * (i + .5)} cy={yl(w[l.key] ?? 0)} r={i === selected ? 4 : 2.5} fill={l.color}/>)}</g>)}
    </svg>
    {hover !== null && <div className="bi-tip" style={{left: ((pl + bw * (hover + .5)) / W * 100) + '%', top: 30}}>{weeks[hover].label}{weeks[hover].partial ? ' (en curso)' : ''} · {bar.name}: {fmtBar(weeks[hover][bar.key])}{lines.map(l => ` · ${l.name}: ${fmtLine(weeks[hover][l.key])}`).join('')}</div>}
  </div>;
}
function Absorption({weeks, total}) {
  const W = 720, H = 200, pl = 40, pr = 12, pt = 14, pb = 28, n = weeks.length, mx = Math.max(1, total, ...weeks.map(w => w.units_sold_acc));
  const x = i => pl + (W - pl - pr) * (n <= 1 ? 0 : i / (n - 1)), y = v => pt + (H - pt - pb) * (1 - v / mx);
  const pts = weeks.map((w, i) => `${x(i)},${y(w.units_sold_acc)}`).join(' ');
  return <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Unidades vendidas acumuladas">
    {total > 0 && <><line x1={pl} x2={W - pr} y1={y(total)} y2={y(total)} stroke="var(--bi-ink-3)" strokeDasharray="4 4"/><text x={W - pr} y={y(total) - 5} fontSize="10" textAnchor="end" fill="var(--bi-ink-3)">Inventario total: {total}</text></>}
    <polygon points={`${x(0)},${y(0)} ${pts} ${x(n - 1)},${y(0)}`} fill="var(--s3)" opacity=".15"/><polyline points={pts} fill="none" stroke="var(--s3)" strokeWidth="2.4"/>
    <circle cx={x(n - 1)} cy={y(weeks[n - 1].units_sold_acc)} r="4" fill="var(--s3)"/><text x={x(n - 1) - 6} y={y(weeks[n - 1].units_sold_acc) - 8} fontSize="11" textAnchor="end" fontWeight="700" fill="var(--bi-ink)">{weeks[n - 1].units_sold_acc} vendidas</text>
    {weeks.map((w, i) => i % Math.ceil(n / 8) === 0 && <text key={i} x={x(i)} y={H - 8} fontSize="10" textAnchor="middle" fill="var(--bi-ink-3)">{w.label}</text>)}
    <text x={pl - 6} y={y(0) + 4} fontSize="10" textAnchor="end" fill="var(--bi-ink-3)">0</text>
  </svg>;
}
function HBars({rows, color = 'var(--s1)', fmt = num, cls = ''}) {
  const mx = Math.max(1, ...rows.map(r => r.v));
  return <div className={'bi-bars ' + cls}>{rows.map(r => <div key={r.l} className="bi-bar" style={{cursor: 'default'}}><span className="lab">{r.l}</span><span className="track"><span className="fill" style={{width: (r.v / mx * 100) + '%', background: color, display: 'block'}}/></span><span className="num">{fmt(r.v)}</span></div>)}</div>;
}

export default function WeeklyBI({leads = [], units = [], expenses = [], separations = []}) {
  const [weeksN, setWeeksN] = useState(12), [filters, setFilters] = useState({}), [selected, setSelected] = useState(null);
  const opts = useMemo(() => options(leads), [leads]);
  const m = useMemo(() => weeklyModel({leads, units, expenses, separations}, {weeks: weeksN, filters, selected: selected ?? undefined}), [leads, units, expenses, separations, weeksN, filters, selected]);
  const w = m.weeks[m.selected], k = m.kpis, heatMax = Math.max(1, ...m.heat.flatMap(h => h.cells));
  return <div className="bi-root">
    <div className="bi-slicers orok-card" role="group" aria-label="Filtros del tablero semanal">
      <div><div style={{fontSize: 11, fontWeight: 600, color: 'var(--bi-ink-2)', marginBottom: 4}}>Semanas</div><div className="bi-seg">{[8, 12, 26].map(v => <button key={v} aria-pressed={weeksN === v} onClick={() => { setWeeksN(v); setSelected(null); }}>{v}</button>)}</div></div>
      {[['project', 'Proyecto'], ['source', 'Fuente'], ['campaign', 'Campaña'], ['owner', 'Responsable']].map(([key, label]) => <label key={key}>{label}<select value={filters[key] || ''} onChange={e => setFilters(f => ({...f, [key]: e.target.value}))}><option value="">Todos</option>{(opts[key] || []).map(o => <option key={o}>{o}</option>)}</select></label>)}
      <label>Semana analizada<select value={m.selected} onChange={e => setSelected(Number(e.target.value))}>{m.weeks.map((x, i) => <option key={x.week} value={i}>{x.label}{x.partial ? ' (en curso)' : ''}</option>).reverse()}</select></label>
    </div>
    <h2 style={{margin: '4px 0 10px', fontSize: 20}}>Semana {w.label}{w.partial ? ' · en curso' : ''}</h2>
    <div className="bi-kpis">
      <Kpi title="Leads captados" value={num(k.leads.value)} k={k.leads}/>
      <Kpi title="Citas agendadas" value={num(k.appointments.value)} k={k.appointments}/>
      <Kpi title="Citas asistidas" value={num(k.attended.value)} k={k.attended}/>
      <Kpi title="Separaciones" value={num(k.separations.value)} k={k.separations}/>
      <Kpi title="Ventas cerradas" value={num(k.sales.value)} k={k.sales}/>
      <Kpi title="Monto vendido" value={sol(k.sales_value.value)} k={k.sales_value} fmt={sol}/>
      <Kpi title="Inversión en marketing" value={sol(k.spend.value)} k={k.spend} fmt={sol} inverse/>
      <Kpi title="Costo por lead" value={sol(k.cpl.value)} k={k.cpl} fmt={sol} inverse/>
      <Kpi title="Leads que llegan a cita" value={pct(k.appt_rate.value)} k={k.appt_rate} points/>
    </div>
    <div className="bi-grid">
      <Card title="Captación y resultados por semana" sub="Barras: leads captados. Líneas: citas de esos leads y ventas cerradas en la semana. Haz clic en una semana para analizarla." span={8}>
        <Combo weeks={m.weeks} bar={{key: 'leads', name: 'Leads', color: 'var(--s1)'}} lines={[{key: 'appointments', name: 'Citas', color: 'var(--s2)'}, {key: 'sales', name: 'Ventas', color: 'var(--s3)'}]} selected={m.selected} onPick={setSelected} label="Leads, citas y ventas por semana"/>
      </Card>
      <Card title="Lectura de la semana" span={4}>
        <ul style={{margin: 0, paddingLeft: 18, display: 'grid', gap: 8, fontSize: 13}}>{m.insights.map((x, i) => <li key={i} style={{color: x.tone === 'down' ? 'var(--bad)' : x.tone === 'up' ? 'var(--good)' : 'inherit'}}><span style={{color: 'var(--bi-ink)'}}>{x.text}</span></li>)}</ul>
        {!m.insights.length && <p className="bi-empty">Sin datos suficientes en esta semana.</p>}
      </Card>
      <Card title="Embudo de la semana" sub="Leads captados en la semana según la etapa que ya alcanzaron" span={4}>
        <HBars rows={m.funnel.map(f => ({l: f.stage, v: f.count}))} cls="bi-funnel"/>
      </Card>
      <Card title="Inversión y costo por lead" sub="Barras: inversión en marketing registrada. Línea: costo por lead." span={8}>
        <Combo weeks={m.weeks} bar={{key: 'spend', name: 'Inversión', color: 'var(--s4)'}} lines={[{key: 'cpl', name: 'Costo por lead', color: 'var(--s2)'}]} selected={m.selected} onPick={setSelected} fmtBar={sol} fmtLine={sol} label="Inversión y costo por lead por semana"/>
      </Card>
      <Card title="Leads por fuente y semana" sub="Intensidad de color según el número de leads" span={8}>
        <div className="bi-scroll"><table className="bi-table bi-heat"><thead><tr><th>Fuente</th>{m.weeks.map((x, i) => <th key={x.week} style={{color: i === m.selected ? 'var(--bi-ink)' : undefined}}>{x.label.split(' ')[0]}</th>)}<th>Total</th></tr></thead>
          <tbody>{m.heat.map(h => <tr key={h.name}><td>{h.name}</td>{h.cells.map((c, i) => <td key={i} className="cell" style={{background: c ? `rgba(42,120,214,${.12 + .78 * c / heatMax})` : 'transparent', color: c / heatMax > .55 ? '#fff' : undefined, outline: i === m.selected ? '2px solid var(--s1)' : 'none'}}>{c || ''}</td>)}<td><b>{h.total}</b></td></tr>)}</tbody></table></div>
        {!m.heat.length && <p className="bi-empty">No hay leads en el período.</p>}
      </Card>
      <Card title="Día de entrada de los leads" sub={`Total del período de ${weeksN} semanas`} span={4}>
        <HBars rows={m.byDay.map((v, i) => ({l: WEEKDAYS[i], v}))} color="var(--s5)"/>
      </Card>
      <Card title="Asesores en la semana" sub="Leads de la semana por responsable y la etapa que alcanzaron" span={6}>
        <div className="bi-scroll"><table className="bi-table"><thead><tr><th>Responsable</th><th>Leads</th><th>Contactados</th><th>Citas</th><th>Asistidas</th><th>Separación</th><th>Venta</th></tr></thead>
          <tbody>{m.owners.map(o => <tr key={o.name}><td>{o.name}</td><td>{o.leads}</td><td>{o.contacted}</td><td>{o.appointments}</td><td>{o.attended}</td><td>{o.separations}</td><td>{o.sales}</td></tr>)}</tbody></table></div>
        {!m.owners.length && <p className="bi-empty">Sin leads asignados en esta semana.</p>}
      </Card>
      <Card title="Absorción del inventario" sub="Unidades vendidas acumuladas frente al inventario total" span={6} note="Usa la fecha de venta de cada unidad del Inventario.">
        <Absorption weeks={m.weeks} total={m.totalUnits}/>
      </Card>
    </div>
    <p className="bi-note">Semanas de lunes a domingo, hora de Lima, del {m.range.from} al {m.range.to}. Citas y embudo siguen a los leads captados en cada semana; separaciones y ventas son las confirmadas o cerradas dentro de la semana. Una semana en curso no está completa.</p>
  </div>;
}
