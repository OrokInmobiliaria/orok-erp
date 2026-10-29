'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {GoogleAuth}=require('google-auth-library');
const {folderId}=require('./planService');

const DRIVE_API='https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD='https://www.googleapis.com/upload/drive/v3/files';
const cleanName=value=>String(value??'').replace(/[\\/:*?"<>|\u0000-\u001f]/g,' ').replace(/\s+/g,' ').trim().slice(0,180);
const mimeFor=name=>({'.pdf':'application/pdf','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg'}[path.extname(String(name)).toLowerCase()]||'application/octet-stream');
const PREFIXES={dni:'01-DNI',signed_separation:'02-Separacion-firmada',reservation_voucher:'03-Voucher-reserva',signed_sale_minutes:'06-Minuta-firmada',notary_voucher:'07-Voucher-notaria'};

class DriveDocumentStore{
 constructor({credentialFile,parentFolderUrl}){this.credentialFile=credentialFile;this.parentFolderId=folderId(parentFolderUrl||'');this.auth=null;if(!this.parentFolderId)throw Error('Configura en Herramientas la carpeta privada de Google Drive para las operaciones.');}
 async client(){if(!this.auth)this.auth=await new GoogleAuth({keyFile:this.credentialFile,scopes:['https://www.googleapis.com/auth/drive']}).getClient();return this.auth;}
 async createFolder(name){const client=await this.client(),response=await client.request({url:DRIVE_API+'?supportsAllDrives=true&fields=id,name,webViewLink',method:'POST',headers:{'Content-Type':'application/json'},data:{name:cleanName(name),mimeType:'application/vnd.google-apps.folder',parents:[this.parentFolderId]}});return response.data;}
 async upload(folder,name,bytes,mimeType=mimeFor(name)){
  const boundary='orok-'+Date.now().toString(36),metadata=Buffer.from(JSON.stringify({name:cleanName(name),parents:[folder]}));
  const body=Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`),metadata,Buffer.from(`\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),Buffer.from(bytes),Buffer.from(`\r\n--${boundary}--`)]);
  const client=await this.client(),response=await client.request({url:DRIVE_UPLOAD+'?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink,mimeType,size',method:'POST',headers:{'Content-Type':'multipart/related; boundary='+boundary,'Content-Length':String(body.length)},data:body,responseType:'json'});return response.data;
 }
 async prepareFolder(separation,pdfPath){
  if(separation.drive_folder_id)return {id:separation.drive_folder_id,webViewLink:separation.drive_folder_url,created:false};
  const folderName=`${separation.code} - Dpto ${separation.unit_number} - ${separation.client_name}`,folder=await this.createFolder(folderName);
  if(pdfPath){const bytes=await fs.readFile(pdfPath);await this.upload(folder.id,`04-Separacion-generada_${separation.code}_Dpto-${separation.unit_number}.pdf`,bytes,'application/pdf');}
  return {...folder,created:true};
 }
 async saveGeneratedMinute({separation,separationPdfPath,minutePdfPath}){
  const folder=await this.prepareFolder(separation,separationPdfPath),bytes=await fs.readFile(minutePdfPath),label=separation.minute?.type==='bank_minute'?'Bancaria':'Directa',file=await this.upload(folder.id,`05-Minuta-${label}-generada_${separation.code}_v${Number(separation.minute?.revision||1)}.pdf`,bytes,'application/pdf');
  return {folder,file:{name:file.name,drive_file_id:file.id,drive_url:file.webViewLink,mime_type:file.mimeType||'application/pdf',size:Number(file.size||bytes.length)}};
 }
 async saveRequiredDocument({separation,pdfPath,kind,fileName,bytes,mimeType}){
  const folder=await this.prepareFolder(separation,pdfPath),prefix=PREFIXES[kind];if(!prefix)throw Error('Tipo de documento no válido.');
  const ext=path.extname(fileName).toLowerCase()||({'application/pdf':'.pdf','image/png':'.png','image/jpeg':'.jpg'}[mimeType]||'');
  const revision=Number(separation.documents?.[kind]?.revision||0)+1,file=await this.upload(folder.id,`${prefix}_${separation.code}_v${revision}${ext}`,bytes,mimeType);
  return {folder,file:{name:file.name,drive_file_id:file.id,drive_url:file.webViewLink,mime_type:file.mimeType||mimeType,size:Number(file.size||bytes.length),revision}};
 }
}
module.exports={DriveDocumentStore,cleanName,mimeFor,PREFIXES};
