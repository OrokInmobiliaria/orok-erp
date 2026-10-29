const {allowedURL}=require('../safe-network.cjs');
const {exportURL}=require('./sheetAccess');
const EMPTY={leads:['','',''],units:'',plansExt:'',plansInt:'',finishes:'',separationTemplate:'',legalTemplatesFolder:'',separationFilesFolder:'',autoSync:true,revision:0};
function toolLinks(settings={}){return {...EMPTY,...settings.toolLinks,finishes:settings.toolLinks?.finishes??settings.acabadosSheetUrl??''};}
function validateLinks(input){
 if(!input||!Array.isArray(input.leads)||input.leads.length>10||input.leads.length<1)throw Error('Registra de 1 a 10 fuentes.');
 const clean=value=>{if(typeof value!=='string'||value.length>2048)throw Error('Enlace no válido.');return value.trim()?allowedURL(value.trim()):'';};
 const leads=input.leads.map(clean),normalized=leads.filter(Boolean).map(exportURL);if(new Set(normalized).size!==normalized.length)throw Error('La misma hoja está registrada más de una vez.');
 if(typeof input.autoSync!=='boolean')throw Error('Configuración automática no válida.');
 const folder=value=>{const result=clean(value??'');if(result){const url=new URL(result);if(url.hostname!=='drive.google.com'||!url.pathname.match(/\/folders\/[\w-]+/))throw Error('Usa un enlace de carpeta de Google Drive.');}return result;};
 return {leads,units:clean(input.units),plansExt:clean(input.plansExt),plansInt:clean(input.plansInt),finishes:clean(input.finishes),separationTemplate:clean(input.separationTemplate??''),legalTemplatesFolder:folder(input.legalTemplatesFolder),separationFilesFolder:folder(input.separationFilesFolder),autoSync:input.autoSync};
}
function updateToolLinks(d,input,actor){
 const current=toolLinks(d.settings);if(input.revision!==current.revision)throw Error('Otro usuario actualizó los enlaces. Recupera la versión compartida antes de guardar.');
 const next={...validateLinks(input),revision:current.revision+1,updated_at:new Date().toISOString(),updated_by:actor};d.settings={...d.settings,toolLinks:next,acabadosSheetUrl:next.finishes};return next;
}
module.exports={toolLinks,updateToolLinks};
