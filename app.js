'use strict';
// The hosting loader imports this entry point instead of running it as main.
require('./server.cjs').start().catch(error=>{
  console.error('No se pudo iniciar el CRM. Revisa la configuracion privada del servidor.');
  process.exitCode=1;
});
