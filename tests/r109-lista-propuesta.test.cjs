const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const r=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
test('R109: lista propuesta escalada al monto de recaudación, usar lista del CRM y envío al CRM',()=>{const h=r('evaluador-src/evaluador.html');
 assert.match(h,/function listaPropuesta/);assert.match(h,/r\.precio=T\*r\.eq\*r\.w\/sw/);assert.match(h,/data-act="lista-aplicar"/);assert.match(h,/data-act="lista-crm"/);assert.match(h,/lista_evaluador:\{/);assert.match(h,/LISTA DE PRECIOS \(R109/);
 assert.match(r('business/preciosEstrategia.js'),/precio_evaluador/);assert.match(r('src/EstrategiaPrecios.jsx'),/Evaluador \{S\(u\.precio_evaluador\)\}/);});
