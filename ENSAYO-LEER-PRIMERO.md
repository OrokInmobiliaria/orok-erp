# LOLA 67.6.10 · preparación del ensayo

Esta es una entrega para configurar un ensayo; no está instalada, conectada ni probada con proveedores reales. Conserva la lógica comercial de 67.6.9 y no completa todos los pendientes de la auditoría de 33 puntos.

## Cambios de esta preparación

- Modelo Anthropic nativo conectado mediante una cadena de apoyo condicional. La salida es solo un pequeño JSON de intención/tono/estrategia validado; no es evidencia comercial ni puede ejecutar acciones. El contexto de apoyo se limita a 1200 caracteres de la consulta y cuatro mensajes de 180 caracteres, con redacción de teléfonos, correos y enlaces.
- El apoyo está desactivado hasta elegir una credencial/modelo disponibles y habilitarlo al preparar la copia. Cuando se habilita, se consulta solo ante mensajes extensos con más de un grupo de necesidades; peticiones directas de precios, humano, agenda de cambio/cancelación y bajas siguen las rutas existentes. Una falla del apoyo conserva el contexto original y permite continuar con LOLA. No se promete una cantidad de solicitudes HTTP subyacentes: los clientes del proveedor pueden realizar reintentos internos.
- Ejecutor creativo recuperado: reserva el trabajo y devuelve job_id/lease_token al servicio creativo del CRM. Las propuestas siguen requiriendo solicitud explícita desde CRM, clave/modelo y revisión humana.
- Sincronización programada de pauta Meta/TikTok recuperada, separada de publicaciones orgánicas. Reconsulta los siete días completos anteriores en Lima. Requiere cuentas autorizadas.
- Copia n8n de ensayo con origen reservado .invalid, proyecto infinity224_pruebas_955318057 y sin referencias a credenciales originales. No reutiliza el webhook original ni conecta la consulta opcional al Postgres histórico.
- Preparación de contenedor para alojar el ensayo junto a SQL en el VPS. El servidor admite OROK_LISTEN_HOST=0.0.0.0 dentro del contenedor; conserva 127.0.0.1 por defecto para instalaciones anteriores.

## Configuración que falta

1. Crear el servicio de ensayo, su volumen privado y su origen HTTPS real. No cambiar el dominio ni el código del CRM comercial. La red PostgreSQL permanece interna; no abrir 5432 públicamente.
2. Configurar un archivo privado de conexión SQL, identidad Google del servidor y claves privadas de sesión/activación; introducir secretos directamente en el destino, no en este paquete ni en el chat. El acceso SQL debe limitarse al ámbito que necesite el ensayo. No copiar automáticamente credenciales privadas desde Namecheap.
3. Variables: OROK_REHEARSAL=1, OROK_PROJECT=infinity224_pruebas_955318057, APP_ORIGIN=origen HTTPS real, OROK_PRIVATE_DIR=/app/private, GOOGLE_APPLICATION_CREDENTIALS=ruta privada, SESSION_SECRET_FILE=ruta privada, BOOTSTRAP_CODE_FILE=ruta privada, LOLA_POSTGRES_URL_FILE=ruta privada y LOLA_POSTGRES_POOL_MAX=3. El inicio del ensayo bloquea el proyecto/origen comercial. La sincronización de Sheets y el proceso SLA del servidor permanecen detenidos en este modo hasta revisar configuración y habilitar explícitamente OROK_REHEARSAL_AUTOMATION=1; esto no habilita por sí solo los flujos de n8n.
4. Revisar `node deploy/init-rehearsal.cjs` (vista previa). Ejecutar `node deploy/init-rehearsal.cjs --apply --install-schema` solo en el destino de ensayo revisado. Inicializa datos vacíos, no importa clientes comerciales y rechaza un proyecto existente. La autenticación inicial se configura aparte desde la interfaz del CRM; la función no crea usuarios ni contraseñas.
5. Arrancar y verificar /api/health. La copia usa el mecanismo Firebase de autenticación del proyecto existente, pero bajo el identificador de ensayo; no copia las cuentas originales. La vista comercial también se proyecta bajo ese identificador distinto. No es un proveedor nuevo de Firebase.
6. Generar el JSON final con `node deploy/prepare-rehearsal-workflow.cjs https://DOMINIO-REAL-ENSAYO archivo-nuevo.json`. Si se habilitará Claude, añadir --claude-model=ID_REAL --enable-claude. El programa rechaza el origen comercial, el proyecto original y la sobrescritura de un archivo existente. Que el formato de un ID sea válido no verifica su disponibilidad ni su precio.
7. Seleccionar credenciales de ensayo en n8n. Verificar versión de nodos instalada, modelo Anthropic disponible y acceso real; el nodo se preparó a partir de la documentación/código oficial, no se ha ejecutado aún en el motor instalado.
8. Conectar WhatsApp por la vía oficial autorizada. Distinguir emisor e interlocutor: el número 955318057 está reservado para el ensayo, pero su configuración no se ha realizado. Usar environment=test y lista explícita de destinatarios. Calendario, Gmail y alertas se configuran con destinos de prueba antes de habilitar tareas. La ausencia de credenciales originales en el JSON no elimina los destinatarios comerciales por defecto del servidor: deben revisarse.
9. Publicar solo la copia de ensayo cuando se hayan verificado los pasos anteriores. Ejecutar primero texto/CRM y después el plan de audio, memoria, citas y humano. No publicar este JSON incompleto por el hecho de estar importado.

## Pendientes preservados

No se resolvieron en esta preparación: envío/archivo directo de PDF/JPG/PNG desde CRM, importación histórica Telegram, permisos reales Meta/TikTok, primer contacto desde formulario y atribución completa de formularios, carruseles, biblioteca compartida de marca, voz/subtítulos, experimentos/variantes y comparaciones de períodos. Ver la auditoría original y el plan de pruebas; no marcar esos puntos como aprobados con un ensayo básico de WhatsApp.

La copia local de volumen n8n informada por EasyPanel terminó, pero la restauración no fue probada y se realizó con SQLite en uso. No se presenta como certificación de restauración consistente.

Fuentes de compatibilidad: [nodo Anthropic](https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.lmchatanthropic/), [código Anthropic oficial](https://github.com/n8n-io/n8n/blob/master/packages/%40n8n/nodes-langchain/nodes/llms/LMChatAnthropic/LmChatAnthropic.node.ts), [cadena LLM oficial](https://github.com/n8n-io/n8n/blob/master/packages/%40n8n/nodes-langchain/nodes/chains/ChainLLM/ChainLlm.node.ts).

## Estado de preparación · 22/10/2026

Servicio lola_pruebas/crm creado y primera carga de código realizada. Dominio asignado https://lola-pruebas-crm.kvrq8w.easypanel.host con destino interno 5185. El CRM aún no está operativo ni conectado a datos: faltan sus archivos privados y la inicialización de SQL. Este paquete corrige los avisos de dependencias de la primera construcción; verificar la nueva construcción Linux.

Borrador n8n separado guardado en https://n8n-n8n.kvrq8w.easypanel.host/workflow/Mvs4FemDAz5VEdOY . Reconoce el nodo Anthropic. No fue ejecutado ni publicado; los ajustes reales de ejecución requieren revisión. Ver validacion/seguridad-20261022/LEER.md.
