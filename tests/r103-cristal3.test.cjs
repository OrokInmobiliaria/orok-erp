const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const r=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
test('R103: Cristal 3.0 en CRM, Evaluador y Contabilidad (fondo más oscuro, cristal marcado, acceso sin cristal)',()=>{
 assert.match(r('src/main.jsx'),/import '\.\/cristal3\.css'/);const c=r('src/cristal3.css');assert.match(c,/--c3-base/);assert.match(c,/prefers-reduced-transparency/);
 for(const f of ['evaluador-src/evaluador.html','contabilidad-src/clara-contabilidad.html'])assert.match(r(f),/R103 · Cristal 3\.0/);
 assert.match(r('src/Access.jsx'),/access-screen/);
});
test('R104: capas internas (tablas, encabezados, avisos, campos y tarjetas dentro de tarjetas) también son cristal',()=>{
 assert.match(r('src/cristal3.css'),/\.orok-card \.orok-card/);
 for(const f of ['evaluador-src/evaluador.html','contabilidad-src/clara-contabilidad.html']){const s=r(f);assert.match(s,/R104 · Cristal en capas/);assert.doesNotMatch(s.slice(s.indexOf('R104 · Cristal en capas')),/th\{background:var\(--solid-sunk\)\}/)}
});
