// R31 · Estructura del menú agrupado. Los íconos se nombran como texto para poder probar el modelo sin React.
export const MANAGER_ONLY = ['precios', 'mkHome', 'mkTrends', 'mkPlan', 'mkForms', 'mkPublish', 'mkKpis', 'comisiones', 'marketing', 'campaigns', 'mkBrand', 'mkVariants', 'mkBudget', 'mkConnections', 'mkBrief', 'finanzas', 'ai', 'settings', 'moraAdmin', 'mora', 'evaluador', 'mercadoEstudio', 'contabilidad', 'lecciones'];
// R33b · ÖRÖK: CRM inmobiliario (todos los roles), Evaluador Inmobiliario con M.O.R.A (solo Gerencia)
// R34 · y Contabilidad y Finanzas (ERP) con D.I.A.V.A (solo Gerencia).
export const MODULES = [
  {id: 'evaluador', label: 'Evaluador Inmobiliario', hint: 'Análisis y riesgo con M.O.R.A', home: 'evaluador', managerOnly: true},
  {id: 'marketing', label: 'Marketing', hint: 'Tendencias, contenido, publicación y pauta con G.R.E.T.A', home: 'mkHome', managerOnly: true},
  {id: 'crm', label: 'CRM Inmobiliario', hint: 'Leads y ventas con L.O.L.A', home: 'dashboard'},
  {id: 'erp', label: 'Contabilidad y Finanzas', hint: 'Logística OC/OS, tesorería y finanzas con D.I.A.V.A', home: 'contabilidad', managerOnly: true},
];
export const modulesFor = role => MODULES.filter(m => !m.managerOnly || role === 'Gerente');
// R42 · Marketing es un módulo propio a cargo de G.R.E.T.A; alimenta al CRM (leads con su origen) sin vivir dentro de él.
export const MARKETING_TABS = ['mkHome', 'mkTrends', 'mkPlan', 'campaigns', 'mkForms', 'mkPublish', 'mkKpis', 'marketing', 'mkBrand'];
// Pestañas anteriores: siguen funcionando y abren su lugar nuevo (sin pantallas repetidas).
export const LEGACY_TABS = {mkVariants: 'mkKpis', mkBudget: 'mkKpis', mkConnections: 'mkPublish', mkBrief: 'mkBrand', finanzas: 'marketing'};
export const canonicalTab = tab => LEGACY_TABS[tab] || tab;
export const moduleOf = tab => { tab = canonicalTab(tab); return ['evaluador', 'mercadoEstudio', 'mora', 'moraAdmin'].includes(tab) ? 'evaluador' : tab === 'contabilidad' ? 'erp' : MARKETING_TABS.includes(tab) ? 'marketing' : 'crm'; };
export function navGroups(role, module = 'crm') {
  const g = role === 'Gerente';
  if (module === 'erp' && g) return [
    {id: 'contabilidad', label: 'Contabilidad y Finanzas', icon: 'Wallet', items: [
      ['contabilidad', 'Contabilidad y Finanzas', 'Wallet', 'Órdenes OC/OS, pagos, bancos, presupuesto, curva S y estados financieros'],
    ]},
  ];
  if (module === 'marketing' && g) return [
    {id: 'mkHoy', label: 'Hoy', icon: 'Home', items: [['mkHome', 'Hoy', 'Home', 'Pendientes, sugerencias de G.R.E.T.A y lo que preguntan los clientes']]},
    {id: 'mkCrear', label: 'Crear', icon: 'Sparkles', items: [
      ['mkTrends', 'Tendencias', 'LineChart', 'Lo que funciona en tu nicho en Instagram y TikTok'],
      ['mkPlan', 'Plan semanal', 'LayoutGrid', '7 publicaciones diarias adaptadas a Instagram, Facebook y TikTok'],
      ['campaigns', 'Estudio', 'Sparkles', 'Alternativas, fotos, reels y aprobación'],
      ['mkForms', 'Formularios', 'FileText', 'Formularios instantáneos para anuncios de Facebook, Instagram y TikTok'],
    ]},
    {id: 'mkPublicar', label: 'Publicar', icon: 'Send', items: [['mkPublish', 'Publicar', 'Send', 'Publicar, programar o terminar en el editor de cada red']]},
    {id: 'mkMedir', label: 'Medir', icon: 'PiggyBank', items: [
      ['mkKpis', 'Pauta y KPIs', 'PiggyBank', 'Meta y TikTok cruzados con el CRM, A/B y presupuesto'],
      ['marketing', 'Ventas atribuidas', 'Megaphone', 'Leads, citas y ventas por canal y gastos'],
    ]},
    {id: 'mkMarca', label: 'Marca', icon: 'Palette', items: [['mkBrand', 'Marca', 'Palette', 'Proyectos, tono, hashtags, G.R.E.T.A y resumen diario']]},
  ];
  if (module === 'evaluador' && g) return [
    {id: 'evaluacion', label: 'Evaluador Inmobiliario', icon: 'Building2', items: [
      ['evaluador', 'Evaluador Inmobiliario', 'Building2', 'Cabida, costos, flujo, banca, seguimiento e inversionistas'],
      ['mercadoEstudio', 'Estudio de mercado', 'LineChart', 'Comparables por distrito: portales con Claude y bases propias'],
    ]},
    {id: 'moraIa', label: 'M.O.R.A', icon: 'Bot', items: [
      ['mora', 'Consultas a M.O.R.A', 'LineChart', 'Preguntas sobre la evaluación guardada en el CRM'],
      ['moraAdmin', 'Administración M.O.R.A', 'Bot', 'Evaluaciones, propuestas y lectura semanal'],
    ]},
  ];
  return [
    {id: 'home', label: 'Inicio', icon: 'Home', items: [
      ['proyectos', 'Mis proyectos', 'LayoutGrid', 'Todos los proyectos, sus etapas y crear uno nuevo'],
      ['dashboard', 'Panel de control', 'LayoutDashboard', 'Indicadores y filtros interactivos'],
      ['weekly', 'Análisis semanal', 'LineChart', 'Detalle por semana'],
    ]},
    {id: 'sales', label: 'Ventas', icon: 'Briefcase', items: [
      ['kanban', 'Kanban de leads', 'KanbanSquare', 'Gestión por etapa y exportación'],
      ['newLead', 'Nuevo lead', 'UserPlus'],
      ['social', 'Bandeja social', 'MessageCircle'],
      ['quotes', 'Cotizaciones', 'FileText'],
      ['inventory', 'Inventario', 'Building2'],
      ...(g ? [['precios', 'Estrategia de precios', 'LineChart', 'Meta vs real, etapas y precios sugeridos con el Evaluador'], ['comisiones', 'Comisiones', 'DollarSign']] : []),
    ]},
    // R42 · Marketing salió del CRM: ahora es el módulo Marketing (G.R.E.T.A).
    // R38 · Las áreas (no Gerencia) elaboran y aprueban órdenes OC/OS; el servidor decide qué ve cada persona.
    ...(!g ? [{id: 'erpArea', label: 'Órdenes OC/OS', icon: 'Wallet', items: [
      ['ordenesErp', 'Órdenes y aprobaciones', 'Wallet', 'Elaborar órdenes de compra o servicio y aprobar las que te tocan'],
    ]}] : []),
    {id: 'config', label: 'Configuración', icon: 'Settings', items: [
      ['integrations', 'Herramientas', 'Wrench', 'Importaciones y enlaces'],
      ...(g ? [['ai', 'IA y automatizaciones', 'Bot'], ['lecciones', 'Lecciones de la IA', 'Sparkles', 'Aprueba lo que la IA aprende de las correcciones del equipo'], ['settings', 'Ajustes del proyecto', 'Settings']] : []),
      ['help', 'Ayuda', 'BookOpen'],
    ]},
  ];
}

// R51 · Menú lateral por etapas del proyecto (computadora). Reúne las pestañas de todos los módulos en el orden
// en que avanza un proyecto: Proyecto → Evaluar → Vender → Promocionar → Construir y finanzas → Ajustes.
export function navEtapas(role) {
  const g = role === 'Gerente';
  return [
    {id: 'proyecto', label: 'Proyecto', items: [['proyectos', 'Mis proyectos', 'LayoutGrid'], ['dashboard', 'Panel de control', 'LayoutDashboard'], ['weekly', 'Análisis semanal', 'LineChart']]},
    ...(g ? [{id: 'evaluar', label: 'Evaluar', items: [['evaluador', 'Evaluación, cabida y mercado', 'Building2'], ['mercadoEstudio', 'Estudio de mercado', 'LineChart'], ['mora', 'Consultas a M.O.R.A', 'Bot'], ['moraAdmin', 'Administración M.O.R.A', 'Settings']]}] : []),
    {id: 'vender', label: 'Vender', items: [['kanban', 'Leads (Kanban)', 'KanbanSquare'], ['newLead', 'Nuevo lead', 'UserPlus'], ['social', 'Bandeja WhatsApp y redes', 'MessageCircle'], ['inventory', 'Inventario', 'Building2'], ...(g ? [['precios', 'Estrategia de precios', 'LineChart']] : []), ['quotes', 'Cotizaciones', 'FileText'], ...(g ? [['comisiones', 'Comisiones', 'DollarSign']] : [])]},
    ...(g ? [{id: 'promocionar', label: 'Promocionar', items: [['mkHome', 'Hoy con G.R.E.T.A', 'Home'], ['mkTrends', 'Tendencias', 'LineChart'], ['mkPlan', 'Plan semanal', 'LayoutGrid'], ['campaigns', 'Estudio creativo', 'Sparkles'], ['mkForms', 'Formularios', 'FileText'], ['mkPublish', 'Publicar', 'Send'], ['mkKpis', 'Pauta y KPIs', 'PiggyBank'], ['marketing', 'Ventas atribuidas', 'Megaphone'], ['mkBrand', 'Marca', 'Palette']]}] : []),
    {id: 'construir', label: 'Construir y finanzas', items: g ? [['contabilidad', 'Órdenes, tesorería y finanzas', 'Wallet']] : [['ordenesErp', 'Órdenes OC/OS', 'Wallet']]},
    {id: 'ajustes', label: 'Ajustes', items: [['integrations', 'Herramientas', 'Wrench'], ...(g ? [['ai', 'IA y automatizaciones', 'Bot'], ['lecciones', 'Lecciones de la IA', 'Sparkles'], ['settings', 'Datos del proyecto', 'Settings']] : []), ['help', 'Ayuda', 'BookOpen']]},
  ];
}
