import React from 'react';
import {LayoutDashboard, LineChart, KanbanSquare, UserPlus, MessageCircle, FileText, Building2, DollarSign, Megaphone, Sparkles, Palette, PiggyBank, Send, Wallet, Wrench, Bot, Settings, BookOpen, Home, LayoutGrid, Search} from 'lucide-react';
import {navEtapas} from './navModel.mjs';
import AppearanceMenu from './AppearanceMenu';
// R51 · Menú lateral del proyecto, ordenado por etapas. En computadora reemplaza las barras de módulos y grupos;
// en celular sigue la barra inferior con «Más».
const ICONS = {LayoutDashboard, LineChart, KanbanSquare, UserPlus, MessageCircle, FileText, Building2, DollarSign, Megaphone, Sparkles, Palette, PiggyBank, Send, Wallet, Wrench, Bot, Settings, BookOpen, Home, LayoutGrid};

export default function SideNav({role, active, onChange, onSearch}) {
  return <aside className="side-nav no-print" aria-label="Menú del proyecto">
    <button type="button" className="side-search" onClick={onSearch} aria-label="Buscar leads, cotizaciones o unidades (Ctrl o Cmd + K)"><Search size={16} aria-hidden="true"/><span>Buscar…</span><kbd>Ctrl K</kbd></button>
    <nav aria-label="Secciones">
      {navEtapas(role).map(s => <div key={s.id} className="side-sec" role="group" aria-labelledby={'side-' + s.id}>
        <div id={'side-' + s.id} className="side-h">{s.label}</div>
        {s.items.map(([id, label, icon]) => { const Icon = ICONS[icon] || LayoutDashboard;
          return <button key={id} type="button" className="side-item" aria-current={active === id ? 'page' : undefined} onClick={() => onChange(id)}><Icon size={17} aria-hidden="true"/><span>{label}</span></button>; })}
      </div>)}
    </nav>
    <div className="side-foot"><AppearanceMenu/></div>
  </aside>;
}
