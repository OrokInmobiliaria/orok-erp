import React, { useMemo, useState } from 'react';
import { BookOpen, ExternalLink, FileText, Search, Sparkles, User } from 'lucide-react';
import HELP from './helpContent.json';

const MANUAL_URL = 'https://docs.google.com/document/d/1b1saMBm-lWnyN7BTsIEbU70uKs4BP5nQo6yLse5lGHQ/edit';
const PLAYBOOK_URL = 'https://docs.google.com/document/d/1gBNbTq6V-JYvjxdWRJD5ZLytEh3MvJ_6SjmsDMv89b4/edit';

// R33c · El contenido vive en helpContent.json: lo usan esta pantalla y el asistente L.O.L.A del servidor.
const CONTENT = { manual: HELP.manual, playbook: HELP.playbook };
// R75 · Guías por módulo: «lo que la IA hace por ti» y «lo que decides tú».
const MODULOS = HELP.modulos || [];

const QUICK_TOPICS = ['SLA', 'Semáforo', 'Contacto', 'Cita', 'Perdido', 'Seguimiento'];

const PLAYBOOK_ROUTE = HELP.route;

export default function HelpCenter({ role }) {
  const [section, setSection] = useState('modulos');
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLocaleLowerCase('es-PE');
  const modulos = useMemo(() => MODULOS.filter(m => (role === 'Gerente' || m.roles === 'todos') && (!normalizedQuery || `${m.title} ${m.tags} ${m.ia.join(' ')} ${m.tu.join(' ')}`.toLocaleLowerCase('es-PE').includes(normalizedQuery))), [role, normalizedQuery]);
  const entries = useMemo(() => section === 'modulos' ? [] : CONTENT[section].filter(item => {
    if (!normalizedQuery) return true;
    return `${item.title} ${item.tags} ${item.text}`.toLocaleLowerCase('es-PE').includes(normalizedQuery);
  }), [section, normalizedQuery]);
  const selected = section === 'modulos'
    ? { label: 'Guía por módulo', icon: Sparkles, url: MANUAL_URL, description: 'Qué hace la IA por ti y qué decides tú, en cada módulo del ERP.' }
    : section === 'playbook'
    ? { label: 'Libro de Jugadas', icon: BookOpen, url: PLAYBOOK_URL, description: 'Reglas comerciales, etapas, SLA y trazabilidad.' }
    : { label: 'Manual de usuario', icon: FileText, url: MANUAL_URL, description: 'Uso cotidiano del CRM paso a paso.' };
  const SelectedIcon = selected.icon;

  return <section style={{ maxWidth: 1040, margin: '0 auto', display: 'grid', gap: 18 }}>
    <div className="orok-card" style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, display: 'flex', gap: 9, alignItems: 'center', color: 'var(--orok-brand)' }}><BookOpen size={25}/> Ayuda</h2>
          <p style={{ margin: '7px 0 0', color: '#57534e' }}>Consulta rápida del Manual y del Libro de Jugadas, sin salir del CRM.</p>
        </div>
        <a href={selected.url} target="_blank" rel="noreferrer" className="orok-btn orok-btn-secondary" aria-label={`Abrir ${selected.label} completo`}><ExternalLink size={16}/> Abrir documento completo</a>
      </div>
      <div role="tablist" aria-label="Documentos de ayuda" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 18 }}>
        <button role="tab" aria-selected={section === 'modulos'} onClick={() => setSection('modulos')} className={`orok-btn orok-btn-${section === 'modulos' ? 'primary' : 'secondary'}`}><Sparkles size={16}/> Guía por módulo</button>
        <button role="tab" aria-selected={section === 'playbook'} onClick={() => setSection('playbook')} className={`orok-btn orok-btn-${section === 'playbook' ? 'primary' : 'secondary'}`}><BookOpen size={16}/> Libro de Jugadas</button>
        <button role="tab" aria-selected={section === 'manual'} onClick={() => setSection('manual')} className={`orok-btn orok-btn-${section === 'manual' ? 'primary' : 'secondary'}`}><FileText size={16}/> Manual de usuario</button>
      </div>
    </div>

    <div className="orok-card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 }}><SelectedIcon size={20} color="var(--orok-brand)"/><strong>{selected.label}</strong></div>
      <p style={{ margin: '0 0 14px', fontSize: 13, color: '#57534e' }}>{selected.description}</p>
      <label style={{ display: 'block', position: 'relative' }}>
        <span style={{ position: 'absolute', left: 14, top: 14, color: '#78716c' }}><Search size={19}/></span>
        <input aria-label="Buscar en Ayuda" value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar: cita, cotización, perdido, SLA, semáforo…" className="orok-input" style={{ margin: 0, paddingLeft: 44 }} />
      </label>
      <div aria-label="Temas frecuentes" style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 12 }}>
        {QUICK_TOPICS.map(topic => <button key={topic} type="button" onClick={() => setQuery(topic)} className="orok-btn orok-btn-secondary" style={{ padding: '7px 11px', fontSize: 12 }}>{topic}</button>)}
        {query && <button type="button" onClick={() => setQuery('')} className="orok-btn orok-btn-secondary" style={{ padding: '7px 11px', fontSize: 12 }}>Limpiar</button>}
      </div>
    </div>

    {section === 'playbook' && <>
      <div className="orok-card" style={{ padding: 20 }}>
        <h3 style={{ margin: '0 0 5px', color: 'var(--orok-brand)' }}>Ruta visual del proceso</h3>
        <p style={{ margin: '0 0 14px', color: '#57534e', fontSize: 13 }}>Empieza aquí: cada cuadro indica qué registrar antes de pasar al siguiente.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(205px, 1fr))', gap: 10 }}>
          {PLAYBOOK_ROUTE.map(step => <button key={step.label} type="button" onClick={() => setQuery(step.query)} aria-label={`Buscar ayuda sobre ${step.label}`} style={{ textAlign: 'left', border: `1px solid ${step.edge}`, borderLeft: `6px solid ${step.edge}`, background: step.color, borderRadius: 12, padding: 13, cursor: 'pointer', color: '#292524' }}>
            <strong style={{ display: 'block', marginBottom: 4 }}>{step.label}</strong>
            <span style={{ display: 'block', fontSize: 12, lineHeight: 1.4 }}>{step.detail}</span>
          </button>)}
        </div>
      </div>

      <div className="orok-card" style={{ padding: 20, border: '1px solid #fecaca', background: '#fffafa' }}>
        <h3 style={{ margin: '0 0 8px', color: '#991b1b' }}>¿Cuándo enviar a Perdido / desestimado?</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10, alignItems: 'stretch' }}>
          <div style={{ borderRadius: 10, padding: 12, background: '#e8f2ff', borderLeft: '5px solid #2563eb' }}><strong>1. ¿Hubo contacto efectivo?</strong><br/><span style={{ fontSize: 13 }}>No: continúa en Seguimiento y define próxima acción.</span></div>
          <div style={{ borderRadius: 10, padding: 12, background: '#fff7cf', borderLeft: '5px solid #ca8a04' }}><strong>2. ¿El cierre es definitivo?</strong><br/><span style={{ fontSize: 13 }}>No: reprograma o nutre el lead.</span></div>
          <div style={{ borderRadius: 10, padding: 12, background: '#fee8e8', borderLeft: '5px solid #dc2626' }}><strong>3. Sí: confirma pérdida</strong><br/><span style={{ fontSize: 13 }}>Elige motivo obligatorio; se conserva todo el historial.</span></div>
        </div>
      </div>
    </>}

    {section === 'modulos' && <div aria-live="polite" style={{ display: 'grid', gap: 14 }}>
      {modulos.map(m => <article key={m.id} className="orok-card" style={{ padding: 20, borderLeft: '4px solid var(--orok-brand)' }}>
        <h3 style={{ margin: '0 0 10px', fontSize: 18 }}>{m.title}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
          <div style={{ background: '#fdf4ee', borderRadius: 12, padding: 12 }}><strong style={{ display: 'flex', gap: 6, alignItems: 'center', color: 'var(--orok-brand)' }}><Sparkles size={16}/> Lo que la IA hace por ti</strong><ul style={{ margin: '8px 0 0', paddingLeft: 18, lineHeight: 1.5, fontSize: 14 }}>{m.ia.map(t => <li key={t}>{t}</li>)}</ul></div>
          <div style={{ background: '#f5f5f4', borderRadius: 12, padding: 12 }}><strong style={{ display: 'flex', gap: 6, alignItems: 'center' }}><User size={16}/> Lo que decides tú</strong><ul style={{ margin: '8px 0 0', paddingLeft: 18, lineHeight: 1.5, fontSize: 14 }}>{m.tu.map(t => <li key={t}>{t}</li>)}</ul></div>
        </div>
      </article>)}
      {!modulos.length && <div className="orok-card" style={{ padding: 24, textAlign: 'center' }}><strong>No encontramos “{query}”.</strong></div>}
    </div>}

    {section !== 'modulos' && <div aria-live="polite" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))', gap: 14 }}>
      {entries.map(item => <article key={item.title} className="orok-card" style={{ padding: 20, borderLeft: '4px solid var(--orok-brand)' }}>
        <h3 style={{ margin: '0 0 8px', fontSize: 17 }}>{item.title}</h3>
        <p style={{ margin: 0, lineHeight: 1.55, color: '#44403c', fontSize: 14 }}>{item.text}</p>
      </article>)}
      {!entries.length && <div className="orok-card" style={{ gridColumn: '1 / -1', padding: 24, textAlign: 'center' }}><strong>No encontramos “{query}”.</strong><p style={{ marginBottom: 0, color: '#57534e' }}>Prueba con otra palabra o abre el documento completo.</p></div>}
    </div>}
  </section>;
}
