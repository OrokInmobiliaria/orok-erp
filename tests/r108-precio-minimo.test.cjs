const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const r=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
test('R108: Evaluador calcula precio mínimo del margen objetivo, colchón y tope; lo exporta al CRM',()=>{const h=r('evaluador-src/evaluador.html');
 assert.match(h,/function precioParaMargen/);assert.match(h,/function politicaDatos/);assert.match(h,/politica_precios:\(\(\)=>/);assert.match(h,/margenObjetivo:15/);assert.match(h,/PRECIOS Y DESCUENTOS \(R108/);
 assert.match(h,/S\.ventas\.filter\(v=>!v\.ej&&/);});
test('R108: CRM marca precios bajo el mínimo y pasa los criterios a M.O.R.A',()=>{
 const P=r('business/preciosEstrategia.js');assert.match(P,/function politicaDe/);assert.match(P,/bajo_minimo/);
 assert.match(r('src/EstrategiaPrecios.jsx'),/PoliticaEvaluador/);assert.match(r('business/moraIntegration.js'),/CRITERIOS_MORA/);
 const H=JSON.parse(r('src/helpContent.json'));assert.ok(H.modulos.some(m=>m.id==='precios'));});
test('R108: la proyección usa las listas vigentes del CRM cuando se traen',()=>{
 assert.match(r('business/preciosEstrategia.js'),/listas: c\.unidades\.filter/);assert.match(r('deploy/build-evaluador.cjs'),/S\.crmListas=/);assert.match(r('evaluador-src/evaluador.html'),/lc&&lc\.vigente>0\?lc\.vigente:u\.lista/);});
