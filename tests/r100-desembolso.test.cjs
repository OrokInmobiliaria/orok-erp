const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const src=fs.readFileSync(require.resolve('../evaluador/app.js'),'utf8');
function context(){const c={};vm.createContext(c);vm.runInContext(src.split('//MODEL-START')[1].split('//MODEL-END')[0]+';this.S=JSON.parse(JSON.stringify(DEF));',c);return c}
test('R100: el saldo hipotecario llega 48 h tras la minuta cumplida la preventa; perfil nuevo pide N dptos. o X% del valor',()=>{
 const c=context(),s=c.S;s.p.perfilPromotor='nuevo';s.p.preventaNuevoUnd=5;s.p.preventaNuevoPct=45;s.p.desembolsoHip='minuta';
 const m=c.compute(s);assert.ok(m.mPre>=0);assert.match(m.preTxt,/5 dptos\. o 45%/);
 const und=m.soldCum[m.mPre]*m.nU,val=m.valT.slice(0,m.mPre+1).reduce((a,b)=>a+b,0)/m.valT.reduce((a,b)=>a+b,0);assert.ok(und>=5-1e-6||val>=.45-1e-6);
 const ini=s.p.inicial/100,antes=m.valT.slice(0,m.mPre+1).reduce((a,b)=>a+b,0);assert.ok(m.cobro[m.mPre]>=antes*(1-ini)-1);
 s.p.desembolsoHip='entrega';const e=c.compute(s);assert.ok(e.peak>m.peak);
 s.p.desembolsoHip='minuta';s.p.perfilPromotor='experiencia';s.p.preventaMin=30;const x=c.compute(s);assert.ok(x.mPre<=m.mPre);assert.match(x.preTxt,/30% de preventa/);
});
test('R100: TIR con varios cambios de signo usa TIR modificada (no valores absurdos)',()=>{
 const c=context(),s=c.S;const m=c.compute(s);assert.ok(m.tirE>-0.2&&m.tirE<1.5);assert.ok(m.tirQ>-0.2&&m.tirQ<1.5);
 const r=c.irrSafe([-100,0,0,300,-150,0,20],0.0095);assert.ok(r>-0.05&&r<0.6);
});
