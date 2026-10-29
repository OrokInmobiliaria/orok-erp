'use strict';
// R46 · C.L.A.R.A pasa a llamarse D.I.A.V.A (Dirección Integral de Administración, Valorizaciones y Activos).
// Cambia solo lo visible; los nombres internos (métodos claraXxx, colecciones, cabecera X-Clara-Secret, flujos n8n y la carpeta
// «07 Procesados por C.L.A.R.A» de Drive) se conservan para no romper lo validado.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const R=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('lo visible dice D.I.A.V.A y su significado; solo queda C.L.A.R.A en el nombre histórico de la carpeta de Drive',()=>{
 for(const f of ['contabilidad-src/clara-contabilidad.html','contabilidad/app.js','contabilidad/index.html','business/claraErp.js','src/navModel.mjs','src/App.jsx','public/manifest.webmanifest','skills/erp-orok-contabilidad/SKILL.md','business/mcpConnector.js']){
  const s=R(f).replace(/Procesados por C\.L\.A\.R\.A/g,'');assert.doesNotMatch(s,/C\.L\.A\.R\.A/,f);
 }
 assert.match(R('business/claraErp.js'),/Eres D\.I\.A\.V\.A \(Dirección Integral de Administración, Valorizaciones y Activos\)/);
 assert.match(R('contabilidad/index.html'),/aria-label="Cerrar D\.I\.A\.V\.A"/);
 assert.match(R('business/claraErp.js'),/ERP ÖRÖK · D\.I\.A\.V\.A/,'los correos de aprobación firman como D.I.A.V.A');
 assert.match(R('skills/erp-orok-contabilidad/SKILL.md'),/07 Procesados por C\.L\.A\.R\.A` \(nombre histórico/);
 assert.match(R('business/claraErp.js'),/X-Clara-Secret/,'la cabecera del webhook de n8n no cambia');
});
