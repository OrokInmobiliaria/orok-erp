const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {MAX_BACKUPS}=require('../backup-scheduler.cjs');

const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('las frecuencias de M.O.R.A reducen carga sin superar 15 segundos de detección',()=>{
 const postgres=read('postgres-project.cjs');
 const panel=read(path.join('src','MoraPanel.jsx'));
 const flow=JSON.parse(read(path.join('n8n','MORA-ENSAYO-67.6.17-EVALUADOR-CONVERSACIONAL-INACTIVO.json')));
 const conversation=flow.nodes.find(node=>node.name==='Consultar cola M.O.R.A cada 10 segundos');
 const market=flow.nodes.find(node=>node.name==='Consultar lecturas de mercado cada 15 segundos');
 assert.match(postgres,/setInterval\(refresh,5000\)/);
 assert.match(panel,/setTimeout\(\(\) => load\(tid, polls \+ 1\), 3000\)/);
 assert.equal(conversation.parameters.rule.interval[0].secondsInterval,10);
 assert.equal(market.parameters.rule.interval[0].secondsInterval,15);
 assert.equal(MAX_BACKUPS,4);
});
