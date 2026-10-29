'use strict';
const {config}=require('../config.cjs'),{createPool}=require('../postgres-project.cjs'),{initializeRehearsal}=require('./rehearsal.cjs');
async function main(){
 if(process.env.OROK_REHEARSAL!=='1')throw Error('Esta inicialización solo se permite con OROK_REHEARSAL=1.');
 const c=config(),flags=new Set(process.argv.slice(2));
 // Validate before creating a network pool, and never print the connection URL.
 require('./rehearsal.cjs').assertRehearsal(c.origin,c.project);
 const pool=createPool(c);try{console.log(JSON.stringify(await initializeRehearsal(pool,{origin:c.origin,project:c.project,apply:flags.has('--apply'),installSchema:flags.has('--install-schema')})));}finally{await pool.end();}
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
