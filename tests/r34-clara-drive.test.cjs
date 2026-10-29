'use strict';
// R34 · Flujo n8n C.L.A.R.A · Drive contable: estructura, credenciales y lógica de los nodos Code.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const file=path.join(__dirname,'../n8n/CLARA-ENSAYO-67.6.18-DRIVE-CONTABLE-INACTIVO.json');
const flow=JSON.parse(fs.readFileSync(file,'utf8'));
const byName=Object.fromEntries(flow.nodes.map(n=>[n.name,n]));
// Ejecuta un nodo Code (modo «todos los elementos») con $input y $('Nodo').itemMatching/first/item simulados.
async function run(name,items,refs={},helpers={}){
  const n=byName[name];assert.ok(n,'no existe '+name);
  const $=(k)=>({itemMatching:(i)=>({json:(refs[k]||[])[i]??(refs[k]||[])[0]}),first:()=>({json:(refs[k]||[])[0]}),item:{json:(refs[k]||[])[0]}});
  const ctx={$input:{all:()=>items.map(j=>({json:j})),first:()=>({json:items[0]})},$,console,Date,JSON,Math,Object,Array,String,Number,Map,Set,Buffer,isNaN,parseFloat,Error};
  ctx.self={helpers};
  const r=await new vm.Script('(async function(){'+n.parameters.jsCode+'}).call(self)').runInNewContext(ctx,{timeout:2000});return JSON.parse(JSON.stringify(r));
}
test('estructura: inactivo, sin pinData, nombres únicos, conexiones válidas y Code compilable',()=>{
  assert.equal(flow.active,false);assert.deepEqual(flow.pinData,{});assert.equal(flow.settings.timezone,'America/Lima');
  assert.equal(new Set(flow.nodes.map(n=>n.name)).size,flow.nodes.length);
  for(const [from,c] of Object.entries(flow.connections)){assert.ok(byName[from],from);for(const out of c.main)for(const t of out)assert.ok(byName[t.node],t.node)}
  for(const n of flow.nodes){if(n.type==='n8n-nodes-base.code')new vm.Script('(async function(){'+n.parameters.jsCode+'})');
    if(n.type==='n8n-nodes-base.httpRequest')assert.ok(n.parameters.options.timeout>=10000&&n.parameters.options.timeout<=90000,n.name)}
});
test('no hay secretos en el JSON y cada llamada usa credenciales de n8n',()=>{
  const txt=JSON.stringify(flow);assert.doesNotMatch(txt,/sk-ant-|x-api-key"\s*:\s*"[^"]|Bearer [A-Za-z0-9]/);
  for(const n of flow.nodes.filter(n=>n.type==='n8n-nodes-base.httpRequest')){
    if(/googleapis/.test(n.parameters.url)||/\$json\.(url|fileId|bandejaId)/.test(n.parameters.url)){assert.equal(n.parameters.authentication,'predefinedCredentialType',n.name);assert.equal(n.parameters.nodeCredentialType,'googleDriveOAuth2Api');assert.ok(n.credentials.googleDriveOAuth2Api)}
    else{assert.ok(['https://api.anthropic.com/v1/messages','https://lola-pruebas-crm.kvrq8w.easypanel.host/api/integrations/lola'].includes(n.parameters.url),n.name);assert.ok(n.credentials.httpHeaderAuth)}}
  const crm=byName['Enviar lecturas al CRM'];assert.match(crm.parameters.jsonBody,/clara_bandeja_put/);assert.equal(crm.onError,'continueRegularOutput');
  const wh=flow.nodes.find(n=>n.type==='n8n-nodes-base.webhook');assert.equal(wh.parameters.authentication,'headerAuth');
});
test('nunca borra archivos en Drive: solo busca, crea carpetas, sube y mueve',()=>{
  for(const n of flow.nodes.filter(n=>n.type==='n8n-nodes-base.httpRequest'))assert.ok(['GET','POST','PATCH'].includes(n.parameters.method),n.name);
  assert.doesNotMatch(JSON.stringify(flow),/"method":"DELETE"|deleteFile|deleteFolder|"trashed":\s*true/);
});
test('las tres carpetas Contabilidad están configuradas con sus RUC',async()=>{const r=(await run('Carpetas · ordenar',[{}])).map(x=>x.json);
  assert.deepEqual(r.map(x=>[x.empresa,x.ruc,x.contabilidad]),[['BMG','20615227685','1RqRBLFGervdPIjOHGfbA2kWUeFRHUjKY'],['MZA','20602354785','1eOPFAhtYW6L-lkSRrnOruhBrAED3VEJ0'],['MAAS','20616628144','17Kb4z3EmySjkiBvBpMLkxlFrlFvj4HY6']]);
  for(const n of flow.nodes.filter(n=>n.type==='n8n-nodes-base.code'&&/const EMPRESAS/.test(n.parameters.jsCode)))assert.doesNotMatch(n.parameters.jsCode,/CONFIGURAR_ID/,n.name);});
test('regla 2025: lo anterior no se lee ni se borra; se archiva por año en 08 Histórico',async()=>{
  const emp={empresa:'BMG',contabilidad:'1AbCdEfGhIjKlMnOpQ'};
  const r=(await run('Clasificar por carpeta',[{files:[{id:'v',name:'Factura vieja.pdf',createdTime:'2024-06-01T00:00:00Z',modifiedTime:'2024-06-01T00:00:00Z'},{id:'n',name:'Factura nueva.pdf',createdTime:'2025-02-01T00:00:00Z'},{id:'i',name:'CLARA-INVENTARIO-2026-10-28.json',createdTime:'2026-10-28T00:00:00Z'}]}],{'Carpetas · ordenar':[emp]})).map(x=>x.json);
  const h=r.find(g=>g.categoria==='08 Histórico (antes de 2025)');assert.deepEqual(h.files.map(f=>[f.id,f.mes]),[['v','2024']]);
  assert.deepEqual(r.filter(g=>g!==h).flatMap(g=>g.files.map(f=>f.id)),['n']);
  const src={empresa:'BMG',contabilidad:'C',entrada:'E',procesados:'P',archivo:{id:'o1',nombre:'old.pdf',mime:'application/pdf'}};
  const old={content:[{type:'text',text:'{"tipo":"factura","fecha":"2024-12-15","total":100,"receptor":{"ruc":"20615227685"}}'}]};
  const e=(await run('Validar lectura',[old],{'Elegir archivos a leer':[src]}))[0].json.entrada_bandeja;assert.equal(e.estado,'omitido');
  const el=(await run('Elegir archivos a leer',[{files:[{id:'a',name:'x.pdf',mimeType:'application/pdf',size:'10',modifiedTime:'2024-01-01T00:00:00Z'},{id:'b',name:'y.pdf',mimeType:'application/pdf',size:'10',modifiedTime:'2025-03-01T00:00:00Z'}]}],{'Empresas con Entrada':[{empresa:'BMG'}]})).map(x=>x.json.archivo.id);
  assert.deepEqual(el,['b']);});
test('el inventario solo lee y escribe un JSON por empresa',async()=>{
  const src=[{empresa:'BMG',contabilidad:'C',raiz:[{id:'f1',name:'Facturas 2025',mimeType:'application/vnd.google-apps.folder',createdTime:'2025-01-02T00:00:00Z'}],carpeta:{id:'f1',name:'Facturas 2025'}}];
  const r=(await run('Armar inventario',[{files:[{id:'x',name:'F001-1.pdf',mimeType:'application/pdf',createdTime:'2024-12-01T00:00:00Z'}]}],{'Subcarpetas a revisar':src})).map(x=>x.json);
  assert.equal(r.length,1);assert.match(r[0].multipart,/CLARA-INVENTARIO-/);assert.match(r[0].multipart,/"anterior_2025":true/);});
test('clasifica lo que sube la app por carpeta y mes de Lima, y lo desconocido va a 01 Entrada',async()=>{
  const emp={empresa:'BMG',contabilidad:'1AbCdEfGhIjKlMnOpQ'};
  const files=[{id:'a',name:'OS-BMG-2026-0045 TUNOPAL S.A.pdf',createdTime:'2026-11-01T03:00:00Z'},{id:'b',name:'Voucher OS-BMG-2026-0045 TUNOPAL 2026-10-28.jpg',createdTime:'2026-10-28T15:00:00Z'},
    {id:'c',name:'Factura electrónica F001-12 TUNOPAL.pdf',createdTime:'2026-10-28T15:00:00Z'},{id:'d',name:'scan_0001.pdf',createdTime:'2026-10-28T15:00:00Z'},{id:'e',name:'CLARA-BANDEJA.json'},{id:'f',name:'CLARA BMG - Compilado total 2026-10-28.xlsx',createdTime:'2026-10-28T15:00:00Z'}];
  const r=(await run('Clasificar por carpeta',[{files}],{'Carpetas · ordenar':[emp]})).map(x=>x.json);
  const cat=Object.fromEntries(r.map(g=>[g.categoria,g]));
  assert.equal(cat['03 Órdenes OC-OS'].files[0].mes,'2026-10');// 03:00 UTC del 1/11 = 31/10 en Lima
  assert.ok(cat['04 Pagos y vouchers']&&cat['02 Comprobantes de proveedores']&&cat['06 Reportes']);
  assert.equal(cat['01 Entrada'].porMes,false);assert.equal(cat['01 Entrada'].files[0].id,'d');
  assert.ok(!r.some(g=>g.files.some(f=>f.id==='e')));
  const m=(await run('Resolver carpeta y meses',[{files:[{id:'CAT'}]},{files:[]}],{'Clasificar por carpeta':[cat['03 Órdenes OC-OS'],cat['01 Entrada']]})).map(x=>x.json);
  assert.equal(m.length,1);assert.equal(m[0].mes,'2026-10');assert.equal(m[0].categoriaId,'CAT');// sin carpeta destino no se mueve
});
test('lee estados de cuenta en hoja con cargo/abono y agrupa por archivo',async()=>{
  const src={empresa:'BMG',contabilidad:'C',entrada:'E',procesados:'P',archivo:{id:'x1',nombre:'bcp.xlsx'}};
  const r=await run('Movimientos desde hoja',[{'Fecha':'02/11/2026','Descripción':'TRANSF TUNOPAL','Cargo':'4,673.00','Abono':''},{'Fecha':'05/11/2026','Descripción':'ABONO','Cargo':'','Abono':'20000'},{'Fecha':'','Descripción':'SALDO','Cargo':'','Abono':''}],{'Elegir archivos a leer':[src]});
  assert.equal(r.length,1);const e=r[0].json.entrada_bandeja;assert.equal(e.estado,'por_revisar');
  assert.deepEqual(e.datos.movimientos.map(m=>m.monto),[-4673,20000]);assert.equal(e.datos.movimientos[0].fecha,'2026-11-02');
});
test('valida la lectura de Claude, detecta la empresa por RUC y avisa si se dejó en otra carpeta',async()=>{
  const src={empresa:'BMG',contabilidad:'C',entrada:'E',procesados:'P',archivo:{id:'f1',nombre:'fac.pdf',mime:'application/pdf'}};
  const ok={model:'claude-haiku-5-5',content:[{type:'text',text:'```json\n{"tipo":"factura","emisor":{"ruc":"20100000001","razon":"TUNOPAL S.A."},"receptor":{"ruc":"20602354785"},"serie":"F001-900","fecha":"2026-10-20","total":"5310","igv":810,"subtotal":4500}\n```'}]};
  const [a,b]=(await run('Validar lectura',[ok,{error:{type:'overloaded_error'}}],{'Elegir archivos a leer':[src,src]})).map(x=>x.json.entrada_bandeja);
  assert.equal(a.estado,'por_revisar');assert.equal(a.tipo,'factura');assert.equal(a.datos.total,5310);assert.equal(a.empresa_detectada,'MZA');assert.match(a.avisos[0],/MZA/);
  assert.equal(b.estado,'error');
});
test('la bandeja se fusiona sin duplicar y solo lo leído bien pasa a Procesados',async()=>{
  const g={empresa:'BMG',contabilidad:'C',entrada:'E',procesados:'P',bandejaId:'B',entradas:[{id:'f1',estado:'por_revisar',leido_en:'2026-10-28T17:00:00Z'},{id:'f2',estado:'error',leido_en:'2026-10-28T17:00:00Z'}]};
  const prev={formato:'clara-bandeja-v1',entradas:[{id:'f1',estado:'por_revisar',leido_en:'2026-10-20T00:00:00Z',viejo:true},{id:'f0',leido_en:'2026-10-01T00:00:00Z'}]};
  const doc=JSON.parse((await run('Fusionar bandeja',[prev],{'Bandeja existente':[g]}))[0].json.contenido);
  assert.equal(doc.entradas.length,3);assert.ok(!doc.entradas.find(e=>e.id==='f1').viejo);
  const nueva=(await run('Bandeja nueva',[g]))[0].json.multipart;assert.match(nueva,/"name":"CLARA-BANDEJA.json"/);assert.match(nueva,/"parents":\["C"\]/);
  const g3={...g,historico:'H',entradas:[{id:'f1',tipo:'factura',estado:'por_revisar',archivo:{nombre:'scan 01.PDF'},datos:{serie:'F001-950',fecha:'2026-10-20',emisor:{razon:'TUNOPAL S.A.'}}},
    {id:'f2',estado:'error'},{id:'o1',tipo:'factura',estado:'omitido'},{id:'x1',tipo:'otro',estado:'por_revisar'},{id:'v1',tipo:'voucher',estado:'por_revisar',archivo:{nombre:'IMG_1.jpg'},datos:{pago:{operacion:'99887',beneficiario:'TUNOPAL/SA',fecha:'2026-10-27'}}}]};
  const mv=(await run('Archivar lo leído',[{id:'B'}],{'Bandeja existente':[g3]})).map(x=>x.json);
  assert.deepEqual(mv.map(m=>[m.fileId,m.destino,m.nuevoNombre||null]),[['f1','C','Factura electrónica F001-950 TUNOPAL S.A. 2026-10-20.pdf'],['o1','H',null],['x1','P',null],['v1','C','Voucher op 99887 TUNOPAL SA 2026-10-27.jpg']]);
  // el nombre estándar lo archiva la rama 02 por el mes del documento
  const r2=(await run('Clasificar por carpeta',[{files:[{id:'f1',name:mv[0].nuevoNombre,createdTime:'2026-12-01T00:00:00Z'},{id:'q',name:'Factura electrónica F001-1 X 2024-05-02.pdf',createdTime:'2026-12-01T00:00:00Z'}]}],{'Carpetas · ordenar':[{empresa:'BMG',contabilidad:'C'}]})).map(x=>x.json);
  assert.equal(r2.find(g=>g.categoria==='02 Comprobantes de proveedores').files[0].mes,'2026-10');
  assert.deepEqual(r2.find(g=>g.categoria==='08 Histórico (antes de 2025)').files.map(f=>[f.id,f.mes]),[['q','2024']]);
  assert.doesNotMatch(JSON.stringify(flow),/"method":\s*"DELETE"/);
});
test('Claude recibe el PDF como documento y la foto como imagen, sin la clave en el cuerpo',async()=>{
  const helpers={getBinaryDataBuffer:async()=>Buffer.from('%PDF-1.4')};
  const pdf={archivo:{mime:'application/pdf'}},img={archivo:{mime:'image/jpeg'}};
  const r=await run('Preparar lectura con Claude',[{},{}],{'Elegir archivos a leer':[pdf,img]},helpers);
  assert.equal(r[0].json.payload.messages[0].content[0].type,'document');assert.equal(r[1].json.payload.messages[0].content[0].type,'image');
  assert.doesNotMatch(JSON.stringify(r),/x-api-key/);
});
test('el webhook del CRM rechaza empresas sin configurar y tipos no permitidos',async()=>{
  await assert.rejects(run('Validar archivo del CRM',[{body:{empresa:'XYZ',nombre:'a.pdf',mime:'application/pdf',base64:'AA=='}}]),/no configurada/);
  {
    const ok=(await run('Validar archivo del CRM',[{body:{empresa:'BMG',nombre:'F001-1 TUNOPAL.pdf',mime:'application/pdf',base64:'data:application/pdf;base64,AA==',categoria:'voucher'}}]))[0].json;
    assert.equal(ok.nombre,'Voucher F001-1 TUNOPAL.pdf');assert.equal(ok.base64,'AA==');
    await assert.rejects(run('Validar archivo del CRM',[{body:{empresa:'BMG',nombre:'x.exe',mime:'application/x-msdownload',base64:'AA=='}}]),/inválido|no permitido/);
  }
});

test('R35: las reglas y carpetas vienen de la skill vía CRM, con respaldo local si el CRM no responde',async()=>{
  for(const n of ['Reglas · ordenar','Reglas · leer entrada']){assert.match(byName[n].parameters.jsonBody,/clara_reglas_get/);assert.equal(byName[n].onError,'continueRegularOutput');assert.equal(byName[n].alwaysOutputData,true)}
  const R={version:'abc123def456',texto:'REGLAS DE LA SKILL',params:{desde:'2025-06-01',empresas:{BMG:{razon:'BMG X',ruc:'20615227685',drive_folder:'NUEVACARPETABMG123456'}}}};
  const r=(await run('Carpetas · leer entrada',[{}],{'Reglas · leer entrada':[{value:R}]})).map(x=>x.json);
  const b=r.find(x=>x.empresa==='BMG');assert.equal(b.contabilidad,'NUEVACARPETABMG123456');assert.equal(b.desde,'2025-06-01');assert.equal(b.reglas_version,'abc123def456');
  const r0=(await run('Carpetas · leer entrada',[{}],{'Reglas · leer entrada':[{error:{message:'timeout'}}]})).map(x=>x.json);assert.equal(r0[0].desde,'2025-01-01');assert.equal(r0.length,3);
  const helpers={getBinaryDataBuffer:async()=>Buffer.from('%PDF')};
  const p=await run('Preparar lectura con Claude',[{}],{'Elegir archivos a leer':[{archivo:{mime:'application/pdf'}}],'Reglas · leer entrada':[{value:R}]},helpers);
  assert.match(p[0].json.payload.system,/REGLAS DE LA SKILL/);assert.match(p[0].json.payload.system,/abc123def456/);
  const src={empresa:'BMG',contabilidad:'C',entrada:'E',procesados:'P',desde:'2025-06-01',archivo:{id:'o1',nombre:'x.pdf',mime:'application/pdf'}};
  const e=(await run('Validar lectura',[{content:[{type:'text',text:'{"tipo":"factura","fecha":"2025-03-01","total":1}'}]}],{'Elegir archivos a leer':[src]}))[0].json.entrada_bandeja;assert.equal(e.estado,'omitido');
});
