# Plantilla oficial para retomar una consulta · LOLA 67.6.3

**Estado: propuesta preparada; pendiente de registro y aprobación por Meta en tu cuenta.** No está aprobada por incluirla en este archivo. No se ha solicitado su aprobación ni enviado a clientes desde este chat.

- Nombre propuesto: `orok_retomar_consulta_v1`
- Idioma: español (`es`)
- Categoría propuesta: `MARKETING`, por tratarse de una reactivación comercial general. Meta decide la categoría y aprobación definitivas. No se la presenta como utilidad para eludir su clasificación.
- Parámetro `{{1}}`: nombre del contacto. Ejemplo para revisión: María.

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

## Validación y pendientes

La entrega mantiene un solo n8n principal, con agenda, asesor, audio, publicaciones y el mismo CRM. Continúa INACTIVA. 149 pruebas locales del conjunto seleccionado pasaron; incluyen 11 casos nuevos de plantilla, permisos, rechazo, duplicados y respuesta del cliente con Meta simulada. Cinco pruebas históricas de sockets siguen excluidas por la restricción de conexiones locales ya documentada. La web se compiló para producción.

Pendiente: registrar la propuesta en Meta y recibir aprobación real, configurar WABA/credenciales y probar envío/estados/respuesta en un destinatario autorizado. Esto no se ha validado contra tu cuenta real.
