const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const src=fs.readFileSync(require.resolve('../evaluador/app.js'),'utf8');
function context(){const c={};vm.createContext(c);vm.runInContext(src.split('//MODEL-START')[1].split('//MODEL-END')[0]+';this.S=JSON.parse(JSON.stringify(DEF));',c);return c}
test('R101: terreno propio es aporte en especie; efectivo frente al capital; el banco exige gastos demostrados',()=>{
 const c=context(),s=c.S;s.p.terrenoPropio=true;s.p.capitalCaja=220000;s.p.bancoGastosMin=255000;const m=c.compute(s);
 assert.ok(m.especie>0);assert.equal(Math.round(m.peakCaja),Math.round(m.peak-m.especie));
 assert.ok(m.mGas>=0&&m.gastoCum[m.mGas]>=255000);assert.ok(m.mDes>=Math.max(m.mPre,m.mGas));
 s.p.bancoGastosMin=10e6;const x=c.compute(s);assert.ok(x.mDes>m.mDes||x.mGas<0);
 s.p.bancoGastosMin=255000;s.p.inicialRetenida=true;const r=c.compute(s);assert.ok(r.peakCaja>m.peakCaja);
 s.p.terrenoPropio=false;assert.equal(c.compute(s).especie,0);
});
