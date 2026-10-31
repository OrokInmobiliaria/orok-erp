'use strict';
const test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path');
test('R80: cuadro de áreas oficial fija las áreas del modelo',()=>{
 const s=fs.readFileSync(path.join(__dirname,'..','evaluador-src','evaluador.html'),'utf8'),b=fs.readFileSync(path.join(__dirname,'..','evaluador','app.js'),'utf8');
 for(const t of [s,b]){assert.match(t,/function cabOficialParse/);assert.match(t,/function cabOficialAplicar/);assert.match(t,/cabFijo\(k\)/);assert.match(t,/cab-oficial-importar/);}
 const src=s.slice(s.indexOf('const OF_COLS'),s.indexOf('function cabOficial(){'));
 const f=new Function('S',src+';return {cabOficialParse,cabOficialTot,cabOficialAplicar,cabFijo,ofPiso};');
 const st={cab:{},p:{},units:[{id:'802',tipo:'Flat 3D',aj:2,piso:8,tech:1,libre:1}]},X=f(st);
 const filas=X.cabOficialParse('Nivel;Común techada\nAzotea\t20.42\t27.00\t\t\t\t\n802\t15.00\t0.00\t0.00\t\t78.14\t20.43\n502\t0.00\t\t\t\t0.00\t0.00\n101\t50.16\t\t\t\t40,29\t18.91\nSot\t69.31\t\t\t\t0\t0');
 assert.equal(filas.length,5);const t=X.cabOficialTot(filas);assert.equal(t.vendT,118.43);assert.equal(t.comunT,154.89);assert.equal(t.tech,273.32);
 st.cab.oficial={activo:true,filas};X.cabOficialAplicar(st);
 assert.deepEqual(st.units.map(u=>[u.id,u.piso,u.tech,u.libre,u.tipo]),[['802',8,78.14,20.43,'Flat 3D'],['101',1,40.29,18.91,'Por definir']]);assert.equal(st.p.comunTechada,154.89);
 assert.ok(X.cabFijo('units.0.tech'));assert.ok(X.cabFijo('p.comunTechada'));assert.ok(!X.cabFijo('units.0.tipo'));
});
