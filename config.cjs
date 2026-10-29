'use strict';
const path=require('node:path'),fs=require('node:fs');
function config(env=process.env){
 const testing=env.OROK_LOCAL_TEST==='1';
 const host=env.OROK_LISTEN_HOST||'127.0.0.1';if(!['127.0.0.1','0.0.0.0'].includes(host))throw Error('Interfaz de escucha no permitida.');
 const origin=env.APP_ORIGIN;if(!origin)throw Error('Configura APP_ORIGIN.');
 const url=new URL(origin);if((url.protocol!=='https:'&&!testing)||url.pathname!=='/'||url.search||url.hash)throw Error('APP_ORIGIN debe ser el origen HTTPS del CRM.');
 const privateDir=path.resolve(env.OROK_PRIVATE_DIR||path.join(__dirname,'private'));
 if(!testing&&!env.OROK_PRIVATE_DIR)throw Error('Configura un directorio privado fuera del sitio público.');
 const publicDir=path.join(__dirname,'dist');
 for(const candidate of [privateDir,env.GOOGLE_APPLICATION_CREDENTIALS,env.SESSION_SECRET_FILE,env.BOOTSTRAP_CODE_FILE,env.LOLA_POSTGRES_URL_FILE].filter(Boolean)){const resolved=path.resolve(candidate);if(resolved===publicDir||resolved.startsWith(publicDir+path.sep))throw Error('Los archivos privados deben estar fuera del sitio público.');}
 const secret=env.SESSION_SECRET_FILE?fs.readFileSync(env.SESSION_SECRET_FILE,'utf8').trim():env.SESSION_SECRET;
 const bootstrap=env.BOOTSTRAP_CODE_FILE?fs.readFileSync(env.BOOTSTRAP_CODE_FILE,'utf8').trim():env.BOOTSTRAP_CODE;
 if(!secret||secret.length<40)throw Error('Falta la clave privada de sesiones.');
 const project=env.OROK_PROJECT||'infinity224';if(!/^[\w-]{1,100}$/.test(project))throw Error('Proyecto no válido.');
 const rehearsal=env.OROK_REHEARSAL==='1';if(rehearsal)require('./deploy/rehearsal.cjs').assertRehearsal(url.origin,project);
 const isolatedR41=env.OROK_R41_ISOLATED==='1';if(isolatedR41&&(!rehearsal||env.OROK_REHEARSAL_AUTOMATION==='1'||project!=='infinity224_pruebas_955318057'))throw Error('El aislamiento R41 exige el proyecto de ensayo y automatizaciones desactivadas.');
 return {testing,host,rehearsal,isolatedR41,rehearsalAutomation:env.OROK_REHEARSAL_AUTOMATION==='1',origin:url.origin,privateDir,sessionSecret:secret,bootstrapCode:bootstrap,project,port:Number(env.PORT)||5185,cookieName:testing?'orok_dev_session':'__Host-orok_session',credential:env.GOOGLE_APPLICATION_CREDENTIALS,firestoreProject:'crm-infinity224',postgresUrlFile:env.LOLA_POSTGRES_URL_FILE,postgresPoolMax:Number(env.LOLA_POSTGRES_POOL_MAX||5)};
}
module.exports={config};
