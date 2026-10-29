'use strict';
const fs=require('node:fs');
const {PDFDocument,StandardFonts,rgb,degrees}=require('pdf-lib');
const {fileURL}=require('./planService');

const WIDTH=595.28,HEIGHT=841.89,X=34,W=527.28;
const clean=value=>String(value??'').replace(/[\u0000-\u001f]/g,' ').replace(/[\u2010-\u2015]/g,'-').replace(/[^\u0020-\u00ff\u20ac]/g,'');
const money=value=>'S/ '+Number(value||0).toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2});
const MONTHS=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
async function asset(value){
 if(!value)return null;
 if(/^https?:/i.test(value)){const response=await fetch(fileURL(value),{signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('No se pudo descargar el plano (HTTP '+response.status+').');return Buffer.from(await response.arrayBuffer());}
 return fs.promises.readFile(value);
}
const UNITS=['','uno','dos','tres','cuatro','cinco','seis','siete','ocho','nueve','diez','once','doce','trece','catorce','quince','dieciséis','diecisiete','dieciocho','diecinueve','veinte','veintiuno','veintidós','veintitrés','veinticuatro','veinticinco','veintiséis','veintisiete','veintiocho','veintinueve'];
function under100(value){if(value<30)return UNITS[value];const tens=['','','treinta','cuarenta','cincuenta','sesenta','setenta','ochenta','noventa'],t=Math.floor(value/10),u=value%10;return tens[t]+(u?' y '+UNITS[u]:'');}
function under1000(value){if(value<100)return under100(value);if(value===100)return 'cien';const hundreds=['','ciento','doscientos','trescientos','cuatrocientos','quinientos','seiscientos','setecientos','ochocientos','novecientos'],h=Math.floor(value/100),rest=value%100;return hundreds[h]+(rest?' '+under100(rest):'');}
function integerWords(value){value=Math.max(0,Math.floor(value));if(value===0)return 'cero';if(value<1000)return under1000(value);if(value<1000000){const n=Math.floor(value/1000),rest=value%1000;return (n===1?'mil':under1000(n).replace(/uno$/,'un')+' mil')+(rest?' '+under1000(rest):'');}if(value<1000000000){const n=Math.floor(value/1000000),rest=value%1000000;return (n===1?'un millón':integerWords(n)+' millones')+(rest?' '+integerWords(rest):'');}return String(value);}
function moneyWords(value){const n=Math.round(Number(value||0)*100),soles=Math.floor(n/100),cents=n%100;return integerWords(soles)+' con '+String(cents).padStart(2,'0')+'/100 soles';}
function applyTemplate(template,values){
 const normalized=String(template).replace(/el monto de\s*\{\{REFUND_AMOUNT\}\}\s*\(\s*\{\{REFUND_AMOUNT_WORDS\}\}\s*\)\s*será devuelto en su totalidad a manos de EL CLIENTE/gi,'cualquier devolución se realizará {{REFUND_CONDITION}}');
 return normalized.replace(/\{\{([A-Z0-9_]+)\}\}/g,(_,key)=>clean(values[key]??'Pendiente'));
}

async function generateAndSaveSeparationPDF({separation,quote,unit,lead={},settings={},templateText,targetFilePath}){
 const doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold);
 const hex=String(settings.brandColor||'#85442A').match(/^#([0-9a-f]{6})$/i)?.[1]||'85442A';
 const brand=rgb(...[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16)/255)),ink=rgb(.16,.14,.13),muted=rgb(.43,.4,.38),light=rgb(.98,.965,.95),white=rgb(1,1,1);
 const created=new Date(separation.generated_at),dateParts=new Intl.DateTimeFormat('es-PE',{timeZone:'America/Lima',day:'2-digit',month:'2-digit',year:'numeric'}).formatToParts(created),part=type=>dateParts.find(item=>item.type===type)?.value||'';
 const refundCondition=separation.refund_condition||'Según acuerdo firmado';
 const values={
  COMPANY_NAME:settings.companyName||'BMG DESARROLLADORA INMOBILIARIA',COMPANY_RUC:settings.companyRuc||'20615227685',COMPANY_ADDRESS:settings.companyAddress||'CALLE PUQUINA 138',COMPANY_REPRESENTATIVE:settings.companyRepresentative||'Marcos Martin Montezuma Chirinos',COMPANY_REPRESENTATIVE_DNI:settings.companyRepresentativeDni||'10797023',COMPANY_RECORD:settings.companyRecord||'16083215',
  CLIENT_NAME:separation.client_name||lead.name,DNI:separation.dni||lead.dni,MARITAL_STATUS:separation.marital_status,ADDRESS:separation.address||lead.address,DISTRICT:separation.district,PROVINCE:separation.province,DEPARTMENT:separation.department,
  QUOTE_CODE:quote.quote_code,UNIT_NUMBER:unit.unit_number,FINAL_PRICE:money(separation.final_price),FINAL_PRICE_WORDS:moneyWords(separation.final_price),SEPARATION_AMOUNT:money(separation.separation_amount),SEPARATION_AMOUNT_WORDS:moneyWords(separation.separation_amount),INITIAL_AMOUNT:money(separation.initial_amount),INITIAL_AMOUNT_WORDS:moneyWords(separation.initial_amount),FINANCING_TYPE:separation.financing_type==='Directo'?'crédito directo':separation.financing_type==='Contado'?'pago al contado':'un crédito hipotecario con una entidad financiera',FINANCED_AMOUNT:money(separation.financed_amount),FINANCED_AMOUNT_WORDS:moneyWords(separation.financed_amount),REFUND_CONDITION:refundCondition,REFUND_AMOUNT:refundCondition,REFUND_AMOUNT_WORDS:refundCondition,ECONOMIC_ACTIVITY:separation.economic_activity,DAY:part('day'),MONTH:MONTHS[Number(part('month'))-1]||'',YEAR:part('year')
 };
 const content=applyTemplate(templateText,values),pages=[];let page,y;
 const addPage=()=>{page=doc.addPage([WIDTH,HEIGHT]);pages.push(page);y=744;return page;};addPage();
 function drawText(value,x,yPos,size=9,weight=false,color=ink,maxWidth=W){let str=clean(value),f=weight?bold:font;while(size>6.5&&f.widthOfTextAtSize(str,size)>maxWidth)size-=.25;page.drawText(str,{x,y:yPos,size,font:f,color});}
 function wrap(value,{x=X+8,width=W-16,size=9,weight=false,line=13,color=ink,after=7}={}){const words=clean(value).split(/\s+/).filter(Boolean),f=weight?bold:font;let row='';for(const word of words){if(row&&f.widthOfTextAtSize(row+' '+word,size)>width){if(y<112){addPage();}drawText(row,x,y,size,weight,color,width);y-=line;row=word;}else row+=(row?' ':'')+word;}if(row){if(y<112)addPage();drawText(row,x,y,size,weight,color,width);y-=line;}y-=after;}
 function section(label){if(y<145)addPage();page.drawRectangle({x:X,y:y-21,width:W,height:21,color:brand});drawText(label,X+10,y-14,9,true,white,W-20);y-=32;}
 function row(label,value,index){if(y<120)addPage();if(index%2===0)page.drawRectangle({x:X,y:y-5,width:W,height:20,color:light});drawText(label,X+9,y,8.5,true,muted,152);drawText(value,X+170,y,8.5,false,ink,W-180);y-=21;}
 section('DATOS DE LA SEPARACIÓN');
 const validity=separation.expires_at?'15 días calendario · hasta '+new Date(separation.expires_at).toLocaleDateString('es-PE',{timeZone:'America/Lima'}):'15 días calendario desde la confirmación';
 [['Código de separación',separation.code],['Cotización',quote.quote_code],['Cliente',separation.client_name],['DNI',separation.dni],['Departamento','Dpto '+unit.unit_number],['Precio de venta',money(separation.final_price)],['Monto de separación',money(separation.separation_amount)],['Cuota inicial',money(separation.initial_amount)],['Saldo por financiar',money(separation.financed_amount)],['Condición de reembolso',refundCondition],['Generado por',separation.generated_by],['Vigencia',validity]].forEach((entry,index)=>row(entry[0],entry[1],index));
 y-=7;
 for(const block of content.split(/\n\s*\n/).map(value=>value.trim()).filter(Boolean)){
  if(block==='[[SIGNATURES]]'){
   if(y<205)addPage();y-=35;page.drawLine({start:{x:X+20,y},end:{x:X+220,y},color:muted,thickness:.7});page.drawLine({start:{x:X+307,y},end:{x:X+507,y},color:muted,thickness:.7});drawText('EL CLIENTE',X+83,y-16,9,true,ink,120);drawText('LA INMOBILIARIA',X+355,y-16,9,true,ink,140);drawText('DNI: '+(separation.dni||''),X+75,y-30,8,false,muted,140);drawText('RUC: '+(settings.companyRuc||'20615227685'),X+348,y-30,8,false,muted,150);y-=55;continue;
  }
  const heading=block.length<110&&block===block.toUpperCase();if(heading)section(block);else wrap(block,{size:8.7,line:12.5,after:8});
 }
 const drawings=[];
 for(const [value,label] of [[unit.plan_image_ext,'Cotas exteriores'],[unit.plan_image_int,'Cotas interiores']]){
  if(!value)continue;const bytes=await asset(value);
  if(bytes.subarray(0,5).toString()==='%PDF-'){const source=await PDFDocument.load(bytes);for(let i=0;i<source.getPageCount();i++)drawings.push({kind:'pdf',source,page:i,label:label+(source.getPageCount()>1?' - '+(i+1):'')});}
  else if(bytes[0]===0x89)drawings.push({kind:'image',image:await doc.embedPng(bytes),label});
  else if(bytes[0]===0xff)drawings.push({kind:'image',image:await doc.embedJpg(bytes),label});
  else throw Error('El plano de '+label.toLowerCase()+' no es un PDF o una imagen válida.');
 }
 for(let start=0;start<drawings.length;start+=2){
  const planPage=doc.addPage([WIDTH,HEIGHT]),items=drawings.slice(start,start+2);pages.push(planPage);
  planPage.drawRectangle({x:X,y:707,width:W,height:21,color:brand});planPage.drawText(clean('PLANO DEL DEPARTAMENTO '+unit.unit_number),{x:X+10,y:714,size:9,font:bold,color:white});
  const dimensions=item=>item.kind==='pdf'?item.source.getPage(item.page).getSize():item.image,sideBySide=items.length===2&&items.every(item=>dimensions(item).width<dimensions(item).height),panelHeight=items.length===1||sideBySide?570:274;
  for(let i=0;i<items.length;i++){
   const item=items[i],top=685-(sideBySide?0:i*292),box={x:X+5+(sideBySide?i*(W/2+3):0),y:top-panelHeight+8,width:sideBySide?W/2-14:W-10,height:panelHeight-30};
   planPage.drawText(clean(item.label),{x:box.x,y:top,size:10,font:bold,color:brand});
   if(item.kind==='pdf'){
    const src=item.source.getPage(item.page),emb=await doc.embedPage(src),rotation=((src.getRotation().angle%360)+360)%360,sideways=rotation===90||rotation===270,ew=sideways?emb.height:emb.width,eh=sideways?emb.width:emb.height,scale=Math.min(box.width/ew,box.height/eh),dw=ew*scale,dh=eh*scale,x=box.x+(box.width-dw)/2,py=box.y+(box.height-dh)/2,shift=rotation===90?[0,dh]:rotation===180?[dw,dh]:rotation===270?[dw,0]:[0,0];
    planPage.drawPage(emb,{x:x+shift[0],y:py+shift[1],width:emb.width*scale,height:emb.height*scale,rotate:degrees(-rotation)});
   }else{const size=item.image.scaleToFit(box.width,box.height);planPage.drawImage(item.image,{x:box.x+(box.width-size.width)/2,y:box.y+(box.height-size.height)/2,...size});}
   planPage.drawText('Infinity224',{x:box.x+box.width*.12,y:box.y+box.height*.40,size:Math.min(40,box.width/6.5),font:bold,color:brand,opacity:.065,rotate:degrees(23)});
  }
 }
 let logo=null;if(settings.projectLogoUrl){try{const bytes=await asset(settings.projectLogoUrl);logo=bytes[0]===0x89?await doc.embedPng(bytes):await doc.embedJpg(bytes);}catch{}}
 for(const [index,item] of pages.entries()){
  item.drawText('ÖRÖK',{x:X,y:795,size:29,font:bold,color:brand});item.drawText('Desarrolladora Inmobiliaria',{x:X,y:779,size:9,font,color:brand});
  if(logo){const size=logo.scaleToFit(78,43);item.drawImage(logo,{x:X+W-size.width,y:815-size.height,width:size.width,height:size.height});}else item.drawText(settings.projectName||'Infinity 224',{x:X+W-78,y:795,size:12,font:bold,color:muted});
  item.drawText(clean('SEPARACIÓN: '+separation.code),{x:X+W-205,y:779,size:8,font,color:muted});item.drawLine({start:{x:X,y:767},end:{x:X+W,y:767},color:brand,thickness:1.4});item.drawLine({start:{x:X,y:92},end:{x:X+W,y:92},color:brand,thickness:.6});
  const footer='ÖRÖK Desarrolladora Inmobiliaria - Calle Puquina 138 San Miguel',source='Documento generado desde la cotización '+quote.quote_code;item.drawText(clean(footer),{x:(WIDTH-font.widthOfTextAtSize(clean(footer),8))/2,y:43,size:8,font,color:ink});item.drawText(clean(source),{x:X,y:29,size:7.5,font,color:muted});item.drawText((index+1)+' / '+pages.length,{x:WIDTH-61,y:29,size:8,font,color:muted});
 }
 doc.setTitle('Separación '+separation.code+' - Infinity 224');doc.setAuthor('ÖRÖK Desarrolladora Inmobiliaria');doc.setSubject('Acuerdo de reserva preferente');
 await fs.promises.writeFile(targetFilePath,await doc.save());return {success:true,filePath:targetFilePath,pages:pages.length};
}

module.exports={generateAndSaveSeparationPDF,moneyWords,applyTemplate,money};
