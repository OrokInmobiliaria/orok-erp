# LOLA 67.6.7 · memoria, seguimiento SLA y asesor humano

## Un mismo CRM y una conversación continua

LOLA ya recibía los últimos mensajes del chat. Esta entrega añade un contexto persistente por identificador verificado del lead, dentro del mismo proyecto del CRM. No crea otro CRM ni depende de una segunda memoria SQL. No vincula personas por coincidencia de nombre.

- Corto plazo: los últimos 24 mensajes del mismo canal, con fechas y transcripciones disponibles. El historial completo registrado sigue consultable en el chat del CRM.
- Largo plazo: perfil y etapa actuales del CRM, citas vigentes, últimas tres citas registradas, hasta 12 declaraciones del cliente y 16 referencias de temas conversados. Las declaraciones y temas se conservan para uso del modelo durante 180 días; son contexto con fecha, no hechos comerciales confirmados.
- La memoria persiste al reiniciar el servidor. Las conversaciones internas de operadores se guardan separadas de la memoria del cliente. Canales con la misma identidad de lead previamente vinculada pueden compartir contexto del cliente; no se realizan asociaciones nuevas por inferencia.
- Al retomar minutos, horas o días después, el agente recibe que ya hubo conversación y cuánto tiempo pasó, y continúa el asunto sin volver a presentarse. Se elimina la introducción inicial si el modelo la repite en una respuesta de continuación.
- Si una preferencia es antigua, LOLA debe comprobar que sigue vigente. El perfil actual y Calendar prevalecen sobre recuerdos. Las frases del cliente no pueden modificar permisos, autorizar precios, confirmar citas ni conceder consentimiento.

La memoria es estructurada y acotada: no supone recordar literalmente cada frase antigua ni recupera por sí sola el historial de Telegram/Postgres aún pendiente de conciliación. Los mensajes nuevos y el historial ya disponible en el CRM son la base; las preferencias se conservan al registrarse desde esta versión.

## Hasta tres seguimientos automáticos elegidos por el usuario

Gerencia dispone de **Conexión de WhatsApp → LOLA · contenido autorizado y posventa → Memoria y seguimiento automático · SLA**. Puede activar/desactivar la cadencia, elegir un máximo de uno a tres intentos y editar las tres esperas.

Valores iniciales: **120, 1440 y 4320 minutos**: dos horas desde la respuesta de LOLA, luego 24 horas desde el primer seguimiento y 72 horas desde el segundo. Son esperas entre intentos, no tres horas absolutas desde el primer mensaje. Se aplazan al siguiente horario válido del SLA en Lima. Si el CRM tiene una próxima acción futura posterior, no se adelanta.

La configuración del paquete permite la automatización solicitada, pero solo se ejecuta cuando están habilitados el SLA, su fecha de activación, el modo automático, los envíos de la conexión y el workflow. La entrega sigue INACTIVA. Los leads anteriores a la activación del SLA no se contactan por este proceso.

Un ciclo se vincula al mensaje del cliente y a una respuesta real de LOLA que queda esperando continuación. Los cierres de cortesía o una negativa explícita no arman una nueva cadencia. Cualquier nueva respuesta del cliente, incluso un audio antes de transcribirse, invalida el ciclo anterior. Una respuesta posterior de LOLA puede iniciar un nuevo ciclo si vuelve a quedar una consulta pendiente y siguen cumpliéndose las condiciones.

Se exige el permiso real de seguimiento ya registrable en la conversación del CRM. La aprobación de la carpeta IA LOLA no sustituye ese permiso. Tampoco lo sustituye la mera existencia de una consulta previa.

- Dentro de la ventana abierta se usa un mensaje de seguimiento sin precios ni promesas.
- Fuera de 24 horas se exige la plantilla exacta `orok_retomar_consulta_v1`, actualmente APPROVED en Meta para el WABA y número emisores. No se utiliza un mensaje libre para evitar esta regla. La plantilla debe aprobarse en la cuenta real.
- El mensaje aceptado queda en el mismo chat de WhatsApp y CRM. La respuesta del cliente continúa con su contexto. «No, gracias» en respuesta a la recuperación o una baja explícita revocan los seguimientos.
- Una cita activa, Calendar en gestión, atención humana pendiente, control manual, baja, etapa comercial que requiere otra gestión, falta de permiso o SLA inactivo bloquean el contacto automático.
- Solo hay un intento por ciclo y posición de la cadencia, mediante reserva transaccional. Un timeout o envío sin confirmación queda detenido para revisión y no se reintenta a ciegas. La aceptación del proveedor no acredita entrega o lectura.
- El disparador comprueba pendientes cada cinco minutos. Cada revisión recorre hasta 100 registros y limita los intentos externos por lote para evitar saturación; por tanto, no promete enviar exactamente al segundo del vencimiento.

Referencia: [Política oficial de WhatsApp Business](https://business.whatsapp.com/policy?lang=es_LA).

## Kanban y SLA existentes

Cada seguimiento aceptado por el proveedor registra un evento `attempt` y un evento de seguimiento, con canal, fecha e identificador. No registra contacto efectivo, MQL, cita asistida ni venta por haber enviado un mensaje.

Los movimientos usan la regla existente: **Lead Inicial → Seguimiento / No contesta** solo al cumplir la cantidad de intentos definida por el SLA y sin contacto humano registrado. El valor previo por defecto era siete intentos. Tres mensajes automáticos no se convierten en siete: pueden sumarse a intentos reales ya registrados; si no alcanzan el umbral, se conserva la etapa y se programa revisión del vendedor. No se marca Perdido por silencio.

La regla anterior de ofertas de tres opciones sin selección durante 24 horas conserva su tratamiento de Seguimiento. No se anulan las otras reglas del CRM. Se respeta una próxima acción futura y no se degrada una cita, separación o venta. El estado de la cadencia y la necesidad de revisión aparecen en el chat del CRM.

## Asesor y consultas de precios

Si el cliente pide un asesor o condiciones económicas, se registra inmediatamente una solicitud visible en el CRM y se prepara el aviso a Ventas. LOLA no negocia, no rebaja ni comunica cifras. La insistencia queda registrada sin enviar repetidamente el mismo aviso durante la solicitud vigente.

Destinos confirmados por el usuario:

| Uso | Destino |
|---|---|
| WhatsApp Business para conversar con el cliente | +51 912 971 742 |
| Aviso interno 1 | +51 987 208 622 |
| Aviso interno 2 | +51 951 532 021 |
| Email y calendario de Ventas | ventas@orok.com.pe |

El número 912 971 742 no se usa como receptor del aviso interno. En pruebas deben autorizarse también los dos teléfonos internos como destinatarios. Las credenciales deben corresponder al número emisor real.

El aviso WhatsApp interno usa la propuesta `orok_alerta_asesor_v1` —categoría propuesta Utility— con nombre, teléfono del cliente y motivo general. Meta debe aprobarla antes de que se envíe. No se anuncia como enviada si falta esa aprobación o falla un destino; cada resultado queda en el CRM. Los avisos internos no se insertan como mensajes del chat del cliente ni generan leads para los vendedores. El correo sigue su propia confirmación de proveedor; ninguna aceptación implica que el vendedor ya lo leyó.

El cliente puede elegir **Cita por WhatsApp**, **Cita por Meet** o **Esperar al asesor**. Si ya tiene cita y solicita atención humana, se conserva esa cita, se alerta a Ventas y se pausa LOLA para la intervención real. No se promete un asesor disponible inmediatamente.

## Citas de asesoría y recordatorios

Las citas por WhatsApp o Meet usan el mismo Calendar, días y horas de atención, comprobación de disponibilidad, selección/confirmación y registro CRM que la visita al showroom. La modalidad queda registrada. Reprogramar mantiene el mismo evento; cancelar conserva sus comprobaciones.

Se mantiene **anticipación mínima de dos horas**. LOLA no agenda para ahora ni para dentro de 30 minutos. Las propuestas duran 15 minutos y se vuelven a comprobar antes de escribir en Calendar. La intervención real de un asesor permite conversar de inmediato, pero el bot no rebaja automáticamente la anticipación de las reservas.

Meet se solicita mediante Calendar con creación de conferencia. El enlace se comparte únicamente si Calendar devuelve uno válido. Si tarda o no llega, se verifica el evento una vez y luego se deja en revisión: no se inventa un enlace ni se crea una segunda cita. Puede existir un evento de Calendar pendiente de conciliación; el operador debe revisar el evento conservado antes de repetir.

Las nuevas citas incluyen invitación al cliente y a ventas@orok.com.pe y configuran recordatorios del organizador: **email 30 minutos antes** y **aviso en Calendar 10 minutos antes**. Son recordatorios previos a una cita programada con anticipación, no citas creadas a 30 minutos. No se fuerza la configuración personal de recordatorios del cliente ni se certifica entrega de los correos. El aviso a Ventas tras la reserva contiene el enlace Meet cuando fue confirmado.

Referencias: [Calendar: crear evento y conferencia](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert), [datos de conferencia](https://developers.google.com/workspace/calendar/api/v3/reference/events#conferenceData).

## /asesor es un control interno invisible para el cliente

En el CRM aparece **Tomar conversación como asesor**. Ese control ejecuta internamente `/asesor`: pausa LOLA, cambia la conversación de WhatsApp de ventas a modo Manual, invalida respuestas automáticas pendientes y registra la toma de control. No manda un mensaje al cliente, no agrega el comando a su historial y no confirma por sí solo una cita. El asesor continúa atendiendo desde el mismo 912 971 742.

El vendedor autenticado también puede escribir el comando en el control del CRM. Un vendedor de los dos números internos puede responder **en privado al aviso recibido**, con `/asesor`, para identificar el cliente mediante la referencia al aviso. El comando tampoco se inserta en el chat del cliente. Sin referencia no se elige un cliente por suposición. Un cliente no puede usar el comando para concederse control humano ni modificar permisos.

No se utiliza escribir `/asesor` en la conversación del cliente desde la aplicación de WhatsApp: ese texto saldría antes de que el servidor pudiera interceptarlo. La invisibilidad se consigue ejecutándolo en el control interno del CRM o como respuesta privada al aviso interno, nunca enviándolo al cliente. El comando tampoco reabre una ventana de WhatsApp vencida.

## Estado de validación y pendientes

192 pruebas del conjunto local seleccionado pasaron, con cero fallos. Se probaron persistencia y separación de memoria, continuidad tras días/reinicio, cadencia y límites, permisos, horario SLA, respuesta por audio, duplicados, plantillas, alertas a los dos destinatarios, control interno, citas WhatsApp/Meet, enlace ausente y regresiones del embudo y agenda. Los proveedores y transcripciones se simularon. Cinco pruebas históricas de sockets siguen excluidas por EACCES y no cuentan como aprobadas. La interfaz compiló para producción.

El workflow tiene 72 nodos y sigue INACTIVO. No se ha instalado esta versión, enviado mensajes a clientes/vendedores ni creado citas reales desde este chat. Requiere el CRM y el workflow de esta misma entrega.

Antes de activar: comprobar la conexión del número +51 912 971 742, los dos destinatarios internos en pruebas, los permisos de seguimiento de contactos, el SLA y las tres esperas, la aprobación real de las plantillas y las credenciales de Gmail/Calendar/Meet/n8n. Probar un cliente y los dos avisos reales; verificar toma de control interna sin texto al cliente, creación de una cita, enlace Meet e invitaciones. Se mantienen los pendientes anteriores de TikTok Messaging, Postgres histórico y archivos/PDF/video indicados en la entrega previa.
