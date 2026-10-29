'use strict';
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {allowedURL}=require('./safe-network.cjs');
const TOKEN=/^[0-9a-f-]{36}\.(?:pdf|png|jpg|csv)$/;
function assets(root){
 fs.mkdirSync(root,{recursive:true});
 const file=token=>{if(!TOKEN.test(token))throw Error('Archivo no válido.');return path.join(root,token);};
 return {file,resolve(value){if(!value)return '';if(String(value).startsWith('/files/'))return file(value.slice(7));return allowedURL(value);},
  async add(name,bytes){if(bytes.length>100*1024*1024)throw Error('Archivo superior a 100 MB.');let ext=path.extname(name).slice(1).toLowerCase();if(ext==='jpeg')ext='jpg';if(!['pdf','png','jpg','csv'].includes(ext))throw Error('Selecciona PDF, PNG, JPG o CSV.');if(ext==='pdf'&&bytes.subarray(0,5).toString()!=='%PDF-')throw Error('PDF no válido.');if(ext==='png'&&bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('PNG no válido.');if(ext==='jpg'&&(bytes[0]!==255||bytes[1]!==216))throw Error('JPG no válido.');const token=randomUUID()+'.'+ext;await fs.promises.writeFile(file(token),bytes,{flag:'wx',mode:0o600});return '/files/'+token;}
 };
}
module.exports={assets,TOKEN};
