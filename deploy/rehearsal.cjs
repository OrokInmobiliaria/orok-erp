'use strict';
const fs=require('node:fs'),path=require('node:path');
const PROJECT='infinity224_pruebas_955318057';
const PREPRODUCTION_PROJECT='infinity224_preproduccion_r28';
const ALLOWED_PROJECTS=new Set([PROJECT,PREPRODUCTION_PROJECT]);
const TEMPLATE='00-Lola-ENSAYO-67.6.10-CONFIGURAR-INACTIVO.json';
function assertRehearsal(origin,project){
 const u=new URL(origin);
 if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash||u.port||['crm.orok.com.pe','orok.com.pe','www.orok.com.pe','localhost'].includes(u.hostname)||u.hostname.endsWith('.invalid')||!u.hostname.includes('.'))throw Error('Indica el origen HTTPS real y exclusivo del ensayo.');
 if(!ALLOWED_PROJECTS.has(project))throw Error('El ensayo requiere su proyecto de datos exclusivo.');
 return {origin:u.origin,project};
}
function prepareWorkflow(template,{origin,project,claudeModel=null,enableClaude=false}){
 const target=assertRehearsal(origin,project),f=structuredClone(template);
 if(enableClaude&&!/^claude-[a-z0-9.-]{3,90}$/.test(claudeModel||''))throw Error('Selecciona un modelo Claude disponible antes de habilitarlo.');
 for(const n of f.nodes){
  n.credentials&&delete n.credentials;
  if(n.type==='n8n-nodes-base.httpRequest'&&String(n.parameters.url).startsWith('https://crm-ensayo.invalid/'))n.parameters.url=n.parameters.url.replace('https://crm-ensayo.invalid',target.origin);
  if(n.name==='Evaluar apoyo condicional de Claude')n.parameters.jsCode=n.parameters.jsCode.replace('const HABILITAR_CLAUDE=false;',`const HABILITAR_CLAUDE=${enableClaude===true};`);
  if(n.type==='@n8n/n8n-nodes-langchain.lmChatAnthropic'&&claudeModel)n.parameters.model={__rl:true,mode:'id',value:claudeModel};
 }
 const serialized=JSON.stringify(f.nodes.filter(n=>!n.type.endsWith('.stickyNote')));
 if(serialized.includes('https://crm.orok.com.pe/')||serialized.includes("['infinity224',")||serialized.includes('https://crm-ensayo.invalid/'))throw Error('El flujo mantiene destinos sin aislar.');
 f.active=false;f.pinData={};f.name='LOLA · ENSAYO 955318057 · 67.6.10 · INACTIVO';
 return f;
}
function emptyData(){return {_postgres_migration_complete:true,_rehearsal:true,_rehearsal_created_at:new Date().toISOString(),settings:{projectName:'Infinity 224 · ENSAYO',brandColor:'#85442a',lolaDriveEnabled:true},leads:[],units:[],quotes:[],separations:[]};}
async function initializeRehearsal(pool,{origin,project,apply=false,installSchema=false}){
 assertRehearsal(origin,project);
 const {PostgresDocuments}=require('../postgres-documents.cjs'),{FirestoreProject}=require('../firestore-project.cjs');
 const db=new PostgresDocuments(pool,{project}),store=new FirestoreProject(db,{project});
 let schemaInstalled=true;
 try{const s=await store.meta.get();if(s.exists)throw Error('El proyecto de ensayo ya tiene datos; no se sobrescribe.');}
 catch(e){if(e.code!=='42P01')throw e;schemaInstalled=false;}
 if(!apply)return {apply:false,project,schemaInstalled,ready:false,source_data_copied:false};
 if(!schemaInstalled){if(!installSchema)throw Error('Falta instalar el esquema SQL del ensayo.');await pool.query(fs.readFileSync(path.join(__dirname,'../migrations/001-lola-postgres.sql'),'utf8'));}
 await store.initialize(emptyData());return {apply:true,project,ready:true,source_data_copied:false};
}
module.exports={PROJECT,PREPRODUCTION_PROJECT,TEMPLATE,assertRehearsal,prepareWorkflow,emptyData,initializeRehearsal};
