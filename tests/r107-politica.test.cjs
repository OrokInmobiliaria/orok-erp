const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const h=fs.readFileSync(path.join(__dirname,'..','evaluador-src','evaluador.html'),'utf8');
test('R107: política de descuentos por unidades esperadas, descuento acumulado por fase y botón para usarlo como promedio',()=>{
 assert.match(h,/const POL_DEF=/);assert.match(h,/function politicaPanel/);assert.match(h,/data-act="pol-usar"/);assert.match(h,/Descuento acumulado por unidad/);
 assert.match(h,/undo\|sim-\|pol-\)/);assert.match(h,/if\(!Array\.isArray\(S\.p\.politicaDesc\)\)/);
});
