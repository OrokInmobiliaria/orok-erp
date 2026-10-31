'use strict';
const test=require('node:test'),assert=require('node:assert'),fs=require('fs'),os=require('os'),path=require('path'),zlib=require('zlib');
const cp=require('../business/comentariosPerdidos');
test('R71: encuentra comentarios que están en un respaldo y no en el lead actual, y los restaura sin borrar nada',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cp'));fs.mkdirSync(path.join(dir,'backups'));
 const viejo={leads:[{id:'a',lead_number:'LD-1',name:'Ana',comment_history:[{id:'c1',at:'2026-10-29T16:00:00Z',author:'Antonio',text:'Llamó'},{id:'c0',at:'2026-10-29T10:00:00Z',author:'X',text:'antes'}]}]};
 fs.writeFileSync(path.join(dir,'backups','crm-x.json.gz'),zlib.gzipSync(JSON.stringify({created_at:'2026-10-29T17:00:00Z',reason:'r',data:viejo})));
 const actual={leads:[{id:'a',lead_number:'LD-1',name:'Ana',comment_history:[{id:'c2',at:'2026-10-30T10:00:00Z',author:'M',text:'nuevo'}],events:[]}]};
 const r=cp.buscar(dir,actual);assert.equal(r.faltantes.length,1);assert.equal(r.faltantes[0].comment_id,'c1');
 const ev=[];const out=cp.restaurar(actual,r.faltantes,[],'Gerente',{event:(l,t)=>ev.push(t)});
 assert.equal(out.restaurados,1);assert.deepEqual(actual.leads[0].comment_history.map(c=>c.id),['c1','c2']);
 assert.equal(cp.restaurar(actual,r.faltantes,[],'Gerente',{event(){}}).restaurados,0);
});
