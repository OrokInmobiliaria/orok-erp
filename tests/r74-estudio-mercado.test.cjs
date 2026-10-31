'use strict';
const test=require('node:test'),assert=require('node:assert');
const {Mercado,limpiar,csvFilas,mdFilas,objetos,numero,distritoDe}=require('../business/mercado');
function fakeStore(){const docs=new Map();const ref=p=>({path:p,doc:id=>ref(p+'/'+id),collection:n=>col(p+'/'+n),get:async()=>({data:()=>docs.has(p)?structuredClone(docs.get(p)):undefined})});
 const col=p=>{const q=(filters=[],ord=null)=>({doc:id=>ref(p+'/'+id),where:(f,o,v)=>q([...filters,[f,v]],ord),orderBy:(f,d)=>q(filters,[f,d]),limit:()=>q(filters,ord),get:async()=>{let rows=[...docs].filter(([k])=>k.startsWith(p+'/')&&k.split('/').length===p.split('/').length+1).map(([,v])=>v).filter(v=>filters.every(([f,x])=>v[f]===x));if(ord)rows.sort((a,b)=>String(a[ord[0]]).localeCompare(String(b[ord[0]]))*(ord[1]==='desc'?-1:1));return {docs:rows.map(v=>({data:()=>structuredClone(v)}))};}});return q();};
 const r=ref('root');r.collection=n=>col('root/'+n);
 const tx={get:x=>x.get(),set:(x,v)=>docs.set(x.path,structuredClone(v)),delete:x=>docs.delete(x.path)};
 return {ref:r,db:{runTransaction:async fn=>fn(tx)},docs};}
const G={name:'Gerente',role:'Gerente'},A={name:'Asesor',role:'Asesor'};
test('R74: números, distritos y limpieza de filas',()=>{
 assert.equal(numero('US$ 185,000'),185000);assert.equal(numero('S/ 1.250.000,50'),1250000.5);assert.equal(numero('72.5'),72.5);
 assert.equal(distritoDe('miraflores'),'Miraflores');assert.equal(distritoDe('JESUS MARIA'),'Jesús María');
 const c=limpiar({'Precio (USD)':'US$ 200,000','Área techada m2':'80','Dorm.':'2','Link':'https://urbania.pe/x/1'},{distrito:'Barranco'});
 assert.equal(c.precio,200000);assert.equal(c.moneda,'USD');assert.equal(c.precio_m2,2500);assert.equal(c.distrito,'Barranco');assert.equal(c.fuente,'urbania.pe');
 assert.equal(limpiar({precio:'',area:'80'},{distrito:'Lince'}),null);
});
test('R74: CSV con ; y tabla Markdown',()=>{
 const o=objetos(csvFilas('Proyecto;Precio;Area;Dormitorios;Distrito\nEdif A;"S/ 450,000";65;2;Lince\n'));assert.equal(o.length,1);assert.equal(limpiar(o[0]).precio_m2,6923);
 const m=objetos(mdFilas('| Proyecto | Precio | m2 | Distrito |\n|---|---|---|---|\n| B | 300000 | 60 | Surquillo |'));assert.equal(limpiar(m[0]).distrito,'Surquillo');
});
test('R74: importar, deduplicar, tareas de Claude y resumen',async()=>{
 const store=fakeStore(),M=new Mercado(store,{});
 const csv='Proyecto,Precio,Moneda,Area,Dormitorios,Distrito,URL\nA,250000,USD,100,2,Miraflores,https://p.pe/1\nB,300000,USD,100,3,Miraflores,https://p.pe/2\nC,,USD,90,2,Miraflores,\n';
 const b64=Buffer.from(csv).toString('base64');
 const prev=await M.rpc('mercadoImportar',[{nombre:'x.csv',base64:b64,vista_previa:true}],G);assert.equal(prev.validas,2);assert.equal(prev.descartadas,1);
 const r1=await M.rpc('mercadoImportar',[{nombre:'x.csv',base64:b64}],G);assert.equal(r1.nuevos,2);
 const r2=await M.rpc('mercadoImportar',[{nombre:'x.csv',base64:b64}],G);assert.equal(r2.nuevos,0);assert.equal(r2.actualizados,2);
 await assert.rejects(()=>M.rpc('mercadoTareaCrear',[{distrito:'Miraflores'}],A),/Gerencia/);
 await assert.rejects(()=>M.rpc('mercadoTareaCrear',[{distrito:'Narnia'}],G),/distrito/);
 const t=await M.rpc('mercadoTareaCrear',[{distrito:'Miraflores',portales:['Urbania','Inventado']}],G);assert.deepEqual(t.portales,['Urbania']);
 const tom=await M.rpc('mercadoTareaTomar',[{}],G);assert.equal(tom.tarea.estado,'en_curso');
 const s=await M.rpc('mercadoSubir',[{tarea_id:t.id,comparables:[{precio:180000,moneda:'USD',area:60,dormitorios:1,url:'https://p.pe/3',fuente:'Urbania'},{precio:0,area:0}]}],G);assert.equal(s.nuevos,1);assert.equal(s.validos,1);
 const fin=await M.rpc('mercadoTareaCompletar',[{id:t.id,resumen:'ok'}],G);assert.equal(fin.estado,'completa');
 const lista=(await M.rpc('mercadoTareas',[{}],G)).tareas;assert.equal(lista[0].comparables,1);
 const res=await M.rpc('mercadoResumen',[{distrito:'Miraflores'}],G);assert.equal(res.comparables,3);assert.equal(res.por_moneda.USD.total.mediana,3000);
 await M.rpc('mercadoDescartar',[{id:res.muestra[0].id}],G);assert.equal((await M.rpc('mercadoResumen',[{distrito:'Miraflores'}],G)).comparables,2);
});
test('R74: Excel con exceljs',async()=>{
 const ExcelJS=require('exceljs'),wb=new ExcelJS.Workbook(),ws=wb.addWorksheet('C');ws.addRow(['Distrito','Precio','Área (m²)','Dormitorios']);ws.addRow(['San Isidro',600000,120,3]);
 const buf=Buffer.from(await wb.xlsx.writeBuffer());const M=new Mercado(fakeStore(),{});
 const r=await M.rpc('mercadoImportar',[{nombre:'b.xlsx',base64:buf.toString('base64'),vista_previa:true}],G);assert.equal(r.validas,1);assert.equal(r.muestra[0].precio_m2,5000);
});
test('R74: navegación, puente y conector MCP',async()=>{
 const {navGroups,MANAGER_ONLY,moduleOf}=await import('../src/navModel.mjs');
 assert.ok(MANAGER_ONLY.includes('mercadoEstudio'));assert.equal(moduleOf('mercadoEstudio'),'evaluador');
 assert.ok(navGroups('Gerente','evaluador').flatMap(g=>g.items).some(i=>i[0]==='mercadoEstudio'));
 const {TOOLS}=require('../business/mcpConnector');for(const n of ['mercado_tareas_pendientes','mercado_subir_comparables','mercado_tarea_completar'])assert.ok(TOOLS.find(t=>t.name===n));
 const fs=require('fs');assert.match(fs.readFileSync(__dirname+'/../src/cloudBridge.js','utf8'),/mercadoImportar/);assert.match(fs.readFileSync(__dirname+'/../application.cjs','utf8'),/MERCADO_METHODS/);
 const css=fs.readFileSync(__dirname+'/../src/theme.css','utf8');assert.match(css,/R74 · Menú lateral retráctil/);
});
