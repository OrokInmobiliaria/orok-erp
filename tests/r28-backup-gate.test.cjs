'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
test('el respaldo previo usa PostgreSQL, valida restauración y no escribe la base',()=>{
 const source=fs.readFileSync(require.resolve('../deploy/create-preupdate-snapshot.cjs'),'utf8');
 assert.match(source,/createPool/);
 assert.match(source,/source:'postgresql'/);
 assert.match(source,/restore-check\.json/);
 assert.match(source,/lead_order_matches/);
 assert.doesNotMatch(source,/firebase-admin|runTransaction|\.doc\(/i);
});
