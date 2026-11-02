#!/usr/bin/env node
// R33b · Genera evaluador/ (index.html + app.js + jspdf) a partir de la app del Evaluador M.O.R.A.
// Uso: node deploy/build-evaluador.cjs <evaluador.html> <jspdf.umd.min.js> <exceljs.min.js>
// La app conserva su comportamiento fuera del CRM; dentro de /evaluador activa el "modo CRM":
// guarda evaluaciones en PostgreSQL vía RPC, trae ventas reales y consulta a M.O.R.A por n8n.
'use strict';
const fs = require('node:fs'), path = require('node:path');
const [src, jspdf, exceljs] = process.argv.slice(2);
if (!src || !jspdf || !exceljs) { console.error('Uso: node deploy/build-evaluador.cjs <evaluador.html> <jspdf.umd.min.js> <exceljs.min.js>'); process.exit(1); }
const html = fs.readFileSync(src, 'utf8');
const a = html.indexOf('<script>'), b = html.lastIndexOf('</script>');
if (a < 0 || b < a) throw Error('No se encontró el script principal.');
let js = html.slice(a + 8, b);
const rep = (from, to) => { if (!js.includes(from)) throw Error('Punto de inserción no encontrado: ' + from.slice(0, 60)); js = js.replace(from, to); };

rep("text=String(text||'').trim();if(!text||aiCtl)return;", "text=String(text||'').trim();if(!text||aiCtl)return;if(CRM)return crmAsk(text);");
rep("const dot=$('#aiDot');if(dot)dot.className='ai-dot'+(sampleFn?'':' off');", "const dot=$('#aiDot');if(dot)dot.className='ai-dot'+(sampleFn||crmAi?'':' off');");
rep("(async()=>{try{const s=window.claude&&await window.claude.use('sample');", "if(CRM)setTimeout(crmBoot,0);else(async()=>{try{const s=window.claude&&await window.claude.use('sample');");
rep('Pégala en el CRM, en Evaluador Inmobiliario &gt; Administración M.O.R.A (dentro del CRM, el Evaluador la guarda directamente con «Guardar en el CRM»).', '${CRM?\'Estás dentro del CRM: usa «Guardar en el CRM» (arriba) y la evaluación queda en la base del CRM con su historial de revisiones.\':\'Pégala en el CRM, en Evaluador Inmobiliario &gt; Administración M.O.R.A (dentro del CRM, el Evaluador la guarda directamente con «Guardar en el CRM»).\'}');

js += String.raw`
/* ---------- R33b · Modo CRM ÖRÖK (solo dentro de /evaluador) ---------- */
var crmAi=false,crmList=[];
async function crmRpc(name,...args){
  const r=await fetch('/api/rpc/db.'+name,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Orok-Request':'1'},body:JSON.stringify({args})});
  let j=null;try{j=await r.json()}catch(_){}
  if(r.status===401)throw Error('Tu sesión del CRM expiró. Vuelve a ingresar.');
  if(!r.ok)throw Error(j&&j.error||('El CRM respondió '+r.status));
  return j?j.value:null;
}
// R100 · aviso: el panel de M.O.R.A en el CRM muestra la última versión guardada; los cambios locales no llegan hasta «Guardar en el CRM».
document.addEventListener('change',e=>{if(!e.target.closest||!e.target.closest('main, #app, body'))return;if(e.target.closest('#crmBar'))return;if(typeof S!=='undefined'&&S._crm&&S._crm.id)setTimeout(()=>crmMsg('Hay cambios sin guardar en el CRM. Pulsa «Guardar en el CRM» para actualizar utilidad y TIR en el panel de M.O.R.A.',true),50)});
function crmMsg(t,bad){const el=document.getElementById('crmBarMsg');if(el){el.textContent=t||'';el.style.color=bad?'var(--bad,#b42318)':''}}
function crmNormalize(){
  for(const k in DEF)if(S[k]===undefined)S[k]=JSON.parse(JSON.stringify(DEF[k]));
  for(const k in DEF.p)if(S.p[k]===undefined)S.p[k]=DEF.p[k];
  for(const k in DEF.mercado)if(S.mercado[k]===undefined)S.mercado[k]=JSON.parse(JSON.stringify(DEF.mercado[k]));
  (S.ventas||[]).forEach(v=>{if(!ETAPAS.includes(v.estado))v.estado=ETAPA_MAP[String(v.estado||'').toLowerCase()]||'Separación'});
  if(!S.estr.estado)S.estr.estado='propuesta';
  if(!S.base)S.base={nombre:'Evaluación inicial',fecha:new Date().toISOString().slice(0,10),snap:JSON.parse(JSON.stringify(Object.fromEntries(SNAPKEYS.map(k=>[k,S[k]]))))};
}
function crmBar(){
  const acts=document.querySelector('.acts');if(!acts||document.getElementById('crmBar'))return;
  const bar=document.createElement('div');bar.id='crmBar';bar.className='crm-bar';
  bar.innerHTML='<label class="mut" for="crmSel">Evaluación</label><select id="crmSel"></select><button class="btn" id="crmReload" type="button" title="Vuelve a cargar la evaluación elegida desde el CRM">Cargar del CRM</button><button class="btn" id="crmSave" type="button">Guardar en el CRM</button><button class="btn" id="crmSales" type="button">Traer ventas del CRM</button><span id="crmBarMsg" class="mut" role="status"></span>';
  acts.prepend(bar);
  document.getElementById('crmSave').addEventListener('click',crmSave);
  const fresh=document.createElement('button');fresh.type='button';fresh.className='btn';fresh.textContent='Nuevo proyecto';fresh.id='crmNew';bar.prepend(fresh);fresh.addEventListener('click',()=>{if(!confirm('Abrir un proyecto nuevo usando el modelo actual como referencia. No se cambiará el proyecto guardado. Revisa los supuestos y la cabida antes de guardarlo.'))return;try{localStorage.setItem(KEY+'-anterior',JSON.stringify(S));}catch(_){}delete S._crm;S.p.nombre='';S.p.direccion='';S.ventas=[];if(S.mercado)S.mercado.comps=[];cur='datosProyecto';save();render();crmFill();crmMsg('Borrador de proyecto nuevo: completa sus datos y revisa el modelo de referencia.');});
  document.getElementById('crmReload').addEventListener('click',()=>{const v=document.getElementById('crmSel').value;if(v&&v!=='__local')crmLoad(v);else crmMsg('Elige una evaluación guardada en el CRM.',true)});
  document.getElementById('crmSales').addEventListener('click',crmSales);
  document.getElementById('crmSel').addEventListener('change',e=>{const v=e.target.value;if(v==='__local')return;crmLoad(v)});
}
function crmFill(){
  const sel=document.getElementById('crmSel');if(!sel)return;const cur=S._crm&&S._crm.id;
  sel.innerHTML=(cur&&crmList.some(e=>e.id===cur)?'':'<option value="__local">Borrador sin guardar en el CRM</option>')+crmList.map(e=>'<option value="'+esc(e.id)+'"'+(e.id===cur?' selected':'')+'>'+esc((e.project&&e.project.nombre)||e.id)+' · rev. '+e.revision+'</option>').join('');
  const remote=crmList.find(e=>e.id===cur);
  if(remote&&S._crm.revision&&remote.revision>S._crm.revision)crmMsg('Hay una revisión más nueva en el CRM (rev. '+remote.revision+'). Usa «Cargar del CRM» para traerla.',true);
}
// R110 · huella del trabajo para saber si hay cambios locales sin guardar en el CRM
function crmHuella(){try{const x=JSON.parse(JSON.stringify(S));delete x._crm;const j=JSON.stringify(x);let h=5381;for(let i=0;i<j.length;i++)h=((h<<5)+h+j.charCodeAt(i))|0;return String(h)}catch(_){return ''}}
function crmCambiosLocales(){return !!(S._crm&&S._crm.h&&S._crm.h!==crmHuella())}
async function crmRefresh(){try{crmList=await crmRpc('getMoraEvaluations')||[];crmFill()}catch(e){crmMsg(e.message,true)}}
async function crmLoad(id,auto){
  crmMsg('Cargando…');
  try{const ev=await crmRpc('getMoraEvaluation',id);
    try{localStorage.setItem(KEY+'-anterior',JSON.stringify(S))}catch(_){}
    if(ev.workspace&&ev.workspace.p)S=JSON.parse(JSON.stringify(ev.workspace));
    else{S=JSON.parse(JSON.stringify(DEF));for(const k of ['p','units','vu','inm','leg','fin','com','gg','part'])if(ev.inputs&&ev.inputs[k]!==undefined)S[k]=ev.inputs[k];
      if(ev.analysis&&ev.analysis.estrategia)S.estr=Object.assign(S.estr,ev.analysis.estrategia);
      S.base={nombre:(ev.analysis&&ev.analysis.baseline&&ev.analysis.baseline.nombre)||'Línea base del CRM',fecha:(ev.analysis&&ev.analysis.baseline&&ev.analysis.baseline.fecha)||String(ev.created_at||'').slice(0,10),snap:JSON.parse(JSON.stringify(Object.fromEntries(SNAPKEYS.map(k=>[k,S[k]]))))};}
    S._crm={id:ev.id,revision:ev.revision,thread:S._crm&&S._crm.id===ev.id?S._crm.thread:null,drive:ev.drive||null};
    crmNormalize();S._crm.h=crmHuella();save();render();mSunat();crmFill();crmMsg('Revisión '+ev.revision+' cargada del CRM'+(auto?' automáticamente (la más reciente)':'')+'. El borrador anterior quedó respaldado en este equipo.');
  }catch(e){crmMsg(e.message,true);crmFill()}
}
async function crmSave(){
  if(String(S.p.nombre||'').trim().length<3){crmMsg('Completa el nombre en Datos del Proyecto antes de guardar.',true);return}
  crmMsg('Guardando en el CRM…');
  try{
    if(S._crm&&S._crm.id){const list=await crmRpc('getMoraEvaluations')||[];const r=list.find(e=>e.id===S._crm.id);
      if(r&&S._crm.revision&&r.revision>S._crm.revision){crmList=list;crmFill();crmMsg('No se guardó: el CRM tiene la revisión '+r.revision+' (por ejemplo, una propuesta aprobada). Usa «Cargar del CRM» primero para no perder ese cambio.',true);return}}
    const payload=moraEvalPayload();if(S._crm&&S._crm.id)payload.id=S._crm.id;
    const ws=JSON.parse(JSON.stringify(S));delete ws._crm;payload.workspace=ws;
    const out=await crmRpc('saveMoraEvaluation',payload);
    S._crm={id:out.id,revision:out.revision,thread:S._crm&&S._crm.id===out.id?S._crm.thread:null,drive:out.drive||null};S._crm.h=crmHuella();save();
    await crmRefresh();crmMsg('Guardado en el CRM · revisión '+out.revision+(out.drive?(out.drive.state==='ready'?' · carpetas vinculadas':out.drive.state==='error'?' · '+out.drive.reason:' · carpetas pendientes de preparar'):''));if(cur==='datosProyecto')render();
  }catch(e){crmMsg(e.message,true)}
}
async function crmSales(){
  if(!S._crm||!S._crm.id){crmMsg('Primero guarda la evaluación en el CRM.',true);return}
  crmMsg('Leyendo ventas del CRM…');
  try{const o=await crmRpc('getMoraSalesFeed',S._crm.id);const v=o&&o.ventas||[];
    S.ventas=v.map(x=>{const e=String(x.etapa||'Separación');return {u:String(x.unidad||''),f:String(x.fecha||S.estr.corte).slice(0,7),precio:+(x.precio||0),estado:ETAPAS.includes(e)?e:(ETAPA_MAP[e.toLowerCase()]||'Separación'),canal:String(x.campana||'')}});
    const ls=o&&o.precios&&Array.isArray(o.precios.listas)?o.precios.listas:[];if(ls.length)S.crmListas={fecha:new Date().toISOString().slice(0,10),etapa:o.precios.etapa_activa,por:Object.fromEntries(ls.filter(x=>+x.precio_vigente>0).map(x=>[String(x.unidad),{vigente:+x.precio_vigente,etapa:+x.precio_etapa||null,objetivo:+x.precio_objetivo||null}]))};save();render();crmMsg(S.ventas.length+' ventas reales cargadas del CRM'+(ls.length?' y '+ls.length+' precios de lista vigentes':'')+'. Revisa Seguimiento.');
  }catch(e){crmMsg(e.message,true)}
}
// R59 · «Crear carpetas en Drive»: guarda la evaluación en el CRM, que encarga la estructura (nombre del proyecto + 14 carpetas).
document.addEventListener('click',e=>{if(!e.target.closest('[data-act="project-drive-crear"]'))return;const b=document.getElementById('crmSave');if(b)b.click();});
document.addEventListener('click',async e=>{if(!e.target.closest('[data-act="project-drive-status"]'))return;if(!S._crm||!S._crm.id){crmMsg('Primero guarda el proyecto en el CRM.',true);return}try{S._crm.drive=await crmRpc('getProjectDrive',S.p.nombre);S._driveSources=await crmRpc('listProjectDriveSources',S.p.nombre);save();render();crmMsg(S._crm.drive&&S._crm.drive.state==='ready'?'Carpetas vinculadas.':'Las carpetas siguen en preparación.');}catch(err){crmMsg(err.message,true)}});
document.addEventListener('click',async e=>{if(!e.target.closest('[data-act="project-drive-scan"]'))return;try{const out=await crmRpc('scanProjectDrive',S.p.nombre);S._driveSources=await crmRpc('listProjectDriveSources',S.p.nombre);save();render();crmMsg('Lectura solicitada: '+out.queued+' carpetas. Consulta el estado al finalizar.');}catch(err){crmMsg(err.message,true)}});
document.addEventListener('change',async e=>{const id=e.target.dataset.sourceApprove;if(!id)return;try{await crmRpc('approveProjectDriveSource',S.p.nombre,id,e.target.checked);crmMsg('Permiso comercial actualizado.');}catch(err){e.target.checked=!e.target.checked;crmMsg(err.message,true)}});
async function crmAsk(text){
  if(!S._crm||!S._crm.id){addMsg('e','Guarda la evaluación en el CRM antes de consultar: M.O.R.A responde con la versión guardada.');return}
  aiTurns.push({role:'user',content:text});addMsg('u',esc(text));
  const bubble=addMsg('a thinking','M.O.R.A está analizando…');aiCtl=new AbortController();const sig=aiCtl.signal;setBusy(true);
  try{const r=await crmRpc('askMora',{evaluation_id:S._crm.id,question:text,tier:aiTier,view:cur,thread_id:S._crm.thread||undefined});
    S._crm.thread=r.thread_id;save();
    for(let i=0;i<60&&!sig.aborted;i++){
      await new Promise(ok=>setTimeout(ok,3000));if(sig.aborted)break;
      const t=await crmRpc('getMoraThread',{thread_id:r.thread_id});
      const ans=(t.messages||[]).find(m=>m.job_id===r.job_id&&m.role==='assistant');
      if(ans){aiTurns.push({role:'assistant',content:ans.text});bubble.className='msg a';
        const props=(ans.proposals||[]).map(p=>'<li>'+esc(p.ruta||'')+' → '+esc(String(p.valor))+(p.motivo?' · '+esc(p.motivo):'')+'</li>').join('');
        bubble.innerHTML=md(ans.text)+(props?'<p class="mut">Propuestas pendientes de Gerencia (Administración M.O.R.A):</p><ul>'+props+'</ul>':'');return}
      if((t.pending||[]).some(p=>p.id===r.job_id&&p.state==='failed')){bubble.remove();addMsg('e','M.O.R.A no pudo completar la consulta. Intenta de nuevo.');return}
    }
    bubble.remove();addMsg('e',sig.aborted?'Dejaste de esperar. La respuesta aparecerá en Evaluador > M.O.R.A · consultas.':'M.O.R.A tarda más de lo normal. Revisa que el flujo n8n de M.O.R.A esté activo.');
  }catch(e){bubble.remove();addMsg('e',esc(e.message))}
  finally{aiCtl=null;setBusy(false);aiSync()}
}
function crmBoot(){
  document.body.classList.add('crm-mode');
  // Misma marca que el CRM: hereda los colores que Gerencia eligió en Ajustes del proyecto.
  try{const ps=parent.document.documentElement.style;for(const k of ['--orok-brand','--orok-accent','--orok-dark']){const v=ps.getPropertyValue(k).trim();if(v)document.documentElement.style.setProperty(k,v)}}catch(_){}
  document.documentElement.dataset.theme='light';
  const st=document.createElement('style');st.textContent='.crm-bar{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-right:8px}.crm-bar select{width:auto;max-width:260px}#crmBarMsg{font-size:12px;max-width:340px}';
  document.head.append(st);
  crmBar();crmAi=true;aiState='on';aiLogEl().innerHTML='';aiSync();
  const t=document.getElementById('saved');if(t)t.title='Borrador en este equipo. Usa «Guardar en el CRM» para compartirlo con Gerencia.';
  // R110 · al abrir (en cualquier equipo, también el celular) se muestra la última revisión del CRM: si no hay borrador vinculado se carga sola;
  // si el CRM tiene una revisión más nueva y aquí no hay cambios sin guardar, también se carga sola; si hay cambios, se avisa.
  crmRefresh().then(()=>{const norm=v=>String(v||'').toLowerCase().replace(/[^a-z0-9]/g,''),pn=(document.querySelector('meta[name="orok-proyecto-nombre"]')||{}).content||'';
    const lista=crmList.slice().sort((a,b)=>String(b.updated_at||'').localeCompare(String(a.updated_at||''))),mismo=lista.filter(e=>pn&&(norm(e.project&&e.project.nombre).includes(norm(pn))||norm(pn).includes(norm(e.project&&e.project.nombre)))),ult=mismo[0]||(!OROK_PROY||OROK_PROY==='principal'?lista[0]:null);
    if(S&&S._crm&&S._crm.id){const r=crmList.find(e=>e.id===S._crm.id);if(r&&r.revision>(S._crm.revision||0)){if(!crmCambiosLocales())return crmLoad(r.id,true);crmMsg('El CRM tiene la revisión '+r.revision+' y aquí hay cambios sin guardar: guárdalos o usa «Cargar del CRM».',true)}return}
    if(ult)return crmLoad(ult.id,true);
    if(!SIN_BORRADOR||!OROK_PROY||OROK_PROY==='principal'){crmMsg('Este equipo muestra un borrador sin evaluación guardada en el CRM.',true);return}delete S._crm;S.p.nombre=(document.querySelector('meta[name="orok-proyecto-nombre"]')||{}).content||'';S.p.direccion='';S.ventas=[];if(S.mercado)S.mercado.comps=[];save();render();crmFill();crmMsg('Proyecto sin evaluación todavía: completa sus datos (el modelo de referencia es solo una plantilla).');});mSunat(); // R55 · al abrir un proyecto sin borrador se trae su última evaluación
}
`;

const page = html.slice(0, a) + '<script src="/evaluador/app.js"></script>' + html.slice(b + 9);
if (/<script>(?!<\/script>)/.test(page)) throw Error('Quedó un script en línea en index.html (CSP script-src self).');
if (/\son(click|change|load|input)=/i.test(page)) throw Error('Quedó un manejador en línea en index.html.');
const out = path.join(__dirname, '..', 'evaluador');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'index.html'), page.replace('<html lang="es">', '<html lang="es" data-modulo="evaluador">'));
fs.writeFileSync(path.join(out, 'app.js'), js);
fs.copyFileSync(jspdf, path.join(out, 'jspdf.umd.min.js'));
fs.copyFileSync(exceljs, path.join(out, 'exceljs.min.js'));
if (!js.includes("'/evaluador/exceljs.min.js'") || !js.includes("'/evaluador/jspdf.umd.min.js'")) throw Error('La app no apunta a las copias locales de jsPDF y ExcelJS.');
console.log('evaluador/ generado:', fs.readdirSync(out).map(f => f + ' ' + fs.statSync(path.join(out, f)).size).join(', '));
