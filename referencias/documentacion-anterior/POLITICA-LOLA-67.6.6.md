# LOLA · límites comerciales, recursos y cumpleaños · 67.6.6

LOLA tiene como misión generar interés y confianza, responder de forma cálida y útil, indicar la ubicación, comunicar características generales verificadas y facilitar una visita o el contacto con un asesor.

## Lo que LOLA no está autorizada a hacer

- Dar precios de unidades, rangos, cotizaciones, cuotas, iniciales, tasas o condiciones financieras.
- Negociar, regatear, rebajar, aceptar contrapropuestas o comprometer al asesor a aceptar una condición.
- Ofrecer descuentos, promociones, bonos, excepciones o mejores condiciones, incluso sin cifras.
- Inventar disponibilidad, características, videos, redes, archivos enviados o confirmaciones de gestiones.

Estas reglas están tanto en el mensaje de instrucciones del agente como en el control del servidor que revisa su respuesta antes del envío. Se amplió el filtro: ahora detecta negociación y rebajas sin cifras; importes explícitos se bloquean y otras propuestas económicas se sustituyen por la derivación aprobada. Se mantienen las tres opciones para continuar: cita, asesor o showroom. Las reglas se aplican al motor compartido de LOLA de WhatsApp, CRM, Instagram/Messenger; TikTok sigue pendiente de su adaptador de mensajería.

No se aplica esta restricción a un texto escrito deliberadamente por un vendedor en modo manual: el vendedor conserva su responsabilidad y autorización propias. LOLA no obtiene esa autorización por una instrucción del cliente ni por una cifra en una herramienta.

## Ubicación, características, videos y redes

La fuente principal autorizada permanentemente por Gerencia es IA LOLA. No requiere autorización por cada uso o por cada enlace procedente de sus documentos. Ver `FUENTE-DRIVE-IA-LOLA.md` para los formatos, controles y limitaciones exactos. Esta autorización no habilita divulgar precios ni negociar, y no modifica las reglas de destinatarios.

Se mantienen ubicación y características verificadas del proyecto. Los enlaces complementarios fuera de Drive pueden administrarse en el CRM. Compartir un enlace no equivale a adjuntar un archivo: los archivos privados mantienen sus permisos y no se presentan como accesibles al cliente. No hay extracción del texto de PDF ni transcripción de videos en esta versión.

## Cumpleaños exclusivamente para compradores

No existía esta función en 67.6.3. Se incorpora dentro del mismo CRM y n8n, desactivada por defecto.

Para calificar se exige:

1. Lead en Venta, venta confirmada con fecha y unidad vendida vinculada al mismo cliente. La unidad debe figurar vendida y el proyecto debe ser Infinity 224. Una separación, un MQL o la frase «ya compré» no califican.
2. Nombre confirmado y cumpleaños real, registrados con su fuente. Solo se requiere día y mes, no el año de nacimiento. No se deduce desde la conversación.
3. Permiso específico para felicitaciones por WhatsApp, con fecha y evidencia, sin baja posterior. Ser comprador por sí solo no implica autorización para recibir mensajes.
4. Plantilla `orok_cumpleanos_compradores_v1`, español, aprobada en Meta para el WABA y número correctos. La propuesta adjunta se presenta como Marketing; Meta decide la clasificación y aprobación. El servidor vuelve a comprobar el texto y estado APPROVED antes de enviar.
5. Conexión y envíos habilitados. Para el envío automático, además Gerencia debe habilitarlo, LOLA debe tener permiso de automatización y no debe haber una intervención manual o derivación humana pendiente.

Texto propuesto para Meta:

> ¡Feliz cumpleaños, {{1}}! Soy LOLA, del equipo de ÖRÖK. Gracias por ser parte de Infinity 224. Te deseamos un día lleno de alegría y un excelente nuevo año de vida. Si prefieres no recibir estos saludos, responde BAJA.

En la ficha completa de un comprador aparece **LOLA · cumpleaños del comprador**, para registrar los datos y, si corresponde hoy, ejecutar una felicitación manual con la plantilla. La opción global de Gerencia permite el envío diario automático desde el n8n a las **09:00 de Lima**. Requiere activar el workflow tras las pruebas reales.

La fecha se comprueba en Lima. Se admite como máximo un intento por cliente y año; no se repite automáticamente un envío sin confirmación. La felicitación se registra en la misma conversación WhatsApp del CRM y sale al cliente por ese número. La baja revoca también el permiso de cumpleaños. El 29 de febrero solo coincide el día real: no se cambia automáticamente a otro día en años no bisiestos.

El agente conversacional tampoco puede felicitar cumpleaños por su cuenta si el servidor no confirma comprador, fecha y permiso. No se agregan ofertas ni descuentos al saludo.

La plantilla adjunta es una **propuesta pendiente de aprobación en tu cuenta**, no una aprobación concedida. Se requieren permiso del destinatario y cumplimiento de las reglas de mensajería aun siendo un comprador. [Política oficial de WhatsApp Business](https://business.whatsapp.com/policy?lang=es_LA).

## Comprobación y estado de entrega

153 pruebas del conjunto local seleccionado pasaron, con cero fallos. Se probaron solicitudes y salidas de negociación, ubicación, enlaces autorizados/no autorizados, evidencia comercial, comprador frente a prospecto, fecha/permisos, aprobación de plantilla, límite anual y modo manual. Meta y los demás proveedores se simularon; no se enviaron mensajes a clientes. Cinco pruebas históricas de sockets siguen excluidas por la restricción del entorno ya documentada.

La aplicación web se compiló para producción. El n8n tiene 68 nodos y sigue INACTIVO. No se ha instalado ni activado en tu servidor.

Pendientes externos: comprobar lectura de IA LOLA desde el servidor, registrar datos y permisos de compradores, obtener aprobación real de las plantillas, configurar credenciales y validar en tu instancia n8n/CRM con destinatarios de prueba. Se mantienen los pendientes anteriores de TikTok Messaging, conciliación del Postgres histórico y entrega/estados de proveedores reales.
