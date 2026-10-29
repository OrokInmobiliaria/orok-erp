#!/usr/bin/env node
// R34 · Genera contabilidad/ (index.html + app.js + jspdf + exceljs) a partir de la app D.I.A.V.A.
// Uso: node deploy/build-contabilidad.cjs <clara-contabilidad.html> <jspdf.umd.min.js> <exceljs.min.js>
// La misma app funciona publicada en Claude; dentro de /contabilidad activa el «modo CRM»:
// datos en PostgreSQL del CRM vía RPC (claraList/claraPut), Drive vía n8n y D.I.A.V.A con el proveedor de L.O.L.A.
'use strict';
const fs = require('node:fs'), path = require('node:path');
const [src, jspdf, exceljs] = process.argv.slice(2);
if (!src || !jspdf || !exceljs) { console.error('Uso: node deploy/build-contabilidad.cjs <clara-contabilidad.html> <jspdf.umd.min.js> <exceljs.min.js>'); process.exit(1); }
const html = fs.readFileSync(src, 'utf8');
const a = html.indexOf('<script>'), b = html.lastIndexOf('</script>');
if (a < 0 || b < a) throw Error('No se encontró el script principal.');
const js = html.slice(a + 8, b);
if (!/const CRM=\/\^\\\/contabilidad/.test(js)) throw Error('La app no tiene el modo CRM (/contabilidad).');
if (/<script[^>]*>/.test(html.slice(b + 9))) throw Error('Hay más de un script en línea: la CSP del CRM solo admite archivos propios.');
const out = path.join(__dirname, '..', 'contabilidad');
fs.mkdirSync(out, { recursive: true });
const pre = html.slice(0, a), cut = pre.indexOf('</style>') + 8;
if (cut < 8) throw Error('No se encontró el bloque de estilos.');
const head = pre.slice(0, cut).replace(/<title>[^<]*<\/title>/, '<title>Contabilidad y Finanzas · ERP ÖRÖK</title>'), body = pre.slice(cut);
fs.writeFileSync(path.join(out, 'index.html'), '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' + head + '</head><body>' + body + '<script src="/contabilidad/app.js"></script></body></html>');
fs.writeFileSync(path.join(out, 'app.js'), js);
fs.copyFileSync(jspdf, path.join(out, 'jspdf.umd.min.js'));
fs.copyFileSync(exceljs, path.join(out, 'exceljs.min.js'));
console.log('contabilidad/ listo:', ['index.html', 'app.js', 'jspdf.umd.min.js', 'exceljs.min.js'].map(f => f + ' ' + fs.statSync(path.join(out, f)).size).join(' · '));
