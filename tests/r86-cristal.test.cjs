'use strict';
const test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path');
test('R86: cristal 2.0 cargado, sin cristal en el acceso y con reducir movimiento',()=>{
 const c=fs.readFileSync(path.join(__dirname,'..','src','cristal2.css'),'utf8'),m=fs.readFileSync(path.join(__dirname,'..','src','main.jsx'),'utf8');
 assert.match(m,/import '\.\/cristal2\.css'/);assert.ok(m.indexOf('cristal2.css')>m.indexOf('glass.css'));
 assert.match(c,/\.access-screen \.orok-card\{animation:none!important;background:#fff/);assert.match(c,/prefers-reduced-motion:reduce/);assert.match(c,/::before\{content:"";position:absolute;inset:0;z-index:-1/);
 assert.doesNotMatch(c,/\.orok-card\{[^}]*backdrop-filter/);
});
