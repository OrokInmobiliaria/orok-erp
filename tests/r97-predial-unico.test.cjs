const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const src=fs.readFileSync(require.resolve('../evaluador/app.js'),'utf8');
function context(){const c={};vm.createContext(c);vm.runInContext(src.split('//MODEL-START')[1].split('//MODEL-END')[0]+';this.S=JSON.parse(JSON.stringify(DEF));',c);return c}
test('R97: predial y arbitrios se cobran una sola vez, desde el cálculo año por año',()=>{
 const c=context(),s=c.S;s.p.predArancel=396;s.p.arbAnual=813.12;const m=c.compute(s);
 const muni=m.L.filter(o=>/predial|arbitrio/i.test(o.n));
 assert.equal(muni.length,2);assert.ok(muni.every(o=>o.i<0&&o.igv===0));
 assert.equal(Math.round(muni.find(o=>o.auto==='predial').tot),Math.round(m.predPlan.total));
 assert.equal(Math.round(muni.find(o=>o.auto==='arbitrios').tot),Math.round(m.predPlan.arbTotal));
 s.p.predPago='20:100';const m2=c.compute(s);assert.ok(m2.L.filter(o=>o.i<0).every(o=>o.pago==='20:100'));
 s.p.arbUnidad=300;assert.ok(c.compute(s).egresos>m2.egresos);
});
