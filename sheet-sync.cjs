'use strict';
const {randomUUID}=require('node:crypto');
const {fetchSheet}=require('./business/sheetAccess');
const {safeFetch}=require('./safe-network.cjs');
const {toolLinks}=require('./business/toolLinks');
const {createQueries}=require('./business/queries');
// One background review every 30 minutes.  The first review receives newly available
// leads; after that, the shared lease prevents another automatic read inside
// half hour.  Any signed-in user may separately request a manual review.
const INTERVAL=30*60*1000;
function sheetSync({store,cache,readSheet=url=>fetchSheet(url,safeFetch(fetch)),now=()=>Date.now(),onNewLeads=async()=>{}}){
 const lease=store.ref.collection('sync_jobs').doc('lead_sheets');
 let running=null,timer,cooldownUntil=0;
 async function cycle(force,assignment){
  const config=toolLinks((await cache.read()).settings);
  if(!config.leads.some(Boolean)||(!force&&!config.autoSync))return {skipped:true};
  const owner=randomUUID();
  const claimed=await store.db.runTransaction(async tx=>{
   const snapshot=await tx.get(lease),old=snapshot.data()||{};
   if(old.until>now()||(!force&&old.next_at>now()))return false;
   tx.set(lease,{owner,until:now()+10*60000,next_at:now()+INTERVAL});return true;
  });
  if(!claimed)return {busy:true};
  const results=[];
  try{
   for(const url of [...new Set(config.leads.filter(Boolean))]){
    try{
     // Fetch once outside Firestore transactions; retries only reapply parsed data.
     const sheet=await readSheet(url);
     if(sheet.error)throw Error(sheet.error);
     const result=await store.run(({read,write})=>{
      const d=read(),current=toolLinks(d.settings);
      if(current.revision!==config.revision||!current.leads.includes(url)||(!force&&!current.autoSync))return {skipped:true};
      const q=createQueries(read,write);
      const summary=q.syncLeadsRaw({csv:sheet.data,isStrict:false,sourceUrl:url},assignment);
      const updated=read(),at=new Date(now()).toISOString();
      updated.settings.leadSheetSync={...(updated.settings.leadSheetSync||{}),[url]:{checked_at:at,success_at:at,error:null,...summary}};
      write(updated);return summary;
     });
     results.push({url,...result});
    }catch(error){
     const message=String(error.message||'No se pudo leer la hoja.').slice(0,240);
     await store.run(({read,write})=>{
      const d=read();if(toolLinks(d.settings).revision!==config.revision)return;
      const previous=d.settings.leadSheetSync?.[url]||{};
      d.settings.leadSheetSync={...(d.settings.leadSheetSync||{}),[url]:{...previous,checked_at:new Date(now()).toISOString(),error:message}};write(d);
     });
     results.push({url,error:message});
    }
   }
   const added=results.reduce((total,result)=>total+(Number(result.added)||0),0);
   if(added)await onNewLeads({added,source:'Sincronización automática'});
   return {results};
  }finally{
   await store.db.runTransaction(async tx=>{const snapshot=await tx.get(lease);if(snapshot.data()?.owner===owner)tx.set(lease,{owner,until:0,next_at:now()+INTERVAL});});
  }
 }
 function run({force=false,assignment=null}={}){
  if(running)return running;
  if(!force&&cooldownUntil>now())return Promise.resolve({skipped:true,reason:'quota_cooldown'});
  running=cycle(force,assignment).catch(error=>{
   // Firestore returns RESOURCE_EXHAUSTED when the account quota is reached.
   // Do not keep retrying from every timer tick or restart; any signed-in user
   // can still use the explicit synchronisation action after the quota recovers.
   if(/RESOURCE_EXHAUSTED|quota exceeded/i.test(String(error.message||'')))cooldownUntil=now()+INTERVAL;
   throw error;
  }).finally(()=>{running=null;});return running;
 }
 function start(){if(timer)return;const tick=()=>run().catch(error=>console.error('No se pudo revisar la sincronización de hojas:',error.message));timer=setInterval(tick,INTERVAL);timer.unref?.();tick();}
 function stop(){clearInterval(timer);timer=null;}
 return {run,start,stop};
}
module.exports={sheetSync,INTERVAL};
