import React, {useEffect, useRef, useState} from 'react';
import {LayoutDashboard, LineChart, KanbanSquare, UserPlus, MessageCircle, FileText, Building2, DollarSign, Megaphone, Sparkles, Palette, GitCompare, PiggyBank, Send, Mail, Wallet, Wrench, Bot, Settings, BookOpen, Home, Briefcase, MoreHorizontal, ChevronDown, Search} from 'lucide-react';

// R31 · Menú agrupado (escritorio: barra de cristal con menús; celular: barra inferior + hoja).
// Solo reorganiza el acceso: cada pestaña conserva su control de permisos original.
import {navGroups as model} from './navModel.mjs';
const ICONS = {LayoutDashboard, LineChart, KanbanSquare, UserPlus, MessageCircle, FileText, Building2, DollarSign, Megaphone, Sparkles, Palette, GitCompare, PiggyBank, Send, Mail, Wallet, Wrench, Bot, Settings, BookOpen, Home, Briefcase};
export const navGroups = (role, module = 'crm') => model(role, module).map(g => ({...g, icon: ICONS[g.icon], items: g.items.map(([id, label, icon, hint]) => [id, label, ICONS[icon], hint])}));

function Item({item, active, onPick}) {
  const [id, label, Icon, hint] = item;
  return <button className="nav-item" role="menuitem" aria-current={active === id ? 'page' : undefined} onClick={() => onPick(id)}><Icon size={18} aria-hidden="true"/><span>{label}{hint && <small>{hint}</small>}</span></button>;
}

export default function GroupedNav({role, module = 'crm', active, onChange, onSearch: searchFn}) {
  const evaluador = module === 'evaluador' && role === 'Gerente', erp = module === 'erp' && role === 'Gerente', mk = module === 'marketing' && role === 'Gerente', onSearch = evaluador || erp || mk ? null : searchFn;
  const groups = navGroups(role, evaluador ? 'evaluador' : erp ? 'erp' : mk ? 'marketing' : 'crm'), [open, setOpen] = useState(null), [sheet, setSheet] = useState(null), ref = useRef(null);
  const groupOf = id => groups.find(g => g.items.some(i => i[0] === id))?.id;
  const current = groupOf(active);
  useEffect(() => {
    if (!open) return;
    const close = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(null); };
    const esc = e => e.key === 'Escape' && setOpen(null);
    document.addEventListener('mousedown', close); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  const pick = id => { setOpen(null); setSheet(null); onChange(id); };
  const quick = mk ? [['mkHome', 'Hoy', Home], ['mkTrends', 'Tendencias', LineChart], ['campaigns', 'Estudio', Sparkles], ['mkKpis', 'KPIs', PiggyBank]] : erp ? [['contabilidad', 'Contabilidad', Wallet]] : evaluador ? [['evaluador', 'Evaluador Inmobiliario', Building2], ['mora', 'M.O.R.A', LineChart], ['moraAdmin', 'Admin', Bot]] : [['dashboard', 'Inicio', Home], ['kanban', 'Leads', KanbanSquare], ['newLead', 'Nuevo', UserPlus]];
  return <>
    <nav ref={ref} className="nav-shell glass desktop-only no-print" aria-label="Secciones">
      {groups.map(g => {
        const Icon = g.icon, label = g.items.find(i => i[0] === active && g.id === current)?.[1];
        // R42 · Un grupo de una sola sección es un botón directo (sin menú que abrir).
        if (g.items.length === 1) { const [id] = g.items[0]; return <div key={g.id} className="nav-group"><button className="nav-top" aria-current={active === id ? 'page' : undefined} onClick={() => pick(id)}><Icon size={17} aria-hidden="true"/>{g.label}</button></div>; }
        return <div key={g.id} className="nav-group">
          <button className="nav-top" aria-haspopup="menu" aria-expanded={open === g.id} aria-current={current === g.id ? 'true' : undefined} onClick={() => setOpen(o => o === g.id ? null : g.id)}>
            <Icon size={17} aria-hidden="true"/>{g.label}{label && label !== g.label && <span style={{fontWeight: 400, opacity: .8}}>· {label}</span>}<ChevronDown className="chev" size={14} aria-hidden="true"/></button>
          {open === g.id && <div className="nav-menu glass" role="menu" aria-label={g.label}>{g.items.map(i => <Item key={i[0]} item={i} active={active} onPick={pick}/>)}</div>}
        </div>;
      })}
      {onSearch && <button className="nav-search" onClick={onSearch} aria-label="Buscar leads (Ctrl o Cmd + K)"><Search size={16} aria-hidden="true"/>Buscar leads…<kbd>Ctrl K</kbd></button>}
    </nav>
    <nav className="tabbar glass no-print" aria-label="Navegación rápida">
      {quick.map(([id, label, Icon]) => <button key={id} aria-current={active === id ? 'true' : undefined} onClick={() => pick(id)}><Icon size={21} aria-hidden="true"/>{label}</button>)}
      {onSearch && <button onClick={onSearch}><Search size={21} aria-hidden="true"/>Buscar</button>}
      <button aria-current={sheet === 'all' ? 'true' : undefined} onClick={() => setSheet('all')}><MoreHorizontal size={21} aria-hidden="true"/>Más</button>
    </nav>
    {sheet && <>
      <div className="sheet-veil" onClick={() => setSheet(null)}/>
      <div className="sheet glass" role="dialog" aria-label="Todas las secciones">
        {groups.filter(g => sheet === 'all' || g.id === sheet).map(g => <div key={g.id} role="menu" aria-label={g.label}><h4>{g.label}</h4>{g.items.map(i => <Item key={i[0]} item={i} active={active} onPick={pick}/>)}</div>)}
      </div>
    </>}
  </>;
}
