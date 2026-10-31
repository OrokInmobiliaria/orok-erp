'use strict';
const test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path');
const {Lecciones}=require('../business/lecciones');
function fakeStore(){const docs=new Map();const ref=p=>({path:p,doc:id=>ref(p+'/'+id),get:async()=>({data:()=>docs.has(p)?structuredClone(docs.get(p)):undefined})});
 const col=p=>({doc:id=>ref(p+'/'+id),limit:()=>({get:async()=>({docs:[...docs].filter(([k])=>k.startsWith(p+'/')).map(([,v])=>({data:()=>structuredClone(v)}))})})});
 return {ref:{collection:n=>col('root/'+n)},db:{runTransaction:async fn=>fn({set:(x,v)=>docs.set(x.path,structuredClone(v))})}};}
const G={name:'Gerente',role:'Gerente'},A={name:'Asesor',role:'Asesor'};
test('R75: lecciones propuestas solo se aplican al aprobarlas',async()=>{
 const L=new Lecciones(fakeStore());
 const l=await L.rpc('leccionProponer',[{ia:'greta',leccion:'No usar la palabra lujo'}],A);assert.equal(l.estado,'propuesta');
 const dup=await L.rpc('leccionProponer',[{ia:'greta',leccion:'no usar la palabra LUJO'}],A);assert.equal(dup.id,l.id);
 assert.equal(await L.instrucciones('greta'),'');
 await assert.rejects(()=>L.rpc('leccionDecidir',[{id:l.id,estado:'aprobada'}],A),/Gerencia/);
 await assert.rejects(()=>L.rpc('leccionesLista',[{}],A),/Gerencia/);
 await L.rpc('leccionDecidir',[{id:l.id,estado:'aprobada',leccion:'Nunca usar la palabra «lujo»'}],G);
 assert.match(await L.instrucciones('greta'),/Nunca usar la palabra «lujo»/);assert.equal(await L.instrucciones('lola'),'');
 const t=await L.rpc('leccionProponer',[{ia:'todas',leccion:'Hablar siempre de usted al cliente'}],G);await L.rpc('leccionDecidir',[{ids:[t.id],estado:'aprobada'}],G);
 assert.match(await L.instrucciones('lola'),/usted/);
 await L.rpc('leccionDecidir',[{id:l.id,estado:'archivada'}],G);assert.doesNotMatch(await L.instrucciones('greta'),/lujo/);
 await assert.rejects(()=>L.rpc('leccionProponer',[{ia:'otra',leccion:'xxxxxxxxxx'}],G),/IA no válida/);
});
test('R75: ayuda por módulo, conexiones y aviso de comentario',async()=>{
 const H=require('../src/helpContent.json');assert.ok(H.modulos.length>=8);for(const m of H.modulos){assert.ok(m.ia.length&&m.tu.length,m.id);assert.ok(['todos','gerencia'].includes(m.roles));}
 const txt=JSON.stringify(H);assert.doesNotMatch(txt,/987208622/);
 const {navGroups,MANAGER_ONLY}=await import('../src/navModel.mjs');assert.ok(MANAGER_ONLY.includes('lecciones'));assert.ok(navGroups('Gerente','crm').flatMap(g=>g.items).some(i=>i[0]==='lecciones'));
 const r=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
 assert.match(r('application.cjs'),/LECCIONES_METHODS/);assert.match(r('business/greta.js'),/lecciones\.instrucciones\('greta'\)/);assert.match(r('business/lolaAssistant.js'),/instrucciones\('lola'\)/);assert.match(r('business/claraErp.js'),/instrucciones\('diava'\)/);
 assert.match(r('src/LeadComments.jsx'),/NO se guardó/);assert.match(r('src/HelpCenter.jsx'),/Lo que la IA hace por ti/);
 assert.ok(require('../business/mcpConnector').TOOLS.find(t=>t.name==='ensenar_a_la_ia'));
 assert.doesNotMatch(r('CLAUDE.md'),/987208622/);
});
