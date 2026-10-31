'use strict';
const test=require('node:test'),assert=require('node:assert'),fs=require('fs'),os=require('os'),path=require('path');
const {GretaPlan,lunesDe,limpiarPieza,DEFAULT_MARCA}=require('../business/gretaPlan');
function fakeStore(){const docs=new Map();const ref=p=>({path:p,doc:id=>ref(p+'/'+id),collection:n=>col(p+'/'+n),get:async()=>({data:()=>docs.has(p)?structuredClone(docs.get(p)):undefined})});
 const col=p=>{const q=(filters=[],ord=null)=>({doc:id=>ref(p+'/'+id),where:(f,o,v)=>q([...filters,[f,v]],ord),orderBy:(f,d)=>q(filters,[f,d]),limit:()=>q(filters,ord),get:async()=>{let rows=[...docs].filter(([k])=>k.startsWith(p+'/')&&k.split('/').length===p.split('/').length+1).map(([,v])=>v).filter(v=>filters.every(([f,x])=>v[f]===x));if(ord)rows.sort((a,b)=>String(a[ord[0]]).localeCompare(String(b[ord[0]]))*(ord[1]==='desc'?-1:1));return {docs:rows.map(v=>({data:()=>structuredClone(v)}))};}});return q();};
 const r=ref('root');r.collection=n=>col('root/'+n);
 const tx={set:(x,v)=>docs.set(x.path,structuredClone(v)),delete:x=>docs.delete(x.path)};
 return {ref:r,db:{runTransaction:async fn=>fn(tx)},docs};}
test('R73: lunes de la semana y limpieza de piezas',()=>{
 assert.equal(lunesDe('2026-11-05'),'2026-11-02');
 const p=limpiarPieza({hora:'09:15',formato:'reel',titulo:'Luz natural',gancho:{texto_pantalla:'¿Solo 8 vecinos?'},hashtags:['#ORÖK','boutique','#mal tag'],produccion:'equipo'},0,{semana_id:'s',fecha:'2026-11-02',red:'tiktok'});
 assert.equal(p.estado,'borrador');assert.equal(p.produccion,'equipo');assert.deepEqual(p.hashtags,['#ORÖK','#boutique','#maltag']);
});
test('R73: semana, generación por red y día, aprobación',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gp'));const store=fakeStore();
 const greta={store,dir,publications:null,skill:()=>({texto:'reglas',version:'x'}),ai:async(u,d,sys,prompt)=>({texto:JSON.stringify({piezas:[1,2,3,4,5].map(i=>({hora:'1'+i+':00',formato:'reel',titulo:'P'+i,gancho:{texto_pantalla:'G'+i},guion:[{seg:'0-2',visual:'v',texto_pantalla:'t',motion:'m',voz:'z'}],hashtags:['#a'+i]}))}),fuentes:[],web:false})};
 const P=new GretaPlan(greta),u={name:'Gerente'};
 assert.equal(P.marca().colores[0].hex,DEFAULT_MARCA.colores[0].hex);
 const s=await P.crearSemana({inicio:'2026-11-04'},u);assert.equal(s.inicio,'2026-11-02');
 const r=await P.generar({semana_id:s.id,fecha:'2026-11-02',red:'instagram'},u,{});assert.equal(r.piezas.length,7);
 const again=await P.generar({semana_id:s.id,fecha:'2026-11-02',red:'instagram'},u,{});assert.equal(again.ya_existian,true);
 const a=await P.aprobarDia({semana_id:s.id,fecha:'2026-11-02'},u);assert.equal(a.aprobadas,7);
 const full=await P.semana(s.id);assert.ok(full.piezas.every(p=>p.estado==='aprobada'));
 await assert.rejects(()=>P.generar({semana_id:s.id,fecha:'2026-12-01',red:'instagram'},u,{}),/día/);
});
test('R74b: 7 piezas por red, distintas, con características y límite de hashtags por red',()=>{
 const {SPECS,SLOTS,POR_DIA,MAX_TAGS,limpiarPieza:lp}=require('../business/gretaPlan');
 assert.equal(POR_DIA,7);for(const r of ['instagram','facebook','tiktok']){assert.equal(SLOTS[r].length,7);assert.ok(SPECS[r].includes('9:16'));}
 const p=lp({hashtags:['#a1','#b2','#c3','#d4','#e5','#f6','#g7']},5,{semana_id:'s',fecha:'2026-11-02',red:'facebook',desde:4});
 assert.equal(p.hashtags.length,MAX_TAGS.facebook);assert.equal(p.orden,10);assert.equal(p.hora,SLOTS.facebook[9]?.hora||'19:00');
});
