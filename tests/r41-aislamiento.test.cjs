'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {config}=require('../config.cjs');
const {validateDatabaseScope,projectionTarget}=require('../postgres-project.cjs');
const {PostgresDocuments}=require('../postgres-documents.cjs');
const {authProject}=require('../server.cjs');
const base={APP_ORIGIN:'https://ensayo.example.test',OROK_PRIVATE_DIR:'/private',SESSION_SECRET:'x'.repeat(64),OROK_PROJECT:'infinity224_pruebas_955318057',OROK_REHEARSAL:'1',OROK_R41_ISOLATED:'1'};
test('el aislamiento exige ensayo y bloquea automatizaciones',()=>{
 const c=config(base);assert.equal(c.isolatedR41,true);assert.equal(c.rehearsalAutomation,false);
 assert.throws(()=>config({...base,OROK_REHEARSAL:'0'}));
 assert.throws(()=>config({...base,OROK_REHEARSAL_AUTOMATION:'1'}));
 assert.throws(()=>config({...base,OROK_PROJECT:'infinity224_preproduccion_r28'}));
});
test('la proyección del ensayo nunca llama a Firestore',async()=>{
 let called=false;const firebase={doc(){called=true;throw Error('Firestore compartido');}};
 const db=new PostgresDocuments({query(){throw Error('No debe consultar la cola');}},{project:base.OROK_PROJECT,firebase:projectionTarget(config(base),firebase)});
 assert.deepEqual(await db.flushProjection(),{configured:false,pending:null});assert.equal(called,false);
 assert.equal(projectionTarget({isolatedR41:false},firebase),firebase);
});
test('el ensayo solo acepta su base y separa usuarios de los existentes',()=>{
 const c=config(base);
 validateDatabaseScope(c,new URL('postgres://u:p@example/orok_r41_ensayo_20261028'));
 assert.throws(()=>validateDatabaseScope(c,new URL('postgres://u:p@example/lola_ensayo_955318057')));
 assert.equal(authProject(c),'infinity224_r41_ensayo_20261028');
 assert.equal(authProject({project:'infinity224'}),'infinity224');
});
