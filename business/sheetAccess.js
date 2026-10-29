function exportURL(value) {
  let url;try{url=new URL(String(value).trim());}catch{throw new Error('Enlace no válido.');}
  if(!['http:','https:'].includes(url.protocol))throw new Error('Usa un enlace HTTP o HTTPS.');
  const gid=url.searchParams.get('gid')||new URLSearchParams(url.hash.slice(1)).get('gid');
  if(url.hostname==='docs.google.com') {
    const published=url.pathname.match(/\/spreadsheets\/d\/e\/([\w-]+)/),sheet=url.pathname.match(/\/spreadsheets\/d\/([\w-]+)/);
    if(published)url=new URL(`https://docs.google.com/spreadsheets/d/e/${published[1]}/pub?output=csv`);
    else if(sheet)url=new URL(`https://docs.google.com/spreadsheets/d/${sheet[1]}/export?format=csv`);
    else throw new Error('Usa el enlace de una hoja de Google Sheets.');
    if(gid && /^\d+$/.test(gid))url.searchParams.set('gid',gid);
  }
  url.hash='';return url.href;
}
function decodeCSV(buffer) {
  if(buffer[0]===0x50&&buffer[1]===0x4b)throw new Error('Este archivo es Excel. Ábrelo en Google Sheets o expórtalo como CSV.');
  const encoding=buffer[0]===0xff&&buffer[1]===0xfe?'utf-16le':buffer[0]===0xfe&&buffer[1]===0xff?'utf-16be':'utf-8';
  let text=new TextDecoder(encoding).decode(buffer);
  if(encoding==='utf-8'&&text.includes('\uFFFD'))text=new TextDecoder('windows-1252').decode(buffer);
  if(/^\s*<(?:!doctype|html)/i.test(text))throw new Error('Se recibió una página web, no los datos. Revisa los permisos y el enlace.');
  return text;
}
async function fetchSheet(value,fetcher=fetch) {
  const response=await fetcher(exportURL(value),{signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error(`No se pudo leer la hoja (HTTP ${response.status}). Revisa sus permisos.`);
  return {success:true,data:decodeCSV(Buffer.from(await response.arrayBuffer()))};
}
module.exports={exportURL,decodeCSV,fetchSheet};
