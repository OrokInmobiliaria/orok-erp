'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('el menú agrupado no muestra a vendedores secciones de Gerencia y contiene todas las pestañas previas',async()=>{
 const {navGroups,MANAGER_ONLY}=await import('../src/navModel.mjs');
 const ids=role=>navGroups(role).flatMap(g=>g.items.map(i=>i[0]));
 const seller=ids('Vendedor'),manager=['crm','marketing'].flatMap(m=>navGroups('Gerente',m).flatMap(g=>g.items.map(i=>i[0]))); // R42 · Marketing es un módulo aparte
 for(const id of MANAGER_ONLY)assert.equal(seller.includes(id),false,id);
 for(const id of ['dashboard','weekly','kanban','social','newLead','inventory','quotes','integrations','help','marketing','campaigns','comisiones','mkHome','mkTrends','mkPublish','mkKpis','mkBrand','ai','settings'])assert.ok(manager.includes(id),id);
 assert.equal(new Set(manager).size,manager.length);
 const app=fs.readFileSync(require.resolve('../src/App.jsx'),'utf8');
 for(const id of ['mkHome','mkTrends','mkPublish','mkKpis','mkBrand'])assert.ok(app.includes("activeTab==='"+id+"'"),id);
 assert.match(app,/tab = canonicalTab\(tab\)/); // R42 · mkVariants, mkBudget, mkConnections, mkBrief y finanzas redirigen a su nuevo lugar
 assert.match(app,/currentUser\.role==='Gerente'&&<LeadExportMenu/);
});
