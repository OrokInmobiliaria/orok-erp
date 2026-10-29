'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {GoogleAuth}=require('google-auth-library');
const {folderId}=require('./planService');

const DRIVE_API='https://www.googleapis.com/drive/v3/files';
const MIME_DOC='application/vnd.google-apps.document';
const NAMES={
 separation:'01 - Acuerdo de reserva preferente',
 bank_minute:'02A - Minuta de compraventa bancaria',
 direct_minute:'02B - Minuta de compraventa directa',
};
const FALLBACKS={separation:'separacion-base.txt',bank_minute:'minuta-bancaria-base.txt',direct_minute:'minuta-directa-base.txt'};
const TOKENS={separation:['{{CLIENT_NAME}}','{{UNIT_NUMBER}}','{{FINAL_PRICE}}'],bank_minute:['{{SIGNERS}}','{{UNIT_NUMBER}}','{{FINAL_PRICE}}'],direct_minute:['{{SIGNERS}}','{{UNIT_NUMBER}}','{{FINAL_PRICE}}']};
const TOKEN_GROUPS={
 separation:TOKENS.separation.map(token=>[token]),
 bank_minute:[['{{SIGNERS}}','{{BUYER_1_NAME}}'],['{{UNIT_NUMBER}}','{{APARTMENT_NUMBER}}'],['{{FINAL_PRICE}}','{{TOTAL_SALE_PRICE}}']],
 direct_minute:[['{{SIGNERS}}','{{BUYER_NAME}}'],['{{UNIT_NUMBER}}'],['{{FINAL_PRICE}}','{{SALE_PRICE}}']],
};

class LegalTemplateStore{
 constructor({credentialFile,folderUrl}){this.credentialFile=credentialFile;this.folderId=folderId(folderUrl||'');this.auth=null;}
 async client(){if(!this.auth)this.auth=await new GoogleAuth({keyFile:this.credentialFile,scopes:['https://www.googleapis.com/auth/drive.readonly']}).getClient();return this.auth;}
 async fallback(kind){return {text:await fs.readFile(path.join(__dirname,'../templates',FALLBACKS[kind]),'utf8'),source:'Plantilla interna de respaldo',file_id:null,modified_at:null,name:NAMES[kind]};}
 validate(kind,value){const text=String(value||'').replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').trim();if(!text||/^\s*<(?:!doctype|html)/i.test(text))throw Error('La plantilla legal está vacía o no es texto.');for(const group of TOKEN_GROUPS[kind])if(!group.some(token=>text.includes(token)))throw Error(NAMES[kind]+' no contiene uno de estos campos obligatorios: '+group.join(' o ')+'.');return text;}
 async get(kind){
  if(!NAMES[kind])throw Error('Tipo de plantilla legal no válido.');
  if(!this.folderId)return this.fallback(kind);
  const client=await this.client(),params=new URLSearchParams({q:"'"+this.folderId+"' in parents and trashed=false and mimeType='"+MIME_DOC+"'",fields:'files(id,name,modifiedTime,webViewLink)',pageSize:'100',supportsAllDrives:'true',includeItemsFromAllDrives:'true'});
  const listed=await client.request({url:DRIVE_API+'?'+params.toString(),method:'GET'});
  const exact=(listed.data.files||[]).filter(file=>file.name===NAMES[kind]).sort((a,b)=>String(b.modifiedTime).localeCompare(String(a.modifiedTime)));
  if(exact.length!==1)throw Error(exact.length?'Hay más de una plantilla llamada “'+NAMES[kind]+'”. Conserva solo una.':'No se encontró “'+NAMES[kind]+'” en la carpeta privada.');
  const file=exact[0],response=await client.request({url:DRIVE_API+'/'+encodeURIComponent(file.id)+'/export?mimeType='+encodeURIComponent('text/plain'),method:'GET',responseType:'arraybuffer'});
  const bytes=Buffer.from(response.data);if(bytes.length>500000)throw Error('La plantilla legal supera 500 KB.');
  return {text:this.validate(kind,bytes.toString('utf8')),source:file.webViewLink||('Google Drive '+file.id),file_id:file.id,modified_at:file.modifiedTime||null,name:file.name};
 }
}
module.exports={LegalTemplateStore,NAMES,TOKENS,TOKEN_GROUPS};
