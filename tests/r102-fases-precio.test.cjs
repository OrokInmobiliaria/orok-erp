const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const src=fs.readFileSync(require.resolve('../evaluador/app.js'),'utf8');
function context(){const c={};vm.createContext(c);vm.runInContext(src.split('//MODEL-START')[1].split('//MODEL-END')[0]+';this.S=JSON.parse(JSON.stringify(DEF));',c);return c}
const sum=a=>a.reduce((x,y)=>x+y,0);
test('R102: precio por fase (preventa → medio → bajo → regular) y cupos',()=>{
 const c=context(),s=c.S;s.p.fasesOn=false;const base=c.compute(s);
 s.p.fasesOn=true;s.p.faseAncla='promedio';const m=c.compute(s);
 assert.equal(Math.round(m.ventas),Math.round(base.ventas));assert.equal(Math.round(sum(m.valT)),Math.round(m.ventas));assert.ok(m.precioRegM2>s.p.precioM2);
 const F=m.fases;assert.ok(F.demIni<=F.demFin&&F.constrIni<=F.casco&&F.casco<=F.obsIni&&F.obsIni<=F.ent);
 assert.equal(m.descFase(F.constrIni-1),s.p.descPreventa);assert.equal(m.descFase(F.casco),s.p.descBajo);assert.equal(m.descFase(F.obsIni),0);
 s.p.faseAncla='regular';const r=c.compute(s);assert.ok(r.ventas<base.ventas);
 s.p.faseAncla='promedio';s.p.cupo_preventa=5;s.p.cupo_medio=2;s.p.cupo_bajo=2;const q=c.compute(s);
 assert.ok(Math.abs(q.usedF.preventa-5)<1e-6&&Math.abs(q.usedF.regular-2)<1e-6);assert.ok(q.finVentas>m.finVentas);
});
test('R102: gastos ya realizados cuentan para lo que pide el banco',()=>{
 const c=context(),s=c.S;s.p.bancoGastosMin=255000;s.p.gastosRealizados=0;const a=c.compute(s);s.p.gastosRealizados=300000;const b=c.compute(s);assert.equal(b.mGas,0);assert.ok(a.mGas>0);
});
