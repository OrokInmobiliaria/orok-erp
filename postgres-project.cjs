'use strict';
const fs=require('node:fs');
const {FirestoreProject}=require('./firestore-project.cjs');
const {PostgresDocuments}=require('./postgres-documents.cjs');
function validateDatabaseScope(config,u){if(config.isolatedR41&&decodeURIComponent(u.pathname)!=='/orok_r41_ensayo_20261028')throw Error('El ensayo R41 requiere su base de datos aislada.');}
function createPool(config){
 const {Pool}=require('pg');
 if(!config.postgresUrlFile)throw Error('Configura LOLA_POSTGRES_URL_FILE; no se utilizará Firestore como memoria de respaldo.');
 const connectionString=fs.readFileSync(config.postgresUrlFile,'utf8').trim(),u=new URL(connectionString);
 if(!['postgres:','postgresql:'].includes(u.protocol)||!u.hostname||!u.password)throw Error('Conexión PostgreSQL incompleta.');
 validateDatabaseScope(config,u);
 if(!Number.isInteger(config.postgresPoolMax)||config.postgresPoolMax<1||config.postgresPoolMax>10)throw Error('El pool PostgreSQL debe tener entre 1 y 10 conexiones.');
 return new Pool({connectionString,max:config.postgresPoolMax,connectionTimeoutMillis:8000,idleTimeoutMillis:30000,application_name:'orok-crm-lola-6769'});
}
async function assertReady(db){
 const {rows}=await db.pool.query('SELECT version FROM lola_unified.migrations WHERE version=1');if(!rows.length)throw Error('Falta la migración SQL de LOLA.');
 const state=await db.collection('orok_projects').doc(db.project).collection('state').doc('config').get();
 if(!state.exists||state.data()._postgres_migration_complete!==true)throw Error('La importación PostgreSQL no está completada; no se inicia la mensajería.');
}
// One lightweight SQL revision read while idle. Public cache is refreshed only
// on commercial changes; chat messages never trigger Firebase reads/listeners.
function attachWatch(db){
 db.listeners=new Set();let timer=null,busy=false,revision=null;
 const refresh=async()=>{if(busy||!db.listeners.size)return;busy=true;try{
  const meta=await db.get(db.collection('orok_projects').doc(db.project).collection('state').doc('config'));
  const next=meta.data()?._state_revision;if(next===revision)return;
  const results=[];for(const l of db.listeners)results.push([l,await db.get(l.ref)]);
  revision=next;for(const [l,s] of results)l.callback(s);
 }catch(e){for(const l of db.listeners)l.onError?.(e);}finally{busy=false;}};
 db.listen=(ref,callback,onError)=>{const l={ref,callback,onError};db.listeners.add(l);revision=null;queueMicrotask(refresh);if(!timer){timer=setInterval(refresh,5000);timer.unref?.();}return ()=>{db.listeners.delete(l);if(!db.listeners.size){clearInterval(timer);timer=null;}};};
}
function projectionTarget(config,firebase){return config.isolatedR41?null:firebase;}
async function createPostgresProject(config,firebase){const pool=createPool(config),db=new PostgresDocuments(pool,{project:config.project,firebase:projectionTarget(config,firebase)});try{await assertReady(db);attachWatch(db);const store=new FirestoreProject(db,{project:config.project});store.persistence='postgresql';const stop=config.isolatedR41?()=>{}:db.startProjection();store.close=async()=>{stop();await pool.end();};return store;}catch(e){await pool.end();throw e;}}
module.exports={createPool,assertReady,attachWatch,createPostgresProject,validateDatabaseScope,projectionTarget};
