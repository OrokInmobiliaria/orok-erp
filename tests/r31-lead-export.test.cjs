'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const {LeadExport,rows,csv,xlsx,sheetId}=require('../business/leadExport.js');
const {MemoryFirestore}=require('./memory-firestore.cjs'),{FirestoreProject}=require('../firestore-project.cjs');
const leads=[{id:'a',code:'LD-1',name:'Ana <Pérez> & Co',phone:'51911111111',email:'ana@x.pe',dni:'12345678',address:'Calle 1',status:'Cita',source:'Facebook',received_at:'2026-10-20T15:00:00Z'},{id:'b',name:'=HYPERLINK("x")',phone:'51922222222',status:'MQL'},{id:'c',name:'Otro',status:'Venta'}];
function unzip(buf){const out={};let i=0;while(buf.readUInt32LE(i)===0x04034b50){const n=buf.readUInt16LE(i+26),e=buf.readUInt16LE(i+28),size=buf.readUInt32LE(i+18),crc=buf.readUInt32LE(i+14),name=buf.subarray(i+30,i+30+n).toString(),data=buf.subarray(i+30+n+e,i+30+n+e+size);assert.equal(zlib.crc32(data),crc,name);out[name]=data.toString();i+=30+n+e+size;}return out;}
async function rig(client){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'orok-exp-')),store=new FirestoreProject(new MemoryFirestore());await store.initialize({settings:{},leads:[],units:[],quotes:[],separations:[]});return {dir,x:new LeadExport(store,{privateDir:dir},{sheetsClient:client})};}

test('las filas exportan solo los leads elegidos y nunca DNI ni dirección',()=>{
 const t=rows(leads,['a','b']);assert.equal(t.length,3);assert.equal(t[1][1],'Ana <Pérez> & Co');
 assert.equal(JSON.stringify(t).includes('12345678'),false);assert.equal(JSON.stringify(t).includes('Calle 1'),false);
 assert.equal(rows(leads).length,4);assert.throws(()=>rows(leads,Array.from({length:5001},(_,i)=>'x'+i)),/5000/);
});
test('el CSV neutraliza fórmulas y trae BOM para Excel',()=>{const c=csv(rows(leads,['b']));assert.ok(c.startsWith('﻿'));assert.ok(c.includes(`"'=HYPERLINK(""x"")"`));});
test('el XLSX es un zip válido con encabezado congelado, filtro y texto escapado',()=>{
 const f=unzip(xlsx(rows(leads,['a','b'])));
 for(const k of ['[Content_Types].xml','_rels/.rels','xl/workbook.xml','xl/_rels/workbook.xml.rels','xl/styles.xml','xl/worksheets/sheet1.xml'])assert.ok(f[k],k);
 const s=f['xl/worksheets/sheet1.xml'];assert.ok(s.includes('Ana &lt;Pérez&gt; &amp; Co'));assert.ok(s.includes('state="frozen"'));assert.ok(s.includes('<autoFilter ref="A1:P3"/>'));
 assert.ok(!s.includes('<f>'),'no debe haber fórmulas');
});
test('la exportación de archivo queda registrada',async()=>{
 const {x}=await rig();const r=await x.file({leads},{ids:['a','c'],format:'xlsx'},'Gerente 1');
 assert.equal(r.count,2);assert.match(r.filename,/^leads-\d{4}-\d{2}-\d{2}\.xlsx$/);assert.equal(Buffer.from(r.base64,'base64').readUInt32LE(0),0x04034b50);
 const h=await x.history();assert.equal(h[0].actor,'Gerente 1');assert.equal(h[0].count,2);assert.equal(h[0].format,'xlsx');
 await assert.rejects(x.file({leads},{ids:['nada']},'G'),/No hay leads/);
});
test('Google Sheets: crea una pestaña nueva, escribe sin interpretar fórmulas y explica el permiso faltante',async()=>{
 const calls=[];const client={request:async q=>{calls.push(q);if(q.url.endsWith(':batchUpdate'))return {data:{replies:[{addSheet:{properties:{sheetId:77}}}]}};return {data:{}};}};
 const {x}=await rig(client);
 await assert.rejects(x.toSheet({leads},{ids:['a']},'G'),/Configura primero/);
 assert.throws(()=>x.config({spreadsheet_url:'https://example.com/hoja'},'G'),/Google Sheets/);
 x.config({spreadsheet_url:'https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/edit'},'G');
 const r=await x.toSheet({leads},{ids:['a','b']},'G');
 assert.equal(r.count,2);assert.match(r.url,/#gid=77$/);
 assert.match(calls[1].url,/valueInputOption=RAW/);assert.equal(calls[1].data.values.length,3);assert.equal(calls[1].data.values[2][1],'=HYPERLINK("x")');
 const denied=(await rig({request:async()=>{const e=Error('x');e.response={status:403};throw e;}})).x;
 denied.config({spreadsheet_url:'https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/edit'},'G');
 await assert.rejects(denied.toSheet({leads},{ids:['a']},'G'),/compartida como Editor/);
 assert.equal(sheetId('https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/edit#gid=0'),'1AbCdEfGhIjKlMnOpQrStUvWxYz012345');
});
