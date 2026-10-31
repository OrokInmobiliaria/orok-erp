(function(){
 var cfg=JSON.parse(document.getElementById('cfg')?document.getElementById('cfg').textContent:'{}');
 var st=document.getElementById('estado'),go=document.getElementById('go'),info={};
 function say(t,cls){st.textContent=t;st.className=cls||'';}
 function post(body){return fetch('/api/whatsapp-signup',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.error||('HTTP '+r.status));return j.value;});});}
 if(!cfg.app_id||!cfg.config_id){say('Falta el ID de configuración del registro integrado. Gerencia debe guardarlo en IA y automatizaciones → Conexión de WhatsApp.','err');go.textContent='No disponible';return;}
 window.fbAsyncInit=function(){FB.init({appId:cfg.app_id,autoLogAppEvents:true,xfbml:false,version:cfg.version||'v26.0'});go.disabled=false;go.textContent='Conectar WhatsApp Business';};
 window.addEventListener('message',function(e){if(!/facebook\.com$/.test(new URL(e.origin).hostname))return;var d;try{d=JSON.parse(e.data);}catch(_){return;}if(d&&d.type==='WA_EMBEDDED_SIGNUP'){info=Object.assign({},d.data||{},{event:d.event});if(d.event==='CANCEL')say('Se canceló en el paso: '+((d.data&&d.data.current_step)||'—')+(d.data&&d.data.error_message?'\n'+d.data.error_message:''),'err');}});
 go.addEventListener('click',function(){go.disabled=true;say('Abriendo la ventana de Meta…');
  FB.login(function(resp){
   if(!resp.authResponse||!resp.authResponse.code){go.disabled=false;say('No se completó la conexión. Puedes intentarlo de nuevo.','err');return;}
   say('Guardando la conexión en el ERP…');
   setTimeout(function(){post({code:resp.authResponse.code,waba_id:info.waba_id,phone_number_id:info.phone_number_id,event:info.event}).then(function(v){
     var s=v&&v.sync||{};say('✓ Número conectado al ERP ('+(v.event||'conectado')+').\nContactos: '+(s.smb_app_state_sync?(s.smb_app_state_sync.ok?'solicitados ✓':'pendiente: '+s.smb_app_state_sync.error):'—')+'\nHistorial: '+(s.history?(s.history.ok?'solicitado ✓':'pendiente: '+s.history.error):'—'),'ok');
     document.getElementById('sync1').hidden=!!(s.smb_app_state_sync&&s.smb_app_state_sync.ok);document.getElementById('sync2').hidden=!!(s.history&&s.history.ok);
    }).catch(function(e){go.disabled=false;say('El ERP no pudo guardar la conexión: '+e.message,'err');});},400);
  },{config_id:cfg.config_id,response_type:'code',override_default_response_type:true,extras:{setup:{},featureType:'whatsapp_business_app_onboarding',sessionInfoVersion:'3'}});
 });
 [['sync1','smb_app_state_sync'],['sync2','history']].forEach(function(p){document.getElementById(p[0]).addEventListener('click',function(){post({sync:p[1]}).then(function(){say('✓ Sincronización solicitada a Meta. Los datos llegarán en unos minutos.','ok');document.getElementById(p[0]).hidden=true;}).catch(function(e){say(e.message,'err');});});});
})();
