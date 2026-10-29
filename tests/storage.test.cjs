const {test}=require('node:test');
const assert=require('node:assert/strict');
const {records,unpack,FirestoreProject}=require('../firestore-project.cjs');
const {MemoryFirestore}=require('./memory-firestore.cjs');
const fixture=()=>({settings:{projectName:'Test'},quote_sequence:1481,leads:[{id:'l',status:'Venta'}],units:[{id:'u',unit_number:'101',status:'SOLD'}],quotes:[],deleted_quotes:[{id:'q',deleted_at:'2026-09-01'}],sessions:[{seller:'Example'}]});
test('round trip preserves data and separates active/deleted quotes',()=>{const d=fixture(),r=records(d),out=unpack(r.meta,[...r.rows].reverse().map(([id,value])=>({id,data:()=>value})));assert.deepEqual(out,{...d,separations:[],archived_leads:[],marketing_expenses:[],deleted_duplicate_leads:[],duplicate_deletion_log:[]});assert.equal(out.quotes.length,0);assert.equal(out.deleted_quotes.length,1);});
test('refuses duplicated records, credentials and oversized records',()=>{const d=fixture();d.leads.push({...d.leads[0]});assert.throws(()=>records(d),/duplicado/);assert.throws(()=>records({...fixture(),users:[]}),/privado/);const big=fixture();big.leads[0].notes='x'.repeat(810000);assert.throws(()=>records(big),/grande/);});
test('rejects traversal before contacting Firestore',()=>{assert.throws(()=>new FirestoreProject(null,{project:'../../other'}),/Ruta/);});
test('workspace cache sends a full snapshot once and only changed collections afterwards',async()=>{
 const db=new MemoryFirestore(),store=new FirestoreProject(db);await store.initialize(fixture());
 const cache=store.watch();
 try{
  const initial=await cache.changes(null,['settings','leads','units','quotes']);
  assert.deepEqual(Object.keys(initial.changed).sort(),['leads','quotes','settings','units']);
  assert.deepEqual(await cache.changes(initial.revision,['settings','leads','units','quotes']),{revision:initial.revision,changed:{}});
  await store.run(({read,write})=>{const data=read();data.leads[0].status='Información enviada';write(data);});
  const delta=await cache.changes(initial.revision,['settings','leads','units','quotes']);
  assert.deepEqual(Object.keys(delta.changed),['leads']);
  assert.equal(delta.changed.leads[0].status,'Información enviada');
  assert.equal('units'in delta.changed,false);
 }finally{cache.close();}
});
