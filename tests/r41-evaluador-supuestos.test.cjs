const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const src=fs.readFileSync(require.resolve('../evaluador/app.js'),'utf8');
function context(){const c={};vm.createContext(c);vm.runInContext(src.split('//MODEL-START')[1].split('//MODEL-END')[0]+';this.S=JSON.parse(JSON.stringify(DEF));',c);return c}
test('escenarios cambian ventas, cobranzas y última venta sin alterar inventario ni precios',()=>{const c=context(),s=c.S;const base=c.compute(s);s.p.velocidadOptimista=2;s.p.velocidadPesimista=.3;s.p.escenarioVenta='optimista';const opt=c.compute(s);s.p.escenarioVenta='pesimista';const pes=c.compute(s);assert.ok(opt.finVentas<base.finVentas&&base.finVentas<pes.finVentas);for(const m of [base,opt,pes]){assert.ok(Math.abs(m.sold.reduce((a,b)=>a+b,0)-s.units.length)<1e-8);assert.equal(m.ventas,base.ventas);assert.ok(Math.abs(m.cobro.reduce((a,b)=>a+b,0)-m.ventas)<.01)}assert.notDeepEqual(opt.cobro,pes.cobro);assert.equal(c.compute(s,{velocidad:2}).finVentas,opt.finVentas);assert.equal(s.p.velocidad,.8)});
test('R91: cada partida tiene su S/ por m²; cambiar costo o incidencia de una cambia su costo y el total, no el de las demás',()=>{const c=context(),s=c.S,fac=c.costFac(s.p),pm=()=>{const tw=s.part.reduce((a,x)=>a+x.pct,0);return s.part.map(x=>s.p.costoM2/fac*x.pct/tw)};const old=pm(),v=old[0]+100;c.editPartCost(s,0,'cost',v);let n=pm();assert.ok(Math.abs(n[0]-v)<0.02);assert.ok(Math.abs(n[1]-old[1])<0.02);assert.ok(Math.abs(s.part.reduce((a,x)=>a+x.pct,0)-100)<1e-8);const total=s.p.costoM2,b1=n[1];c.editPartCost(s,0,'pct',25);assert.ok(Math.abs(s.part[0].pct-25)<1e-6);assert.ok(s.p.costoM2>total);n=pm();assert.ok(Math.abs(n[1]-b1)<0.02);assert.throws(()=>c.editPartCost(s,0,'pct',100));assert.throws(()=>c.editPartCost(s,0,'cost',-1));});
test('fases e hitos extienden horizonte y desembolsos sin perder cobranzas',()=>{const c=context(),s=c.S,base=c.compute(s);s.p.inicioIndep=base.ent+5;s.p.inicioPosventa=base.ent+6;s.p.durPosventa=18;s.p.hitos=[{nombre:'Cierre documental',mes:60}];const m=c.compute(s);assert.equal(m.indStart,base.ent+5);assert.equal(m.H,60);assert.equal(m.postStart,base.ent+6);assert.ok(Math.abs(m.cobro.reduce((a,b)=>a+b,0)-m.ventas)<.01);assert.equal(c.monthOffset('2025-06','2026-06'),12);assert.throws(()=>c.monthOffset('2025-06','2025-05'));});
test('Calendario renderiza fechas y controles visuales; escenarios conservan opciones',()=>{const c=context();Object.assign(c,{M:c.compute(c.S),nf:String,ml:String,esc:String,inp:()=>'',fld:()=>'',V:{}});vm.runInContext(src.slice(src.indexOf('function salesControls()'),src.indexOf('V.supuestos=()=>')),c);assert.match(c.scheduleControls(),/type="month"/);assert.match(c.scheduleControls(),/2025-06/);assert.match(c.salesControls(),/Pesimista/);});
test('SUNAT carga automáticamente, reutiliza la consulta al cargar otra evaluación y conserva ante fallo',async()=>{const c={CRM:true,S:{p:{tc:3.4},mercado:{}},limaDate:()=> '2026-10-28',save:()=>{},render:()=>{},document:{querySelector:()=>null},calls:0};c.crmRpc=async()=>{c.calls++;return {value:3.45,date:'2026-10-28',source:'SUNAT'}};vm.createContext(c);vm.runInContext(src.slice(src.indexOf('let ratePending='),src.indexOf('async function mGeocode')),c);await c.mSunat();assert.equal(c.S.p.tc,3.45);c.S={p:{tc:3.1},mercado:{}};await c.mSunat();assert.equal(c.S.p.tc,3.45);assert.equal(c.calls,1);c.limaDate=()=> '2026-10-29';c.crmRpc=async()=>{throw Error('sin conexión')};await c.mSunat();assert.equal(c.S.p.tc,3.45)});


test('mover o alargar obra desplaza entrega y fases dependientes conservando sus desfases',()=>{
 const c=context(),s=c.S,m=c.compute(s);s.p.inicioIndep=m.ent+2;s.p.inicioPosventa=m.ent+4;
 const before=c.compute(s),moved=c.editSchedule(s,'inicioObra',m.io+3);
 assert.equal(moved.ent,before.ent+3);assert.equal(moved.indStart,before.indStart+3);assert.equal(moved.postStart,before.postStart+3);
 assert.equal(moved.dur,before.dur);assert.notDeepEqual(moved.cobro,before.cobro);assert.equal(moved.ventas,before.ventas);
 const longer=c.editSchedule(s,'durObra',moved.dur+2);assert.equal(longer.ent,moved.ent+2);assert.equal(longer.indStart,moved.indStart+2);
 assert.ok(Math.abs(longer.cobro.reduce((a,b)=>a+b,0)-longer.ventas)<.01);
 const clean=context(),auto=clean.compute(clean.S),next=clean.editSchedule(clean.S,'inicioObra',auto.io+2);assert.equal(next.indStart,auto.indStart+2);assert.equal(next.postStart,auto.postStart+2);
});
test('calendario mueve diseño, lanzamiento e hitos y rechaza entradas inválidas sin alterar datos',()=>{
 const c=context(),s=c.S,m=c.compute(s);const design=c.editSchedule(s,'disenoInicio',2);assert.equal(design.designEnd-design.designStart,m.designEnd-m.designStart);
 const launch=c.editSchedule(s,'mesLanz',m.lanz+4);assert.equal(launch.finVentas,m.finVentas+4);
 s.p.hitos=[{nombre:'Compromiso',mes:12}];assert.equal(c.editSchedule(s,'hito.0',90).H,90);
 for(const [k,v] of [['inicioIndep',0],['inicioPosventa',0],['durObra',0],['durDiseno',-1],['mesLanz',1.5],['inicioObra',600],['hito.9',2]]){
  const before=JSON.stringify(s);assert.throws(()=>c.editSchedule(s,k,v));assert.equal(JSON.stringify(s),before);
 }
});
test('fechas y fases se editan en Calendario y no están duplicadas en Supuestos',()=>{
 const c=context();Object.assign(c,{M:c.compute(c.S),nf:String,ml:String,esc:String,inp:()=>'',fld:k=>k,V:{},rateError:'',mRateNote:()=>''});
 vm.runInContext(src.slice(src.indexOf('function salesControls()'),src.indexOf('V.valores=()=>')),c);
 vm.runInContext(src.slice(src.indexOf('V.calendario=()=>'),src.indexOf('function cfChart()')),c);
 const sup=c.V.supuestos(),cal=c.V.calendario();assert.doesNotMatch(sup,/data-calendar|p.inicioObra|p.durObra|p.indep|p.mesLanz/);assert.match(cal,/type="range"/);assert.match(cal,/Duración Construcción/);assert.match(cal,/Hitos vinculados/);
});
test('R93: construcción como el presupuesto de obra (área total techada + libre; utilidad sobre el subtotal)',()=>{const c=context(),s=c.S;s.p.utilPct=8;const m=c.compute(s);assert.ok(Math.abs(m.areaConstr-(m.areaTech+m.libreV))<1e-9);assert.ok(Math.abs(m.constrSub-m.areaConstr*s.p.costoM2)<1e-6);const ut=m.constrSub-m.cd*(1+s.p.ggPct/100);assert.ok(Math.abs(ut-m.constrSub*0.08)<1e-6);});
