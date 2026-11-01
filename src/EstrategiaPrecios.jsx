import React, {useEffect, useMemo, useState} from 'react';
// R48 · Ventas › Estrategia de precios (solo Gerencia).
// Línea base del Excel de estrategia o del Evaluador; avance real desde separaciones y ventas del CRM; precios sugeridos
// por etapa y por brecha contra la meta. Aplicar precios cambia la lista de Inventario con respaldo e historial.
const db = new Proxy({}, {get: (_, k) => (...a) => window.crmDB[k](...a)});
const S = v => v == null ? '—' : 'S/ ' + Math.round(Number(v)).toLocaleString('es-PE');
const P = v => v == null ? '—' : Number(v).toLocaleString('es-PE', {maximumFractionDigits: 2}) + ' %';
const N = v => v == null ? '—' : Number(v).toLocaleString('es-PE', {maximumFractionDigits: 2});
const tone = v => v >= 0 ? '#166534' : '#991b1b';

function cellValue(c) { const v = c?.value; if (v && typeof v === 'object') return v.result ?? v.text ?? (v.richText ? v.richText.map(r => r.text).join('') : null); return v; }
function loadExcelJS() {
  if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
  return new Promise((ok, fail) => { const s = document.createElement('script'); s.src = '/evaluador/exceljs.min.js'; s.onload = () => ok(window.ExcelJS); s.onerror = () => fail(Error('No se pudo cargar el lector de Excel.')); document.head.appendChild(s); });
}
// Lee el Excel de estrategia (hojas «Cuadro final» y «Resumen»). Usa los valores calculados que guarda Excel.
async function leerExcel(file) {
  const ExcelJS = await loadExcelJS(), wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const cf = wb.worksheets.find(w => /cuadro\s*final/i.test(w.name)), rs = wb.worksheets.find(w => /resumen/i.test(w.name));
  if (!cf) throw Error('El Excel no tiene la hoja «Cuadro final» con la lista de precios por unidad.');
  let header = 0; cf.eachRow((row, i) => { if (!header && /^\s*unidad\s*$/i.test(String(cellValue(row.getCell(1)) || '')) && /tipo|piso|[aá]rea/i.test(String(cellValue(row.getCell(2)) || '') + String(cellValue(row.getCell(4)) || ''))) header = i; });
  if (!header) throw Error('No encontré la fila de títulos (Unidad, Tipo, Piso, Área…) en «Cuadro final».');
  const unidades = [];
  for (let i = header + 1; i <= cf.rowCount; i++) {
    const r = cf.getRow(i), u = cellValue(r.getCell(1));
    if (!u || /total/i.test(String(u))) break;
    unidades.push({unidad: String(u), codigo: String(u), tipo: cellValue(r.getCell(2)), piso: cellValue(r.getCell(3)), area: cellValue(r.getCell(4)), ancla: cellValue(r.getCell(5)), precio_base: cellValue(r.getCell(6))});
  }
  const v = (ws, ref) => ws ? cellValue(ws.getCell(ref)) : null;
  // «Estrategia de Reserva» del Cuadro final: «1% y darle un descuento de S/30,000» (preventa) y «S/1,500 y … S/20,000» (reserva).
  const montos = t => (String(t || '').match(/S\/\s*[\d.,]+/g) || []).map(x => Number(x.replace(/[^\d]/g, '')));
  const estr = []; cf.eachRow(row => { const t = String(cellValue(row.getCell(1)) || ''); if (/descuento/i.test(t) && /S\//.test(t)) estr.push(t); });
  const filaPreventa = estr.find(t => /%/.test(t)), filaReserva = estr.find(t => t !== filaPreventa);
  const e2 = Number(v(cf, 'B3')) || 0.07, e3 = Number(v(cf, 'B4')) || 0.11, umbral2 = Number(v(rs, 'B25')) || 0.35;
  const fecha = v(rs, 'B3'), fechaIso = fecha instanceof Date ? fecha.toISOString().slice(0, 10) : '';
  return {
    proyecto: String(v(rs, 'A1') || 'Proyecto').replace(/\s*-\s*Estrategia.*$/i, ''),
    meta_recaudacion: Number(v(rs, 'B41')) || null, linea_base: Number(v(rs, 'B40')) || null, objetivo_superar_pct: 0.03, unidades,
    // R49 · Escalera recomendada: Etapa 1 = oferta de preventa (precio del Excel), Etapa 2 a mitad de camino y Etapa 3 = precio ERP congelado.
    ancla: 'erp', etapas: [{nombre: 'Etapa 1', alza: 0, umbral: 0, avance: 0}, {nombre: 'Etapa 2', alza: e2, umbral: umbral2, avance: 0.5}, {nombre: 'Etapa 3', alza: e3, umbral: Math.min(0.95, umbral2 * 2), avance: 1}],
    feria: {fecha_inicio: fechaIso, tasa_cierre: Number(v(rs, 'B11')) || 0.1,
      preventa: {descuento: Number(v(rs, 'B27')) || montos(filaPreventa).at(-1) || 0, cupos: Number(v(rs, 'B42')) || 0, condicion: filaPreventa ? 'Separación del ' + (String(filaPreventa).match(/[\d.,]+\s*%/) || ['1 %'])[0] + ' y firma de preventa en planos' : ''},
      reserva: {descuento: montos(filaReserva).at(-1) || 0, cupos: Number(v(rs, 'B7')) || 0, condicion: filaReserva && montos(filaReserva).length > 1 ? 'Separación de S/ ' + montos(filaReserva)[0].toLocaleString('es-PE') : ''},
      reparto: [Number(v(rs, 'B31')) || 0.3, Number(v(rs, 'D31')) || 0.4, Number(v(rs, 'F31')) || 0.3],
      metas: {preventas: Number(v(rs, 'B6')) || 0, reservas: Number(v(rs, 'B7')) || 0, calificados: Number(v(rs, 'B8')) || 0, citas: Number(v(rs, 'B9')) || 0}},
    fuente: {tipo: 'excel', nombre: file.name}, mercado: {evaluacion_id: '', modo: 'tope'},
  };
}

function Curva({curva, meta}) {
  if (!curva?.length) return <p style={{fontSize: 12, margin: 0}}>Aún no hay unidades separadas o vendidas: la curva aparecerá con la primera venta.</p>;
  const W = 560, H = 180, pad = 34, max = Math.max(...curva.map(c => Math.max(c.base, c.real))) * 1.08;
  const x = i => pad + (curva.length === 1 ? (W - 2 * pad) / 2 : i * (W - 2 * pad) / (curva.length - 1)), y = v => H - pad + 6 - v / max * (H - pad - 10);
  const line = k => curva.map((c, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(c[k]).toFixed(1)).join(' ');
  return <figure style={{margin: 0}}>
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Recaudación acumulada: línea base contra real" style={{width: '100%', height: 'auto', maxHeight: 260}}>
      <line x1={pad} x2={W - pad} y1={y(0)} y2={y(0)} stroke="currentColor" opacity=".25"/>
      <path d={line('base')} fill="none" stroke="#94a3b8" strokeWidth="2" strokeDasharray="5 4"/>
      <path d={line('real')} fill="none" stroke="#e07a3a" strokeWidth="2.5"/>
      {curva.map((c, i) => <circle key={i} cx={x(i)} cy={y(c.real)} r="4" fill="#e07a3a" stroke="#fff" strokeWidth="1.5"><title>{`${c.unidad} · ${c.fecha} · real ${S(c.real)} · base ${S(c.base)}`}</title></circle>)}
    </svg>
    <figcaption style={{fontSize: 12, display: 'flex', gap: 16, flexWrap: 'wrap'}}><span><b style={{color: '#e07a3a'}}>━</b> Real acumulado</span><span><b style={{color: '#94a3b8'}}>┅</b> Línea base (lista Etapa 1) de las mismas unidades</span><span>Meta del proyecto: {S(meta)}</span></figcaption>
  </figure>;
}

function Barra({c}) {
  const total = Math.max(c.meta_recaudacion, c.proyectado, c.linea_base) * 1.05, w = v => Math.max(0, v / total * 100) + '%';
  return <div aria-label="Recaudado y proyectado frente a la meta" style={{position: 'relative', height: 26, borderRadius: 8, background: 'rgba(148,163,184,.25)', overflow: 'hidden'}}>
    <div style={{position: 'absolute', left: 0, top: 0, bottom: 0, width: w(c.recaudado), background: '#85442A'}} title={'Recaudado ' + S(c.recaudado)}/>
    <div style={{position: 'absolute', left: w(c.recaudado), top: 0, bottom: 0, width: w(c.proyectado - c.recaudado), background: 'rgba(181,101,74,.45)'}} title={'Proyectado restante ' + S(c.proyectado - c.recaudado)}/>
    <div style={{position: 'absolute', left: w(c.meta_recaudacion), top: -2, bottom: -2, width: 2, background: '#111'}} title={'Meta ' + S(c.meta_recaudacion)}/>
    <div style={{position: 'absolute', left: w(c.linea_base), top: -2, bottom: -2, width: 2, background: '#64748b'}} title={'Línea base ' + S(c.linea_base)}/>
  </div>;
}

const COCHERAS_DEFECTO = ['A', 'B', 'C', 'D'].map(codigo => ({codigo, precio_base: 56000, manual: null}));
// R49 · Ajuste manual: en pantalla el % va como número entero (3 = +3 %); en la estrategia se guarda como fracción (0.03).
const manualUI = m => !m ? {modo: 'auto', valor: ''} : {modo: m.modo, valor: m.modo === 'pct' ? String(Math.round(m.valor * 10000) / 100) : String(m.valor)};
const manualCfg = e => !e || e.modo === 'auto' || e.valor === '' || !Number.isFinite(Number(e.valor)) ? null : e.modo === 'pct' ? {modo: 'pct', valor: Number(e.valor) / 100} : {modo: 'precio', valor: Number(e.valor)};

function Editor({config, revision, evaluaciones, calc, onSaved}) {
  const [f, setF] = useState(config);
  const [busy, setBusy] = useState(false), [err, setErr] = useState('');
  useEffect(() => setF({...config, cocheras: config.cocheras || COCHERAS_DEFECTO}), [config]);
  const set = (path, value) => setF(prev => { const next = structuredClone(prev); let o = next; const k = path.split('.'); k.slice(0, -1).forEach(p => { o = o[p]; }); o[k.at(-1)] = value; return next; });
  const numIn = (path, value, step = 'any', label) => <label style={{display: 'grid', gap: 4, fontSize: 12}}>{label}<input className="orok-input" type="number" step={step} value={value ?? ''} onChange={e => set(path, e.target.value === '' ? null : Number(e.target.value))}/></label>;
  const save = async (refrescar = false) => { setBusy(true); setErr(''); try { await db.preciosEstrategiaGuardar({config: f, revision, refrescar_erp: refrescar}); onSaved(refrescar ? 'Precios ERP de referencia tomados del Inventario de hoy.' : 'Estrategia guardada.'); } catch (e) { setErr(e.message); } finally { setBusy(false); } };
  const erp = f.ancla === 'erp';
  return <details className="orok-card" style={{padding: 16}}>
    <summary style={{cursor: 'pointer', fontWeight: 700}}>Parámetros de la estrategia (meta, etapas, feria y lista Etapa 1)</summary>
    <div data-responsive-grid="true" style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10, marginTop: 12}}>
      {numIn('meta_recaudacion', f.meta_recaudacion, 1000, 'Meta de recaudación (S/)')}
      {numIn('linea_base', f.linea_base, 1000, 'Línea base del modelo (S/)')}
      {numIn('objetivo_superar_pct', f.objetivo_superar_pct, 0.01, 'Objetivo para superar la meta (0.03 = 3 %)')}
    </div>
    <h4 style={{margin: '14px 0 6px'}}>Etapas de precio</h4>
    <label style={{display: 'grid', gap: 4, fontSize: 12, maxWidth: 520, marginBottom: 8}}>Cómo se arma la escalera<select className="orok-input" value={f.ancla || 'etapa1'} onChange={e => set('ancla', e.target.value)}>
      <option value="erp">Hacia el precio ERP (recomendado): Etapa 1 = oferta de preventa y cada etapa sube hasta el precio ERP</option>
      <option value="etapa1">% de alza sobre la lista Etapa 1 del Excel</option></select></label>
    {f.etapas.map((e, i) => <div key={i} data-responsive-grid="true" style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginBottom: 6}}>
      <label style={{display: 'grid', gap: 4, fontSize: 12}}>Nombre<input className="orok-input" value={e.nombre} onChange={ev => set(`etapas.${i}.nombre`, ev.target.value)}/></label>
      {erp ? (i === 0 ? <div style={{fontSize: 12, alignSelf: 'end', paddingBottom: 8}}>Oferta de preventa = precio Etapa 1 de cada unidad{calc?.etapas?.[0]?.vs_erp_pct != null ? ` (${P(calc.etapas[0].vs_erp_pct)} frente al ERP en promedio)` : ''}</div>
        : <label style={{display: 'grid', gap: 4, fontSize: 12}}>Avance hacia el precio ERP (0.5 = mitad, 1 = ERP){calc?.etapas?.[i]?.vs_erp_pct != null && <span style={{opacity: .75}}>Hoy: {P(calc.etapas[i].vs_erp_pct)} frente al ERP · +{P(calc.etapas[i].alza_pct)} sobre Etapa 1</span>}<input className="orok-input" type="number" step="0.05" value={e.avance ?? ''} onChange={ev => set(`etapas.${i}.avance`, ev.target.value === '' ? null : Number(ev.target.value))}/></label>)
        : numIn(`etapas.${i}.alza`, e.alza, 0.01, 'Alza sobre Etapa 1 (0.07 = 7 %)')}
      {i > 0 && numIn(`etapas.${i}.umbral`, e.umbral, 0.01, 'Se activa al vender (0.35 = 35 % del valor)')}
    </div>)}
    <h4 style={{margin: '14px 0 6px'}}>Feria</h4>
    <div data-responsive-grid="true" style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10}}>
      <label style={{display: 'grid', gap: 4, fontSize: 12}}>Viernes de inicio<input className="orok-input" type="date" value={f.feria.fecha_inicio || ''} onChange={e => set('feria.fecha_inicio', e.target.value)}/></label>
      {numIn('feria.preventa.descuento', f.feria.preventa?.descuento, 1000, 'Descuento preventa en planos (S/)')}
      {numIn('feria.preventa.cupos', f.feria.preventa?.cupos, 1, 'Cupos de preventa (cualquier unidad)')}
      <label style={{display: 'grid', gap: 4, fontSize: 12}}>Condición de preventa<input className="orok-input" value={f.feria.preventa?.condicion || ''} onChange={e => set('feria.preventa.condicion', e.target.value)}/></label>
      {numIn('feria.reserva.descuento', f.feria.reserva?.descuento, 1000, 'Descuento reserva fuera de preventa (S/)')}
      {numIn('feria.reserva.cupos', f.feria.reserva?.cupos, 1, 'Cupos de reserva (0 = sin límite)')}
      <label style={{display: 'grid', gap: 4, fontSize: 12}}>Condición de reserva<input className="orok-input" value={f.feria.reserva?.condicion || ''} onChange={e => set('feria.reserva.condicion', e.target.value)}/></label>
      {['preventas', 'reservas', 'calificados', 'citas'].map(k => <React.Fragment key={k}>{numIn('feria.metas.' + k, f.feria.metas[k], 1, 'Meta de ' + k)}</React.Fragment>)}
    </div>
    <h4 style={{margin: '14px 0 6px'}}>Estudio de mercado del Evaluador</h4>
    <div data-responsive-grid="true" style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10}}>
      <label style={{display: 'grid', gap: 4, fontSize: 12}}>Evaluación que aporta los comparables<select className="orok-input" value={f.mercado?.evaluacion_id || ''} onChange={e => set('mercado', {...(f.mercado || {}), evaluacion_id: e.target.value})}><option value="">La más reciente del mismo proyecto</option>{(evaluaciones || []).map(e => <option key={e.id} value={e.id}>{e.nombre} · {e.comparables} comparables</option>)}</select></label>
      <label style={{display: 'grid', gap: 4, fontSize: 12}}>Uso del mercado<select className="orok-input" value={f.mercado?.modo || 'referencia'} onChange={e => set('mercado', {...(f.mercado || {}), modo: e.target.value})}><option value="referencia">Solo referencia (compara y avisa)</option><option value="tope">Rango del mercado: el sugerido no pasa el percentil 75 (sin estudio, el precio ERP)</option></select></label>
    </div>
    <h4 style={{margin: '14px 0 6px'}}>Precios por unidad <span style={{fontWeight: 400, fontSize: 12}}>(⚓ = sugerida para el stand; los cupos sirven para cualquier unidad{erp ? '; el precio ERP queda congelado como referencia aunque apliques precios' : ''})</span></h4>
    {erp && <button type="button" className="orok-btn orok-btn-secondary" disabled={busy} style={{marginBottom: 6}} onClick={() => save(true)}>Tomar precios ERP de hoy (Inventario)</button>}
    <div className="table-scroll"><table style={{width: '100%', fontSize: 12, borderCollapse: 'collapse'}}><thead><tr>{['Unidad', 'Tipo', 'Piso', 'Área m²', 'Ancla', erp ? 'Etapa 1 · oferta preventa (S/)' : 'Precio Etapa 1 (S/)', ...(erp ? ['Precio ERP de referencia (S/)'] : [])].map(h => <th key={h} style={{textAlign: 'left', padding: 6}}>{h}</th>)}</tr></thead>
      <tbody>{f.unidades.map((u, i) => <tr key={u.unidad} style={{borderTop: '1px solid rgba(148,163,184,.3)'}}><td style={{padding: 6}}>{u.unidad}</td><td style={{padding: 6}}>{u.tipo}</td><td style={{padding: 6}}>{u.piso}</td><td style={{padding: 6}}>{N(u.area)}</td>
        <td style={{padding: 6}}><input type="checkbox" checked={!!u.ancla} onChange={e => set(`unidades.${i}.ancla`, e.target.checked)} aria-label={'Unidad ancla ' + u.unidad}/></td>
        <td style={{padding: 6}}><input className="orok-input" type="number" step="100" value={u.precio_base} onChange={e => set(`unidades.${i}.precio_base`, Number(e.target.value))} style={{maxWidth: 140}}/></td>
        {erp && <td style={{padding: 6}}><input className="orok-input" type="number" step="100" aria-label={'Precio ERP de referencia ' + u.unidad} placeholder="se toma al guardar" value={u.precio_erp ?? ''} onChange={e => set(`unidades.${i}.precio_erp`, e.target.value === '' ? null : Number(e.target.value))} style={{maxWidth: 140}}/></td>}</tr>)}</tbody></table></div>
    <h4 style={{margin: '14px 0 6px'}}>Estacionamientos <span style={{fontWeight: 400, fontSize: 12}}>(entran en la meta y siguen las mismas etapas y ajustes que los departamentos)</span></h4>
    <div className="table-scroll"><table style={{width: '100%', fontSize: 12, borderCollapse: 'collapse'}}><thead><tr>{['Código', 'Precio Etapa 1 (S/)', ...(erp ? ['Precio ERP (S/)'] : []), ''].map(h => <th key={h} style={{textAlign: 'left', padding: 6}}>{h}</th>)}</tr></thead>
      <tbody>{(f.cocheras || []).map((c, i) => <tr key={i} style={{borderTop: '1px solid rgba(148,163,184,.3)'}}>
        <td style={{padding: 6}}><input className="orok-input" aria-label={'Código de estacionamiento ' + (i + 1)} value={c.codigo} onChange={e => set(`cocheras.${i}.codigo`, e.target.value.toUpperCase())} style={{maxWidth: 90}}/></td>
        <td style={{padding: 6}}><input className="orok-input" type="number" step="100" aria-label={'Precio Etapa 1 estacionamiento ' + c.codigo} value={c.precio_base ?? ''} onChange={e => set(`cocheras.${i}.precio_base`, Number(e.target.value))} style={{maxWidth: 140}}/></td>
        {erp && <td style={{padding: 6}}><input className="orok-input" type="number" step="100" aria-label={'Precio ERP estacionamiento ' + c.codigo} placeholder="se toma al guardar" value={c.precio_erp ?? ''} onChange={e => set(`cocheras.${i}.precio_erp`, e.target.value === '' ? null : Number(e.target.value))} style={{maxWidth: 140}}/></td>}
        <td style={{padding: 6}}><button type="button" className="orok-btn orok-btn-secondary" onClick={() => setF(p => ({...p, cocheras: p.cocheras.filter((_, k) => k !== i)}))}>Quitar</button></td></tr>)}</tbody></table></div>
    <button type="button" className="orok-btn orok-btn-secondary" style={{marginTop: 6}} onClick={() => setF(p => { const cs = p.cocheras || []; const ultimo = cs.at(-1); return {...p, cocheras: [...cs, {codigo: String.fromCharCode(65 + cs.length), precio_base: ultimo?.precio_base || 56000, manual: null}]}; })}>Agregar estacionamiento</button>
    {err && <p role="alert" style={{color: '#b91c1c'}}>{err}</p>}
    <div style={{display: 'flex', justifyContent: 'flex-end', marginTop: 10}}><button className="orok-btn orok-btn-primary" disabled={busy} onClick={() => save(false)}>{busy ? 'Guardando…' : 'Guardar estrategia'}</button></div>
  </details>;
}

// Bandeja de Gerencia: solicitudes de precio especial de Ventas (rebajas o alzas), como la aprobación de OC/OS.
function Solicitudes({onCambio}) {
  const [rows, setRows] = useState(null), [edit, setEdit] = useState({}), [busy, setBusy] = useState(''), [err, setErr] = useState('');
  const load = () => Promise.resolve().then(() => db.precioSolicitudes({})).then(setRows).catch(e => setErr(e.message));
  useEffect(() => { load(); }, []);
  const decidir = async (r, decision) => {
    const e = edit[r.id] || {}; setBusy(r.id); setErr('');
    try { await db.precioDecidir(r.id, {decision, precio_aprobado: e.precio ?? r.precio_propuesto, comentario: e.nota || ''}); await load(); onCambio?.(); }
    catch (x) { setErr(x.message); } finally { setBusy(''); }
  };
  if (!rows) return null;
  const pend = rows.filter(r => ['pendiente', 'observada'].includes(r.estado)), hist = rows.filter(r => !['pendiente', 'observada'].includes(r.estado)).slice(0, 15);
  return <div className="orok-card" style={{padding: 16}} id="solicitudes-precio">
    <h3 style={{marginTop: 0}}>Solicitudes de precio especial {pend.length ? <span style={{background: '#9a3412', color: '#fff', borderRadius: 999, padding: '1px 9px', fontSize: 13}}>{pend.length}</span> : null}</h3>
    <p style={{fontSize: 12, marginTop: 0}}>Toda rebaja o alza que propone Ventas espera tu aprobación. Lo aprobado vale 7 días para esa unidad y cliente, y pasa a la cotización, la separación y la minuta. Cada decisión llega por correo al vendedor.</p>
    {err && <p role="alert" style={{color: '#b91c1c'}}>{err}</p>}
    {!pend.length && <p style={{fontSize: 13}}>No hay solicitudes pendientes.</p>}
    {pend.map(r => { const e = edit[r.id] || {}; return <div key={r.id} style={{borderTop: '1px solid rgba(148,163,184,.35)', padding: '10px 0', display: 'grid', gap: 6}}>
      <div><b>Unidad {r.unidad}</b> · {r.cliente} ({r.lead_number || '—'}) · pide <b>{r.solicitante?.nombre}</b> · {new Date(r.creada).toLocaleString('es-PE', {timeZone: 'America/Lima'})}{r.estado === 'observada' ? ' · observada' : ''}</div>
      <div style={{fontSize: 13}}>Lista {S(r.precio_lista)} → propuesto <b>{S(r.precio_propuesto)}</b> <span style={{color: r.tipo === 'descuento' ? '#9a3412' : '#166534'}}>({r.variacion_pct > 0 ? '+' : ''}{r.variacion_pct} %, {r.tipo} de {S(Math.abs(r.diferencia))})</span></div>
      <div style={{fontSize: 13}}>Motivo: {r.motivo}</div>
      <div data-responsive-grid="true" style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 8, alignItems: 'end'}}>
        <label style={{display: 'grid', gap: 4, fontSize: 12}}>Precio que apruebas (S/)<input className="orok-input" type="number" step="100" value={e.precio ?? r.precio_propuesto} onChange={x => setEdit({...edit, [r.id]: {...e, precio: Number(x.target.value)}})}/></label>
        <label style={{display: 'grid', gap: 4, fontSize: 12}}>Comentario al vendedor<input className="orok-input" value={e.nota || ''} onChange={x => setEdit({...edit, [r.id]: {...e, nota: x.target.value}})}/></label>
        <div style={{display: 'flex', gap: 6, flexWrap: 'wrap'}}>
          <button className="orok-btn orok-btn-primary" disabled={busy === r.id} onClick={() => decidir(r, 'aprobar')}>Aprobar</button>
          <button className="orok-btn orok-btn-secondary" disabled={busy === r.id} onClick={() => decidir(r, 'observar')}>Observar</button>
          <button className="orok-btn orok-btn-secondary" style={{color: '#991b1b'}} disabled={busy === r.id} onClick={() => decidir(r, 'rechazar')}>Rechazar</button>
        </div></div></div>; })}
    {hist.length > 0 && <details style={{marginTop: 8}}><summary style={{cursor: 'pointer', fontSize: 13}}>Decisiones recientes</summary>
      {hist.map(r => <div key={r.id} style={{fontSize: 12, padding: '4px 0', borderTop: '1px solid rgba(148,163,184,.3)'}}>{r.unidad} · {r.cliente} · {r.estado} {r.precio_aprobado ? S(r.precio_aprobado) : ''} · {r.decidido_por || ''}{r.cotizacion?.quote_code ? ' · cotización ' + r.cotizacion.quote_code : ''}</div>)}</details>}
  </div>;
}

export default function EstrategiaPrecios() {
  const [state, setState] = useState({busy: true, data: null, error: ''});
  const [msg, setMsg] = useState(''), [err, setErr] = useState(''), [sel, setSel] = useState(new Set()), [confirm, setConfirm] = useState(false), [busy, setBusy] = useState(false), [manual, setManual] = useState({}), [masivo, setMasivo] = useState({modo: 'pct', valor: ''});
  const load = () => Promise.resolve().then(() => db.preciosEstrategia()).then(data => setState({busy: false, data, error: ''})).catch(e => setState({busy: false, data: null, error: e.message}));
  useEffect(() => { load(); }, []);
  const c = state.data?.calculo;
  const candidatos = useMemo(() => (c?.unidades || []).filter(u => u.precio_objetivo && u.en_erp && u.precio_objetivo !== u.precio_actual), [c]);
  const pendientesManual = Object.keys(manual).length;
  const editarManual = (key, patch) => setManual(prev => { const row = (c?.unidades || []).find(u => u.unidad === key); return {...prev, [key]: {...(prev[key] || manualUI(row?.manual)), ...patch}}; });
  const asignarMasivo = modo => { const patch = modo === 'auto' ? {modo: 'auto', valor: ''} : {...masivo}; setManual(prev => { const n = {...prev}; for (const k of sel) n[k] = patch; return n; }); };
  const guardarManual = async () => {
    setBusy(true); setErr(''); setMsg('');
    try {
      const cfg = structuredClone(state.data.config); cfg.cocheras = cfg.cocheras || COCHERAS_DEFECTO;
      for (const u of cfg.unidades) if (manual[u.unidad]) u.manual = manualCfg(manual[u.unidad]);
      for (const k of cfg.cocheras) if (manual['EST-' + k.codigo]) k.manual = manualCfg(manual['EST-' + k.codigo]);
      await db.preciosEstrategiaGuardar({config: cfg, revision: state.data.revision});
      setMsg(`Ajustes manuales guardados (${pendientesManual}). El resto de precios se recalculó para la meta; revisa y pulsa «Aplicar precios».`); setManual({}); await load();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const importar = async file => {
    if (!file) return; setErr(''); setMsg(''); setBusy(true);
    try { const config = await leerExcel(file); const prev = state.data?.config; if (prev) { config.cocheras = prev.cocheras; const man = new Map((prev.unidades || []).map(u => [u.unidad, u])); config.unidades.forEach(u => { const o = man.get(String(u.unidad).match(/(\d{3,4})/)?.[1] || u.unidad); u.manual = o?.manual || null; if (o?.precio_erp) u.precio_erp = o.precio_erp; }); if (prev.mercado?.evaluacion_id) config.mercado.evaluacion_id = prev.mercado.evaluacion_id; } await db.preciosEstrategiaGuardar({config, revision: state.data?.revision || 0}); setMsg(`Estrategia importada de «${file.name}»: ${config.unidades.length} unidades.`); await load(); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const aplicar = async () => {
    setBusy(true); setErr('');
    try { const r = await db.aplicarPreciosEstrategia([...sel]); setMsg(`Precios aplicados (${r.cambios.length}: ${r.cambios.filter(x => !x.cochera).length} en Inventario, ${r.cambios.filter(x => x.cochera).length} estacionamientos). Quedó registrado en el historial.`); setConfirm(false); setSel(new Set()); await load(); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const importBtn = <label className="orok-btn orok-btn-secondary" style={{cursor: busy ? 'wait' : 'pointer'}}>{busy ? 'Leyendo…' : 'Importar Excel de estrategia'}<input type="file" accept=".xlsx" hidden disabled={busy} onChange={e => { importar(e.target.files?.[0]); e.target.value = ''; }}/></label>;

  if (state.busy) return <section className="orok-card" style={{padding: 16}}>Cargando estrategia de precios…</section>;
  if (state.error) return <section className="orok-card" style={{padding: 16}}><p role="alert" style={{color: '#b91c1c'}}>{state.error}</p></section>;
  if (!state.data?.configurada) return <section className="orok-card" style={{padding: 20, display: 'grid', gap: 10}}>
    <h2 style={{margin: 0}}>Estrategia de precios</h2>
    <p style={{margin: 0}}>Carga la línea base del proyecto: lista Etapa 1 por unidad, meta de recaudación, etapas de alza y condiciones de feria. Desde ahí el ERP compara cada venta real contra la meta y sugiere cómo mover los precios.</p>
    <div>{importBtn}</div>{err && <p role="alert" style={{color: '#b91c1c'}}>{err}</p>}{msg && <p role="status">{msg}</p>}
    <Solicitudes/>
  </section>;

  const cambiarAErp = async () => {
    setBusy(true); setErr(''); setMsg('');
    try {
      const cfg = structuredClone(state.data.config); cfg.ancla = 'erp'; cfg.mercado = {...(cfg.mercado || {}), modo: 'tope'};
      cfg.etapas = cfg.etapas.map((e, i, a) => ({...e, avance: i === 0 ? 0 : a.length > 1 ? Math.round(i / (a.length - 1) * 1000) / 1000 : 1}));
      await db.preciosEstrategiaGuardar({config: cfg, revision: state.data.revision});
      setMsg('Escalera hacia el precio ERP activada. Los precios ERP de hoy quedaron congelados como referencia; revisa la tabla antes de aplicar.'); await load();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const kpi = (label, value, sub, color) => <div className="orok-card" style={{padding: 12, minWidth: 0}}><div style={{fontSize: 12, opacity: .75}}>{label}</div><div style={{fontSize: 20, fontWeight: 800, color}}>{value}</div>{sub && <div style={{fontSize: 11, opacity: .75}}>{sub}</div>}</div>;
  return <section style={{display: 'grid', gap: 14}}>
    <header style={{display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end'}}>
      <div><div style={{fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase', opacity: .7}}>Ventas · solo Gerencia</div><h2 style={{margin: 0}}>Estrategia de precios · {c.proyecto}</h2>
        <p style={{margin: '4px 0 0', fontSize: 12}}>Real desde separaciones y ventas del CRM · línea base de {c.fuente?.nombre || c.fuente?.tipo} · revisión {state.data.revision} ({state.data.por})</p></div>
      <div style={{display: 'flex', gap: 8, flexWrap: 'wrap'}}>{importBtn}<button className="orok-btn orok-btn-secondary" onClick={load}>Actualizar</button></div>
    </header>
    {err && <p role="alert" style={{color: '#b91c1c', margin: 0}}>{err}</p>}{msg && <p role="status" style={{color: '#166534', margin: 0}}>{msg}</p>}
    <div data-responsive-grid="true" style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 10}}>
      {kpi('Meta de recaudación', S(c.meta_recaudacion), 'Línea base del modelo ' + S(c.linea_base))}
      {kpi('Recaudado (real)', S(c.recaudado), `${c.unidades_vendidas} de ${c.unidades_total} dptos.${c.cocheras_total ? ` · ${c.cocheras_vendidas} de ${c.cocheras_total} estac.` : ''} · ${P(c.avance_valor_pct)} del valor`)}
      {kpi('Proyectado al cierre', S(c.proyectado), c.manual_total ? `Incluye ${S(c.manual_total)} con precio manual` : 'Lo vendido + lo que falta según las etapas')}
      {kpi('Brecha vs meta', S(c.brecha_vs_meta), c.brecha_vs_meta >= 0 ? 'Se alcanza la meta' : 'Falta para la meta', tone(c.brecha_vs_meta))}
      {kpi('Etapa activa', c.etapa_activa, c.siguiente_etapa ? `${c.siguiente_etapa.nombre} al ${P(c.siguiente_etapa.umbral_pct)} · faltan ${S(c.siguiente_etapa.falta_lista)} de lista` : 'Última etapa')}
      {kpi('Ajuste automático', P(c.ajuste_sugerido_pct), 'Sobre la etapa activa, solo en lo que no tiene precio manual', c.ajuste_sugerido_pct > 0 ? '#9a3412' : '#166534')}
    </div>
    <div className="orok-card" style={{padding: 16, display: 'grid', gap: 10}}>
      <h3 style={{margin: 0}}>Recaudado y proyectado frente a la meta</h3><Barra c={c}/>
      <div style={{fontSize: 12, display: 'flex', gap: 14, flexWrap: 'wrap'}}><span>■ Recaudado {S(c.recaudado)}</span><span style={{opacity: .7}}>■ Restante proyectado {S(c.restante_proyectado)}</span><span>│ Meta</span><span style={{color: '#64748b'}}>│ Línea base</span>{c.feria?.descuento_pendiente > 0 && <span>Incluye descuento de feria pendiente: −{S(c.feria.descuento_pendiente)}</span>}</div>
      <div className="table-scroll"><table style={{width: '100%', fontSize: 13, borderCollapse: 'collapse'}}><thead><tr>{['Escenario', 'Objetivo', 'Proyectado − objetivo', 'Ajuste en lo que falta', 'Ratio necesario S/ m²'].map(h => <th key={h} style={{textAlign: 'left', padding: 6}}>{h}</th>)}</tr></thead>
        <tbody>{c.escenarios.map(e => <tr key={e.nombre} style={{borderTop: '1px solid rgba(148,163,184,.3)'}}><td style={{padding: 6}}>{e.nombre}</td><td style={{padding: 6}}>{S(e.objetivo)}</td><td style={{padding: 6, color: tone(e.diferencia_proyectada)}}>{S(e.diferencia_proyectada)}</td><td style={{padding: 6}}>{e.alcanzable_sin_ajuste ? 'No hace falta' : '+' + P(e.ajuste_pct)}</td><td style={{padding: 6}}>{N(e.ratio_necesario_m2)}</td></tr>)}</tbody></table></div>
      <p style={{fontSize: 12, margin: 0}}>Tramos proyectados: {c.tramos.map(t => `${t.etapa} ${S(t.valor)}`).join(' · ') || 'todo vendido'}. Lista Etapa 1 total {S(c.lista_etapa1)} ({N(c.ratio_lista_m2)} S/ m²).</p>
    </div>
    {c.ancla !== 'erp' && <div className="orok-card" style={{padding: 14, display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', borderLeft: '4px solid #85442A'}}>
      <span style={{fontSize: 13}}><b>Escalera recomendada:</b> Etapa 1 = oferta de preventa (precio del Excel), Etapa 2 a mitad de camino y Etapa 3 = precio ERP de hoy (congelado), con el sugerido dentro del rango del mercado del Evaluador.</span>
      <button className="orok-btn orok-btn-primary" disabled={busy} onClick={cambiarAErp}>Usar escalera hacia precio ERP</button></div>}
    <div className="orok-card" style={{padding: 16}}>
      <h3 style={{marginTop: 0}}>Estudio de mercado (Evaluador)</h3>
      {c.diagnostico && <div style={{border: '1px solid rgba(133,68,42,.35)', borderRadius: 10, padding: 10, marginBottom: 12}}>
        <b style={{fontSize: 13}}>Lectura del mercado y recomendación</b>
        <ul style={{margin: '6px 0 0', paddingLeft: 18, fontSize: 13, display: 'grid', gap: 4}}>{c.diagnostico.recomendaciones.map((r, i) => <li key={i}>{r}</li>)}</ul>
        <div style={{fontSize: 12, marginTop: 6, opacity: .8}}>Techo de recaudación ({c.diagnostico.con_mercado ? 'percentil 75 del mercado' : 'precio ERP'}): {S(c.diagnostico.techo_total)}{c.diagnostico.mediana_total ? ` · a la mediana del mercado: ${S(c.diagnostico.mediana_total)}` : ''} · meta {S(c.meta_recaudacion)}{c.ancla === 'erp' ? ` · todo a precio ERP: ${S(c.erp_total)}` : ''}</div></div>}
      {!c.mercado ? <p style={{fontSize: 12, margin: 0}}>No hay una evaluación del Evaluador con estudio de mercado para este proyecto. Haz el barrido de proyectos similares en el Evaluador › Estudio de mercado y guárdala en el CRM: aquí aparecerá el S/ por m² por dormitorios y tamaño.</p> : <>
        <p style={{fontSize: 12, marginTop: 0}}>{c.mercado.proyecto} · {c.mercado.distrito || 'distrito sin indicar'} · {c.mercado.comparables} comparables · sugerido del Evaluador {N(c.mercado.sugerido_m2)} S/ m²{c.mercado.rango_m2 ? ` (rango ${N(c.mercado.rango_m2[0])}–${N(c.mercado.rango_m2[1])})` : ''} · uso: {c.mercado.modo === 'tope' ? 'tope de precio' : 'referencia'}</p>
        <div data-responsive-grid="true" style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 12}}>{[['Por dormitorios', c.mercado.por_dormitorios], ['Por tamaño', c.mercado.por_tamano]].map(([t, rows]) => <div key={t}><b style={{fontSize: 13}}>{t}</b>
          <table style={{width: '100%', fontSize: 12, borderCollapse: 'collapse'}}><thead><tr>{['Grupo', 'Comparables', 'Mediana S/ m²', 'Rango (p25–p75)'].map(h => <th key={h} style={{textAlign: 'left', padding: 5}}>{h}</th>)}</tr></thead>
            <tbody>{rows.map(r => <tr key={r.grupo} style={{borderTop: '1px solid rgba(148,163,184,.3)'}}><td style={{padding: 5}}>{r.grupo}</td><td style={{padding: 5}}>{r.n}</td><td style={{padding: 5, fontWeight: 700}}>{N(r.mediana)}</td><td style={{padding: 5}}>{N(r.p25)}–{N(r.p75)}</td></tr>)}</tbody></table></div>)}</div></>}
    </div>
    <div className="orok-card" style={{padding: 16}}><h3 style={{marginTop: 0}}>Línea base vs real</h3><Curva curva={c.curva} meta={c.meta_recaudacion}/></div>
    <div className="orok-card" style={{padding: 16}}>
      <div style={{display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center'}}><h3 style={{margin: 0}}>Precios por unidad y estacionamiento</h3>
        <span style={{display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center'}}>
          {pendientesManual > 0 && <><button className="orok-btn orok-btn-secondary" disabled={busy} onClick={() => setManual({})}>Descartar cambios</button><button className="orok-btn orok-btn-primary" disabled={busy} onClick={guardarManual}>{busy ? 'Guardando…' : `Guardar ajustes manuales (${pendientesManual})`}</button></>}
          {!confirm ? <button className="orok-btn orok-btn-primary" disabled={!candidatos.length || busy || pendientesManual > 0} title={pendientesManual ? 'Primero guarda los ajustes manuales' : ''} onClick={() => setConfirm(true)}>Aplicar precios{sel.size ? ` (${sel.size} marcadas)` : candidatos.length ? ` (${candidatos.length})` : ''}</button>
          : <span style={{display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap'}}><b>¿Cambiar la lista vigente?</b><button className="orok-btn orok-btn-secondary" disabled={busy} onClick={() => setConfirm(false)}>Cancelar</button><button className="orok-btn orok-btn-primary" disabled={busy} onClick={aplicar}>{busy ? 'Aplicando…' : 'Sí, aplicar'}</button></span>}</span></div>
      <p style={{fontSize: 12}}>Cada fila puede ir en <b>automático</b> (etapa activa × ajuste para la meta, redondeado a S/ 100{c.mercado?.modo === 'tope' ? ', sin pasar el percentil 75 del mercado, ⤓' : ''}), con un <b>% manual</b> de alza o descuento sobre la etapa activa (−5 = 5 % menos), o con un <b>precio fijo</b>. Lo manual no se toca; el ajuste automático se reparte en las demás para llegar a la meta. Guarda los ajustes, revisa el precio objetivo y aplica (todas o solo las marcadas). Antes de aplicar se guarda un respaldo.</p>
      {sel.size > 0 && <div style={{display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end', padding: 10, borderRadius: 10, background: 'rgba(133,68,42,.07)', marginBottom: 8}}>
        <b style={{fontSize: 13, alignSelf: 'center'}}>Marcadas ({sel.size}):</b>
        <label style={{display: 'grid', gap: 4, fontSize: 12}}>Tipo<select className="orok-input" value={masivo.modo} onChange={e => setMasivo({...masivo, modo: e.target.value})}><option value="pct">% sobre etapa activa</option><option value="precio">Precio fijo (S/)</option></select></label>
        <label style={{display: 'grid', gap: 4, fontSize: 12}}>{masivo.modo === 'pct' ? 'Porcentaje (−5 = descuento)' : 'Precio (S/)'}<input className="orok-input" type="number" step={masivo.modo === 'pct' ? 0.5 : 100} value={masivo.valor} onChange={e => setMasivo({...masivo, valor: e.target.value})} style={{maxWidth: 140}}/></label>
        <button className="orok-btn orok-btn-secondary" disabled={masivo.valor === ''} onClick={() => asignarMasivo(masivo.modo)}>Asignar a marcadas</button>
        <button className="orok-btn orok-btn-secondary" onClick={() => asignarMasivo('auto')}>Volver a automático</button>
        <button className="orok-btn orok-btn-secondary" onClick={() => setSel(new Set())}>Desmarcar</button>
      </div>}
      <div className="table-scroll"><table style={{width: '100%', fontSize: 12, borderCollapse: 'collapse'}}><thead><tr>{['', 'Unidad', 'Tipo', 'Área', 'Estado', 'Etapa 1', 'Etapa activa', 'Precio ERP ref.', 'Vigente', 'Automático', 'Ajuste manual', 'Precio objetivo', 'Dif. vs vigente', 'S/ m²', 'Mercado S/ m²', 'Posición'].map(h => <th key={h} style={{textAlign: 'left', padding: 6, whiteSpace: 'nowrap'}}>{h}</th>)}</tr></thead>
        <tbody>{c.unidades.map(u => { const libre = u.estado === 'Disponible', ed = manual[u.unidad] || manualUI(u.manual), cambiado = !!manual[u.unidad];
          return <tr key={u.unidad} style={{borderTop: '1px solid rgba(148,163,184,.3)', opacity: libre ? 1 : .7, background: u.kind === 'cochera' ? 'rgba(148,163,184,.08)' : undefined}}>
          <td style={{padding: 6}}>{libre && u.en_erp && <input type="checkbox" aria-label={'Seleccionar ' + u.unidad} checked={sel.has(u.unidad)} onChange={e => setSel(prev => { const n = new Set(prev); e.target.checked ? n.add(u.unidad) : n.delete(u.unidad); return n; })}/>}</td>
          <td style={{padding: 6, fontWeight: 700, whiteSpace: 'nowrap'}}>{u.kind === 'cochera' ? 'Estac. ' + u.codigo : u.unidad}{u.ancla ? ' ⚓' : ''}{!u.en_erp && <span title="No existe en Inventario" style={{color: '#b91c1c'}}> (sin inventario)</span>}</td><td style={{padding: 6}}>{u.tipo}</td><td style={{padding: 6}}>{u.area ? N(u.area) : '—'}</td>
          <td style={{padding: 6}}>{u.estado}{u.precio_real ? ' · ' + S(u.precio_real) : ''}</td><td style={{padding: 6}}>{S(u.precio_base)}</td><td style={{padding: 6}}>{S(u.precio_etapa)}{u.etapa_vs_erp_pct != null && u.etapa_vs_erp_pct !== 0 && <div style={{fontSize: 10, opacity: .7}}>{P(u.etapa_vs_erp_pct)} vs ERP</div>}</td><td style={{padding: 6}}>{S(u.precio_erp)}</td><td style={{padding: 6}}>{S(u.precio_actual)}</td>
          <td style={{padding: 6, opacity: u.origen === 'manual' ? .55 : 1}}>{S(u.precio_sugerido)}{u.topado_por_mercado ? <span title="Limitado por el percentil 75 del mercado"> ⤓</span> : u.topado_por_erp ? <span title="Limitado por el precio ERP (sin estudio de mercado)"> ⤓ERP</span> : ''}</td>
          <td style={{padding: 6, whiteSpace: 'nowrap'}}>{libre ? <span style={{display: 'flex', gap: 4, alignItems: 'center'}}>
            <select className="orok-input" aria-label={'Modo de precio ' + u.unidad} value={ed.modo} onChange={e => editarManual(u.unidad, {modo: e.target.value, valor: e.target.value === 'auto' ? '' : ed.valor})} style={{maxWidth: 92, padding: '4px 6px', outline: cambiado ? '2px solid #d97706' : undefined}}><option value="auto">Auto</option><option value="pct">%</option><option value="precio">S/</option></select>
            {ed.modo !== 'auto' && <input className="orok-input" type="number" aria-label={(ed.modo === 'pct' ? 'Porcentaje ' : 'Precio ') + u.unidad} step={ed.modo === 'pct' ? 0.5 : 100} value={ed.valor} onChange={e => editarManual(u.unidad, {valor: e.target.value})} style={{maxWidth: ed.modo === 'pct' ? 70 : 110, padding: '4px 6px'}}/>}</span> : '—'}</td>
          <td style={{padding: 6, fontWeight: 700}}>{S(u.precio_objetivo)}{u.origen === 'manual' && <div style={{fontSize: 10, fontWeight: 400, color: '#9a3412'}}>manual{u.manual?.modo === 'pct' ? ` ${u.manual.valor > 0 ? '+' : ''}${Math.round(u.manual.valor * 10000) / 100} %` : ''}</div>}{cambiado && <div style={{fontSize: 10, fontWeight: 400, color: '#d97706'}}>sin guardar</div>}</td>
          <td style={{padding: 6, color: u.diferencia_vs_actual > 0 ? '#9a3412' : '#166534'}}>{u.diferencia_vs_actual == null ? '—' : (u.diferencia_vs_actual > 0 ? '+' : '') + S(u.diferencia_vs_actual)}</td><td style={{padding: 6}}>{u.ratio_sugerido_m2 ? N(u.ratio_sugerido_m2) : '—'}</td>
          <td style={{padding: 6}} title={u.mercado ? `${u.mercado.criterio} · ${u.mercado.n} comparables · rango ${N(u.mercado.p25_m2)}–${N(u.mercado.p75_m2)}` : 'Sin estudio de mercado'}>{u.mercado ? <>{N(u.mercado.mediana_m2)}<div style={{fontSize: 10, opacity: .7}}>{u.mercado.criterio} · {u.mercado.n}</div></> : '—'}</td>
          <td style={{padding: 6, color: u.posicion_mercado === 'Sobre el mercado' ? '#9a3412' : u.posicion_mercado === 'Bajo el mercado' ? '#1d4ed8' : '#166534'}}>{u.posicion_mercado || '—'}</td></tr>; })}</tbody></table></div>
    </div>
    <Solicitudes onCambio={load}/>
    {c.feria && <div className="orok-card" style={{padding: 16}}>
      <h3 style={{marginTop: 0}}>Feria desde el {c.feria.fecha_inicio}{c.feria.vigente ? ' · vigente' : ''}</h3>
      <div data-responsive-grid="true" style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10, marginBottom: 10}}>{(c.feria.ofertas || []).map(o => <div key={o.modalidad} style={{border: '1px solid rgba(148,163,184,.4)', borderRadius: 10, padding: 10}}>
        <b>{o.nombre}</b><div style={{fontSize: 18, fontWeight: 800}}>−{S(o.descuento)}</div><div style={{fontSize: 12}}>{o.condicion}</div>
        <div style={{fontSize: 12, marginTop: 4}}>{o.cupos ? `${o.usados} de ${o.cupos} cupos usados · quedan ${o.restantes}` : `${o.usados} usados · sin límite de cupos`}</div></div>)}</div>
      <p style={{fontSize: 12}}>El vendedor elige la oferta al cotizar cualquier unidad; el ERP fija el descuento y descuenta el cupo al confirmar la separación. Cierres esperados con la meta de leads: {N(c.feria.cierres_esperados)}.</p>
      <div className="table-scroll"><table style={{width: '100%', fontSize: 12, borderCollapse: 'collapse'}}><thead><tr><th style={{textAlign: 'left', padding: 6}}>Indicador</th><th style={{textAlign: 'left', padding: 6}}>Meta / real</th>{c.feria.dias.map((d, i) => <th key={d} style={{textAlign: 'left', padding: 6}}>{['Viernes', 'Sábado', 'Domingo'][i]} {d.slice(5)}</th>)}</tr></thead>
        <tbody>{Object.entries(c.feria.metas).map(([k, m]) => <tr key={k} style={{borderTop: '1px solid rgba(148,163,184,.3)'}}><td style={{padding: 6, textTransform: 'capitalize'}}>{k}</td><td style={{padding: 6, fontWeight: 700}}>{m.real} / {m.meta}</td>{m.por_dia.map((d, i) => <td key={i} style={{padding: 6}}>{d.real} / {d.meta}</td>)}</tr>)}</tbody></table></div>
      <p style={{fontSize: 11, margin: '8px 0 0'}}>Preventas = separaciones confirmadas ese día; reservas = separaciones abiertas ese día; calificados y citas salen del Kanban y la agenda.</p>
    </div>}
    <Editor config={state.data.config} revision={state.data.revision} evaluaciones={state.data.evaluaciones} calc={c} onSaved={m => { setMsg(m); load(); }}/>
    {!!state.data.aplicaciones?.length && <details className="orok-card" style={{padding: 16}}><summary style={{cursor: 'pointer', fontWeight: 700}}>Historial de precios aplicados</summary>
      {state.data.aplicaciones.map(a => <div key={a.id} style={{fontSize: 12, borderTop: '1px solid rgba(148,163,184,.3)', padding: '6px 0'}}><b>{new Date(a.at).toLocaleString('es-PE', {timeZone: 'America/Lima'})}</b> · {a.by} · {a.etapa} · ajuste {P(a.ajuste_pct)} · {a.cambios.map(x => `${x.unidad}: ${S(x.antes)} → ${S(x.despues)}`).join(' · ')}</div>)}</details>}
  </section>;
}
