# LOLA 67.6.2 · CRM, canales y agenda compartida

Importar **00-Lola-Unificado-67.6.2-INACTIVO.json** y utilizar el **CRM-6762.zip** de esta misma entrega. El flujo tiene 63 nodos y se entrega INACTIVO. Sustituye la entrega 67.6.1. No se ha instalado, activado ni enviado ningún mensaje desde este chat.

## Qué incorpora esta versión

- WhatsApp, Instagram y Messenger utilizan el mismo motor comercial, ficha, historial de gestiones y agenda. Las identidades se conservan por canal y cuenta; no se mezclan personas solo por su nombre.
- El usuario del CRM y LOLA dentro del CRM pueden consultar horarios, crear, reprogramar, cancelar y solicitar asesor sin depender de una conversación previa por WhatsApp. La acción «Agendar cita» del tablero y el bloque de gestión abren ahora la agenda compartida.
- El n8n muestra cuatro operaciones distintas de Calendar: consultar/verificar, crear con invitación por email, reprogramar y cancelar con aviso a invitados. Conserva la credencial de Calendar del original como referencia; debe seleccionarse la conexión real en la instancia de destino.
- La agenda conserva martes a domingo, inicios 10:00–18:00, duración 45 minutos, margen 15 minutos, anticipación mínima 2 horas y horizonte 7 días, en Lima. WhatsApp muestra dos botones de horario y «Ver más horarios», hasta seis opciones. El CRM muestra los seis botones. Cada opción vence a los 15 minutos y la disponibilidad se comprueba otra vez al elegir.
- Reprogramar modifica el evento existente. Cancelar solicita confirmación y comprueba el vínculo del evento con el lead. Si otro canal ya creó una cita, no se crea una segunda a partir de una oferta antigua. Una cancelación registrada desde otro canal deja de aparecer activa en los demás.
- Calendar solicita enviar invitaciones o cambios por correo con `sendUpdates=all` y el correo del cliente como invitado. El aviso de Gmail es para Ventas/asesor. «Invitación solicitada» no certifica entrega del correo ni aceptación del cliente. El enlace de una cita vinculada abre el evento existente para evitar duplicarlo.
- La intervención humana pausa a LOLA. Hablar con asesor registra la solicitud en el CRM y crea el aviso a Ventas. No afirma que el asesor esté conectado ni que haya leído el correo.
- Se conserva audio/transcripción, catálogo y características verificables, tres opciones comerciales, perfil, seguimiento por falta de selección y baja/reanudación explícita. El modelo no puede confirmar una cita por su cuenta: las confirmaciones se emiten después del resultado de Calendar.
- Se incorpora recuperación manual después de 24 horas y dashboard de publicaciones con análisis del modelo, descritos más abajo.

## Recuperación de WhatsApp después de 24 horas

Cada minuto n8n prepara borradores para conversaciones vencidas. Se prepara un borrador por último mensaje entrante; no se manda una plantilla API ni un mensaje al cliente. La tarea recorre la bandeja por páginas de 100 registros.

En la conversación WhatsApp del CRM aparece **Retomar conversación después de 24 horas**:

1. Seleccionar «Preparar / revisar mensaje» y editar el texto si corresponde.
2. Elegir si LOLA podrá atender cuando responda el cliente. El valor inicial conserva control manual. Una derivación humana pendiente impide reactivarla por este mecanismo.
3. Pulsar «Abrir mensaje en WhatsApp». Seleccionar la cuenta de WhatsApp Business del negocio y confirmar el envío en la aplicación. El enlace no elige el remitente ni envía por sí solo.
4. El CRM conserva «WhatsApp abierto; envío sin confirmar». Un eco oficial del envío se registra como mensaje real; el enlace solo no acredita entrega.
5. Una respuesta entrante real cambia el estado a «El cliente respondió». Solo entonces puede reanudarse LOLA si se eligió esa opción y no hay baja ni atención humana pendiente. Un mensaje cualquiera no revoca una baja.

Requiere que el número del negocio siga disponible en WhatsApp Business, mediante coexistencia si también utiliza la API. Si el número solo tiene acceso API y no está disponible en la app, este procedimiento manual no queda habilitado por el simple enlace: se debe configurar coexistencia o utilizar una plantilla aprobada por Meta, cuya entrega puede tener coste. El paquete no envía esas plantillas de pago automáticamente.

No se promete coste cero de la conversación posterior. Preparar/abrir el borrador no realiza un envío API; una respuesta del cliente permite continuar la atención, pero el coste de mensajes de la API depende de las tarifas actuales y del proveedor. No se codificó una supuesta gratuidad automática dentro de 24 horas.

Plantilla del operador:

> Hola {nombre}, somos el equipo de ÖRÖK. Retomamos tu consulta sobre Infinity 224. ¿Deseas continuar con la información, coordinar una visita o hablar con un asesor? Responde a este mensaje y te ayudamos. Si prefieres que no te contactemos, indícanoslo.

Referencia del enlace con texto prellenado: [Ayuda oficial de WhatsApp](https://faq.whatsapp.com/5913398998672934). Consultar tarifas aplicables en la cuenta de Meta y con el proveedor antes de habilitar envíos API de recuperación. Un texto prellenado no es una plantilla aprobada por Meta.

## Publicaciones y dashboard en el mismo CRM

Gerencia encuentra el bloque **Publicaciones · Instagram, Facebook y TikTok** en **Rendimiento Mkt.**. Comparte el CRM con el reporte de pauta; las métricas orgánicas no se suman como gasto publicitario.

- Conectar la lectura por cuenta en ese bloque. Las claves se guardan en el servidor; campos vacíos conservan las anteriores. Instagram permite indicar Instagram Login o Facebook Login; Facebook requiere acceso a la página. TikTok Display API requiere un token del usuario con `video.list` y `user.info.basic`, y verifica el Open ID. Estos permisos son distintos de mensajería y anuncios.
- El flujo lee diariamente publicaciones y contadores básicos. La integración Meta obtiene Me gusta/reacciones, comentarios y compartidos cuando están disponibles; no simula alcance/vistas/guardados/clics si no vienen del proveedor. TikTok obtiene vistas, Me gusta, comentarios y compartidos de videos públicos autorizados.
- También se puede importar `samples/publicaciones-normalizadas.json`. Las columnas faltantes se muestran «Sin datos». El archivo de ejemplo tiene **cero filas**, para no confundir demostraciones con resultados reales.
- Cada captura reemplaza la última versión de la misma publicación y conserva su historial. Una captura más antigua no sobreescribe otra reciente. Una paginación incompleta no sustituye el reporte con resultados parciales. La lectura directa se limita a 100 publicaciones por cuenta; para más volumen debe acotarse/exportarse el reporte.
- El filtro corresponde a publicaciones creadas en el período, en Lima. Los contadores son acumulados a su última captura; no se presentan como incrementos de ese período. No se suma alcance como personas únicas entre posts. ER = (Me gusta/reacciones + comentarios + compartidos) / alcance, solo si están todos los datos.
- Leads, citas y ventas por publicación requieren una vinculación explícita con evidencia en el CRM. No se atribuyen por coincidencia de nombre, fecha o texto. «Citas» cuenta leads atribuidos con un registro de cita en su historial; no implica asistencia.
- «Solicitar y guardar análisis» usa el modelo Claude ya configurado por Gerencia en el CRM. Se envían métricas agregadas por publicación, sin nombres, teléfonos ni correos de los leads. Se guardan captura usada, modelo, observaciones con ID de publicación, pruebas propuestas, limitaciones y consumo devuelto. No publica ni cambia campañas. Puede consumir saldo del modelo.
- El análisis se solicita por botón del CRM o disparador manual del mismo n8n; no se ejecuta diariamente de forma automática. Una solicitud duplicada conserva el resultado. Una llamada sin confirmación queda en revisión y no se reintenta automáticamente. Las conclusiones del modelo requieren criterio humano.

Referencia de la lectura TikTok: [List Videos](https://developers.tiktok.com/docs/en/tiktok-api-v2-video-list), [Video Object](https://developers.tiktok.com/docs/en/tiktok-api-v2-video-object). Los permisos, versiones y respuestas reales de Meta deben comprobarse con las cuentas de destino. Las métricas no entregadas se pueden incorporar mediante reporte normalizado; no se han validado credenciales reales desde este chat.

## Orden para instalar y probar

1. Guardar respaldo del CRM instalado, workflows activos, credenciales y archivos privados. Conservar Postgres y su historial.
2. Instalar CRM-6762.zip en la aplicación Node existente. `dist/` ya está compilada. Conservar la configuración privada del servidor; no publicarla dentro de `dist/`.
3. Reiniciar la aplicación. Salud y `connection_check` deben informar **67.6.2**.
4. Importar solo el n8n **67.6.2 INACTIVO** como flujo principal. Los archivos en `referencias/` documentan versiones anteriores y no se activan como workers adicionales.
5. Configurar las credenciales HTTP privadas del CRM, Calendar, Gmail, modelo comercial, Sheets y Supabase. Revisar las URL del CRM si el dominio instalado cambia. Ejecutar «Prueba de conexión manual»: `writes:0`.
6. Configurar los callbacks oficiales de cada canal hacia el servidor CRM y verificar su firma. El webhook normalizado del n8n usa Header Auth y no sustituye la validación de firmas de Meta. Probar entradas con ID único para evitar duplicados de conectores.
7. En entorno y destinatarios de prueba: entrar por WhatsApp, Instagram/Messenger y formulario; consultar desde CRM; agendar por un canal y reprogramar/cancelar desde otro; comprobar un único evento, invitación, aviso y estado del lead. Probar intervención manual, baja y reanudación.
8. Comprobar una conversación vencida: preparar, editar, abrir WhatsApp Business, enviar manualmente y recibir una respuesta. Verificar que no se emitió una plantilla API para recuperar, que el enlace no figura como entrega y que el modo elegido se respeta.
9. Configurar lectura de publicaciones, importar/verificar capturas reales y solicitar un análisis de prueba. Confirmar permisos, consumo y vínculo de atribución.
10. Detener los antiguos workers comerciales antes de activar este flujo. Validar con los servicios reales antes de usarlo con clientes.

## Qué sigue pendiente y cuándo se ejecuta

| Pendiente | Momento y requisito |
|---|---|
| Importar y comprobar el JSON en la instancia real de n8n | Después de instalar CRM 67.6.2 y seleccionar sus credenciales; antes de activarlo. La estructura y expresiones se comprobaron localmente, no se ejecutó el motor n8n real. |
| Calendar, invitaciones y Gmail reales | En la prueba de extremo a extremo con la cuenta de ventas. Los ensayos locales simulan respuestas; no acreditan entrega de email. |
| WhatsApp Business/coexistencia del número | Antes de utilizar la recuperación manual. El enlace no habilita coexistencia ni verifica la cuenta remitente. |
| Permisos de Meta, callbacks y formularios | Durante conexión de cuentas de prueba. Acceso y formatos oficiales deben validarse por cada cuenta. |
| TikTok Messaging y su envío nativo | Cuando se confirme el acceso a Business Messaging y su contrato de envío. Sigue bloqueado; no se anuncia como operativo. Display API para publicaciones es independiente. |
| Importar/consolidar datos de Postgres | Después de exportar el estado real con SQL de solo lectura y conciliar teléfonos, IDs, historial y eventos Calendar. No retirar el origen antes. |
| Métricas adicionales de publicaciones | Al disponer de exportes o permisos de Insights válidos. La lectura Meta incluida es básica; alcance/vistas/etc. no se inventan. |
| Verificación visual del CRM y prueba en dispositivo | Después de instalar esta versión; la web fue compilada, pero no se ha revisado en un navegador contra el servidor real. |

## Validación entregada

137 pruebas del conjunto seleccionado pasaron; cero fallos en ese conjunto. Incluye agenda WhatsApp/Instagram/Messenger, circuito de agenda desde CRM, recuperación, publicaciones/modelo con proveedor simulado y siete pruebas del manejador HTTP real ejecutado en proceso. Se compilaron las pantallas de producción.

Cinco pruebas antiguas que conectan por sockets locales no pudieron ejecutarse por `EACCES 127.0.0.1`; se excluyeron del conjunto seleccionado. No se presentan como aprobadas. Tampoco se certifica toda la batería histórica ni una operación en producción. Ver `VALIDACION-67.6.2.json` y los registros en `validacion/`.
