import {build} from 'vite';
import react from '@vitejs/plugin-react';
await build({configFile:false,plugins:[react()],base:'/'});

// R36 · PWA: cada compilación marca sw.js con la versión del paquete y la huella de index.html,
// así los equipos instalados detectan la versión nueva y se actualizan.
import {readFileSync,writeFileSync} from 'node:fs';import {createHash} from 'node:crypto';
const pkg=JSON.parse(readFileSync('package.json','utf8')),idx=readFileSync('dist/index.html');
const ver=pkg.version+'-'+createHash('sha256').update(idx).digest('hex').slice(0,10);
writeFileSync('dist/sw.js',readFileSync('dist/sw.js','utf8').replaceAll('__ERP_VERSION__',ver));
// R60 · El botón «Dictar o adjuntar» se pide con la versión en la dirección: un navegador con una copia vieja la descarga de nuevo.
writeFileSync('dist/index.html',readFileSync('dist/index.html','utf8').replace('src="/ia-rellenar.js"','src="/ia-rellenar.js?v='+pkg.version+'"'));
writeFileSync('dist/version.json',JSON.stringify({version:pkg.version,build:ver,generado:new Date().toISOString()}));
console.log('PWA lista · versión '+ver);
