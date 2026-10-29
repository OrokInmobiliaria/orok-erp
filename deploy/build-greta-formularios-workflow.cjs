'use strict';
// R43 · Genera n8n/GRETA-R43-FORMULARIOS-META-ENSAYO-INACTIVO.json: crea y archiva formularios instantáneos en la página de Facebook.
// Se importa INACTIVO. Antes de activarlo: credencial «Facebook Graph API» con token de página (pages_manage_ads, leads_retrieval,
// pages_read_engagement, pages_show_list), PAGE_ID real en «Configuración» y una prueba con un formulario de ensayo.
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const HOST=process.env.CRM_HOST||'https://lola-pruebas-crm-r41-ensayo.kvrq8w.easypanel.host';
const CRM={httpHeaderAuth:{id:'OROKR41CRM20261028',name:'R41 CRM ensayo'}},FB={facebookGraphApi:{id:'CONFIGURAR_META',name:'Meta · página ÖRÖK (token de página)'}};
const crm=(name,body,pos)=>({id:randomUUID(),name,type:'n8n-nodes-base.httpRequest',typeVersion:4.2,position:pos,credentials:CRM,
 parameters:{method:'POST',url:HOST+'/api/integrations/lola',authentication:'genericCredentialType',genericAuthType:'httpHeaderAuth',sendHeaders:true,headerParameters:{parameters:[{name:'Content-Type',value:'application/json'}]},sendBody:true,specifyBody:'json',jsonBody:'={{ JSON.stringify('+body+') }}',options:{timeout:30000}}});
const fb=(name,url,body,pos,onError)=>({id:randomUUID(),name,type:'n8n-nodes-base.httpRequest',typeVersion:4.2,position:pos,credentials:FB,...(onError?{onError}:{}),
 parameters:{method:'POST',url,authentication:'predefinedCredentialType',nodeCredentialType:'facebookGraphApi',sendBody:true,specifyBody:'json',jsonBody:body,options:{timeout:60000}}});
const iff=(name,expr,pos)=>({id:randomUUID(),name,type:'n8n-nodes-base.if',typeVersion:1,position:pos,parameters:{conditions:{boolean:[{value1:expr,value2:true}]}}});
const JOB="$('Tomar formulario pendiente en CRM').first().json.value.job",CFG="$('Configuración').first().json";
const nodes=[
 {id:randomUUID(),name:'Formularios · revisar cola cada 10 minutos',type:'n8n-nodes-base.scheduleTrigger',typeVersion:1.2,position:[0,0],parameters:{rule:{interval:[{field:'minutes',minutesInterval:10}]}}},
 crm('Tomar formulario pendiente en CRM',"{action:'lead_form_claim'}",[240,0]),
 iff('¿Hay formulario en cola?','={{ !!$json.value?.job }}',[480,0]),
 {id:randomUUID(),name:'Configuración',type:'n8n-nodes-base.code',typeVersion:2,position:[720,-100],parameters:{jsCode:"// Completar antes de activar: ID numérico de la página de Facebook de ÖRÖK y versión de la Graph API.\nreturn [{json:{page_id:'CONFIGURAR_PAGE_ID', api_version:'v21.0'}}];"}},
 iff('¿Crear o archivar?',"={{ "+JOB+".tipo === 'crear' }}",[960,-100]),
 fb('Crear formulario en Meta',"={{ 'https://graph.facebook.com/' + "+CFG+".api_version + '/' + "+CFG+".page_id + '/leadgen_forms' }}","={{ JSON.stringify("+JOB+".payload) }}",[1200,-200],'continueErrorOutput'),
 iff('¿Archivar versión anterior?',"={{ !!"+JOB+".archivar_anterior }}",[1440,-260]),
 fb('Archivar versión anterior en Meta',"={{ 'https://graph.facebook.com/' + "+CFG+".api_version + '/' + "+JOB+".archivar_anterior }}","={{ JSON.stringify({status:'ARCHIVED'}) }}",[1680,-340],'continueRegularOutput'),
 crm('Confirmar formulario al CRM',"{action:'lead_form_complete', job_id:"+JOB+".id, lease_token:"+JOB+".lease_token, external_id:String($('Crear formulario en Meta').first().json.id)}",[1920,-260]),
 fb('Archivar formulario en Meta',"={{ 'https://graph.facebook.com/' + "+CFG+".api_version + '/' + "+JOB+".external_id }}","={{ JSON.stringify({status:'ARCHIVED'}) }}",[1200,40],'continueErrorOutput'),
 crm('Confirmar archivo al CRM',"{action:'lead_form_complete', job_id:"+JOB+".id, lease_token:"+JOB+".lease_token}",[1440,0]),
 crm('Avisar fallo de formulario al CRM',"{action:'lead_form_fail', job_id:"+JOB+".id, lease_token:"+JOB+".lease_token, error:String($json.error?.message || $json.message || 'Meta rechazó el formulario').slice(0,280)}",[1440,200])
];
const by=n=>({node:n,type:'main',index:0}),connections={
 'Formularios · revisar cola cada 10 minutos':{main:[[by('Tomar formulario pendiente en CRM')]]},
 'Tomar formulario pendiente en CRM':{main:[[by('¿Hay formulario en cola?')]]},
 '¿Hay formulario en cola?':{main:[[by('Configuración')],[]]},
 'Configuración':{main:[[by('¿Crear o archivar?')]]},
 '¿Crear o archivar?':{main:[[by('Crear formulario en Meta')],[by('Archivar formulario en Meta')]]},
 'Crear formulario en Meta':{main:[[by('¿Archivar versión anterior?')],[by('Avisar fallo de formulario al CRM')]]},
 '¿Archivar versión anterior?':{main:[[by('Archivar versión anterior en Meta')],[by('Confirmar formulario al CRM')]]},
 'Archivar versión anterior en Meta':{main:[[by('Confirmar formulario al CRM')]]},
 'Archivar formulario en Meta':{main:[[by('Confirmar archivo al CRM')],[by('Avisar fallo de formulario al CRM')]]}
};
const wf={name:'ERP R43 · G.R.E.T.A · Formularios instantáneos Meta · ENSAYO',nodes,connections,settings:{timezone:'America/Lima',executionOrder:'v1'},active:false,pinData:{},versionId:randomUUID(),meta:{templateCredsSetupCompleted:false}};
const out=path.join(__dirname,'..','n8n','GRETA-R43-FORMULARIOS-META-ENSAYO-INACTIVO.json');
fs.writeFileSync(out,JSON.stringify(wf,null,1));console.log('Escrito',out,nodes.length,'nodos, inactivo');
