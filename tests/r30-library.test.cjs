'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {validateProposal,systemPrompt,saveBrands,readBrands}=require('../business/creativeCampaigns.js');
const slide=(h,c)=>({seconds:2,headline:h,caption:c,voiceover:'',visual:'Foto aprobada',asset_id:null});
const proposal=(scenes,extra={})=>({analysis:{summary:'s',observations:[],limitations:[]},strategy:{audience:'a',placements:['p'],test_plan:'t',budget_notes:'b'},creatives:[{id:'c1',format:'carousel',headline:'Conoce el proyecto',body:'Te invitamos a conocerlo.',cta:'Coordina tu visita',caption:'Escríbenos.',design_notes:'Foto aprobada',scenes,...extra}],checks:[]});
const campaign=(brand={})=>({brief:{formats:['carousel'],facts:[],factsVerified:false},media:[],brand});

test('un carrusel acepta de 2 a 10 láminas y rechaza menos o más',()=>{
 const ok=n=>Array.from({length:n},(_,i)=>slide('Lámina '+(i+1),'Texto breve'));
 assert.equal(validateProposal(proposal(ok(2)),campaign()).creatives[0].scenes.length,2);
 assert.equal(validateProposal(proposal(ok(10)),campaign()).creatives[0].scenes.length,10);
 assert.throws(()=>validateProposal(proposal(ok(1)),campaign()),/Carrusel/);
 assert.throws(()=>validateProposal(proposal(ok(11)),campaign()),/Carrusel/);
});
test('un carrusel mantiene las reglas de precios, ofertas y datos sin respaldo',()=>{
 assert.throws(()=>validateProposal(proposal([slide('Oferta única','x'),slide('b','c')]),campaign()),/condiciones/);
 assert.throws(()=>validateProposal(proposal([slide('Departamentos de 75 m2','x'),slide('b','c')]),campaign()),/respaldo/);
});
test('las palabras prohibidas de la biblioteca de marca bloquean la pieza',()=>{
 assert.throws(()=>validateProposal(proposal([slide('Un lugar Barato','x'),slide('b','c')]),campaign({forbidden_words:['barato']})),/palabra prohibida por la marca: barato/);
 assert.doesNotThrow(()=>validateProposal(proposal([slide('Un lugar cálido','x'),slide('b','c')]),campaign({forbidden_words:['barato']})));
});
test('el prompt incluye tono, palabras prohibidas y hashtags, y por defecto no cambia',()=>{
 const p=systemPrompt({name:'N',project:'P',tone:'cálido y cercano',forbidden_words:['barato','ganga'],hashtags:['#MiProyecto']});
 assert.ok(p.includes('cálido y cercano')&&p.includes('barato, ganga')&&p.includes('#MiProyecto')&&p.includes('carousel'));
 assert.equal(systemPrompt().includes('Tono de marca'),false);
});
test('la biblioteca limpia hashtags y palabras y se guarda de forma privada',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'orok-brand-'));
 const r=saveBrands(dir,{brands:[{name:'E',project:'Torre Sol',address:'Av. Sol 1',tone:' cálido ',forbidden_words:['Barato','barato',''],hashtags:['#Sol','sin-numeral','#a b']}]},'Gerencia');
 assert.deepEqual(r.brands[0].hashtags,['#Sol','#ab']);assert.equal(r.brands[0].forbidden_words.length,2);
 assert.equal(readBrands(dir)[0].tone,'cálido');
 assert.equal((fs.statSync(path.join(dir,'creative-brand.json')).mode&0o077),0);
});
