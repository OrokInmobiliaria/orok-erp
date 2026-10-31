'use strict';
const test=require('node:test'),assert=require('node:assert');
const {composicion,escenas,medidas,esVideo}=require('../business/videoHF');
const p={id:'p1',titulo:'Luz natural',formato:'reel',gancho:{texto_pantalla:'¿Solo 8 vecinos?'},cta:'Agenda tu visita',guion:[{seg:'0-2',texto_pantalla:'¿Solo 8 vecinos?'},{seg:'2-5',texto_pantalla:'Arquitectura de autor'},{seg:'5-30',texto_pantalla:'Escena larga'},{seg:'',voz:'Departamentos con luz natural. Más texto.'}],
 versiones:{facebook:{medidas:'Feed 4:5 · 1080×1350',cta:'Escríbenos por WhatsApp',formato:'video'},instagram:{medidas:'Reel 9:16'},tiktok:{formato:'video'}}};
test('R77: escenas con gancho, guion y CTA por red',()=>{
 const e=escenas(p,'instagram');assert.equal(e[0].tipo,'gancho');assert.equal(e[0].dur,2);assert.equal(e.at(-1).texto,'Agenda tu visita');
 assert.equal(e.filter(x=>x.texto==='¿Solo 8 vecinos?').length,1);assert.equal(e.find(x=>x.texto==='Escena larga').dur,6);assert.ok(e.some(x=>x.texto==='Departamentos con luz natural'));
 assert.equal(escenas(p,'facebook').at(-1).texto,'Escríbenos por WhatsApp');
});
test('R77: medidas por red y composición segura',()=>{
 assert.deepEqual(medidas('facebook',p.versiones.facebook),{w:1080,h:1350});assert.deepEqual(medidas('tiktok',{}),{w:1080,h:1920});
 const c=composicion({...p,gancho:{texto_pantalla:'<script>x</script>'}},'tiktok',{nombre:'ÖRÖK Inmobiliaria',colores:[{hex:'#85442A'}]});
 assert.equal(c.w,1080);assert.equal(c.h,1920);assert.doesNotMatch(c.html,/<script>x/);assert.match(c.html,/&lt;script&gt;/);assert.match(c.html,/data-composition-id="main"/);assert.match(c.html,/#85442A/);assert.match(c.html,/>ÖRÖK</);
 assert.ok(esVideo('reel'));assert.ok(!esVideo('carrusel'));assert.ok(!esVideo('modo foto'));
});
