const fs=require('fs');
const {PDFDocument,StandardFonts,rgb,degrees,PDFName,PDFString}=require('pdf-lib');
const {fileURL}=require('./planService');
const RATE=0.078,WIDTH=595.28,HEIGHT=841.89,X=34,W=527.28;
const PROJECT_ADDRESS='Calle La Apacheta 224, San Miguel';
const PROJECT_MAP_URL='https://www.google.com/maps/place/La+Apacheta+224,+Lima+15088/@-12.0658803,-77.1027187,17z/data=!3m1!4b1!4m6!3m5!1s0x9105c95fd1031705:0x30183465c349f1a2!8m2!3d-12.0658856!4d-77.1001438!16s%2Fg%2F11vstph02c?entry=ttu&g_ep=EgoyMDI2MDkxNS4wIKXMDSoASAFQAw%3D%3D';
const EXECUTIVE_EMAILS='ventas@orok.com.pe · hola@infinity224.pe';
const clean=value=>String(value??'').replace(/[\u0000-\u001f]/g,' ').replace(/[\u2010-\u2015]/g,'-').replace(/[^\u0020-\u00ff\u20ac\u2022]/g,'');
const money=value=>'S/ '+Number(value||0).toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2});
function quoteAmounts({price,parkingPrice=0,discount=0}){
  const list=Number(price)+Number(parkingPrice||0),discountAmount=list*Number(discount||0)/100;
  return {list,discountAmount,total:list-discountAmount};
}
function mortgage(principal,months=240,rate=RATE){const r=(1+rate)**(1/12)-1;return principal*r/(1-(1+r)**-months);}
async function asset(value){
  if(!value)return null;
  if(/^https?:/i.test(value)){
    const response=await fetch(fileURL(value),{signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw new Error('No se pudo descargar el plano (HTTP '+response.status+').');
    return Buffer.from(await response.arrayBuffer());
  }
  return fs.promises.readFile(value);
}
async function generateAndSaveQuotePDF(data){
  const {unit,lead={},settings={},quote_code,targetFilePath}=data;
  const price=Number(unit.price);if(!Number.isFinite(price)||price<=0)throw new Error('Precio del departamento no válido.');
  const discount=Number(data.discount_pct||0);if(!Number.isFinite(discount)||discount<0||discount>100)throw new Error('Descuento no válido.');
  const parking=data.parkingCode&&data.parkingCode!=='Ninguno'?data.parkingCode:'';
  const parkingPrice=parking?Number(data.parkingPrice??56000):0;if(parking&&(!Number.isFinite(parkingPrice)||parkingPrice<=0))throw Error('Precio de estacionamiento no válido.');
  const {list,discountAmount:off,total}=quoteAmounts({price,parkingPrice,discount});
  const unitLabel=/estacionamiento|parking|cochera/i.test(unit.unit_type||'')?'Estacionamiento':'Departamento';
  const separationPct=Number(settings.separationPct??1),separation=total*separationPct/100;
  const exchange=Number(settings.exchangeRate)||3.75,custom=Number(data.customInitialPct??10),teaPct=Number(data.teaPct??RATE*100),tea=teaPct/100,teaLabel=teaPct.toFixed(2).replace('.',',')+'%';if(!(teaPct>=1&&teaPct<=30))throw new Error('TEA no válida.');
  if(!Number.isFinite(custom)||custom<0||custom>100)throw new Error('Porcentaje de inicial no válido.');
  const doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold);
  const match=String(settings.brandColor||'#85442A').match(/^#([0-9a-f]{6})$/i);
  const hex=match?.[1]||'85442A',brand=rgb(...[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16)/255)),ink=rgb(.16,.14,.13),muted=rgb(.43,.4,.38),light=rgb(.98,.965,.95),white=rgb(1,1,1);
  const phone=String(settings.contactPhone||'912971742'),digits=phone.replace(/\D/g,''),wa=digits.length===9?'51'+digits:digits;
  let logo;
  if(settings.projectLogoUrl){try{const bytes=await asset(settings.projectLogoUrl);logo=bytes[0]===0x89?await doc.embedPng(bytes):await doc.embedJpg(bytes);}catch{/* Keep the project name if the optional logo is unavailable. */}}
  function text(page,value,x,y,size=10,weight=false,color=ink,maxWidth=W){
    let str=clean(value),f=weight?bold:font;
    while(size>6.5&&f.widthOfTextAtSize(str,size)>maxWidth)size-=.25;
    page.drawText(str,{x,y,size,font:f,color});
  }
  function wrap(page,value,x,y,width,size=9,weight=false,line=13){
    const words=clean(value).split(/\s+/),f=weight?bold:font;let row='';
    for(const word of words){if(row&&f.widthOfTextAtSize(row+' '+word,size)>width){text(page,row,x,y,size,weight,ink,width);y-=line;row=word;}else row+=(row?' ':'')+word;}
    if(row){text(page,row,x,y,size,weight,ink,width);y-=line;}return y;
  }
  function section(page,label,y){page.drawRectangle({x:X,y:y-21,width:W,height:21,color:brand});text(page,label,X+10,y-14,10,true,white);return y-32;}
  function row(page,label,value,y,idx=0){if(idx%2===0)page.drawRectangle({x:X,y:y-5,width:W,height:20,color:light});text(page,label,X+9,y,9,true,muted,145);text(page,value,X+162,y,9,false,ink,W-175);return y-21;}
  function right(page,value,y,size=10,weight=false){const str=clean(value),f=weight?bold:font;text(page,str,X+W-f.widthOfTextAtSize(str,size)-9,y,size,weight);}
  function icon(page,kind,x,y,url){
    page.drawCircle({x:x+11,y:y+11,size:11,color:brand});
    if(kind==='fb')text(page,'f',x+7,y+3,20,true,white,15);
    if(kind==='ig'){
      page.drawRectangle({x:x+5,y:y+5,width:12,height:12,borderColor:white,borderWidth:1.2});page.drawCircle({x:x+11,y:y+11,size:3,borderColor:white,borderWidth:1});page.drawCircle({x:x+15,y:y+15,size:1,color:white});
    }
    if(kind==='web'){
      page.drawCircle({x:x+11,y:y+11,size:6,borderColor:white,borderWidth:1});
      page.drawEllipse({x:x+11,y:y+11,xScale:2.5,yScale:6,borderColor:white,borderWidth:.8});
      page.drawLine({start:{x:x+5,y:y+11},end:{x:x+17,y:y+11},color:white,thickness:1});
    }
    if(kind==='map'){
      page.drawCircle({x:x+11,y:y+13,size:4.5,borderColor:white,borderWidth:1.2});
      page.drawLine({start:{x:x+7.8,y:y+9.8},end:{x:x+11,y:y+4.5},color:white,thickness:1.2});
      page.drawLine({start:{x:x+14.2,y:y+9.8},end:{x:x+11,y:y+4.5},color:white,thickness:1.2});
      page.drawCircle({x:x+11,y:y+13,size:1.15,color:white});
    }
    if(kind==='wa'){
      page.drawCircle({x:x+11,y:y+12,size:6.3,borderColor:white,borderWidth:1});page.drawLine({start:{x:x+6,y:y+7},end:{x:x+4,y:y+3},color:white,thickness:1});page.drawLine({start:{x:x+4,y:y+3},end:{x:x+10,y:y+6},color:white,thickness:1});
      page.drawSvgPath('M 0 0 C 0 5 4 9 8 9 L 9 6 L 6 5 L 5 6 C 3 5 2 3 2 2 L 3 1 L 2 -1 Z',{x:x+7,y:y+16,scale:.8,color:white});
    }
    const annotation=doc.context.register(doc.context.obj({Type:'Annot',Subtype:'Link',Rect:[x-2,y-2,x+24,y+24],Border:[0,0,0],Contents:PDFString.of(kind),A:{Type:'Action',S:'URI',URI:PDFString.of(url)}}));
    page.node.addAnnot(annotation);
  }
  function frame(page,index,count){
    text(page,'ÖRÖK',X,795,29,true,brand);text(page,'Desarrolladora Inmobiliaria',X,779,9,false,brand,200);
    const logoLeft=X+W-125;
    if(logo){const s=logo.scaleToFit(125,35);page.drawImage(logo,{x:X+W-s.width,y:812-s.height,width:s.width,height:s.height});}
    else text(page,settings.projectName||'Infinity 224',logoLeft,795,14,true,muted,125);
    const codeText='CÓDIGO: '+quote_code;let codeSize=9;while(codeSize>6.5&&font.widthOfTextAtSize(clean(codeText),codeSize)>155)codeSize-=.25;
    text(page,codeText,logoLeft-12-font.widthOfTextAtSize(clean(codeText),codeSize),795,codeSize,false,muted,155);
    page.drawLine({start:{x:X,y:767},end:{x:X+W,y:767},color:brand,thickness:1.4});
    page.drawLine({start:{x:X,y:92},end:{x:X+W,y:92},color:brand,thickness:.6});
    const items=[['fb','https://www.facebook.com/profile.php?id=61582240642705'],['ig','https://www.instagram.com/orok.inmobiliaria/'],['web','https://infinity224.pe/'],['wa','https://wa.me/'+wa]];
    items.forEach(([kind,url],i)=>icon(page,kind,231+i*35,60,url));
    const footer='OROK Desarrolladora Inmobiliaria - Calle Puquina 138 San Miguel';text(page,footer,(WIDTH-font.widthOfTextAtSize(footer,8))/2,43,8);
    const line='Teléfono: '+phone;text(page,line,(WIDTH-font.widthOfTextAtSize(clean(line),8))/2,29,8);
    text(page,(index+1)+' / '+count,WIDTH-61,29,8,false,muted,30);
  }
  const first=doc.addPage([WIDTH,HEIGHT]),planPage=doc.addPage([WIDTH,HEIGHT]),third=doc.addPage([WIDTH,HEIGHT]);
  let y=section(first,'DATOS DEL CLIENTE',749);
  for(const [i,entry] of [['Nombres y apellidos',lead.name||'A quien corresponda'],['Celular / DNI',(lead.phone||'-')+' / '+(lead.dni||'Pendiente')],['Email',lead.email||'Pendiente'],['Dirección',lead.address||'Pendiente'],['Fecha',new Date().toLocaleDateString('es-PE',{timeZone:'America/Lima'})]].entries())y=row(first,...entry,y,i);
  y=section(first,'DATOS DEL INMUEBLE',y-8);
  y=row(first,unitLabel,String(unit.unit_number)+' - '+(unit.unit_type||'Flat')+(parking?' + Estacionamiento '+parking:''),y);
  y=row(first,'Área total / techada / libre',((Number(unit.covered_area)||0)+(Number(unit.free_area)||0)).toFixed(2)+' / '+Number(unit.covered_area||0).toFixed(2)+' / '+Number(unit.free_area||0).toFixed(2)+' m²',y,1);
  const finalLabel='PRECIO FINAL (INCLUYE IMPUESTOS)';
  const priceRows=[[unitLabel+' '+unit.unit_number,price],...(parking?[['Estacionamiento '+parking,parkingPrice]]:[]),['Precio de lista (suma de unidades)',list],['Descuento comercial ('+discount+'% sobre la suma)',-off],[finalLabel,total]];
  for(const [label,value] of priceRows){const final=label===finalLabel;if(final)first.drawLine({start:{x:X+8,y:y+14},end:{x:X+W-8,y:y+14},color:rgb(.8,.76,.73),thickness:.55});text(first,label,X+9,y,9,final);right(first,money(value),y,10,final);y-=20;}
  text(first,'El precio final incluye impuestos.',X+9,y+4,8,false,muted);y-=10;
  text(first,'Precio referencial: USD '+(total/exchange).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})+' | TC: S/ '+exchange,X+9,y,9,false,muted);y-=27;
  if(data.financingType==='Directo'){
    const months=Number(data.directCreditMonths??settings.directCreditMonths??12);if(!Number.isInteger(months)||months<1)throw new Error('Plazo de crédito directo no válido.');
    y=section(first,'CRÉDITO DIRECTO (SIN INTERESES)',y);
    for(const [i,entry] of [['Inicial pendiente (30% menos separación)',money(total*.3-separation)],['Cuotas mensuales (55%)',months+' x '+money(total*.55/months)],['Saldo a la entrega (15%)',money(total*.15)]].entries())y=row(first,...entry,y,i);
  }else{
    y=section(first,'SIMULACIÓN DE CRÉDITO HIPOTECARIO - TEA '+teaLabel,y);
    const widths=[100,146,135,146],headers=['Inicial','Inicial pendiente*','Monto a financiar','Cuota mensual (20 años)'];let x=X;
    headers.forEach((h,i)=>{text(first,h,x+6,y,8,true,muted,widths[i]-10);x+=widths[i];});y-=22;
    const options=[10,20];if(custom>0&&!options.includes(custom))options.push(custom);
    for(const pct of options){let xx=X;const initial=total*pct/100;[pct+'%',money(initial-separation),money(total-initial),money(mortgage(total-initial,240,tea))].forEach((value,i)=>{text(first,value,xx+6,y,9,i===3,ink,widths[i]-10);xx+=widths[i];});y-=25;}
    y=wrap(first,'* Inicial pendiente: inicial total menos la separación abonada. Simulación referencial con la TEA de '+teaLabel+' indicada por el banco; la cuota definitiva depende de la evaluación del banco y no incluye seguros ni cargos adicionales.',X+7,y-3,W-14,8,false,11);
  }
  if(y<108)throw new Error('Los datos superan el espacio disponible de la primera página.');
  // A4 plan pages reserve header/footer space; drawings stay vector-based.
  const drawings=[];
  for(const [value,label] of [[unit.plan_image_ext,'Cotas exteriores'],[unit.plan_image_int,'Cotas interiores']]){
    if(!value)continue;const bytes=await asset(value);
    if(bytes.subarray(0,5).toString()==='%PDF-'){
      const src=await PDFDocument.load(bytes);for(let i=0;i<src.getPageCount();i++)drawings.push({kind:'pdf',source:src,page:i,label:label+(src.getPageCount()>1?' - '+(i+1):'')});
    }else if(bytes[0]===0x89)drawings.push({kind:'image',image:await doc.embedPng(bytes),label});
    else if(bytes[0]===0xff)drawings.push({kind:'image',image:await doc.embedJpg(bytes),label});
    else throw new Error('El enlace de '+label.toLowerCase()+' no devuelve un PDF o una imagen válida.');
  }
  async function drawPlans(page,items){
    section(page,'PLANO DEL DEPARTAMENTO '+unit.unit_number,749);
    if(!items.length){text(page,'No hay planos asociados a esta unidad.',X+12,680,12,false,muted);return;}
    const dimensions=item=>item.kind==='pdf'?item.source.getPage(item.page).getSize():item.image;
    const sideBySide=items.length===2&&items.every(item=>dimensions(item).width<dimensions(item).height);
    const panelHeight=items.length===1||sideBySide?584:282;
    for(let i=0;i<items.length;i++){
      const item=items[i],top=710-(sideBySide?0:i*300),bottom=top-panelHeight;
      const box={x:X+5+(sideBySide?i*(W/2+3):0),y:bottom+8,width:sideBySide?W/2-14:W-10,height:panelHeight-30};
      text(page,item.label,box.x,top,10,true,brand,box.width);
      if(item.kind==='pdf'){
        const src=item.source.getPage(item.page),emb=await doc.embedPage(src),rotation=((src.getRotation().angle%360)+360)%360;
        const sideways=rotation===90||rotation===270,ew=sideways?emb.height:emb.width,eh=sideways?emb.width:emb.height,scale=Math.min(box.width/ew,box.height/eh),dw=ew*scale,dh=eh*scale;
        const x=box.x+(box.width-dw)/2,y=box.y+(box.height-dh)/2;
        const shift=rotation===90?[0,dh]:rotation===180?[dw,dh]:rotation===270?[dw,0]:[0,0];
        page.drawPage(emb,{x:x+shift[0],y:y+shift[1],width:emb.width*scale,height:emb.height*scale,rotate:degrees(-rotation)});
      }else{const size=item.image.scaleToFit(box.width,box.height);page.drawImage(item.image,{x:box.x+(box.width-size.width)/2,y:box.y+(box.height-size.height)/2,...size});}
      page.drawText('Infinity224',{x:box.x+box.width*.12,y:box.y+box.height*.40,size:Math.min(40,box.width/6.5),font:bold,color:brand,opacity:.065,rotate:degrees(23)});
    }
  }
  await drawPlans(planPage,drawings.slice(0,2));
  for(let i=2;i<drawings.length;i+=2)await drawPlans(doc.addPage([WIDTH,HEIGHT]),drawings.slice(i,i+2));
  y=section(third,'CUADRO DE ACABADOS GENERAL',749);
  const finishes=[['SALA, COMEDOR Y DORMITORIOS','Puerta Ares (PET EVEREST)','Cerradura digital de 4 bulones Ezviz','Piso laminado H2O FLOOR 8 mm Golden Vista','Asistente inteligente Alexa Echo Pop'],['KITCHENETTE','Tablero de cuarzo Blanco Estelar 15 mm','Melamine Agave Mate / Capri','Horno y encimera FDV','Porcelanato Calacatta Blanco 60 x 120'],['BAÑOS','Porcelanato Celima Sundance Silver 60 x 60','Inodoro One-Piece Mediterráneo Vanipro','Grifería y ducha Asturias Vanipro','Mueble vanitorio Maya'],['ZONA DE LAVADO','Cerámica Celima Amapola New Ivory','Lavarropa TREBOL Amazonas','Terma automática de 30 L / 50 L','Puertas de melamine tropicalizado']];
  finishes.forEach((group,i)=>{const x=X+(i%2)*267,top=y-Math.floor(i/2)*118;third.drawRectangle({x,y:top-103,width:260,height:113,color:light});let yy=wrap(third,group[0],x+9,top,242,9,true,12)-4;group.slice(1).forEach(line=>{yy=wrap(third,'• '+line,x+9,yy,240,8.5,false,12);});});
  y-=246;y=wrap(third,'Acabados referenciales sujetos al anexo firmado en el contrato correspondiente.',X+8,y,W-16,8,false,11)-16;
  y=section(third,'CONDICIONES DE SEPARACIÓN ('+separationPct+'%)',y);
  y=row(third,'Razón social / RUC',(settings.companyName||'BMG SAC')+' / '+(settings.companyRuc||'20615227685'),y);
  y=row(third,'Monto de separación',money(separation),y,1);
  y=row(third,'Banco / cuenta',(settings.bankName||'BCP')+' / '+(settings.bankAccount||'1937376823061'),y);
  y=row(third,'CCI',settings.bankCci||'00219300737682306114',y,1);
  y=wrap(third,'Proforma válida por 15 días calendario o sujeta a stock. La separación se mantiene hasta la entrega de la cuota inicial dentro de los 15 días siguientes. Tipo de cambio referencial: S/ '+exchange+'.',X+9,y-3,W-18,8,false,12)-14;
  y=section(third,'EJECUTIVO DE VENTAS',y);
  y=row(third,'Asesor',settings.agentName||'Ventas',y);
  y=row(third,'Celular',phone,y,1);
  y=row(third,'Dirección del proyecto',PROJECT_ADDRESS,y);
  const mapRowY=y;
  y=row(third,'Ubicación','Abrir en Google Maps',y,1);
  icon(third,'map',X+W-37,mapRowY-11,PROJECT_MAP_URL);
  y=row(third,'Email',EXECUTIVE_EMAILS,y);
  if(y<106)throw new Error('Los datos superan el espacio disponible de condiciones.');
  doc.getPages().forEach((page,i)=>frame(page,i,doc.getPageCount()));
  doc.setTitle('Cotización '+quote_code+' - Infinity224');doc.setAuthor('OROK Desarrolladora Inmobiliaria');
  await fs.promises.writeFile(targetFilePath,await doc.save());return {success:true,filePath:targetFilePath};
}
module.exports={generateAndSaveQuotePDF,mortgage,RATE,quoteAmounts,PROJECT_ADDRESS,PROJECT_MAP_URL,EXECUTIVE_EMAILS};
