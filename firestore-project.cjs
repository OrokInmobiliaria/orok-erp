'use strict';
const {createHash,randomUUID}=require('node:crypto');
const ARRAYS=['leads','units','quotes','separations','deleted_quotes','archived_leads','marketing_expenses','sessions','deleted_duplicate_leads','duplicate_deletion_log'];
const safeId=s=>typeof s==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(s);

// Firestore does not accept undefined at any depth.  This boundary is shared
// by every save path, including older lifecycle routines, so it guarantees an
// optional audit field can never reject an otherwise valid appointment action.
function withoutUndefined(value){
 if(Array.isArray(value))return value.map(item=>item===undefined?null:withoutUndefined(item));
 if(value&&typeof value==='object'&&!(value instanceof Date)){
  const result={};for(const [key,item] of Object.entries(value))if(item!==undefined)result[key]=withoutUndefined(item);return result;
 }
 return value;
}
function records(data){
 const result=new Map(),meta=withoutUndefined(structuredClone(data));
 if('users' in meta||'access_audit' in meta)throw Error('Las cuentas requieren un almacenamiento privado separado.');
 for(const kind of ARRAYS){
  const rows=data[kind]||[];if(!Array.isArray(rows))throw Error('Colección no válida: '+kind);delete meta[kind];const ids=new Set();
  rows.forEach((row,position)=>{const id=kind==='sessions'?String(position):String(row.id??'');if(!id||ids.has(id))throw Error('Identificador vacío o duplicado en '+kind);ids.add(id);const key=createHash('sha256').update(kind+'\0'+id).digest('hex');const value={kind,id,position,data:withoutUndefined(row)};if(Buffer.byteLength(JSON.stringify(value))>800000)throw Error('Registro demasiado grande en '+kind);result.set(key,value);});
 }
 if(Buffer.byteLength(JSON.stringify(meta))>800000)throw Error('Configuración demasiado grande.');return {meta,rows:result};
}
function unpack(meta,docs){const result=structuredClone(meta);for(const kind of ARRAYS)result[kind]=[];for(const doc of docs){const r=doc.data();if(!ARRAYS.includes(r.kind))throw Error('Tipo de registro no reconocido.');result[r.kind].push(r);}for(const kind of ARRAYS)result[kind]=result[kind].sort((a,b)=>a.position-b.position).map(r=>r.data);return result;}
class FirestoreProject{
 constructor(firestore,{collection='orok_projects',project='infinity224'}={}){if(!safeId(collection)||!safeId(project))throw Error('Ruta de proyecto no válida.');this.db=firestore;this.ref=firestore.collection(collection).doc(project);this.meta=this.ref.collection('state').doc('config');this.rows=this.ref.collection('records');this.snapshot=null;}
 async initialize(data){const packed=records(data);packed.meta._state_revision=1;if(packed.rows.size>450)throw Error('La carga inicial supera el tamaño permitido para una transacción.');await this.db.runTransaction(async tx=>{const existing=await tx.get(this.meta);if(existing.exists)throw Error('El proyecto ya tiene datos; no se sobrescribirá.');tx.create(this.meta,packed.meta);for(const [id,row] of packed.rows)tx.create(this.rows.doc(id),row);});}
 async run(callback){return this.db.runTransaction(async tx=>{
  const config=await tx.get(this.meta);if(!config.exists)throw Error('El proyecto todavía no se ha migrado.');
  const currentMeta=config.data(),observed=this.snapshot;
  let data,previous;
  if(observed&&JSON.stringify(observed.meta)===JSON.stringify(currentMeta)){
   data=structuredClone(observed.data);previous=observed.rows;
  }else{
   const documents=await tx.get(this.rows);data=unpack(currentMeta,documents.docs);previous=new Map(documents.docs.map(d=>[d.id,d.data()]));
  }
  let changed=false;const result=await callback({tx,read:()=>structuredClone(data),write:value=>{data=structuredClone(value);changed=true;}});if(!changed)return result;
  const next=records(data),operations=[];next.meta._state_revision=Number(currentMeta._state_revision||0)+1;
  operations.push(()=>tx.set(this.meta,next.meta));
  for(const [id,row] of next.rows)if(JSON.stringify(row)!==JSON.stringify(previous.get(id)))operations.push(()=>tx.set(this.rows.doc(id),row));
  for(const id of previous.keys())if(!next.rows.has(id))operations.push(()=>tx.delete(this.rows.doc(id)));
  if(operations.length>450)throw Error('Demasiados cambios en una sola operación.');for(const action of operations)action();return result;
 });}
 read(){return this.run(({read})=>read());}
 watch(onError=()=>{}){
  let meta,docs,error,readyResolve,cached=null,revision=0,previousRows=new Map();
  const instance=randomUUID(),history=[],ready=new Promise(resolve=>{readyResolve=resolve;});
  const publicKinds=['settings','leads','units','quotes','separations','marketing_expenses','duplicate_deletion_log'];
  const token=()=>instance+':'+revision;
  const publish=kinds=>{
   if(!meta||!docs)return;
   cached=unpack(meta,docs);revision++;
   this.snapshot={data:cached,meta:structuredClone(meta),rows:new Map(previousRows)};
   history.push({revision,kinds:[...new Set(kinds)]});if(history.length>100)history.shift();
   readyResolve();
  };
  const fail=e=>{error=e;readyResolve();onError(e);};
  const offMeta=this.meta.onSnapshot(s=>{
   if(!s.exists)return fail(Error('Proyecto sin migrar.'));
   const next=s.data(),first=!meta;
   // Every write advances _state_revision.  That marker invalidates a server
   // snapshot, but it is not a Settings change and must not make every client
   // download Settings again when only a lead, quote, or unit was updated.
   const settingsChanged=!first&&JSON.stringify(meta.settings??{})!==JSON.stringify(next.settings??{});
   meta=next;
   if(docs&&(first||settingsChanged))publish(first?publicKinds:['settings']);
  },fail);
  const offRows=this.rows.onSnapshot(s=>{
   const nextRows=new Map(s.docs.map(doc=>[doc.id,doc.data()])),kinds=new Set();
   if(!cached)for(const kind of publicKinds)kinds.add(kind);
   else for(const id of new Set([...previousRows.keys(),...nextRows.keys()])){
    const before=previousRows.get(id),after=nextRows.get(id);
    if(JSON.stringify(before)!==JSON.stringify(after))kinds.add(after?.kind||before?.kind);
   }
   previousRows=nextRows;docs=s.docs;
   if(meta&&(kinds.size||!cached))publish([...kinds].filter(Boolean));
  },fail);
  const wait=async()=>{await ready;if(error)throw error;if(!cached)throw Error('El proyecto todavía no está disponible.');};
  return {
   read:async()=>{await wait();return structuredClone(cached);},
   readKind:async kind=>{await wait();return structuredClone(cached[kind]??(ARRAYS.includes(kind)?[]:{}));},
   changes:async(since,kinds=publicKinds)=>{
    await wait();
    const current=token();if(since===current)return {revision:current,changed:{}};
    let selected=new Set(kinds),from=-1;
    if(typeof since==='string'&&since.startsWith(instance+':'))from=Number(since.slice(instance.length+1));
    if(Number.isInteger(from)&&from>=0&&from<=revision&&history.length&&from>=history[0].revision-1){
     selected=new Set();for(const entry of history)if(entry.revision>from)for(const kind of entry.kinds)if(kinds.includes(kind))selected.add(kind);
    }
    const changed={};for(const kind of selected)changed[kind]=structuredClone(cached[kind]??(ARRAYS.includes(kind)?[]:{}));
    return {revision:current,changed};
   },
   close:()=>{offMeta();offRows();this.snapshot=null;}
  };
 }
}
module.exports={FirestoreProject,records,unpack,withoutUndefined};
