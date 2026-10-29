# LOLA 67.6.7 · cambios de esta entrega

Ver `MEMORIA-SEGUIMIENTO-Y-ASESOR.md`: memoria de corto y largo plazo, hasta tres seguimientos automáticos según SLA y consentimiento, alertas a +51 987208622 / +51 951532021 / ventas@orok.com.pe, asesoría WhatsApp o Meet con dos horas de anticipación y control interno /asesor invisible al cliente. El número de atención es +51 912971742. Sustituye también 67.6.6.

# Cambio de esta entrega: showroom por WhatsApp, texto y audio

Ver `VISITAS-SHOWROOM-WHATSAPP.md`. Solicitud directa por WhatsApp; selección escrita o dictada de día/hora, repetición de lo interpretado y confirmación explícita antes de reservar. El correo sirve para la invitación. Se conserva IA LOLA como fuente permanente autorizada. Sustituye también la entrega 67.6.5.

# Cambio de esta entrega: fuente permanente IA LOLA


La carpeta confirmada por el usuario es **IA LOLA**:
https://drive.google.com/drive/folders/1XzOlumWN8jPhWMCQ1yge3cZ4tBiTuU6z

La selección anterior «LOLA - Información comercial vigente» quedó descartada. No se usa esa carpeta ni se amplía la búsqueda a todo Drive.


Ver `FUENTE-DRIVE-IA-LOLA.md`: autorización de Gerencia ya otorgada, sin permisos por consulta. Lectura en el mismo motor; no altera los límites comerciales. Debe comprobarse el acceso técnico desde el servidor.

# LOLA 67.6.7 · CRM, canales y agenda compartida

Importar **00-Lola-Unificado-67.6.7-INACTIVO.json** y utilizar el **CRM-6767.zip** de esta misma entrega. El flujo tiene 72 nodos y se entrega INACTIVO. Sustituye las entregas 67.6.1, 67.6.2 y 67.6.3. No se ha instalado, activado ni enviado ningún mensaje desde este chat.

## Refuerzo de conducta y atención posventa

Ver `POLITICA-LOLA-67.6.7.md`. Se refuerza la prohibición de negociar y dar precios, se incorporan recursos autorizados por Gerencia y el circuito de cumpleaños para compradores verificados. Está desactivado por defecto y requiere plantilla Meta, datos y permiso reales. Compartir enlaces de videos no significa enviar archivos adjuntos.

## Qué incorpora esta versión

- WhatsApp, Instagram y Messenger utilizan el mismo motor comercial, ficha, historial de gestiones y agenda. Las identidades se conservan por canal y cuenta; no se mezclan personas solo por su nombre.
- El usuario del CRM y LOLA dentro del CRM pueden consultar horarios, crear, reprogramar, cancelar y solicitar asesor sin depender de una conversación previa por WhatsApp. La acción «Agendar cita» del tablero y el bloque de gestión abren ahora la agenda compartida.
- El n8n muestra cuatro operaciones distintas de Calendar: consultar/verificar, crear con invitación por email, reprogramar y cancelar con aviso a invitados. Conserva la credencial de Calendar del original como referencia; debe seleccionarse la conexión real en la instancia de destino.
- La agenda conserva martes a domingo, inicios 10:00–18:00, duración 45 minutos, margen 15 minutos, anticipación mínima 2 horas y horizonte 7 días, en Lima. WhatsApp muestra dos botones de horario y «Ver más horarios», hasta seis opciones. El CRM muestra los seis botones. Cada opción vence a los 15 minutos y la disponibilidad se comprueba otra vez al elegir.
- Reprogramar modifica el evento existente. Cancelar solicita confirmación y comprueba el vínculo del evento con el lead. Si otro canal ya creó una cita, no se crea una segunda a partir de una oferta antigua. Una cancelación registrada desde otro canal deja de aparecer activa en los demás.
- Calendar solicita enviar invitaciones o cambios por correo con `sendUpdates=all` y el correo del cliente como invitado. El aviso de Gmail es para Ventas/asesor. «Invitación solicitada» no certifica entrega del correo ni aceptación del cliente. El enlace de una cita vinculada abre el evento existente para evitar duplicarlo.
- La intervención humana pausa a LOLA. Hablar con asesor registra la solicitud en el CRM y crea el aviso a Ventas. No afirma que el asesor esté conectado ni que haya leído el correo.
- Se conserva audio/transcripción, catálogo y características verificables, tres opciones comerciales, perfil, seguimiento por falta de selección y baja/reanudación explícita. El modelo no puede confirmar una cita por su cuenta: las confirmaciones se emiten después del resultado de Calendar.
- Se incorpora recuperación con plantillas aprobadas por Meta después de 24 horas y dashboard de publicaciones con análisis del modelo, descritos más abajo.

## Recuperación con plantilla Meta

Propuesta `orok_retomar_consulta_v1` (español), pendiente de aprobación en tu cuenta.

Texto:

> Hola {{1}}, somos el equipo de ÖRÖK. Nos escribiste sobre Infinity 224. ¿Deseas retomar tu consulta? Podemos ayudarte con información del proyecto, una visita o un asesor.

Botones de respuesta rápida: **Sí, continuar** / **No, gracias**.

## Registro y conexión

1. Registrar la propuesta en las plantillas del WABA de ÖRÖK, con el nombre, idioma, texto y botones indicados. Se adjunta el JSON del cuerpo de creación; no contiene credenciales ni una aprobación. Este paquete no ejecuta el registro en Meta por sí solo.
2. Esperar el estado **APPROVED**. No modificar después el texto en el CRM: si se cambia la plantilla, se debe revisar su aprobación y actualizar la integración para que el contenido coincida.
3. En Conexión de WhatsApp del CRM, registrar el **WABA ID**, además del Phone Number ID y las credenciales existentes. La credencial debe permitir leer plantillas/números del WABA y enviar mensajes: permisos de administración y mensajería de WhatsApp correspondientes a esa cuenta.
4. Para el contacto, disponer de autorización real de seguimiento. El CRM permite registrar fecha y evidencia del permiso obtenido; marcar una casilla no obtiene el permiso por sí mismo. Una consulta previa no se convierte automáticamente en autorización para seguimiento comercial.
5. Después de 24 horas, abrir la conversación del lead en el CRM y pulsar **Preparar y verificar plantilla en Meta**. El servidor consulta Meta y comprueba el número del WABA, el estado APPROVED, idioma, texto y botones.
6. El usuario revisa y pulsa **Enviar plantilla aprobada**. Selecciona si después responderá LOLA o continuará la atención humana. El servidor envía un mensaje de tipo `template`, desde el mismo número y lead de la estructura actual.
7. El envío aceptado permanece **esperando al cliente**. La respuesta del cliente permite continuar la atención habitual. Si responde «Sí, continuar», se respeta el modo elegido; «No, gracias» registra la baja y revoca seguimiento. También se reconoce ese rechazo por texto mientras espera la recuperación.

## Controles de la integración

No envía si la plantilla está pendiente, pausada, rechazada o difiere del contenido esperado; si el número no pertenece al WABA; si falta permiso del contacto; si hay baja; si la conversación ya recibió respuesta; o si la recuperación ya fue intentada. Los cambios de Calendar en curso y las derivaciones humanas conservan sus controles.

Solo hay un intento por último mensaje entrante. Los errores sin confirmación quedan en revisión: no se reintenta automáticamente ni se inicia una cadena de recordatorios. Un estado aceptado por Meta no acredita lectura del cliente. El mensaje y sus estados se guardan en la conversación del mismo CRM.

La preparación puede ser automática en n8n; el envío de recuperación se ejecuta por el usuario desde el CRM. No se abre la aplicación con un texto libre como mecanismo principal de recuperación. La antigua función de enlace manual queda únicamente como compatibilidad técnica con la entrega anterior, sin control visible en la pantalla nueva.

La aprobación es necesaria para enviar por la plataforma fuera de 24 horas, pero no garantiza que ningún destinatario reporte el mensaje como spam. Mantener permiso, contexto y respeto a la baja sigue siendo necesario. [Política oficial vigente de WhatsApp Business](https://business.whatsapp.com/policy?lang=es_LA).

Referencias de implementación de Meta: [Consultar plantillas](https://www.postman.com/meta/whatsapp-business-platform/request/qtgr0i7/get-all-templates-default-fields), [Enviar plantilla interactiva](https://www.postman.com/meta/whatsapp-business-platform/request/lwtlz1k/send-message-template-interactive).


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
2. Instalar CRM-6767.zip en la aplicación Node existente. `dist/` ya está compilada. Conservar la configuración privada del servidor; no publicarla dentro de `dist/`.
3. Reiniciar la aplicación. Salud y `connection_check` deben informar **67.6.7**.
4. Importar solo el n8n **67.6.7 INACTIVO** como flujo principal. Los archivos en `referencias/` documentan versiones anteriores y no se activan como workers adicionales.
5. Configurar las credenciales HTTP privadas del CRM, Calendar, Gmail, modelo comercial, Sheets y Supabase. Revisar las URL del CRM si el dominio instalado cambia. Ejecutar «Prueba de conexión manual»: `writes:0`.
6. Configurar los callbacks oficiales de cada canal hacia el servidor CRM y verificar su firma. El webhook normalizado del n8n usa Header Auth y no sustituye la validación de firmas de Meta. Probar entradas con ID único para evitar duplicados de conectores.
7. En entorno y destinatarios de prueba: entrar por WhatsApp, Instagram/Messenger y formulario; consultar desde CRM; agendar por un canal y reprogramar/cancelar desde otro; comprobar un único evento, invitación, aviso y estado del lead. Probar intervención manual, baja y reanudación.
8. Registrar y obtener aprobación de la plantilla en Meta; configurar el WABA ID y sus permisos. Probar una conversación vencida con autorización real del contacto: verificar plantilla, ejecutar envío desde CRM, revisar estados y responder los botones desde el teléfono del cliente de prueba. No se envían mensajes libres fuera de la ventana.
9. Configurar lectura de publicaciones, importar/verificar capturas reales y solicitar un análisis de prueba. Confirmar permisos, consumo y vínculo de atribución.
10. Detener los antiguos workers comerciales antes de activar este flujo. Validar con los servicios reales antes de usarlo con clientes.

## Qué sigue pendiente y cuándo se ejecuta

| Pendiente | Momento y requisito |
|---|---|
| Importar y comprobar el JSON en la instancia real de n8n | Después de instalar CRM 67.6.7 y seleccionar sus credenciales; antes de activarlo. La estructura y expresiones se comprobaron localmente, no se ejecutó el motor n8n real. |
| Calendar, invitaciones y Gmail reales | En la prueba de extremo a extremo con la cuenta de ventas. Los ensayos locales simulan respuestas; no acreditan entrega de email. |
| Aprobación de la plantilla y acceso al WABA | Registrar la propuesta, esperar APPROVED y verificar credenciales y permiso del destinatario antes de usar recuperación. |
| Permisos de Meta, callbacks y formularios | Durante conexión de cuentas de prueba. Acceso y formatos oficiales deben validarse por cada cuenta. |
| TikTok Messaging y su envío nativo | Cuando se confirme el acceso a Business Messaging y su contrato de envío. Sigue bloqueado; no se anuncia como operativo. Display API para publicaciones es independiente. |
| Importar/consolidar datos de Postgres | Después de exportar el estado real con SQL de solo lectura y conciliar teléfonos, IDs, historial y eventos Calendar. No retirar el origen antes. |
| Métricas adicionales de publicaciones | Al disponer de exportes o permisos de Insights válidos. La lectura Meta incluida es básica; alcance/vistas/etc. no se inventan. |
| Verificación visual del CRM y prueba en dispositivo | Después de instalar esta versión; la web fue compilada, pero no se ha revisado en un navegador contra el servidor real. |

## Validación entregada

192 pruebas del conjunto seleccionado pasaron; cero fallos en ese conjunto. Incluye agenda WhatsApp/Instagram/Messenger, circuito de agenda desde CRM, recuperación manual heredada y con plantilla Meta (11 casos nuevos), publicaciones/modelo con proveedor simulado y siete pruebas del manejador HTTP real ejecutado en proceso. Se compilaron las pantallas de producción.

Cinco pruebas antiguas que conectan por sockets locales no pudieron ejecutarse por `EACCES 127.0.0.1`; se excluyeron del conjunto seleccionado. No se presentan como aprobadas. Tampoco se certifica toda la batería histórica ni una operación en producción. Ver `VALIDACION-67.6.7.json` y los registros en `validacion/`.
