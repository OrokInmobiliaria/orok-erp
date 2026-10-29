#!/usr/bin/env node
// R36 · Códigos de instalación del ERP (solo en el servidor). Gerencia los genera y los entrega en persona o por un canal privado.
//   node deploy/codigo-instalacion.cjs crear [--horas 24] [--usos 1] [--etiqueta "Laptop de Martín"]
//   node deploy/codigo-instalacion.cjs listar
//   node deploy/codigo-instalacion.cjs revocar <id-del-equipo>
//   node deploy/codigo-instalacion.cjs anular <id-del-codigo>
'use strict';
const {config}=require('../config.cjs'),{DeviceEnrollment}=require('../business/deviceEnrollment');
const [cmd,...a]=process.argv.slice(2),opt=k=>{const i=a.indexOf(k);return i>=0?a[i+1]:undefined};
try{
 const e=new DeviceEnrollment(config());
 if(cmd==='crear'){const r=e.crearCodigo({horas:opt('--horas'),usos:opt('--usos'),etiqueta:opt('--etiqueta'),por:'consola del servidor'});console.log(`Código de instalación: ${r.codigo}\nVence: ${new Date(r.vence).toLocaleString('es-PE',{timeZone:'America/Lima'})} (Lima) · usos: ${r.usos}\nSe muestra solo esta vez. Entrégalo por un canal privado.`);}
 else if(cmd==='listar')console.log(JSON.stringify(e.listar(),null,2));
 else if(cmd==='revocar')console.log(JSON.stringify(e.revocar(a[0],'consola del servidor')));
 else if(cmd==='anular')console.log(JSON.stringify(e.anularCodigo(a[0])));
 else{console.error('Uso: crear [--horas N] [--usos N] [--etiqueta texto] | listar | revocar <id> | anular <id>');process.exitCode=1;}
}catch(err){console.error(err.message);process.exitCode=1;}
