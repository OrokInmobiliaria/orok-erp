'use strict';
const {createHash}=require('node:crypto');
const {withoutUndefined}=require('./firestore-project.cjs');
const clone=v=>v===undefined?undefined:structuredClone(v);
const safePath=p=>{if(typeof p!=='string'||!p||p.length>1500||p.split('/').some(s=>!s||s==='.'||s==='..'||/[\x00-\x1f]/.test(s)))throw Error('Ruta SQL no válida.');return p;};
class Ref{
 constructor(db,path,collection=false,options={}){this.db=db;this.path=safePath(path);this.id=path.split('/').at(-1);this._collection=collection;this.options=options;}
 collection(name){return new Ref(this.db,this.path+'/'+safePath(name),true);}
 doc(name){if(!this._collection||String(name).includes('/'))throw Error('Documento SQL no válido.');return new Ref(this.db,this.path+'/'+safePath(String(name)));}
 where(field,op,value){if(!this._collection||!['==','in','>=','<=','>','<'].includes(op))throw Error('Consulta SQL no admitida.');return new Ref(this.db,this.path,true,{...this.options,filters:[...(this.options.filters||[]),{field,op,value}]});}
 orderBy(field,direction='asc'){if(!this._collection||!['asc','desc'].includes(direction))throw Error('Orden SQL no válido.');return new Ref(this.db,this.path,true,{...this.options,field,direction});}
 startAfter(value){return new Ref(this.db,this.path,true,{...this.options,after:value});}
 limit(value){if(!Number.isInteger(value)||value<1||value>10000)throw Error('Límite SQL no válido.');return new Ref(this.db,this.path,true,{...this.options,limit:value});}
 get(){return this.db.get(this);}
 onSnapshot(callback,onError){if(!this.db.listen)throw Error('Listener SQL no preparado.');return this.db.listen(this,callback,onError);}
}
function snapshot(ref,body){return {id:ref.id,ref,exists:body!==undefined,data:()=>clone(body)};}
function fieldParts(field){if(typeof field!=='string'||!/^\w+(?:\.\w+)*$/.test(field))throw Error('Campo SQL no válido.');return field.split('.');}
function buildQuery(project,ref){
 const values=[project,ref.path],add=v=>{values.push(v);return '$'+values.length;};
 if(!ref._collection)return {text:'SELECT path,body FROM lola_unified.documents WHERE project_id=$1 AND path=$2',values};
 const o=ref.options,clauses=['project_id=$1','collection_path=$2'];
 const field=f=>{const parts=fieldParts(f);return parts.length===1?"(body->>'"+parts[0]+"')":"(body #>> '{"+parts.join(',')+"}')";};
 for(const f of o.filters||[]){const expression=field(f.field);if(f.op==='in'){if(!Array.isArray(f.value)||!f.value.length||f.value.length>30)throw Error('Filtro SQL no válido.');clauses.push(expression+' = ANY('+add(f.value.map(String))+'::text[])');}else if(typeof f.value==='number'){if(!Number.isFinite(f.value))throw Error('Número SQL no válido.');clauses.push('('+expression+')::numeric '+(f.op==='=='?'=':f.op)+' '+add(f.value));}else clauses.push(expression+' '+(f.op==='=='?'=':f.op)+' '+add(String(f.value)));}
 let sort='path ASC';
 if(o.field){const expression=field(o.field);clauses.push(expression+' IS NOT NULL');sort=expression+' '+(o.direction||'asc').toUpperCase()+', path '+(o.direction||'asc').toUpperCase();
  if(o.after!==undefined){let value=o.after,cursorPath=null;if(value&&typeof value.data==='function'){const data=value.data();cursorPath=value.ref.path;value=fieldParts(o.field).reduce((v,k)=>v?.[k],data);}if(value===undefined)throw Error('Cursor SQL sin valor.');const bound=add(String(value)),op=o.direction==='desc'?' < ':' > ';clauses.push(cursorPath?'('+expression+op+bound+' OR ('+expression+' = '+bound+' AND path'+op+add(cursorPath)+'))':expression+op+bound);}
 }else if(o.after!==undefined)throw Error('El cursor requiere un orden explícito.');
 return {text:'SELECT path,body FROM lola_unified.documents WHERE '+clauses.join(' AND ')+' ORDER BY '+sort+(o.limit?' LIMIT '+add(o.limit):''),values};
}
class PostgresDocuments{
 constructor(pool,{project='infinity224',collection='orok_projects',firebase=null}={}){if(!/^[\w-]{1,100}$/.test(project)||!/^\w+$/.test(collection))throw Error('Proyecto SQL no válido.');this.pool=pool;this.project=project;this.root=collection+'/'+project;this.firebase=firebase;this.lastProjectionError=null;this.lastProjectionAt=null;this.projecting=null;this.onProjection=()=>{};}
 collection(name){return new Ref(this,safePath(name),true);}
 assertScope(ref){if(ref.db!==this||!(ref.path===this.root||ref.path.startsWith(this.root+'/')))throw Error('Documento fuera del proyecto SQL.');}
 async get(ref,client=this.pool){this.assertScope(ref);const q=buildQuery(this.project,ref),{rows}=await client.query(q.text,q.values);if(!ref._collection)return snapshot(ref,rows[0]?.body);const docs=rows.map(r=>snapshot(new Ref(this,r.path),r.body));return {docs,size:docs.length,empty:!docs.length};}
 isCommercial(path){const rest=path.slice(this.root.length+1);return rest==='state/config'||rest.startsWith('records/')||['publications','publication_attribution','publication_analysis','ads_daily','ads_attribution','ads_sync_runs'].some(c=>rest.startsWith(c+'/')&&rest.split('/').length===2);}
 async runTransaction(callback){
  const client=await this.pool.connect();let committed=false;
  try{
   await client.query('BEGIN');await client.query("SET LOCAL lock_timeout='5s'");await client.query("SET LOCAL statement_timeout='15s'");
   // One project lock keeps the pre-existing combined commercial/conversation
   // transactions atomic. No external provider calls occur in this adapter.
   await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[this.root]);
   const writes=[],observed=new Map();
   const tx={persistence:'postgresql',get:async ref=>{if(writes.length)throw Error('Todas las lecturas deben preceder a las escrituras.');const s=await this.get(ref,client);if(ref._collection)for(const d of s.docs)observed.set(d.ref.path,d.data());else observed.set(ref.path,s.data());return s;},set:(ref,data)=>writes.push({op:'set',ref,data}),create:(ref,data)=>writes.push({op:'create',ref,data}),update:(ref,data)=>writes.push({op:'update',ref,data}),delete:ref=>writes.push({op:'delete',ref})};
   const result=await callback(tx);
   for(const w of writes){
    this.assertScope(w.ref);if(w.ref._collection)throw Error('Se esperaba un documento.');const path=w.ref.path;
    const previous=observed.has(path)?observed.get(path):(await this.get(w.ref,client)).data();
    if(w.op==='create'&&previous!==undefined)throw Error('El documento SQL ya existe.');if(w.op==='update'&&previous===undefined)throw Error('Documento SQL no encontrado.');
    const body=w.op==='delete'?undefined:withoutUndefined(w.op==='update'?{...previous,...w.data}:w.data);
    if(JSON.stringify(body)===JSON.stringify(previous))continue;
    if(body!==undefined&&(typeof body!=='object'||body===null||Buffer.byteLength(JSON.stringify(body))>1000000))throw Error('Documento SQL no válido o demasiado grande.');
    const revision=String((await client.query("SELECT nextval('lola_unified.change_revision') AS revision")).rows[0].revision);
    if(body===undefined)await client.query('DELETE FROM lola_unified.documents WHERE project_id=$1 AND path=$2',[this.project,path]);
    else await client.query('INSERT INTO lola_unified.documents(project_id,path,collection_path,doc_id,body,revision) VALUES($1,$2,$3,$4,$5::jsonb,$6) ON CONFLICT(project_id,path) DO UPDATE SET body=EXCLUDED.body,revision=EXCLUDED.revision,updated_at=clock_timestamp()',[this.project,path,path.slice(0,path.lastIndexOf('/')),w.ref.id,JSON.stringify(body),revision]);
    // Changing only the SQL revision counter is not a commercial update.
    const comparable=v=>{const x={...v};delete x._state_revision;return x;};
    if(this.isCommercial(path)&&!(path.endsWith('/state/config')&&previous&&body&&JSON.stringify(comparable(previous))===JSON.stringify(comparable(body))))await client.query('INSERT INTO lola_unified.firebase_outbox(project_id,path,revision,deleted) VALUES($1,$2,$3,$4) ON CONFLICT(project_id,path) DO UPDATE SET revision=EXCLUDED.revision,deleted=EXCLUDED.deleted',[this.project,path,revision,body===undefined]);
    observed.set(path,body);
   }
   await client.query('COMMIT');committed=true;if(writes.length)this.onProjection();return result;
  }catch(error){if(!committed)await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
 }
 async flushProjection(){
  if(!this.firebase)return {configured:false,pending:null};if(this.projecting)return this.projecting;
  this.projecting=(async()=>{const {rows}=await this.pool.query('SELECT o.path,o.revision::text,o.deleted,d.body FROM lola_unified.firebase_outbox o LEFT JOIN lola_unified.documents d ON d.project_id=o.project_id AND d.path=o.path WHERE o.project_id=$1 ORDER BY o.revision LIMIT 100',[this.project]);let applied=0;
   for(const row of rows){const target=this.firebase.doc(row.path),marker=this.firebase.doc(this.root+'/postgres_projection_markers/'+createHash('sha256').update(row.path).digest('hex'));
    await this.firebase.runTransaction(async tx=>{const old=(await tx.get(marker)).data();if(old&&BigInt(old.revision)>=BigInt(row.revision))return;if(row.deleted)tx.delete(target);else{if(!row.body)throw Error('Proyección SQL sin datos.');tx.set(target,row.body);}tx.set(marker,{revision:row.revision,updated_at:new Date().toISOString()});});
    await this.pool.query('DELETE FROM lola_unified.firebase_outbox WHERE project_id=$1 AND path=$2 AND revision=$3',[this.project,row.path,row.revision]);applied++;
   }this.lastProjectionError=null;this.lastProjectionAt=new Date().toISOString();return {configured:true,applied};
  })().catch(e=>{this.lastProjectionError=String(e.code||'projection_pending');throw e;}).finally(()=>{this.projecting=null;});return this.projecting;
 }
 startProjection(){let stopped=false,pending=null;const run=()=>{if(stopped||pending)return;pending=setTimeout(()=>{pending=null;this.flushProjection().catch(()=>{});},1000);pending.unref?.();};this.onProjection=run;const timer=setInterval(run,30000);timer.unref?.();run();return ()=>{stopped=true;clearTimeout(pending);clearInterval(timer);this.onProjection=()=>{};};}
}
module.exports={PostgresDocuments,buildQuery,Ref};
