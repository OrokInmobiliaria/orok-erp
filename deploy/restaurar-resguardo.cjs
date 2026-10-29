'use strict';
// R45 · Abre un respaldo cifrado del ERP (.orokbak) con la llave privada de Gerencia y lo deja en una carpeta para revisar o restaurar.
// Uso: node deploy/restaurar-resguardo.cjs --llave /ruta/llave-privada.pem --archivo ERP-OROK-....orokbak --salida /ruta/carpeta-nueva
// NUNCA restaura sobre producción: deja los archivos y te indica cómo cargar la base en una BASE NUEVA para comparar antes de cambiar nada.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process'),{descifrar}=require('../business/resguardo');
const arg=n=>{const i=process.argv.indexOf('--'+n);return i>0?process.argv[i+1]:'';};
(async()=>{
 const llave=arg('llave'),archivo=arg('archivo'),salida=arg('salida');
 if(!llave||!archivo||!salida){console.log('Uso: node deploy/restaurar-resguardo.cjs --llave llave-privada.pem --archivo respaldo.orokbak --salida carpeta-nueva');process.exit(2);}
 if(fs.existsSync(salida)&&fs.readdirSync(salida).length)throw Error('La carpeta de salida debe estar vacía (no se sobrescribe nada).');
 fs.mkdirSync(salida,{recursive:true,mode:0o700});
 const tgz=path.join(salida,'paquete.tar.gz'),h=await descifrar(archivo,tgz,fs.readFileSync(llave,'utf8'));
 execFileSync('tar',['-xzf',tgz,'-C',salida]);fs.rmSync(tgz);
 const m=JSON.parse(fs.readFileSync(path.join(salida,'manifiesto.json'),'utf8'));
 console.log('Respaldo abierto: '+m.at+' · versión '+m.version+' · llave '+h.huella);
 console.log('Conteos de control:',JSON.stringify(m.conteos));
 console.log('Partes:',m.partes.join(', '));if(m.avisos.length)console.log('Avisos al crearlo:',m.avisos.join(' | '));
 if(m.partes.includes('postgres.dump'))console.log('\nPara revisar la base: créala NUEVA (p. ej. orok_restauracion_AAAAMMDD) y ejecuta:\n  pg_restore --no-owner --dbname=<conexión a la base NUEVA> '+path.join(salida,'postgres.dump')+'\nCompara conteos con producción antes de decidir cualquier cambio. No restaures sobre la base vigente.');
 if(m.partes.includes('privado.tar'))console.log('Archivos privados: tar -xf '+path.join(salida,'privado.tar')+' -C <carpeta nueva>');
})().catch(e=>{console.error('No se pudo abrir el respaldo: '+e.message);process.exit(1);});
