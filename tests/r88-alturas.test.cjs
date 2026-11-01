'use strict';
const test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path');
test('R88: estudio de mercado por altura con casillas',()=>{
 const s=fs.readFileSync(path.join(__dirname,'..','evaluador-src','evaluador.html'),'utf8');
 assert.match(s,/function mAltOk\(c\)/);assert.match(s,/data-k="mercado\.alturas\.\$\{g\.k\}"/);assert.match(s,/m-alt-proyecto/);assert.doesNotMatch(s,/<select id="mAltura"/);
 const src=s.slice(s.indexOf('const mAltKey'),s.indexOf('function mComparableIncluded'));
 const S={mercado:{alcance:'radio',cuadras:7,alturas:{a:true,b:true,c:true,d:false,x:true}}};
 const f=new Function('S',src+';return {mScopeKind,mAltOk}')(S);
 assert.equal(f.mScopeKind({pisos:14,distCuadras:2}),'altura');assert.equal(f.mScopeKind({pisos:8,distCuadras:2}),'dentro');assert.equal(f.mScopeKind({pisos:null,distCuadras:2}),'dentro');assert.equal(f.mScopeKind({pisos:8,distCuadras:9}),'radio');
});
test('R89: segundo uso y remodelados fuera del estudio',()=>{
 const s=fs.readFileSync(path.join(__dirname,'..','evaluador-src','evaluador.html'),'utf8');
 assert.match(s,/const MEST_MODELO=/);assert.doesNotMatch(s,/id="i-mercado-inclUsados"/);assert.match(s,/quedan fuera del estudio/);
 const src=s.slice(s.indexOf('const MEST=['),s.indexOf('const MCOL='));const f=new Function(src+';return mEsUsado')();
 assert.ok(f({estado:'usado'}));assert.ok(f({estado:'venta',nombre:'Depa remodelado en Maranga'}));assert.ok(!f({estado:'venta',nombre:'Edificio nuevo'}));assert.ok(!f({estado:'venta',nombre:'Depa remodelado',estadoManual:true}));
});
test('R90: cabecera separa duración del proyecto y horizonte del flujo',()=>{const s=fs.readFileSync(path.join(__dirname,'..','evaluador-src','evaluador.html'),'utf8');assert.match(s,/proyecto \$\{durProy\} meses \(arranque → independización\)/);});
