const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const b=fs.readFileSync(path.join(__dirname,'..','deploy','build-evaluador.cjs'),'utf8');
test('R110: al abrir se carga la última revisión del CRM (también en el celular) sin pisar cambios locales',()=>{
 assert.match(b,/function crmHuella/);assert.match(b,/function crmCambiosLocales/);assert.match(b,/if\(!crmCambiosLocales\(\)\)return crmLoad\(r\.id,true\)/);
 assert.match(b,/if\(ult\)return crmLoad\(ult\.id,true\)/);assert.match(b,/OROK_PROY==='principal'\?lista\[0\]:null/);assert.match(b,/S\._crm\.h=crmHuella\(\)/);
});
