# ÖRÖK CRM 67.4.1 + Lola WhatsApp completo 02

Esta entrega sustituye el motor parcial 01 de la versión 67.4.0. El flujo principal para WhatsApp es `n8n/04-Lola-WhatsApp-COMPLETO-02-Agenda-CRM-INACTIVO.json`.

No hay que unirlo al lienzo de Telegram ni activar ambos motores de WhatsApp. Este flujo contiene conversación, audios, agenda, gestión de citas, avisos de ventas y mantenimiento. Utiliza el CRM 67.4.1 para conservar estado, historial, validaciones e idempotencia.

## Funciones incluidas

| Función | Comportamiento preparado |
|---|---|
| Texto y audio | Lola conversa; audios recibidos se transcriben y los comandos de agenda usan las mismas validaciones que el texto |
| Catálogo y características | Conserva herramientas Sheets/Supabase y límites comerciales del ensayo |
| Tres opciones | Agendar cita, hablar con asesor, visitar showroom |
| Contacto para cita | Pide nombre/correo que falten; el teléfono procede del WhatsApp del cliente |
| Horarios | Consulta Calendar y presenta hasta seis opciones, máximo dos por día, en una lista nativa de WhatsApp |
| Crear cita | Revalida el horario elegido, crea un evento identificable, registra la cita en CRM y confirma por WhatsApp |
| Invitación | Solicita a Calendar las notificaciones a invitados con `sendUpdates=all`; el éxito de la API no acredita que el correo haya llegado a la bandeja del cliente |
| Reprogramar | Consulta horarios, comprueba la cita activa y modifica el mismo evento |
| Cancelar | Pide confirmación vinculada a la cita; No conserva y Sí cancela el evento comprobado |
| Avisar a ventas | Gmail avisa a ventas al elegir asesor y tras gestiones de citas; un fallo no se anuncia como envío exitoso |
| Seguimiento de 24h | Desde el envío efectivo de la oferta, marca Seguimiento al lead elegible que no seleccionó; nunca Perdido |
| Control humano | Manual, Sugerencias y Automático; los mensajes del celular/Mac pausan Lola cuando existe el eco oficial de coexistencia |
| Datos y auditoría | Conserva historial y posiciones; los cambios comerciales de etapa ocurren solo por acciones confirmadas, selección de asesor o la regla de seguimiento |
| Baja | Bloquea automatización y registra opt-out en el CRM |

Las funciones del ensayo original de Telegram se conservan en el original sin modificar. WhatsApp tiene estado e historial propios en el CRM, sin reutilizar las tablas SQL del ensayo ni mezclar sesiones entre canales.

## Reglas de agenda conservadas del ensayo

- Calendar y correo de ventas: `ventas@orok.com.pe`.
- Responsable: Antonio Garces. Showroom: Calle La Apacheta 224, San Miguel.
- Zona: America/Lima. Cita: 45 minutos y margen de 15 minutos.
- Anticipación mínima: 2 horas. Horizonte: próximos 7 días.
- Martes a domingo, inicios de 10:00 a 18:00. Lunes y horarios especiales pasan a coordinación humana.
- Horarios ofrecidos vinculados al contacto y solicitud; caducan en 15 minutos y se comprueban otra vez al seleccionar y antes de escribir si hubo una demora.

## Respaldo e instalación del CRM

1. Conservar el ZIP original `orok-crm-app-v67.2.5 before claude` y el paquete anterior 67.4.0. Si el hosting cambió desde su descarga, hacer un ZIP nuevo de `/home/bmgcfdei/orok-crm-app`, fuera de esa carpeta.
2. Anotar en Setup Node.js App el valor actual de `OROK_PRIVATE_DIR` y respaldar ESA carpeta privada en un lugar privado del hosting. No enviarla por chat: contiene documentos y credenciales.
3. Iniciar sesión en el CRM actual y comprobar en `<OROK_PRIVATE_DIR>/backups` un `crm-....json.gz` y su manifest recientes. Conservar una copia fuera de la rotación. Si falta un respaldo reciente de datos, resolverlo antes de instalar.
4. Subir este ZIP a `/home/bmgcfdei/orok-crm-app` y extraer allí, reemplazando los archivos incluidos. El ZIP tiene los archivos del CRM en la raíz, sin una carpeta envolvente adicional.
5. No borrar `node_modules`, documentos, carpeta privada ni base de datos. No ejecutar inicializadores de Firestore/SQL. No hay dependencias de producción nuevas.
6. Reiniciar `orok-crm-app` desde Setup Node.js App.
7. En `https://crm.orok.com.pe/api/health` comprobar `ok: true`, `version: 67.4.1` y `persistence_guard: true`.
8. Verificar leads, etapas/posiciones, cotizaciones, separaciones y planos antes de habilitar el canal.

## Configuración del flujo n8n

1. Importar **04-Lola-WhatsApp-COMPLETO-02-Agenda-CRM-INACTIVO.json** como flujo nuevo, inactivo.
2. Mantener inactivo o despublicar el anterior **Motor CRM 01** si se llegó a publicar. No usar dos motores que consuman la misma cola.
3. Seleccionar Header Auth en todos los HTTP del CRM: cabecera `X-Orok-Webhook-Secret`, secreto privado existente del CRM. Es distinto del token de acceso de Meta y del token de verificación del webhook.
4. Seleccionar las credenciales OpenAI, Sheets y Supabase que usa el ensayo.
5. En **Calendar consultar crear reprogramar cancelar**, seleccionar la credencial **Google Calendar OAuth2 API** que ya funcionaba con `ventas@orok.com.pe` en Telegram. Debe permitir consultar y modificar ese calendario.
6. En **Avisar ventas por correo WhatsApp**, seleccionar la credencial Gmail del ensayo que puede enviar como la cuenta de ventas. Revisar el remitente real durante la prueba.
7. Las URL del CRM son literales, sin dependencia de `$vars`. La URL y método de Google se obtienen del trabajo autorizado y solo se resuelven cuando esa rama recibe una tarea; no deben sustituirse por una URL genérica del CRM.
8. Ejecutar primero la prueba sin escritura del observador 02: debe devolver `connection: true`, `writes: 0`. No es necesario publicar el observador ni conectar su webhook a Meta.
9. En el principal, **Consultar cola manualmente** procesa un trabajo. Si está vacía, termina sin error. Para encadenar consulta, confirmación y aviso, publicar el principal únicamente después de revisar las credenciales y el entorno de prueba.
10. El principal consulta cada 10 segundos y revisa seguimiento/operaciones interrumpidas cada minuto. Sus HTTP tienen tiempos máximos y el flujo un límite de 240 segundos por ejecución.

El archivo **01** es una revisión opcional de Telegram; no es una dependencia del flujo 04. No activarlo simultáneamente con el original del mismo bot. El archivo **02** es diagnóstico/observador autenticado; el principal es el **04**.

## Configuración de Meta y CRM para pruebas físicas

- Usar primero el número de prueba de Meta, con el teléfono personal del usuario como destinatario autorizado. No sustituir todavía el webhook de LeadCenter ni quitar YCloud.
- En WhatsApp del lead, engranaje de Gerencia: configurar versión Graph API indicada por Meta, Phone Number ID, token de acceso, App Secret y token de verificación privado.
- Elegir entorno **Pruebas**, añadir el destinatario con código de país y habilitar conexión/envío. El token de Meta permanece en el servidor, no en n8n.
- Callback de Meta: `https://crm.orok.com.pe/api/integrations/whatsapp`, mismo token de verificación, suscripción `messages`. La recepción exige firma HMAC y número de negocio autorizado.
- Primero probar Manual; luego Sugerencias. Tras verificar las credenciales de Calendar/Gmail, habilitar **agenda y gestión de citas** y **Lola automática** desde Gerencia; seleccionar Automático en la conversación de prueba.
- Con la agenda habilitada, las pruebas de cita crearán/modificarán eventos en el Calendar configurado y solicitarán invitaciones por correo. Usar el propio correo de prueba y cancelar el evento al terminar.

## Pruebas físicas de aceptación

1. Enviar texto al número de prueba: aparece en el lead correcto, sin moverlo por recibir un mensaje.
2. Responder Manual desde CRM: aparece en WhatsApp; refrescar no duplica el envío.
3. Recibir audio y pedir una sugerencia: se reproduce, transcribe y genera borrador sin enviar.
4. Adjuntar audio M4A/MP3 y enviarlo; probar grabación y descarte en el navegador del usuario.
5. Preguntar precio: frase aprobada, sin cifras, y tres botones.
6. Elegir Agendar cita: pedir el dato que falte y mostrar lista de horarios comprobados. Todavía no debe existir un evento.
7. Elegir horario: verificar un único evento de 45 min en Calendar, destinatario de invitación, confirmación WhatsApp y lead en Cita. Repetir el mismo evento de entrada no debe duplicar.
8. Pedir reprogramación: seleccionar otra opción; comprobar que cambia el mismo ID de evento y el CRM refleja el horario nuevo.
9. Pedir cancelar: elegir Conservar y comprobar que no cambia; volver a pedir cancelar y confirmar Sí, comprobando Calendar y CRM.
10. Elegir asesor: comprobar solicitud registrada, correo a ventas y Lola pausada.
11. Tomar Manual mientras Lola/agenda procesa: no debe disparar una operación que aún no se despachó. Una operación ya aceptada por Google se concilia en el CRM y se suprime la respuesta automática pendiente.
12. Enviar STOP o pedir baja: opt-out en CRM y bloqueo de mensajes automáticos posteriores.
13. Ofertas sin selección: probar vencimiento en entorno controlado; solo el contacto elegible pasa a Seguimiento, nunca Perdido. No modificar timestamps de producción para simularlo.
14. Fallos de permisos/plazo: no afirmar que se creó/cambió/canceló una cita o se envió un correo sin confirmación de la API.

## Validación y límites

- Ver `VALIDACION-AUTOMATICA-v67.4.1.json` y el registro de pruebas incluido. Las pruebas usan Firestore en memoria y Meta/Calendar/Gmail simulados; no se han enviado mensajes, creado citas ni instalado archivos en producción durante la preparación.
- Estructura n8n, referencias entre nodos, JavaScript y expresiones de proveedor se validan localmente. La importación y ejecución en la instancia real de n8n sigue pendiente de las pruebas físicas y sus credenciales.
- La revisión visual del panel y el micrófono en el navegador real siguen pendientes: no se pudo instalar Chromium en el entorno local. La compilación sí se verifica.
- La coexistencia celular/Mac requiere acceso y elegibilidad de Meta. El motor soporta los ecos oficiales, pero este ZIP no activa coexistencia ni importa el historial anterior del teléfono.
- El bot no envía brochure ni planos automáticamente: tampoco estaban implementados en el ensayo. Mantiene esa restricción y no anuncia envíos inexistentes.
- Fuera de la ventana de WhatsApp de 24h el panel bloquea texto libre. Las plantillas aprobadas no forman parte de esta entrega.
- Si el navegador solo graba WebM, se requiere FFmpeg en el hosting o adjuntar MP3/M4A. En iPhone debe verificarse soporte MP4 con su versión de Safari.
- Los archivos recibidos se descargan de Meta y pueden caducar; metadatos/transcripciones se conservan. El archivado permanente del audio original queda para almacenamiento.
- Instagram, Messenger, TikTok, dashboard de campañas y Claude son bloques posteriores.
- Los respaldos antiguos del CRM no incluyen las nuevas subcolecciones WhatsApp (`whatsapp_threads`, mensajes/auditoría, receipts, jobs, outbox, ofertas y bloqueos de agenda). Antes de futuras migraciones, respaldarlas también en Firestore. No borrarlas al limpiar cPanel.

## Reversión

Detener el principal n8n, desactivar envío/agenda/automatización y restaurar SOLO el código anterior desde su ZIP, conservando carpeta privada y Firestore. Un evento ya confirmado en Google se gestiona explícitamente: volver al código anterior no cancela citas. No restaurar toda la base sobre datos más nuevos.
