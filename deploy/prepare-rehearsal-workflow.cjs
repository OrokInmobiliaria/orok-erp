'use strict';
const fs=require('node:fs'),path=require('node:path');
const {PROJECT,TEMPLATE,prepareWorkflow}=require('./rehearsal.cjs');
function main(){
 const [origin,output,...flags]=process.argv.slice(2);if(!origin||!output)throw Error('Uso: node deploy/prepare-rehearsal-workflow.cjs https://DOMINIO-REAL-ENSAYO destino.json [--claude-model=ID] [--enable-claude]');
 const claudeModel=flags.find(v=>v.startsWith('--claude-model='))?.slice('--claude-model='.length)||null;
 const flow=prepareWorkflow(JSON.parse(fs.readFileSync(path.join(__dirname,'../n8n',TEMPLATE),'utf8')),{origin,project:PROJECT,claudeModel,enableClaude:flags.includes('--enable-claude')});
 fs.writeFileSync(output,JSON.stringify(flow,null,2),{encoding:'utf8',flag:'wx'});
 console.log(JSON.stringify({active:false,project:PROJECT,origin:new URL(origin).origin,output,credentials:'Seleccionar credenciales de ensayo en n8n.'}));
}
if(require.main===module)try{main();}catch(e){console.error(e.message);process.exitCode=1;}
