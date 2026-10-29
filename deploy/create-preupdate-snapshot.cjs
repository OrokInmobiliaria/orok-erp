'use strict';

// Punto de control inmutable previo a cualquier publicación. Lee PostgreSQL,
// que es la fuente autoritativa del CRM, y no realiza ninguna escritura.
const fs=require('node:fs/promises');
const path=require('node:path');
const zlib=require('node:zlib');
const {promisify}=require('node:util');
const {createHash,randomUUID}=require('node:crypto');
const {config:readConfig}=require('../config.cjs');
const {createPool,assertReady}=require('../postgres-project.cjs');
const {PostgresDocuments}=require('../postgres-documents.cjs');
const {FirestoreProject}=require('../firestore-project.cjs');

const gzip=promisify(zlib.gzip),gunzip=promisify(zlib.gunzip);
const VERSION=require('../package.json').version;
const sha256=value=>createHash('sha256').update(value).digest('hex');
const stamp=value=>new Date(value).toISOString().replace(/[:.]/g,'-');
async function atomic(file,value){const temporary=file+'.'+randomUUID()+'.tmp';await fs.writeFile(temporary,value,{mode:0o600});await fs.rename(temporary,file);}
function countBy(rows,selector){return rows.reduce((result,row)=>{const value=selector(row)||'';result[value]=(result[value]||0)+1;return result;},{});}

async function main(){
 const config=readConfig(),pool=createPool(config);let data;
 try{const db=new PostgresDocuments(pool,{project:config.project});await assertReady(db);data=await new FirestoreProject(db,{project:config.project}).read();}finally{await pool.end();}
 const createdAt=new Date().toISOString(),name='orok-v'+VERSION+'-pre-update-'+stamp(createdAt),folder=path.join(config.privateDir,'pre-update-backups',name);await fs.mkdir(folder,{recursive:true,mode:0o700});
 const positionsInStage=new Map(),positions=(data.leads||[]).map((lead,globalPosition)=>{const stage=String(lead.status||'Lead Inicial'),stagePosition=positionsInStage.get(stage)||0;positionsInStage.set(stage,stagePosition+1);return {global_position:globalPosition,stage_position:stagePosition,id:String(lead.id),lead_number:String(lead.lead_number||''),name:String(lead.name||''),status:stage,substatus:String(lead.substatus||'')};});
 const snapshot=Buffer.from(JSON.stringify({schema:3,source:'postgresql',created_at:createdAt,reason:'Punto de control previo a actualización del CRM',version:VERSION,project:config.project,data})),compressed=await gzip(snapshot,{level:9});
 const positionsPayload=Buffer.from(JSON.stringify({schema:2,source:'postgresql',created_at:createdAt,version:VERSION,total_leads:positions.length,positions},null,2));
 const dataFile='crm-data.json.gz',positionsFile='kanban-positions.json';await atomic(path.join(folder,dataFile),compressed);await atomic(path.join(folder,positionsFile),positionsPayload);
 const restored=JSON.parse((await gunzip(compressed)).toString('utf8')),checks={gzip_sha256_matches:sha256(compressed)===sha256(await fs.readFile(path.join(folder,dataFile))),snapshot_schema:restored.schema===3,source_is_postgresql:restored.source==='postgresql',lead_count_matches:(restored.data.leads||[]).length===positions.length,lead_order_matches:(restored.data.leads||[]).every((lead,index)=>String(lead.id)===positions[index].id),quotes_count:(restored.data.quotes||[]).length,separations_count:(restored.data.separations||[]).length,units_count:(restored.data.units||[]).length};
 if(Object.values(checks).some(value=>value===false))throw Error('La verificación del respaldo no coincide; no publiques esta versión.');
 const restoreCheck=Buffer.from(JSON.stringify({schema:1,created_at:createdAt,version:VERSION,checks,verified:true},null,2));await atomic(path.join(folder,'restore-check.json'),restoreCheck);
 const manifest={schema:2,source:'postgresql',created_at:createdAt,version:VERSION,project:config.project,purpose:'Restaurar código, datos o únicamente etapa/posición Kanban antes de una actualización.',total_leads:(data.leads||[]).length,status_counts:countBy(data.leads||[],lead=>lead.status),substatus_counts:countBy(data.leads||[],lead=>lead.substatus),counts:{units:(data.units||[]).length,quotes:(data.quotes||[]).length,separations:(data.separations||[]).length,marketing_expenses:(data.marketing_expenses||[]).length},files:{[dataFile]:{sha256:sha256(compressed),bytes:compressed.length},[positionsFile]:{sha256:sha256(positionsPayload),bytes:positionsPayload.length},'restore-check.json':{sha256:sha256(restoreCheck),bytes:restoreCheck.length}},restore_rule:'Restaurar selectivamente por id; nunca borrar leads ni información posterior sin autorización expresa.',deployment_gate:'No continuar si restore-check.json no indica verified=true o si los conteos no coinciden.'};
 await atomic(path.join(folder,'manifest.json'),Buffer.from(JSON.stringify(manifest,null,2)));process.stdout.write(JSON.stringify({ok:true,folder,manifest},null,2)+'\n');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
