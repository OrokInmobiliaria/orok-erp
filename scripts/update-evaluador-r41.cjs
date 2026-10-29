const fs=require('node:fs');
const file='evaluador-src/evaluador.html';let s=fs.readFileSync(file,'utf8');
function rep(a,b){if(!s.includes(a))throw Error('Missing: '+a.slice(0,90));s=s.replace(a,b)}
rep('function compute(s,ov){',`function saleSpeed(p){
  const base=Math.max(.05,Number(p.velocidad)||.8);
  return p.escenarioVenta==='optimista'?Math.max(.05,Number(p.velocidadOptimista)||base*1.25):p.escenarioVenta==='pesimista'?Math.max(.05,Number(p.velocidadPesimista)||base*.7):base;
}
function editPartCost(s,i,kind,value){
  const v=Number(value),factor=1+(+s.p.ggPct||0)/100+(+s.p.utilPct||0)/100;
  if(!Number.isFinite(v)||v<0||!s.part[i]||(kind==='pct'&&v>100))throw Error('Ingresa un costo positivo o una incidencia entre 0 y 100.');
  const tw=sum(s.part.map(x=>+x.pct))||1,cd=Number(s.p.costoM2)/factor;
  const costs=s.part.map(x=>cd*(+x.pct||0)/tw);
  if(kind==='cost'){costs[i]=v;const total=sum(costs);if(total<=0)throw Error('El costo directo debe ser mayor que cero.');s.p.costoM2=total*factor;s.part.forEach((x,j)=>x.pct=100*costs[j]/total)}
  else{const other=sum(costs.filter((_,j)=>j!==i));s.part.forEach((x,j)=>x.pct=j===i?v:other>0?(100-v)*costs[j]/other:(100-v)/(s.part.length-1))}
}
function monthOffset(start,date){if(!/^\\d{4}-\\d{2}$/.test(date))throw Error('Selecciona un mes válido.');const [y,m]=date.split('-').map(Number),[sy,sm]=start.split('-').map(Number);const n=(y-sy)*12+m-sm;if(m<1||m>12||n<0||n>600)throw Error('La fecha debe estar dentro de los 50 años posteriores al inicio.');return n}
function compute(s,ov){`);
rep('const p=Object.assign({},s.p,ov||{});','const p=Object.assign({},s.p,ov||{});if(!ov||ov.velocidad===undefined)p.velocidad=saleSpeed(p);');
rep('const H=Math.max(ent+ind+3,finVentas+3,ent+12);',`const indStart=Math.max(ent,Number(p.inicioIndep??ent)),postStart=Math.max(ent,Number(p.inicioPosventa??ent)),postDur=Math.max(1,Math.round(Number(p.durPosventa)||12));
  const designStart=Math.max(0,Number(p.disenoInicio)||0),designEnd=Math.max(designStart,Number(p.disenoFin??(io-1)));
  const lastMilestone=Math.max(0,...(p.hitos||[]).map(x=>Number(x.mes)||0));
  const H=Math.max(indStart+ind+3,finVentas+3,postStart+postDur,designEnd,lastMilestone);`);
rep('ent+k)]+=pend/ind','indStart+k)]+=pend/ind');
rep("even(0,io-1);return a","even(designStart,designEnd);return a");
rep("even(ent,ent+ind-1);return a","even(indStart,indStart+ind-1);return a");
rep("even(ent,ent+11);return a","even(postStart,postStart+postDur-1);return a");
rep('igvVentas,io,dur,ent,ind,lanz,finVentas,H,','igvVentas,io,dur,ent,ind,indStart,postStart,postDur,designStart,designEnd,lanz,finVentas,H,');
// Typed fields and automatic rate throughout the module.
rep("${type==='number'?'type=\"number\" step=\"any\"':'type=\"text\"'}", "type=\"${type}\" ${type==='number'?'step=\"any\"':''} ${k==='p.tc'||k==='mercado.tc'?'readonly aria-readonly=\"true\"':''}");
rep("${fld('p.tc','Tipo de cambio (S/ por US$)')}","${fld('p.tc','Tipo de cambio SUNAT · venta (automático)')}");
rep('  <div class="panel"><h3>Obra</h3>', '  ${salesControls()}${scheduleControls()}\n  <div class="panel"><h3>Obra</h3>');
rep('V.supuestos=()=>',`function salesControls(){const base=Number(S.p.velocidad)||.8;return \`<div class="panel"><h3>Escenario de velocidad de venta</h3><div class="fields"><div class="f"><label for="salesScenario">Escenario activo</label><select id="salesScenario" data-k="p.escenarioVenta">\${[['base','Base'],['optimista','Optimista'],['pesimista','Pesimista']].map(([k,n])=>\`<option value="\${k}" \${(S.p.escenarioVenta||'base')===k?'selected':''}>\${n}</option>\`).join('')}</select></div>\${fld('p.velocidad','Base (unidades/mes)')}<div class="f"><label>Optimista (unidades/mes)</label>\${inp('p.velocidadOptimista',S.p.velocidadOptimista??base*1.25)}</div><div class="f"><label>Pesimista (unidades/mes)</label>\${inp('p.velocidadPesimista',S.p.velocidadPesimista??base*.7)}</div></div><p class="note">Activo: \${nf(M.p.velocidad,2)} unidades/mes · última venta: \${ml(M.finVentas)}. Cambia ventas, cobranzas, financiamiento y plazo; conserva precios y costos. Las ventas registradas del CRM se conservan en Seguimiento.</p></div>\`}
function dateControl(key,offset){return \`<input type="month" aria-label="Fecha \${esc(key)}" data-date="\${key}" value="\${ym(offset)}">\`}
function scheduleControls(){return \`<div class="panel"><h3>Fechas de fases e hitos</h3><p class="note">Calendario mensual vinculado a Obra y al flujo de caja. La última venta, la preventa mínima y el crédito bancario se calculan según los supuestos.</p><label>Inicio del proyecto \${inp('p.inicio',S.p.inicio,'','month')}</label><div class="tw"><table><thead><tr><th>Fase</th><th>Inicio</th><th>Fin</th></tr></thead><tbody>
<tr><td>Diseño, estudios y licencias</td><td>\${dateControl('disenoInicio',M.designStart)}</td><td>\${dateControl('disenoFin',M.designEnd)}</td></tr>
<tr><td>Preventa y ventas</td><td>\${dateControl('mesLanz',M.lanz)}</td><td>\${ml(M.finVentas)} · según velocidad</td></tr>
<tr><td>Construcción</td><td>\${dateControl('inicioObra',M.io)}</td><td>\${dateControl('finObra',M.ent-1)}</td></tr>
<tr><td>Independización y desembolsos</td><td>\${dateControl('inicioIndep',M.indStart)}</td><td>\${dateControl('finIndep',M.indStart+M.ind-1)}</td></tr>
<tr><td>Posventa</td><td>\${dateControl('inicioPosventa',M.postStart)}</td><td>\${dateControl('finPosventa',M.postStart+M.postDur-1)}</td></tr></tbody></table></div>
<h3>Hitos adicionales</h3><p class="note">Los hitos de lanzamiento, inicio y entrega siguen las fases. Agrega compromisos adicionales; estos no generan pagos automáticamente.</p>\${(S.p.hitos||[]).map((x,i)=>\`<div class="row">\${inp('p.hitos.'+i+'.nombre',x.nombre,'','text')}\${dateControl('hito.'+i,x.mes)}<button data-act="del-hito" data-i="\${i}">Quitar</button></div>\`).join('')}<button class="btn" data-act="add-hito">Agregar hito</button><p role="status" id="scheduleMsg"></p></div>\`}
V.supuestos=()=>`);
rep('${S_(v/m2,2)}</td><td class="n">US$', '<input type="number" min="0" step="any" aria-label="Costo por m² de ${esc(x.n)}" data-part-cost="${i}" value="${Number((v/m2).toFixed(6))}"></td><td class="n">US$');
rep('<div class="panel"><h3>Partidas del costo directo</h3>', '<div class="panel"><div class="fields">${fld(\'p.costoM2\',\'Costo total por m² sin IGV (incluye GG y utilidad)\')}</div><h3>Partidas del costo directo</h3>');
rep('Si las incidencias no suman 100%, se normalizan.', 'Editar el S/m² de una partida conserva los costos de las demás y recalcula el total y las incidencias. Editar una incidencia mantiene el total y redistribuye proporcionalmente las demás.');
rep("['Diseño, estudios y licencias',0,M.io-1,'m']","['Diseño, estudios y licencias',M.designStart,M.designEnd,'m']");
rep("['Independización y desembolsos',M.ent,M.ent+M.ind-1,'w'],['Posventa',M.ent,M.ent+11,'m']","['Independización y desembolsos',M.indStart,M.indStart+M.ind-1,'w'],['Posventa',M.postStart,M.postStart+M.postDur-1,'m']");
rep("['Cierre del proyecto',H]];","['Cierre del proyecto',H],...(S.p.hitos||[]).map(x=>[x.nombre,x.mes])];");
rep('${hitos.map(([n,t])=>`<tr><td>${n}', '${hitos.map(([n,t])=>`<tr><td>${esc(n)}');
rep('<div class="panel"><h3>Flujo económico mensual y acumulado</h3>', '${salesControls()}<div class="panel"><h3>Flujo económico mensual y acumulado</h3>');
// Daily, on entry/load; no interval and no manual activation.
const rateStart=s.indexOf('async function mSunat()');const rateEnd=s.indexOf('\n}',rateStart)+2;if(rateStart<0||rateEnd<2)throw Error('rate');
s=s.slice(0,rateStart)+`let ratePending=null,rateCheckedDay='',rateError='';
async function mSunat(){
  if(!CRM)return;const today=limaDate();
  const cached=S.mercado.tcSunat;
  if(cached&&cached.checkedDay===today){S.p.tc=S.mercado.tc=Number(cached.value);return}
  if(ratePending||rateCheckedDay===today)return;rateCheckedDay=today;
  ratePending=(async()=>{try{const r=await crmRpc('getMoraExchangeRate');if(!Number.isFinite(Number(r?.value))||Number(r.value)<=0)throw Error('Cotización no válida');S.p.tc=S.mercado.tc=Number(r.value);S.mercado.tcSunat={...r,checkedDay:today};rateError='';save();render()}catch(e){rateError='No se pudo actualizar SUNAT. Se conserva el último valor: '+(e.message||'error de conexión');const el=document.querySelector('[data-rate-status]');if(el)el.textContent=rateError}finally{ratePending=null}})();return ratePending;
}`+s.slice(rateEnd);
rep('<button class="btn" data-act="m-sunat">Actualizar TC SUNAT</button> <span role="status">${mRateNote()}</span>', '<span role="status" data-rate-status>${rateError||mRateNote()} · consulta automática al ingresar</span>');
rep("else if(a==='m-sunat'){mSunat();return}","else if(a==='add-hito'){(S.p.hitos||=([])).push({nombre:'Nuevo hito',mes:M.io})}\n  else if(a==='del-hito'){S.p.hitos.splice(Number(b.dataset.i),1)}");
rep("  const el=e.target;const k=el.dataset&&el.dataset.k;if(!k)return;",`  const el=e.target;
  if(el.dataset.date){try{const key=el.dataset.date,n=monthOffset(S.p.inicio,el.value);if(key==='finObra'){if(n<M.io)throw Error('El fin debe ser posterior al inicio.');S.p.durObra=n-M.io+1}else if(key==='finIndep'){if(n<M.indStart)throw Error('Revisa el inicio de la fase.');S.p.indep=n-M.indStart+1}else if(key==='finPosventa'){if(n<M.postStart)throw Error('Revisa el inicio de la fase.');S.p.durPosventa=n-M.postStart+1}else if(key.startsWith('hito.'))S.p.hitos[Number(key.split('.')[1])].mes=n;else{if(['inicioIndep','inicioPosventa'].includes(key)&&n<M.ent)throw Error('Esta fase debe comenzar desde la entrega de obra.');if(key==='disenoFin'&&n<M.designStart)throw Error('Revisa el inicio del diseño.');S.p[key]=n}save();render()}catch(err){el.setCustomValidity(err.message);el.reportValidity();el.addEventListener('input',()=>el.setCustomValidity(''),{once:true})}return}
  if(el.dataset.partCost!==undefined){try{editPartCost(S,Number(el.dataset.partCost),'cost',el.value);save();render()}catch(err){el.setCustomValidity(err.message);el.reportValidity();el.addEventListener('input',()=>el.setCustomValidity(''),{once:true})}return}
  const k=el.dataset&&el.dataset.k;if(!k)return;
  if(/^part\\.\\d+\\.pct$/.test(k)){try{editPartCost(S,Number(k.split('.')[1]),'pct',el.value);save();render()}catch(err){el.setCustomValidity(err.message);el.reportValidity();el.addEventListener('input',()=>el.setCustomValidity(''),{once:true})}return}
  if(k==='p.tc'||k==='mercado.tc')return;
  if(['p.velocidad','p.velocidadOptimista','p.velocidadPesimista','p.costoM2'].includes(k)&&(!Number.isFinite(Number(el.value))||Number(el.value)<.05)){el.setCustomValidity('Ingresa un valor mayor o igual a 0.05.');el.reportValidity();el.addEventListener('input',()=>el.setCustomValidity(''),{once:true});return}
  if(k==='p.inicio'&&!/^\\d{4}-\\d{2}$/.test(el.value))return;`);
fs.writeFileSync(file,s);
for(const file of ['src/navModel.mjs','src/MoraPanel.jsx','src/GroupedNav.jsx']){let t=fs.readFileSync(file,'utf8').replaceAll('Evaluación y riesgo','Evaluador Inmobiliario');if(file.endsWith('navModel.mjs'))t=t.replace("label: 'Evaluación'","label: 'Evaluador Inmobiliario'");if(file.endsWith('GroupedNav.jsx'))t=t.replace("'evaluador', 'Evaluación'","'evaluador', 'Evaluador Inmobiliario'").replace('label && <span','label && label !== g.label && <span');fs.writeFileSync(file,t)}
const build='deploy/build-evaluador.cjs';let b=fs.readFileSync(build,'utf8');b=b.replace('crmNormalize();save();render();crmFill();','crmNormalize();save();render();mSunat();crmFill();').replace('  crmRefresh();','  crmRefresh();mSunat();');fs.writeFileSync(build,b);
