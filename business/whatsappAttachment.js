'use strict';
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const TYPES={'application/pdf':{type:'document',ext:'pdf',limit:16},'text/plain':{type:'document',ext:'txt',limit:16},'image/jpeg':{type:'image',ext:'jpg',limit:5},'image/png':{type:'image',ext:'png',limit:5},'application/msword':{type:'document',ext:'doc',limit:16,ole:['WordDocument']},'application/vnd.ms-excel':{type:'document',ext:'xls',limit:16,ole:['Workbook','Book']},'application/vnd.ms-powerpoint':{type:'document',ext:'ppt',limit:16,ole:['PowerPoint Document']},'application/vnd.openxmlformats-officedocument.wordprocessingml.document':{type:'document',ext:'docx',limit:16,entry:'word/document.xml'},'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':{type:'document',ext:'xlsx',limit:16,entry:'xl/workbook.xml'},'application/vnd.openxmlformats-officedocument.presentationml.presentation':{type:'document',ext:'pptx',limit:16,entry:'ppt/presentation.xml'}};
function attachment(input){
 let mime=String(input?.mime||'').toLowerCase();const ext=String(input?.filename||'').split('.').pop().toLowerCase();if(!mime||mime==='application/octet-stream')mime=Object.keys(TYPES).find(m=>TYPES[m].ext===ext||(m==='image/jpeg'&&ext==='jpeg'))||mime;
 const spec=TYPES[mime],bytes=input?.bytes;
 if(!spec||!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>spec.limit*1024*1024)throw Error('Adjunta PDF, TXT, Word, Excel o PowerPoint de hasta 16 MB, o JPG/PNG de hasta 5 MB.');
 const valid=spec.entry?bytes.subarray(0,4).equals(Buffer.from('PK\x03\x04'))&&bytes.includes(Buffer.from('[Content_Types].xml'))&&bytes.includes(Buffer.from(spec.entry)):spec.ole?bytes.subarray(0,8).equals(Buffer.from([208,207,17,224,161,177,26,225]))&&spec.ole.some(v=>bytes.includes(Buffer.from(v,'utf16le'))):mime==='application/pdf'?bytes.subarray(0,5).toString()==='%PDF-':mime==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:mime==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):!bytes.includes(0);
 if(!valid)throw Error('El contenido del archivo no coincide con su formato.');
 const stem=String(input.filename||'Archivo').split(/[\\/]/).pop().replace(/[\r\n\x00-\x1f"<>:|?*]/g,'_').replace(/\.[^.]*$/,'').slice(0,140)||'Archivo';
 return {bytes,mime,type:spec.type,filename:stem+'.'+spec.ext};
}
class AttachmentArchive{
 constructor(privateDir){this.dir=privateDir?path.join(privateDir,'whatsapp-attachments'):null;}
 file(account,id){return path.join(this.dir,createHash('sha256').update(account+'\0'+id).digest('hex'));}
 get(account,id){if(!this.dir)return null;try{const f=this.file(account,id),meta=JSON.parse(fs.readFileSync(f+'.json','utf8'));return {...meta,bytes:fs.readFileSync(f+'.bin')};}catch(e){if(e.code==='ENOENT')return null;throw e;}}
 put(account,id,value){if(!this.dir)return;fs.mkdirSync(this.dir,{recursive:true,mode:0o700});const f=this.file(account,id);fs.writeFileSync(f+'.bin',value.bytes,{mode:0o600});fs.writeFileSync(f+'.json',JSON.stringify({mime:value.mime,filename:value.filename}),{mode:0o600});}
}
module.exports={attachment,AttachmentArchive,TYPES};
