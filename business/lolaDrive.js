'use strict';
const {GoogleAuth}=require('google-auth-library');
const {inflateRawSync}=require('node:zlib');
const {createHash}=require('node:crypto');
const {norm,unauthorizedReply,urls}=require('./lolaPolicy');
const FOLDER={id:'1XzOlumWN8jPhWMCQ1yge3cZ4tBiTuU6z',name:'IA LOLA',url:'https://drive.google.com/drive/folders/1XzOlumWN8jPhWMCQ1yge3cZ4tBiTuU6z'};
const ROOT='https://www.googleapis.com/drive/v3/files',FOLDER_MIME='application/vnd.google-apps.folder';
const MAX=8*1024*1024;
const xml=s=>String(s).replace(/<[^>]*>/g,'').replace(/&#(x[\da-f]+|\d+);/gi,(_,n)=>{const v=n[0]==='x'?parseInt(n.slice(1),16):Number(n);return v>0&&v<=0x10ffff?String.fromCodePoint(v):'';}).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');
// Bounded Office XML reader: no macros, external relations or executable content.
function officeText(bytes,kind){
 const b=Buffer.from(bytes);if(b.length>MAX)throw Error('Documento Office demasiado grande.');
 let e=-1;for(let i=b.length-22;i>=Math.max(0,b.length-65557);i--)if(b.readUInt32LE(i)===0x06054b50){e=i;break;}
 if(e<0)throw Error('Office ZIP no válido.');let p=b.readUInt32LE(e+16),total=0;const entries=new Map(),count=b.readUInt16LE(e+10);if(count>4000)throw Error('Demasiadas partes Office.');
 for(let n=0;n<count;n++){
  if(p+46>b.length||b.readUInt32LE(p)!==0x02014b50)throw Error('Índice Office no válido.');
  const method=b.readUInt16LE(p+10),compressed=b.readUInt32LE(p+20),size=b.readUInt32LE(p+24),nl=b.readUInt16LE(p+28),extra=b.readUInt16LE(p+30),comment=b.readUInt16LE(p+32),offset=b.readUInt32LE(p+42),name=b.toString('utf8',p+46,p+46+nl);p+=46+nl+extra+comment;
  if(!/^(?:word\/document.xml|xl\/sharedStrings.xml|xl\/worksheets\/sheet\d+.xml)$/.test(name))continue;
  total+=size;if(total>MAX||offset+30>b.length||b.readUInt32LE(offset)!==0x04034b50)throw Error('Límite de lectura Office.');
  const start=offset+30+b.readUInt16LE(offset+26)+b.readUInt16LE(offset+28);if(start+compressed>b.length)throw Error('Office incompleto.');
  const data=b.subarray(start,start+compressed),v=method===0?data:method===8?inflateRawSync(data,{maxOutputLength:MAX}):null;if(!v||v.length!==size)throw Error('Compresión Office no admitida.');entries.set(name,v.toString('utf8'));
 }
 if(kind==='docx')return String(entries.get('word/document.xml')||'').split(/<\/w:p>/).map(xml).join('\n');
 const shared=[...String(entries.get('xl/sharedStrings.xml')||'').matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map(m=>xml(m[1]));
 return [...entries].filter(([n])=>n.startsWith('xl/worksheets/')).flatMap(([,s])=>[...s.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map(r=>[...r[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)].map(c=>{const v=xml(c[2].match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1]||'');return /\bt="s"/.test(c[1])?shared[Number(v)]||'':/\bt="inlineStr"/.test(c[1])?xml(c[2]):v;}).join(' | '))).join('\n');
}
function safeText(text){
 // Financial/profile data and instructions in documents cannot expand LOLA's authority.
 return String(text).split(/[\r\n]+/).map(s=>s.trim()).filter(s=>s&&!unauthorizedReply(s)&&!/@|\b\d{5,}\b|\b\d{1,3}(?:[.,]\d{3})+\b|\b(?:dni|contrase[nñ]a|token|api.?key|ignora|ignore|system prompt|system message|prompt|instrucciones del sistema)\b/i.test(s)).join('\n').slice(0,10000);
}
function internal(name){const label=norm(name).replace(/[_./\\-]+/g,' ');return /\b(?:contrato|venta depas|ingreso|clientes|leads|prompt|precios|cotizaci\w*|planos?|dni|voucher)\b/.test(label);}
function resourceUrl(value){try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443')return null;
 if(['www.instagram.com','instagram.com','www.facebook.com','facebook.com','www.tiktok.com','tiktok.com','www.youtube.com','youtube.com','youtu.be','vimeo.com','www.vimeo.com','infinity224.pe','www.infinity224.pe','orok.com.pe','www.orok.com.pe','maps.app.goo.gl','maps.google.com'].includes(u.hostname)||u.hostname==='www.google.com'&&u.pathname.startsWith('/maps'))return u.href;
 }catch{}return null;}
class LolaDrive{
 constructor(config={},options={}){this.config=config;this.requester=options.requester;this.clock=options.clock||Date.now;this.cache=null;this.pending=null;this.textCache=new Map();}
 async request(url,options={}){
  if(this.requester)return this.requester(url,options);
  if(!this.config.credential)throw Error('Falta conexión técnica de lectura a Drive.');
  if(!this.auth)this.auth=await new GoogleAuth({keyFile:this.config.credential,scopes:['https://www.googleapis.com/auth/drive.readonly']}).getClient();
  const r=await this.auth.request({url,method:'GET',timeout:8000,retry:false,...options});return r.data;
 }
 async list(deadline=Infinity){
  const folder=await this.request(ROOT+'/'+FOLDER.id+'?fields=id,mimeType,trashed&supportsAllDrives=true');
  if(folder.id!==FOLDER.id||folder.mimeType!==FOLDER_MIME||folder.trashed)throw Error('La carpeta autorizada no está disponible para esta conexión.');
  const queue=[FOLDER.id],seen=new Set(queue),files=[];
  while(queue.length){const id=queue.shift();let page='';do{
   if(this.clock()>deadline)throw Error('Drive superó el tiempo de consulta.');
   const q=new URLSearchParams({q:`'${id}' in parents and trashed = false`,fields:'nextPageToken,incompleteSearch,files(id,name,mimeType,modifiedTime,size,parents,webViewLink,permissions(type,role))',pageSize:'100',supportsAllDrives:'true',includeItemsFromAllDrives:'true',...(page?{pageToken:page}:{})});
   const data=await this.request(ROOT+'?'+q);if(data.incompleteSearch)throw Error('Listado Drive incompleto.');
   for(const f of data.files||[]){if(!/^[\w-]+$/.test(f.id)||!f.parents?.includes(id))continue;if(f.mimeType===FOLDER_MIME){if(!seen.has(f.id)){seen.add(f.id);if(seen.size>12)throw Error('La carpeta supera 12 subcarpetas.');queue.push(f.id);}}else if(f.mimeType!=='application/vnd.google-apps.shortcut'){files.push(f);if(files.length>100)throw Error('La carpeta supera 100 archivos.');}}
   page=data.nextPageToken||'';
  }while(page);}
  return files;
 }
 async readText(f){
  if(Number(f.size)>MAX)return null;let kind='',url=ROOT+'/'+f.id;
  if(f.mimeType==='application/vnd.google-apps.document')url+='/export?mimeType=text%2Fplain';
  else if(f.mimeType==='application/vnd.google-apps.spreadsheet'){url+='/export?mimeType=application%2Fvnd.openxmlformats-officedocument.spreadsheetml.sheet';kind='xlsx';}
  else if(/wordprocessingml/.test(f.mimeType)){url+='?alt=media';kind='docx';}
  else if(/spreadsheetml/.test(f.mimeType)){url+='?alt=media';kind='xlsx';}
  else if(/^text\/(?:plain|csv)$/.test(f.mimeType))url+='?alt=media';else return null;
  const data=await this.request(url,{responseType:'arraybuffer',maxContentLength:MAX});const bytes=Buffer.from(data);if(bytes.length>MAX)throw Error('Texto Drive demasiado grande.');return safeText(kind?officeText(bytes,kind):bytes.toString('utf8'));
 }
 async context(settings={},force=false){
  const base={folder:FOLDER,authorization:'Gerencia · autorización permanente de carpeta confirmada por el usuario',sources:[],resources:[]};
  if(settings.lolaExperience?.driveEnabled===false)return {...base,state:'disabled'};
  if(!force&&this.cache&&this.clock()-this.cache.at<300000)return this.cache.value;
  if(this.pending&&!force)return this.pending;
  const run=(async()=>{try{
   const deadline=this.clock()+15000,files=await this.list(deadline),sources=[],resources=[],warnings=[];let total=0;
   for(const f of files){
    if(internal(f.name))continue;
    const label=String(f.name).slice(0,150);if(unauthorizedReply(label))continue;
    const key=f.id+':'+f.modifiedTime;let text=this.textCache.get(key);
    if(text===undefined){if(this.clock()>deadline){warnings.push('Consulta parcial por tiempo; los archivos no leídos no se usan como evidencia.');break;}try{text=await this.readText(f)||'';this.textCache.set(key,text);}catch{warnings.push(label+': no se pudo extraer texto');text='';}}
    if(text&&total<16000){text=text.slice(0,Math.min(8000,16000-total));total+=text.length;sources.push({id:f.id,name:label,modified_at:f.modifiedTime,text});}
    // Folder authority covers resources described there; no new per-link approval dialog.
    for(const link of urls(text)){const url=resourceUrl(link);if(url)resources.push({id:'drive-link-'+createHash('sha256').update(url).digest('hex').slice(0,16),kind:/youtube|youtu.be|vimeo/.test(url)?'video':/instagram|facebook|tiktok/.test(url)?'social':'website',label,url,approved:true,source_id:f.id});}
    // Never publish a private Drive file or alter its sharing to make a link work.
    if(f.permissions?.some(p=>p.type==='anyone'&&['reader','writer','commenter'].includes(p.role))&&/^(?:video\/|image\/|application\/pdf)/.test(f.mimeType))resources.push({id:'drive-file-'+f.id,kind:f.mimeType.startsWith('video/')?'video':f.mimeType==='application/pdf'?'brochure':'website',label,url:`https://drive.google.com/file/d/${f.id}/view`,approved:true,source_id:f.id});
   }
   const value={...base,state:'ready',checked_at:new Date(this.clock()).toISOString(),sources,resources:[...new Map(resources.map(r=>[r.url,r])).values()].slice(0,60),warnings,files_seen:files.length};this.cache={at:this.clock(),value};if(this.textCache.size>200)this.textCache.clear();return value;
  }catch{this.cache=null;return {...base,state:'unavailable',reason:'No se pudo leer IA LOLA. Revisa la conexión de Drive del servidor; no requiere una nueva aprobación comercial.'};}})();
  this.pending=run;try{return await run;}finally{if(this.pending===run)this.pending=null;}
 }
}
module.exports={LolaDrive,FOLDER,officeText,safeText,internal,resourceUrl};
