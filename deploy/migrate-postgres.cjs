'use strict';
// Run from the existing CRM service, with old writers stopped. No secrets printed.
const fs=require('node:fs'),path=require('node:path');
const {config:readConfig}=require('../config.cjs');
const {PostgresDocuments}=require('../postgres-documents.cjs');
const {FirestoreProject}=require('../firestore-project.cjs');
const {createPool}=require('../postgres-project.cjs');
async function importProject({source,target,apply=false}){
 const marker=target.collection('orok_projects').doc(target.project).collection('state').doc('config');
 try{if((await marker.get()).exists)throw Error('El destino ya contiene un proyecto; no se sobrescribirá.');}catch(e){if(apply||e.code!=='42P01')throw e;}
 let documents=0,collections=0;
 async function walk(collection){collections++;let query=collection.orderBy('__name__').limit(100),last;
  while(true){const page=await query.get();if(!page.docs.length)break;
   if(apply)await target.runTransaction(async tx=>{for(const d of page.docs){const local=new (require('../postgres-documents.cjs').Ref)(target,d.ref.path);tx.create(local,d.data());}});
   documents+=page.docs.length;
   for(const d of page.docs)for(const child of await d.ref.listCollections())await walk(child);
   if(page.docs.length<100)break;last=page.docs.at(-1);query=collection.orderBy('__name__').startAfter(last).limit(100);
  }
 }
 // The config is imported LAST and marked ready only after every collection was copied.
 const sourceConfig=(await source.meta.get()).data();if(!sourceConfig)throw Error('CRM origen sin inicializar.');
 for(const collection of await source.ref.listCollections())if(!['state','postgres_projection_markers'].includes(collection.id))await walk(collection);
 if(apply)await target.runTransaction(async tx=>tx.create(marker,{...sourceConfig,_postgres_migration_complete:true,_postgres_migrated_at:new Date().toISOString()}));
 return {apply,documents,collections,ready:apply};
}
async function main(){const config=readConfig(),args=new Set(process.argv.slice(2)),apply=args.has('--apply');if(apply&&!args.has('--writers-stopped'))throw Error('Detén la versión anterior y confirma --writers-stopped.');
 const {initializeApp,cert,deleteApp}=require('firebase-admin/app'),{getFirestore}=require('firebase-admin/firestore');const firebase=initializeApp({credential:cert(JSON.parse(fs.readFileSync(config.credential,'utf8')))}),firestore=getFirestore(firebase),source=new FirestoreProject(firestore,{project:config.project}),pool=createPool(config),target=new PostgresDocuments(pool,{project:config.project,firebase:firestore});
 try{const schema=fs.readFileSync(path.join(__dirname,'../migrations/001-lola-postgres.sql'),'utf8');if(args.has('--install-schema')){if(!apply)throw Error('--install-schema requiere --apply.');await pool.query(schema);}
  const result=await importProject({source,target,apply});console.log(JSON.stringify(result));
 }finally{await pool.end();await deleteApp(firebase);}
}
if(require.main===module)main().catch(()=>{console.error('Migración detenida. Revisa destino, permisos y copia de seguridad; no se borró el origen. Si hubo importación parcial, concilia el destino antes de reintentar.');process.exitCode=1;});
module.exports={importProject};
