const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const src=fs.readFileSync(require.resolve('../evaluador/app.js'),'utf8');
function context(){const c={};vm.createContext(c);vm.runInContext(src.split('//MODEL-START')[1].split('//MODEL-END')[0]+';this.S=JSON.parse(JSON.stringify(DEF));',c);return c}
test('R105: la simulación escala solo el grupo elegido y no cambia los datos del proyecto',()=>{
 const c=context(),s=c.S,antes=JSON.stringify(s),m=c.compute(s),x=c.compute(s,{_esc:{Ventas:0.6}});
 assert.equal(JSON.stringify(s),antes);assert.ok(Math.abs(x.groups.Ventas.tot-m.groups.Ventas.tot*0.6)<1);assert.ok(x.neta>m.neta);
 assert.equal(Math.round(x.groups.Terreno.tot),Math.round(m.groups.Terreno.tot));
});
test('R105: vista con botón Simular y aplicar con deshacer',()=>{const h=fs.readFileSync(require('path').join(__dirname,'..','evaluador-src','evaluador.html'),'utf8');
 assert.match(h,/data-act="sim-abrir"/);assert.match(h,/function simAplicarCat/);assert.match(h,/undo\|sim-\)/);});
