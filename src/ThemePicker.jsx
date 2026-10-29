import React, {useState} from 'react';
import {Check} from 'lucide-react';
import {PALETTES, savedPalette, applyPalette} from './palettes.mjs';

export default function ThemePicker() {
  const [current, setCurrent] = useState(savedPalette);
  return <section className="orok-card theme-picker" aria-label="Apariencia" style={{marginBottom: 20}}>
    <h2 style={{marginTop: 0, fontSize: 20}}>Apariencia</h2>
    <p style={{fontSize: 13, color: 'var(--ink-3)', margin: '0 0 14px'}}>Elige la paleta de color de todo el ERP: CRM, Evaluador y Contabilidad. Se guarda en este navegador y no cambia lo que ven otros usuarios ni los documentos PDF.</p>
    <div className="palette-grid" role="radiogroup" aria-label="Paleta de color">
      {PALETTES.map(p => <button key={p.id} role="radio" aria-checked={current === p.id} className="palette-option" onClick={() => setCurrent(applyPalette(p.id))}>
        <span className="palette-preview" style={{background: `radial-gradient(circle at 25% 30%, ${p.swatches[2]}, transparent 55%), radial-gradient(circle at 80% 70%, ${p.swatches[0]}, transparent 55%), ${p.swatches[3]}`}}>
          <span className="palette-glass"><i style={{background: p.swatches[1]}}/><i style={{background: p.swatches[0], width: '55%'}}/></span>
        </span>
        <span className="palette-name">{current === p.id && <Check size={15} aria-hidden="true"/>}{p.name}</span>
        <small>{p.note}</small>
      </button>)}
    </div>
  </section>;
}
