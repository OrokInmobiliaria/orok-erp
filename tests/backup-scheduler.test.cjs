const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const zlib=require('node:zlib');
const {promisify}=require('node:util');
const {backupScheduler}=require('../backup-scheduler.cjs');

test('el respaldo por ingreso guarda una copia verificable en el directorio privado',async()=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'orok-backup-'));let lease={};
 const store={
  ref:{collection:()=>({doc:()=>({})})},
  db:{runTransaction:async work=>work({get:async()=>({data:()=>lease}),set:(_ref,value,options)=>{lease=options?.merge?{...lease,...value}:value;}})},
  read:async()=>({leads:[{id:'lead-1',status:'Seguimiento'}],settings:{projectName:'ÖRÖK'}})
 };
 const scheduler=backupScheduler({store,privateDir:folder,now:()=>Date.parse('2026-09-26T18:00:00.000Z')});
 const result=await scheduler.run({reason:'Prueba de ingreso'});
 const files=await fs.readdir(path.join(folder,'backups'));
 assert.equal(result.skipped,undefined);assert.equal(files.filter(name=>name.endsWith('.json.gz')).length,1);assert.equal(files.filter(name=>name.endsWith('.manifest.json')).length,1);
 const content=await fs.readFile(path.join(folder,'backups',files.find(name=>name.endsWith('.json.gz'))));
 assert.match((await promisify(zlib.gunzip)(content)).toString('utf8'),/lead-1/);
 await fs.rm(folder,{recursive:true,force:true});
});

test('la quinta copia por ingreso conserva solo las cuatro más recientes',async()=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'orok-backup-'));let lease={},clock=Date.parse('2026-09-26T18:00:00.000Z');
 const store={ref:{collection:()=>({doc:()=>({})})},db:{runTransaction:async work=>work({get:async()=>({data:()=>lease}),set:(_ref,value,options)=>{lease=options?.merge?{...lease,...value}:value;}})},read:async()=>({leads:[],settings:{}})};
 const scheduler=backupScheduler({store,privateDir:folder,now:()=>clock});
 for(let index=0;index<5;index++){await scheduler.run({reason:'Ingreso '+index});clock+=1000;}
 const backups=(await fs.readdir(path.join(folder,'backups'))).filter(name=>name.endsWith('.json.gz'));
 assert.equal(backups.length,4);assert.ok(backups.every(name=>name!=='crm-2026-09-26T18-00-00-000Z.json.gz'));
 await fs.rm(folder,{recursive:true,force:true});
});
