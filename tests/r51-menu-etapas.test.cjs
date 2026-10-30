'use strict';
// R51 · Menú lateral por etapas: reúne TODAS las secciones de todos los módulos (ninguna queda inaccesible) y respeta roles.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
test('el menú por etapas contiene cada pestaña del menú anterior, en el orden de un proyecto',async()=>{
 const {navGroups,navEtapas,MANAGER_ONLY,moduleOf}=await import('../src/navModel.mjs');
 for(const role of ['Gerente','Vendedor']){
  const antes=new Set();for(const m of ['crm','marketing','evaluador','erp'])for(const g of navGroups(role,m))for(const [id] of g.items)antes.add(id);
  const ahora=navEtapas(role).flatMap(s=>s.items.map(i=>i[0]));
  for(const id of antes)assert.ok(ahora.includes(id),role+': falta '+id);
  assert.equal(new Set(ahora).size,ahora.length,'sin repetidos');
  if(role!=='Gerente')for(const id of ahora)assert.ok(!MANAGER_ONLY.includes(id)&&moduleOf(id)==='crm',role+' no ve '+id);
 }
 assert.deepEqual(navEtapas('Gerente').map(s=>s.label),['Proyecto','Evaluar','Vender','Promocionar','Construir y finanzas','Ajustes']);
 assert.deepEqual(navEtapas('Vendedor').map(s=>s.label),['Proyecto','Vender','Construir y finanzas','Ajustes']);
});
test('la aplicación usa el menú lateral y en computadora oculta las barras anteriores',()=>{
 const app=fs.readFileSync(path.join(__dirname,'..','src','App.jsx'),'utf8'),css=fs.readFileSync(path.join(__dirname,'..','src','theme.css'),'utf8');
 assert.match(app,/<SideNav role=\{currentUser\.role\} active=\{activeTab\} onChange=\{handleTabChange\}/);
 assert.match(css,/@media \(min-width:1024px\)\{\n \.has-sidenav\{padding-left:256px\}/);
});
