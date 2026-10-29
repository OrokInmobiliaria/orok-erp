'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {mortgage,RATE,generateAndSaveQuotePDF}=require('../business/quotePDF.js');
test('la cuota usa la TEA elegida; sin TEA mantiene 7,80%',()=>{
 const base=mortgage(300000),same=mortgage(300000,240,RATE),higher=mortgage(300000,240,.095);
 assert.equal(base,same);assert.ok(higher>base);
 const r=(1+.095)**(1/12)-1;assert.ok(Math.abs(higher-300000*r/(1-(1+r)**-240))<1e-9);
 assert.ok(Math.abs(mortgage(300000,240,.078)-2425)<30,String(mortgage(300000,240,.078)));
});
const data=(extra)=>({unit:{id:'u',unit_number:'302',unit_type:'Flat 2D',floor:3,covered_area:53.79,free_area:0,price:390294},lead:{name:'Cliente Prueba',dni:'12345678',phone:'51911111111',email:'c@p.pe'},settings:{projectName:'Infinity 224',exchangeRate:3.4,separationPct:1},quote_code:'2026-0009999',discount_pct:0,financingType:'Hipotecario',customInitialPct:15,parkingCode:'Ninguno',parkingPrice:56000,...extra});
test('el PDF se genera con una TEA autorizada y rechaza una TEA fuera de rango',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'orok-tea-'));
 const file=path.join(dir,'q.pdf');await generateAndSaveQuotePDF({...data({teaPct:9.25}),targetFilePath:file});
 assert.ok(fs.statSync(file).size>1000);assert.equal(fs.readFileSync(file).subarray(0,4).toString(),'%PDF');
 await assert.rejects(generateAndSaveQuotePDF({...data({teaPct:45}),targetFilePath:path.join(dir,'x.pdf')}),/TEA/);
 await generateAndSaveQuotePDF({...data({financingType:'Directo',directCreditMonths:12}),targetFilePath:path.join(dir,'d.pdf')});
});
