'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const zlib=require('node:zlib');
const {promisify}=require('node:util');
const {createHash,randomUUID}=require('node:crypto');
const gzip=promisify(zlib.gzip);

const MAX_BACKUPS=4;
const MAX_CONNECTION_BACKUPS=1;
const stamp=at=>new Date(at).toISOString().replace(/[:.]/g,'-');

async function atomic(file,data){
 const temp=file+'.'+randomUUID()+'.tmp';
 await fs.writeFile(temp,data,{mode:0o600});
 await fs.rename(temp,file);
}
async function list(folder){
 try{return (await fs.readdir(folder,{withFileTypes:true})).filter(entry=>entry.isFile()&&/^crm-\d{4}-\d{2}-\d{2}T.+\.json\.gz$/.test(entry.name)).map(entry=>entry.name).sort();}
 catch(error){if(error.code==='ENOENT')return [];throw error;}
}
function backupTime(name){const match=name.match(/^crm-(.+)\.json\.gz$/);return match?Date.parse(match[1].replace(/(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/,'$1:$2:$3.$4Z')):NaN;}
async function prune(folder,max=MAX_BACKUPS){
 const files=await list(folder),keep=new Set(files.slice(-max));
 await Promise.all(files.filter(file=>!keep.has(file)).flatMap(file=>[fs.rm(path.join(folder,file),{force:true}),fs.rm(path.join(folder,file.replace(/\.gz$/,'.manifest.json')),{force:true})]));
 return {kept:keep.size,removed:files.length-keep.size};
}
function backupScheduler({store,privateDir,now=()=>Date.now()}){
 if(!privateDir)throw Error('Configura un directorio privado para los respaldos.');
 const folder=path.join(privateDir,'backups'),connectionFolder=path.join(privateDir,'connection-backups');let running=null;
 async function run({reason='Ingreso de lead',category='ingress'}={}){
  if(running)return running;
  running=(async()=>{
   const target=category==='connection'?connectionFolder:folder,max=category==='connection'?MAX_CONNECTION_BACKUPS:MAX_BACKUPS;
   const lease=store.ref.collection('backup_jobs').doc(category==='connection'?'crm_before_first_connection':'crm_lead_ingress');const owner=randomUUID(),at=now();
   const claimed=await store.db.runTransaction(async tx=>{
    const old=(await tx.get(lease)).data()||{};
    if(old.until>at)return false;
    tx.set(lease,{owner,until:at+10*60*1000});return true;
   });
   if(!claimed)return {skipped:true};
   try{
    await fs.mkdir(target,{recursive:true,mode:0o700});
    const data=await store.read();
    const payload=Buffer.from(JSON.stringify({schema:2,created_at:new Date(at).toISOString(),reason,data}));
    const hash=createHash('sha256').update(payload).digest('hex');const file='crm-'+stamp(at)+'.json.gz';
    await atomic(path.join(target,file),await gzip(payload,{level:9}));
    await atomic(path.join(target,file.replace(/\.gz$/,'.manifest.json')),JSON.stringify({file,created_at:new Date(at).toISOString(),sha256:hash,bytes:payload.length},null,2));
    const retention=await prune(target,max);return {file,category,bytes:payload.length,sha256:hash,...retention};
   }finally{
    await store.db.runTransaction(async tx=>{const snapshot=await tx.get(lease);if(snapshot.data()?.owner===owner)tx.set(lease,{owner,until:0},{merge:true});});
   }
  })().finally(()=>{running=null;});return running;
 }
 function start(){}
 function stop(){}
 return {folder,connectionFolder,run,start,stop,prune:()=>prune(folder)};
}
module.exports={backupScheduler,prune,backupTime,MAX_BACKUPS,MAX_CONNECTION_BACKUPS};
