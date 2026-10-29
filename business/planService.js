const fs = require('fs');
const path = require('path');
const { parseDelimited } = require('./leadImport');
const norm = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const unitNumber = value => String(value ?? '').match(/(?:^|[^0-9])(\d{3,4})(?!\d)/)?.[1] || '';
function folderId(value) {
  try {const url=new URL(value);return url.hostname==='drive.google.com' ? url.pathname.match(/\/folders\/([\w-]+)/)?.[1] : null;}catch{return null;}
}
function fileURL(value) {
  const url=new URL(String(value).trim());
  if(!['http:','https:'].includes(url.protocol))throw new Error('El plano debe usar un enlace HTTP o HTTPS.');
  if(folderId(url.href))throw new Error('El enlace apunta a una carpeta; falta localizar el archivo del plano.');
  if(url.hostname==='drive.google.com') {
    const id=url.pathname.match(/\/file\/d\/([\w-]+)/)?.[1] || url.searchParams.get('id');
    if(!id)throw new Error('Enlace de archivo de Drive no válido.');
    const direct=new URL(`https://drive.google.com/uc?export=download&id=${id}`);
    if(url.searchParams.has('resourcekey'))direct.searchParams.set('resourcekey',url.searchParams.get('resourcekey'));
    return direct.href;
  }
  return url.href;
}
function planRows(csv,isExt) {
  const text=String(csv||'').replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
  const department=['dpto','dpt','departamento','unidad','unit number','unit','numero'];
  const links=['link','url','enlace','plano','archivo','link plano','url plano'];
  let selected;
  for(const sep of [',',';','\t']) {
    try {
      const rows=parseDelimited(text,sep);
      for(let i=0;i<Math.min(20,rows.length);i++) {
        const h=rows[i].map(norm),d=h.findIndex(v=>department.includes(v));
        let u=h.findIndex(v=>links.includes(v));
        if(d>=0&&u<0){
          // Some existing plan sheets have an empty URL header. Infer only a
          // single column made of links; never guess between multiple columns.
          const width=Math.max(h.length,...rows.slice(i+1).map(r=>r.length));
          const candidates=[];
          for(let c=0;c<width;c++){
            const values=rows.slice(i+1).filter(r=>unitNumber(r[d])).map(r=>String(r[c]||'').trim()).filter(Boolean);
            if(c!==d&&values.length&&values.every(v=>/^https?:\/\/\S+$/i.test(v)))candidates.push(c);
          }
          if(candidates.length===1)u=candidates[0];
        }
        if(d>=0 && u>=0){selected={rows,index:i,d,u,t:h.findIndex(v=>['cotas','tipo','tipo de plano'].includes(v))};break;}
      }
      if(selected)break;
    }catch{}
  }
  if(!selected)throw new Error('La hoja de planos debe contener columnas Dpto y Link (o URL).');
  const {rows,index,d,u,t}=selected;const result=[];
  for(const row of rows.slice(index+1)) {
    const type=norm(row[t]);
    if((isExt && /interior/.test(type)) || (!isExt && /exterior/.test(type)))continue;
    const unit=unitNumber(row[d]),url=String(row[u]||'').trim();
    if(!unit || !url)continue;
    result.push({unit_number:unit,label:String(row[d]).trim(),url});
  }
  if(!result.length)throw new Error('No hay filas válidas para ese tipo de plano. Revisa Dpto, Link y Cotas.');
  return result;
}
function publicFolderFiles(html) {
  // Read JSON data supplied by the public folder. Never execute page scripts.
  const encoded=html.match(/window\['_DRIVE_ivd'\]\s*=\s*'((?:\\.|[^'\\])*)'/)?.[1];
  if(!encoded)throw new Error('No se pudo listar la carpeta pública. Usa la carpeta sincronizada de Drive o enlaces directos a los archivos.');
  const decoded=encoded.replace(/\\(x[0-9a-f]{2}|u[0-9a-f]{4}|[\s\S])/gi,(_,token)=>{
    if(/^[xu]/.test(token)&&token.length>1)return String.fromCharCode(parseInt(token.slice(1),16));
    return ({n:'\n',r:'\r',t:'\t',b:'\b',f:'\f'})[token] ?? token;
  });
  const data=JSON.parse(decoded),files=new Map();
  function visit(value) {
    if(!Array.isArray(value))return;
    if(typeof value[0]==='string' && Array.isArray(value[1]) && typeof value[2]==='string' && /^(application\/pdf|image\/(png|jpeg))$/.test(value[3]))files.set(value[0],{id:value[0],name:value[2],url:`https://drive.google.com/uc?export=download&id=${value[0]}`});
    else value.forEach(visit);
  }
  visit(data);
  if(!files.size)throw new Error('La carpeta no muestra archivos PDF, PNG o JPG accesibles.');
  return [...files.values()];
}
function choosePlan(files,label,unit,isExt) {
  const stem=name=>norm(path.basename(name).replace(/\.(pdf|png|jpe?g)$/i,''));
  const exact=files.filter(f=>stem(f.name)===stem(label));
  if(exact.length===1)return exact[0];
  if(exact.length>1)throw new Error(`Hay varios archivos llamados ${label}. No se eligió uno automáticamente.`);
  // Existing interior sheets reuse the exterior suffix, while their folder's
  // base drawing is named D 201.pdf. Prefer that exact base over named options.
  const base=files.filter(f=>stem(f.name)===norm('D '+unit)||stem(f.name)===unit);
  if(base.length===1)return base[0];
  if(base.length>1)throw new Error(`Hay varios planos base para ${unit}. Especifica el nombre del archivo.`);
  const candidates=files.filter(f=>{
    const name=stem(f.name),suffix=name.match(/^(?:d |dpto |departamento )?\d{3,4} ([12])$/)?.[1];
    if(suffix && suffix !== (isExt?'2':'1'))return false;
    return unitNumber(f.name)===unit && !(isExt ? /interior/.test(name) : /exterior/.test(name));
  });
  if(candidates.length!==1)throw new Error(candidates.length ? `El departamento ${unit} tiene varias versiones. Especifica en Dpto el nombre del archivo, por ejemplo D ${unit}_2.` : `No se encontró el archivo del departamento ${unit}.`);
  return candidates[0];
}
async function resolvePlanRows(rows,isExt,fetcher=fetch) {
  const folders=new Map(),resolved=[];
  for(const row of rows) {
    const id=folderId(row.url);
    if(id) {
      if(!folders.has(id)) {
        const response=await fetcher(`https://drive.google.com/drive/folders/${id}`,{signal:AbortSignal.timeout(30000)});
        if(!response.ok)throw new Error(`No se pudo leer la carpeta (HTTP ${response.status}).`);
        folders.set(id,publicFolderFiles(await response.text()));
      }
      resolved.push({...row,url:choosePlan(folders.get(id),row.label,row.unit_number,isExt).url});
    } else resolved.push({...row,url:fileURL(row.url)});
  }
  return resolved;
}
function applyPlans(units,rows,isExt) {
  const key=isExt?'plan_image_ext':'plan_image_int',assignments=new Map();
  for(const row of rows) {
    const id=unitNumber(row.unit_number),value=String(row.url||'').trim();
    if(!id||!value)continue;
    if(folderId(value))throw new Error('No se puede guardar una carpeta como plano. Usa Ligar para localizar los archivos.');
    if(assignments.has(id)&&assignments.get(id)!==value)throw new Error(`Hay dos planos distintos asignados a ${id}. No se modificó el inventario.`);
    assignments.set(id,value);
  }
  let updated=0,matched=0;const missing=[];
  const result=units.map(unit=>{
    const value=assignments.get(String(unit.unit_number));
    if(!value)return unit;matched++;
    if(unit[key]===value)return unit;updated++;return {...unit,[key]:value};
  });
  for(const id of assignments.keys())if(!units.some(u=>String(u.unit_number)===id))missing.push(id);
  return {units:result,report:{updated,matched,missing,total:assignments.size}};
}
async function scanFolder(folder) {
  const root=await fs.promises.realpath(folder),files=[];
  async function walk(dir,depth=0) {
    if(depth>15)throw new Error('La carpeta contiene demasiados niveles. Selecciona la carpeta de planos.');
    for(const entry of await fs.promises.readdir(dir,{withFileTypes:true})) {
      if(entry.isSymbolicLink())continue;
      const full=path.join(dir,entry.name);
      if(entry.isDirectory())await walk(full,depth+1);
      else if(/\.(pdf|png|jpe?g)$/i.test(entry.name))files.push({name:entry.name,url:full});
    }
  }
  await walk(root);return files;
}
async function folderPlans(folder,units,isExt) {
  const files=await scanFolder(folder),rows=[],skipped=[];
  for(const unit of units) {
    const id=String(unit.unit_number);
    if(!files.some(f=>unitNumber(f.name)===id))continue;
    try {const file=choosePlan(files,`D ${id}_${isExt?'2':'1'}`,id,isExt);rows.push({unit_number:id,url:file.url});}
    catch(error){skipped.push(error.message);}
  }
  return {rows,skipped};
}
module.exports={planRows,publicFolderFiles,resolvePlanRows,applyPlans,fileURL,folderId,choosePlan,folderPlans};
