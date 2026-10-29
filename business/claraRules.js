'use strict';
// R35 · Reglas de C.L.A.R.A desde la skill «erp-orok-contabilidad» (fuente única).
// El ERP, la pantalla, la IA y n8n leen de aquí el texto de instrucciones y el bloque `clara-parametros`.
// Orden de búsqueda: 1) <privateDir>/skills/erp-orok-contabilidad/SKILL.md (copia editable por Gerencia en el servidor)
//                    2) skills/erp-orok-contabilidad/SKILL.md del paquete.
// Si el archivo o su bloque de parámetros tiene un error, se conserva la última versión válida y se informa el aviso.
const fs = require('node:fs'), path = require('node:path'), { createHash } = require('node:crypto');

const PACKAGE_FILE = path.join(__dirname, '..', 'skills', 'erp-orok-contabilidad', 'SKILL.md');
const EMPRESAS = ['BMG', 'MZA', 'MAAS'];
const MODULOS = ['logistica', 'tesoreria', 'presupuesto', 'ventas', 'evaluacion', 'obra', 'honorarios'];

function parseSkill(md) {
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(md);
  if (!fm || !/^name:\s*erp-orok-contabilidad\s*$/m.test(fm[1])) throw Error('El archivo no es la skill erp-orok-contabilidad (falta el encabezado name).');
  const body = md.slice(fm[0].length);
  const m = /```json clara-parametros\n([\s\S]*?)\n```/.exec(body);
  if (!m) throw Error('Falta el bloque ```json clara-parametros.');
  let p; try { p = JSON.parse(m[1]); } catch (e) { throw Error('El bloque clara-parametros no es JSON válido: ' + e.message); }
  validateParams(p);
  // Instrucciones para la IA: el texto sin el bloque de parámetros (que es para las máquinas).
  const texto = body.replace(/## Parámetros que usan el ERP y n8n[\s\S]*$/, '').trim();
  return { texto, params: p };
}
function validateParams(p) {
  const bad = (c, msg) => { if (!c) throw Error('Parámetro no válido: ' + msg); };
  bad(/^\d{4}-\d{2}-\d{2}$/.test(p.desde || ''), 'desde (AAAA-MM-DD)');
  bad(typeof p.igv === 'number' && p.igv >= 0 && p.igv < 0.5, 'igv (por ejemplo 0.18)');
  bad(p.retencion_4ta && p.retencion_4ta.tasa >= 0 && p.retencion_4ta.tasa < 0.5 && p.retencion_4ta.desde_monto >= 0, 'retencion_4ta');
  bad(p.detraccion && p.detraccion.desde_monto >= 0, 'detraccion.desde_monto');
  bad(p.empresas && EMPRESAS.every(e => p.empresas[e] && /^\d{11}$/.test(p.empresas[e].ruc || '') && /^[A-Za-z0-9_-]{15,}$/.test(p.empresas[e].drive_folder || '')), 'empresas (BMG, MZA y MAAS con RUC de 11 dígitos y drive_folder)');
  bad(p.tipos_proyecto && Object.values(p.tipos_proyecto).every(l => Array.isArray(l) && l.every(x => MODULOS.includes(x))), 'tipos_proyecto (módulos: ' + MODULOS.join(', ') + ')');
  // R38 · Cadenas de aprobación de órdenes.
  if (p.aprobaciones) {
    const A = p.aprobaciones, cargos = Array.isArray(A.cargos) ? A.cargos : [];
    bad(cargos.length && cargos.every(c => typeof c === 'string' && c.trim()), 'aprobaciones.cargos');
    bad(Array.isArray(A.reglas) && A.reglas.length && A.reglas.every(r => r && Array.isArray(r.pasos) && r.pasos.length && r.pasos.every(x => cargos.includes(x)) && new Set(r.pasos).size === r.pasos.length
      && (!r.empresa || [].concat(r.empresa).every(e => EMPRESAS.includes(e))) && (!r.tipos || (Array.isArray(r.tipos) && r.tipos.length)) && (!r.modulo || MODULOS.includes(r.modulo))), 'aprobaciones.reglas (pasos con cargos de la lista, empresas BMG/MZA/MAAS)');
    bad(EMPRESAS.every(e => A.reglas.some(r => !r.empresa || [].concat(r.empresa).includes(e))), 'aprobaciones.reglas (cada empresa necesita al menos una regla)');
    bad(!A.cargos_gerencia || (Array.isArray(A.cargos_gerencia) && A.cargos_gerencia.every(c => cargos.includes(c))), 'aprobaciones.cargos_gerencia');
    bad(!A.gerencia_omite || (Array.isArray(A.gerencia_omite) && A.gerencia_omite.every(c => cargos.includes(c) && !(A.cargos_gerencia || []).includes(c))), 'aprobaciones.gerencia_omite (solo cargos de jefatura)');
    bad(!A.requiere_proyecto || (Array.isArray(A.requiere_proyecto) && A.requiere_proyecto.every(e => EMPRESAS.includes(e))), 'aprobaciones.requiere_proyecto');
    bad(!A.equipo || (Array.isArray(A.equipo) && A.equipo.every(m => m && typeof m.nombre === 'string' && m.nombre.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m.email || '')
      && (!m.cargos || Object.entries(m.cargos).every(([c, es]) => cargos.includes(c) && Array.isArray(es) && es.every(e => EMPRESAS.includes(e))))
      && (!m.empresas || (Array.isArray(m.empresas) && m.empresas.length && m.empresas.every(e => EMPRESAS.includes(e)))))), 'aprobaciones.equipo (nombre, correo, cargos y empresas válidos)');
  }
  // R37 · Control de obra y cobranzas (opcionales).
  if (p.obra) bad(+p.obra.tolerancia_atraso_pct >= 0 && +p.obra.tolerancia_atraso_pct <= 50, 'obra.tolerancia_atraso_pct (0 a 50)');
  if (p.cobranzas) {
    const c = p.cobranzas;
    bad(c.plazo_cobro_dias == null || (Number.isInteger(c.plazo_cobro_dias) && c.plazo_cobro_dias >= 0 && c.plazo_cobro_dias <= 180), 'cobranzas.plazo_cobro_dias (0 a 180)');
    bad(!c.detraccion_pct_por_tipo || Object.values(c.detraccion_pct_por_tipo).every(v => typeof v === 'number' && v >= 0 && v <= 20), 'cobranzas.detraccion_pct_por_tipo (0 a 20)');
    bad(!c.plantillas || Object.values(c.plantillas).every(l => Array.isArray(l) && l.length && l.every(h => h && typeof h.hito === 'string' && h.hito && +h.pct > 0) && l.reduce((a, h) => a + +h.pct, 0) <= 100.0001), 'cobranzas.plantillas (hitos con nombre y porcentaje; cada plantilla suma 100 % o menos)');
  }
}

class ClaraRules {
  constructor(privateDir, packageFile = PACKAGE_FILE) { this.privateFile = privateDir ? path.join(privateDir, 'skills', 'erp-orok-contabilidad', 'SKILL.md') : null; this.packageFile = packageFile; this.last = null; this.stamp = ''; }
  read() {
    const files = [this.privateFile, this.packageFile].filter(f => f && fs.existsSync(f));
    if (!files.length) throw Error('No se encontró la skill erp-orok-contabilidad.');
    const file = files[0], st = fs.statSync(file), stamp = file + ':' + st.mtimeMs + ':' + st.size;
    if (this.last && this.stamp === stamp) return this.last;
    const md = fs.readFileSync(file, 'utf8');
    try {
      const { texto, params } = parseSkill(md);
      this.last = { version: createHash('sha256').update(md).digest('hex').slice(0, 12), fuente: file === this.privateFile ? 'servidor' : 'paquete', texto, params, aviso: null, leido: new Date().toISOString() };
    } catch (e) {
      if (!this.last && file !== this.packageFile) { this.privateFile = null; return this.read(); } // la copia del servidor tiene error: usar la del paquete
      if (!this.last) throw e;
      this.last = { ...this.last, aviso: 'La skill del ' + (file === this.privateFile ? 'servidor' : 'paquete') + ' tiene un error y se mantiene la versión ' + this.last.version + ': ' + e.message };
    }
    this.stamp = stamp; return this.last;
  }
}
module.exports = { ClaraRules, parseSkill, validateParams, PACKAGE_FILE };
