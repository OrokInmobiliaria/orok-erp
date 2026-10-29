'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {config:readConfig}=require('./config.cjs');
const {createPool}=require('./postgres-project.cjs');
const {PostgresDocuments}=require('./postgres-documents.cjs');
const {FirestoreProject}=require('./firestore-project.cjs');
const {LegalTemplateStore}=require('./business/legalTemplateStore');
const {generateAndSaveSeparationPDF}=require('./business/separationPDF');
const {createMinute}=require('./business/minuteService');
const {generateLegalPDF}=require('./business/legalDocumentPDF');
const {DriveDocumentStore}=require('./business/driveDocumentStore');
const LEAD_PHONE='999000128';
const UNIT_NUMBER='9901';
const QUOTE_ID='00000000-0000-4000-8000-000000000127';
const SEPARATION_ID='00000000-0000-4000-8000-000000000128';
(async()=>{
 const config=readConfig(),pool=createPool(config),db=new PostgresDocuments(pool,{project:config.project}),store=new FirestoreProject(db,{project:config.project});
 try{
  const data=await store.read(),existing=(data.separations||[]).find(item=>item.id===SEPARATION_ID);
  if(existing?.minute?.drive_file_id){console.log('R28_DRIVE_E2E',JSON.stringify({ok:true,reused:true,separation:existing.code,folder:existing.drive_folder_url,minute:existing.minute.drive_url}));return;}
  const lead=(data.leads||[]).find(item=>String(item.phone)===LEAD_PHONE),unit=(data.units||[]).find(item=>String(item.unit_number)===UNIT_NUMBER);
  if(!lead||!unit)throw Error('Faltan el lead o la unidad aislados de preproducción.');
  const now=new Date().toISOString(),quote={id:QUOTE_ID,date:now,unit_id:unit.id,lead_id:lead.id,dni:'12345678',financingType:'Directo',directCreditMonths:12,discount_pct:0,initial_pct:30,parking:'Ninguno',recontact_at:null,quote_code:'R28-TEST-9901',lead_name:lead.name,unit_number:UNIT_NUMBER,price:Number(unit.price),final_price:Number(unit.price),seller:'Prueba Técnica',client_snapshot:{name:lead.name,dni:'12345678',phone:lead.phone,email:lead.email,address:lead.address},pdf_path:''};
  const signers=[{role:'Titular',name:'Prueba Legal R28',dni:'12345678',marital_status:'Soltero',address:'Calle de Prueba 128, Lima'}];
  const separation={id:SEPARATION_ID,code:quote.quote_code,quote_id:quote.id,lead_id:lead.id,unit_id:unit.id,unit_number:UNIT_NUMBER,client_name:lead.name,dni:'12345678',marital_status:'Soltero',address:'Calle de Prueba 128, Lima',district:'San Miguel',province:'Lima',department:'Lima',economic_activity:'Prueba técnica de preproducción',financing_type:'Directo',final_price:Number(quote.final_price),separation_amount:Number(quote.final_price)*0.01,initial_amount:Number(quote.final_price)*0.30,financed_amount:Number(quote.final_price)*0.70,refund_condition:'Según acuerdo firmado',signers,status:'CONFIRMED',generated_at:now,generated_by:'Prueba Técnica',generated_by_id:'r28-e2e',confirmed_at:now,confirmed_by:'Prueba Técnica',confirmation_method:'manual',expires_at:new Date(Date.now()+15*86400000).toISOString(),documents:{},document_version:'67.6.11-r28',audit:[{at:now,actor:'Prueba Técnica',action:'generate',from:null,to:'CONFIRMED',reason:'Validación integral aislada r28'}]};
  const templates=new LegalTemplateStore({credentialFile:config.credential,folderUrl:data.settings.toolLinks.legalTemplatesFolder}),sepTemplate=await templates.get('separation');
  Object.assign(separation,{template_source:sepTemplate.source,template_file_id:sepTemplate.file_id||null,template_modified_at:sepTemplate.modified_at||null});
  const files=path.join(config.privateDir,'files');await fs.mkdir(files,{recursive:true});
  const sepFile=path.join(files,SEPARATION_ID+'.pdf'),minuteFile=path.join(files,'00000000-0000-4000-8000-000000000129.pdf');
  await generateAndSaveSeparationPDF({separation,quote,unit,lead,settings:data.settings,templateText:sepTemplate.text,targetFilePath:sepFile});separation.pdf_path='/files/'+path.basename(sepFile);
  const minuteTemplate=await templates.get('direct_minute'),minute=createMinute(separation,'Prueba Técnica',minuteTemplate,'/files/'+path.basename(minuteFile),signers);
  await generateLegalPDF({templateText:minuteTemplate.text,minute,separation,unit,settings:data.settings,targetFilePath:minuteFile});
  const drive=new DriveDocumentStore({credentialFile:config.credential,parentFolderUrl:data.settings.toolLinks.separationFilesFolder}),staged={...separation,minute},saved=await drive.saveGeneratedMinute({separation:staged,separationPdfPath:sepFile,minutePdfPath:minuteFile});
  separation.minute={...minute,drive_file_id:saved.file.drive_file_id,drive_url:saved.file.drive_url};separation.drive_folder_id=saved.folder.id;separation.drive_folder_url=saved.folder.webViewLink||'';
  await store.run(({read,write})=>{const d=read();if(!(d.quotes||[]).some(item=>item.id===QUOTE_ID))d.quotes=[...(d.quotes||[]),quote];if(!(d.separations||[]).some(item=>item.id===SEPARATION_ID))d.separations=[...(d.separations||[]),separation];const savedLead=d.leads.find(item=>item.id===lead.id);savedLead.status='Minuta';savedLead.substatus=minute.status;savedLead.last_quote={id:quote.id,code:quote.quote_code,delivered_at:quote.date,unit_number:quote.unit_number,final_price:quote.final_price,financing_type:'Directo',pdf_path:''};savedLead.separations=[...(savedLead.separations||[]).filter(item=>item.id!==separation.id),{id:separation.id,at:now,status:'active',unit_id:unit.id,code:separation.code}];savedLead.stage_history=[...(savedLead.stage_history||[]),{from:'Lead Inicial',to:'Minuta',at:now,actor:'Prueba Técnica',observed:false}];write(d);});
  console.log('R28_DRIVE_E2E',JSON.stringify({ok:true,reused:false,separation:separation.code,folder:separation.drive_folder_url,minute:separation.minute.drive_url,template:minute.template_source}));
 }finally{await pool.end();}
})().catch(error=>{console.error('R28_DRIVE_E2E_ERROR',error.message);process.exitCode=1;});
