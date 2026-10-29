'use strict';
// R31 · Exportación de leads desde el Kanban: Excel (.xlsx real), CSV y Google Sheets.
// Solo Gerencia. Cada exportación queda registrada (quién, cuándo, cuántos, destino).
// No exporta DNI, dirección ni datos financieros: solo lo necesario para gestionar el contacto.
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib');
const { randomUUID } = require('node:crypto');

const COLUMNS = [
  ['Código', l => l.code || l.id], ['Nombre', l => l.name], ['Teléfono', l => l.phone], ['Correo', l => l.email],
  ['Etapa', l => l.status], ['Subestado', l => l.substatus], ['Fuente', l => l.source], ['Campaña', l => l.campaign_name],
  ['Proyecto', l => l.project], ['Responsable', l => l.sales_owner], ['Fecha de ingreso', l => lima(l.received_at)],
  ['Última actividad', l => lima(l.last_activity_at)], ['Próxima acción', l => l.next_action], ['Fecha próxima acción', l => lima(l.next_action_at)],
  ['Tipo de interés', l => l.unit_interest], ['Horizonte de compra', l => l.purchase_horizon],
];
function lima(v) { const t = Date.parse(v || ''); if (!Number.isFinite(t)) return ''; return new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(t)); }
const clean = v => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, 1000);

function rows(leads, ids) {
  const pick = Array.isArray(ids) ? new Set(ids.map(String)) : null;
  if (pick && pick.size > 5000) throw Error('Exporta hasta 5000 leads por vez.');
  const list = (leads || []).filter(l => l && (!pick || pick.has(String(l.id))));
  return [COLUMNS.map(c => c[0]), ...list.map(l => COLUMNS.map(([, f]) => clean(f(l))))];
}

function csv(table) {
  const cell = v => '"' + String(v).replace(/^[=+@\-\t\r]/, "'$&").replace(/"/g, '""') + '"';
  return '﻿' + table.map(r => r.map(cell).join(';')).join('\r\n');
}

// ---- XLSX mínimo y válido (zip sin compresión + SpreadsheetML) ----
const esc = v => String(v).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);
const colName = i => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
function sheetXml(table) {
  const widths = table[0].map((_, c) => Math.min(48, Math.max(10, ...table.slice(0, 200).map(r => String(r[c] || '').length + 2))));
  const body = table.map((r, i) => `<row r="${i + 1}">` + r.map((v, c) => `<c r="${colName(c)}${i + 1}" t="inlineStr"${i === 0 ? ' s="1"' : ''}><is><t xml:space="preserve">${esc(v)}</t></is></c>`).join('') + '</row>').join('');
  const last = colName(table[0].length - 1) + table.length;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${body}</sheetData><autoFilter ref="A1:${last}"/></worksheet>`;
}
function zip(files) {
  const parts = [], central = []; let offset = 0;
  for (const [name, content] of files) {
    const data = Buffer.from(content, 'utf8'), n = Buffer.from(name), crc = zlib.crc32(data);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(0, 8); h.writeUInt32LE(0, 10); h.writeUInt32LE(crc, 14); h.writeUInt32LE(data.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(n.length, 26); h.writeUInt16LE(0, 28);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(0, 10); c.writeUInt32LE(0, 12); c.writeUInt32LE(crc, 16); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(offset, 42);
    parts.push(h, n, data); central.push(c, n); offset += 30 + n.length + data.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}
function xlsx(table) {
  return zip([
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Leads" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">Leads!$A$1:$' + colName(table[0].length - 1) + '$' + table.length + '</definedName></definedNames></workbook>'],
    ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
    ['xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF35190F"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'],
    ['xl/worksheets/sheet1.xml', sheetXml(table)],
  ]);
}

const sheetId = url => (String(url || '').match(/\/spreadsheets\/d\/([\w-]{20,})/) || [])[1] || null;

class LeadExport {
  constructor(store, config, { sheetsClient } = {}) {
    this.store = store; this.dir = config.privateDir; this.credential = config.credential; this.sheetsClient = sheetsClient;
    this.log = store.ref.collection('lead_exports');
  }
  config(input, actor) {
    const f = path.join(this.dir, 'lead-export.json');
    const read = () => { try { const c = JSON.parse(fs.readFileSync(f, 'utf8')); return { spreadsheet_url: c.spreadsheet_url || '' }; } catch { return { spreadsheet_url: '' }; } };
    if (!input) return read();
    const url = String(input.spreadsheet_url || '').trim();
    if (url && !sheetId(url)) throw Error('Pega el enlace de una hoja de Google Sheets.');
    fs.mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(f + '.tmp', JSON.stringify({ spreadsheet_url: url, updated_by: actor, updated_at: new Date().toISOString() }), { mode: 0o600 }); fs.renameSync(f + '.tmp', f);
    return read();
  }
  async record(actor, format, count, destination = '') {
    await this.store.db.runTransaction(async tx => { const id = randomUUID(); tx.set(this.log.doc(id), { id, at: new Date().toISOString(), actor, format, count, destination }); });
  }
  async file(data, input, actor) {
    const format = input.format === 'csv' ? 'csv' : 'xlsx', table = rows(data.leads, input.ids);
    if (table.length < 2) throw Error('No hay leads para exportar con estos filtros.');
    const stamp = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
    const bytes = format === 'csv' ? Buffer.from(csv(table), 'utf8') : xlsx(table);
    await this.record(actor, format, table.length - 1);
    return { filename: `leads-${stamp}.${format}`, mime: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', base64: bytes.toString('base64'), count: table.length - 1 };
  }
  async client() {
    if (this.sheetsClient) return this.sheetsClient;
    if (!this.credential) throw Error('El servidor no tiene configurada la cuenta de servicio de Google.');
    const { GoogleAuth } = require('google-auth-library');
    return new GoogleAuth({ keyFile: this.credential, scopes: ['https://www.googleapis.com/auth/spreadsheets'] }).getClient();
  }
  async toSheet(data, input, actor) {
    const url = this.config().spreadsheet_url, id = sheetId(url);
    if (!id) throw Error('Configura primero el enlace de la hoja de Google Sheets de destino.');
    const table = rows(data.leads, input.ids);
    if (table.length < 2) throw Error('No hay leads para exportar con estos filtros.');
    const title = 'Leads ' + new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date()).replace(/[/:]/g, '-').replace(',', '');
    const client = await this.client(), base = 'https://sheets.googleapis.com/v4/spreadsheets/' + id;
    try {
      const added = await client.request({ url: base + ':batchUpdate', method: 'POST', data: { requests: [{ addSheet: { properties: { title, gridProperties: { frozenRowCount: 1 } } } }] } });
      await client.request({ url: base + '/values/' + encodeURIComponent("'" + title + "'!A1") + '?valueInputOption=RAW', method: 'PUT', data: { values: table } });
      const gid = added?.data?.replies?.[0]?.addSheet?.properties?.sheetId;
      await this.record(actor, 'google_sheets', table.length - 1, id);
      return { ok: true, count: table.length - 1, tab: title, url: `https://docs.google.com/spreadsheets/d/${id}/edit${gid !== undefined ? '#gid=' + gid : ''}` };
    } catch (e) {
      const status = e?.response?.status;
      if (status === 403 || status === 404) throw Error('La hoja no está compartida como Editor con la cuenta de servicio del CRM.');
      throw Error('Google Sheets no aceptó la exportación. Intenta de nuevo.');
    }
  }
  async history() { return (await this.log.orderBy('at', 'desc').limit(20).get()).docs.map(d => d.data()); }
}

module.exports = { LeadExport, rows, csv, xlsx, COLUMNS, sheetId };
