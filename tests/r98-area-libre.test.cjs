const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const src=fs.readFileSync(require.resolve('../evaluador/app.js'),'utf8');
function context(){const c={};vm.createContext(c);vm.runInContext(src.split('//MODEL-START')[1].split('//MODEL-END')[0]+';this.S=JSON.parse(JSON.stringify(DEF));',c);return c}
test('R98: área de construcción total y costo del área libre como % del m² techado',()=>{
 const c=context(),s=c.S,m=c.compute(s);
 assert.equal(Math.round(m.areaTotal*100)/100,999.11);assert.equal(m.areaConstr,m.areaTotal);
 s.p.libreCostoPct=40;const m4=c.compute(s);
 assert.equal(Math.round(m4.areaConstr*100)/100,Math.round((m.areaTech+m.libreV*.4)*100)/100);
 assert.ok(m4.cd<m.cd&&m4.egresos<m.egresos&&m4.neta>m.neta);
 assert.equal(Math.round(m4.cd/m4.areaConstr*100),Math.round(m.cd/m.areaConstr*100));
});
