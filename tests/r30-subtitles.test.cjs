'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
test('los subtítulos siguen la duración de las escenas, no pasan de 2 líneas de 42 caracteres y exportan SRT y VTT',async()=>{
 const {cues,toSrt,toVtt}=await import('../src/subtitles.mjs');
 const scenes=[{seconds:4,voiceover:'Te invitamos a conocer el proyecto y recorrer sus espacios con calma junto a nuestro equipo.',caption:'x'},{seconds:3,voiceover:'',caption:'Coordina tu visita'},{seconds:2,voiceover:'',caption:''}];
 const c=cues(scenes);
 assert.ok(c.length>=3);assert.ok(c.every(x=>x.text.split('\n').length<=2&&x.text.split('\n').every(l=>l.length<=42)));
 assert.equal(Math.round(c.at(-1).end*1000)/1000,7);assert.equal(c[0].start,0);
 for(let i=1;i<c.length;i++)assert.ok(c[i].start>=c[i-1].end-1e-9&&c[i].end>c[i].start);
 const srt=toSrt(scenes),vtt=toVtt(scenes);
 assert.match(srt,/^1\n00:00:00,000 --> /);assert.ok(vtt.startsWith('WEBVTT\n\n00:00:00.000 --> '));assert.ok(srt.includes('Coordina tu visita'));
 assert.equal(cues([]).length,0);
});
