const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {PDFDocument}=require('pdf-lib');
const {activeForUnit,addCalendarDays,documentProgress,minimumSeparationAmount,voucherPaymentStatus,fetchSeparationTemplate,updateSeparation,attachDocument}=require('../business/separationService');
const {applyTemplate,generateAndSaveSeparationPDF}=require('../business/separationPDF');

function fixture(){
 return {
  separations:[{id:'s1',code:'2026-0001473',quote_id:'q1',lead_id:'l2',unit_id:'u1',unit_number:'201',client_name:'Cliente Dos',final_price:480000,separation_amount:4800,status:'DRAFT',expires_at:null,documents:{},audit:[]}],
  units:[{id:'u1',unit_number:'201',status:'AVAILABLE'}],
  leads:[{id:'l1',name:'Primero',status:'Contactado'},{id:'l2',name:'Cliente Dos',status:'Calificado'},{id:'l3',name:'Tercero',status:'Seguimiento'}]
 };
}

test('a generated draft does not block the unit and 15 calendar days are exact',()=>{
 const d=fixture();assert.equal(activeForUnit(d.separations,'u1'),null);
 assert.equal(addCalendarDays('2026-10-10T12:00:00.000Z',15),'2026-10-25T12:00:00.000Z');
 d.separations[0].status='CONFIRMED';assert.equal(activeForUnit(d.separations,'u1').id,'s1');
});

test('confirming separation moves only the linked lead to Kanban Separación and preserves lead order',()=>{
 const d=fixture(),order=d.leads.map(item=>item.id);const result=updateSeparation(d,'s1','confirm',{reason:'Abono verificado'},'Ana Ventas');
 assert.equal(result.status,'CONFIRMED');assert.equal(d.leads.find(item=>item.id==='l2').status,'Separación');
 assert.deepEqual(d.leads.map(item=>item.id),order);assert.equal(d.leads[0].status,'Contactado');assert.equal(d.leads[2].status,'Seguimiento');
 assert.equal(result.audit.at(-1).actor,'Ana Ventas');assert.equal(result.audit.at(-1).action,'confirm');
});

test('release and reserve keep the lead; sale requires complete closing documents',()=>{
 const released=fixture();assert.throws(()=>updateSeparation(released,'s1','release',{},'Ana'),/motivo/);updateSeparation(released,'s1','release',{reason:'Cliente desistió'},'Ana');assert.equal(released.separations[0].status,'RELEASED');assert.equal(released.leads[1].status,'Calificado');
 const reserved=fixture();updateSeparation(reserved,'s1','confirm',{},'Ana');updateSeparation(reserved,'s1','reserve',{reason:'Cliente pidió extensión',expires_at:'2030-01-15'},'Ana');assert.equal(reserved.separations[0].status,'RESERVED');assert.match(reserved.separations[0].expires_at,/2030-01-15/);
 const sold=fixture();updateSeparation(sold,'s1','confirm',{},'Ana');assert.throws(()=>updateSeparation(sold,'s1','sold',{reason:'Minuta firmada'},'Ana'),/Genera la minuta/);sold.separations[0].minute={pdf_path:'/files/minuta.pdf',status:'Firmada'};sold.separations[0].documents={signed_sale_minutes:{drive_file_id:'m1'},notary_voucher:{drive_file_id:'n1'}};updateSeparation(sold,'s1','sold',{reason:'Minuta firmada y voucher notarial'},'Ana');assert.equal(sold.separations[0].status,'SOLD');assert.equal(sold.units[0].status,'SOLD');assert.equal(sold.leads[1].status,'Venta');
});

test('the third required cloud document confirms automatically and moves only its linked lead',()=>{
 const d=fixture(),file=kind=>({name:kind+'.pdf',drive_file_id:'drive-'+kind,drive_url:'https://drive.google.com/file/d/'+kind+'/view',mime_type:'application/pdf',size:100,...(kind==='voucher'?{review:{status:'match',extracted:{amount:4800}}}:{})});
 let result=attachDocument(d,'s1','dni',file('dni'),'Ana');assert.equal(result.autoConfirmed,false);assert.deepEqual(documentProgress(d.separations[0]),{complete:1,total:3,ready:false});assert.equal(d.leads[1].status,'Calificado');
 attachDocument(d,'s1','signed_separation',file('signed'),'Ana');result=attachDocument(d,'s1','reservation_voucher',file('voucher'),'Ana');
 assert.equal(result.autoConfirmed,true);assert.equal(d.separations[0].status,'CONFIRMED');assert.equal(d.separations[0].confirmation_method,'documents');assert.equal(d.leads[1].status,'Separación');assert.equal(activeForUnit(d.separations,'u1').id,'s1');
});

test('an underpaid voucher never confirms automatically and manual confirmation requires an audited reason',()=>{
 const d=fixture(),file=(kind,review)=>({name:kind+'.pdf',drive_file_id:'drive-'+kind,drive_url:'https://drive.google.com/file/d/'+kind+'/view',mime_type:'application/pdf',size:100,...(review?{review}:{})});
 attachDocument(d,'s1','dni',file('dni'),'Ana');attachDocument(d,'s1','signed_separation',file('signed'),'Ana');
 const result=attachDocument(d,'s1','reservation_voucher',file('voucher',{status:'review',extracted:{amount:315}}),'Ana');
 assert.equal(minimumSeparationAmount(d.separations[0]),4800);assert.deepEqual(voucherPaymentStatus(d.separations[0]),{required:4800,paid:315,covers:false});
 assert.equal(result.autoConfirmed,false);assert.equal(result.autoConfirmationBlocked,true);assert.equal(d.separations[0].status,'DRAFT');assert.equal(d.leads[1].status,'Calificado');
 assert.throws(()=>updateSeparation(d,'s1','confirm',{},'Ana'),/motivo/);updateSeparation(d,'s1','confirm',{reason:'Excepción aprobada por gerencia'},'Ana');assert.equal(d.separations[0].status,'CONFIRMED');
});

test('document review metadata is preserved without affecting the three-document rule',()=>{
 const d=fixture(),review={status:'review',label:'Revisar',summary:'El DNI no coincide.'},file={name:'dni.pdf',drive_file_id:'drive-dni',drive_url:'https://drive.google.com/file/d/dni/view',mime_type:'application/pdf',size:100,review};
 const result=attachDocument(d,'s1','dni',file,'Ana');
 assert.deepEqual(result.separation.documents.dni.review,review);assert.equal(result.autoConfirmed,false);assert.equal(d.leads[1].status,'Calificado');assert.equal(d.units[0].status,'AVAILABLE');
});

test('public Google Docs template is exported as text and validates required tokens',async()=>{
 let requested='';const body='{{CLIENT_NAME}}\n{{UNIT_NUMBER}}\n{{FINAL_PRICE}}';
 const result=await fetchSeparationTemplate('https://docs.google.com/document/d/abc123/edit',async url=>{requested=url;return {ok:true,arrayBuffer:async()=>Buffer.from(body)};});
 assert.equal(requested,'https://docs.google.com/document/d/abc123/export?format=txt');assert.equal(result.text,body);
 await assert.rejects(()=>fetchSeparationTemplate('https://docs.google.com/document/d/abc123/edit',async()=>({ok:true,arrayBuffer:async()=>Buffer.from('{{CLIENT_NAME}}')})),/campo obligatorio/);
});

test('legacy refund placeholders become the signed-agreement condition',()=>{
 const legacy='Solo si el banco no aprueba, el monto de {{REFUND_AMOUNT}} ({{REFUND_AMOUNT_WORDS}}) será devuelto en su totalidad a manos de EL CLIENTE.';
 const result=applyTemplate(legacy,{REFUND_CONDITION:'Según acuerdo firmado'});
 assert.equal(result,'Solo si el banco no aprueba, cualquier devolución se realizará Según acuerdo firmado.');
});

test('the separation template uses the approved BMG and ÖRÖK legal identification without changing the remaining clauses',async()=>{
 const template=await fs.readFile(path.join(__dirname,'..','templates','separacion-base.txt'),'utf8');
 assert.match(template,/BMG Desarrolladora Inmobiliaria S\.A\.C\., que utiliza ÖRÖK como nombre comercial, RUC 20615227685, con domicilio legal en Calle Puquina 138, Maranga, San Miguel, Lima, Perú,/);
 assert.match(template,/representada por su apoderado \{\{COMPANY_REPRESENTATIVE\}\}/);
 assert.match(template,/ANTECEDENTES/);
 assert.match(template,/CLÁUSULA PRIMERA; DEL PROYECTO:/);
});
test('separation PDF reuses the quote code and appends the linked department plan',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'orok-separation-')),planPath=path.join(root,'plan.pdf'),target=path.join(root,'separation.pdf');
 try{
  const plan=await PDFDocument.create();plan.addPage([300,500]).drawText('Plano Dpto 201');await fs.writeFile(planPath,await plan.save());
  await generateAndSaveSeparationPDF({separation:{code:'2026-0001473',generated_at:'2026-10-16T15:00:00.000Z',client_name:'Cliente Dos',dni:'12345678',marital_status:'Soltero',address:'Dirección',district:'San Miguel',province:'Lima',department:'Lima',economic_activity:'Arquitectura',financing_type:'Hipotecario',final_price:480000,separation_amount:4800,initial_amount:48000,financed_amount:432000,refund_condition:'Según acuerdo firmado',generated_by:'Ana',expires_at:null},quote:{quote_code:'2026-0001473'},unit:{unit_number:'201',plan_image_ext:planPath},settings:{contactPhone:'912971742'},templateText:'{{CLIENT_NAME}}\n\n{{UNIT_NUMBER}}\n\n{{FINAL_PRICE}}',targetFilePath:target});
  const result=await PDFDocument.load(await fs.readFile(target));assert.equal(result.getPageCount(),2);assert.match(result.getTitle(),/2026-0001473/);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
