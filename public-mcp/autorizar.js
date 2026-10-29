// R44 · Página de autorización del conector de Claude. Confirma con la sesión del ERP abierta en este navegador.
(function(){
 var root=document.getElementById('mcp'),sol=root.getAttribute('data-solicitud'),cliente=root.getAttribute('data-cliente');
 var msg=document.getElementById('msg'),acc=document.getElementById('acciones'),login=document.getElementById('login');
 function post(path,body){return fetch(path,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Orok-Request':'1'},body:JSON.stringify(body||{})}).then(function(r){return r.json().then(function(j){if(!r.ok)throw Error(j.error||'No se pudo completar.');return j.value;});});}
 function decidir(ok){acc.hidden=true;msg.textContent=ok?'Conectando…':'Cancelando…';post('/mcp/oauth/decidir',{solicitud:sol,permitir:ok}).then(function(v){location.href=v.redirect;}).catch(function(e){msg.textContent=e.message;});}
 function revisar(){msg.textContent='Revisando tu sesión del ERP…';login.hidden=true;acc.hidden=true;
  post('/mcp/oauth/sesion',{}).then(function(u){msg.textContent='¿Permites que '+cliente+' use el ERP ÖRÖK como '+u.name+' ('+u.role+')? Podrá consultar y preparar borradores con tus mismos permisos. No podrá aprobar, pagar ni borrar. Puedes cortar la conexión cuando quieras desde Configuración › Conexiones de IA.';acc.hidden=false;})
  .catch(function(e){msg.textContent=e.message+' Inicia sesión en el ERP en otra pestaña y vuelve aquí.';login.hidden=false;});}
 document.getElementById('permitir').onclick=function(){decidir(true);};
 document.getElementById('cancelar').onclick=function(){decidir(false);};
 document.getElementById('revisar').onclick=revisar;
 revisar();
})();
