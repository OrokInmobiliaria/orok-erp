# Visitas al showroom desde WhatsApp · texto y audio · 67.6.9

La solicitud puede iniciarse directamente en WhatsApp mediante mensaje escrito o nota de voz. El correo electrónico se solicita para la invitación de Calendar; no es un disparador obligatorio de la solicitud. La misma agenda continúa disponible desde el CRM.

## Recorrido implementado

1. El cliente escribe o dice «Quisiera visitar el showroom» o pide agendar una visita. Ya no necesita una oferta de botones anterior para iniciar esta gestión. Si LOLA está en modo automático y la agenda habilitada, el servidor inicia la coordinación. La intervención del asesor y las bajas siguen respetándose.
2. Si llega audio, n8n lo descarga y transcribe; la transcripción se enruta a la misma agenda. El mensaje de voz y su transcripción permanecen en el mismo chat. Si falta nombre o correo, LOLA los pide para identificar la visita y enviar la invitación. No exige que el cliente envíe un email para solicitarla.
3. LOLA consulta el calendario de ventas y ofrece horarios libres dentro de las reglas de atención. No reserva al mostrar opciones.
4. El cliente elige una propuesta. Pulsar el botón que muestra día y hora confirma esa selección. Si la elección llega escrita o por audio, LOLA interpreta solo una fecha y hora que coincidan con las propuestas vigentes, repite el día y la hora de Lima y pregunta si confirma la visita. Aún no hay una reserva.
5. El cliente responde «Sí, confirmo», por texto o audio, o pulsa «Sí, confirmar visita». «No confirmo» conserva la posibilidad de elegir otra alternativa. Un sí sin propuesta vigente, una fecha ambigua, un botón antiguo o un horario que no se ofreció no crean la cita.
6. Solo después de la confirmación explícita se vuelve a comprobar Calendar y se solicita crear el evento. Si el horario se ocupó, se ofrecen otras opciones. Si Calendar no confirma la creación, no se anuncia una cita reservada.
7. Cuando Calendar devuelve el evento correcto, LOLA confirma la visita por el mismo WhatsApp, con día, hora y ubicación; registra la cita en el CRM, solicita la invitación por correo al cliente y genera el aviso a Ventas. Una respuesta aceptada de Calendar/Gmail no acredita entrega del correo ni aceptación del invitado.

El CRM incorpora también botones de confirmación para una fecha/hora escrita en su conversación interna con LOLA. Los canales con opciones numeradas mantienen la confirmación ligada a la propuesta actual. La conversación interna del CRM no se convierte en un mensaje al cliente automáticamente.

## Horarios conservados

Zona de atención: America/Lima. De martes a domingo; visitas de 45 minutos, con inicios entre 10:00 y 18:00, margen de 15 minutos, anticipación mínima de dos horas y horizonte de siete días. El último inicio a las 18:00 deja terminar la visita y el margen antes de las 19:00. Los lunes y horarios especiales se derivan para coordinación humana. Se consultan los eventos reales de Calendar para evitar conflictos. Cada propuesta dura 15 minutos y se comprueba otra vez al confirmar.

## Interpretación prudente de texto o audio

Se admiten expresiones inequívocas como «mañana a las cuatro de la tarde», «el miércoles a las 4 pm» o «21/10 a las 16:00», siempre que coincidan con una única propuesta. También se admite fecha completa. La fecha relativa se interpreta en Lima cuando llega el mensaje.

Si falta el día, falta precisar mañana/tarde cuando es necesario, se plantean alternativas o no coincide con un horario ofrecido, LOLA solicita aclaración. No se presume una reserva a partir de una transcripción dudosa. Una elección escrita/dictada se repite y se confirma antes de crear el evento. La transcripción automática real requiere las credenciales del servicio de audio en n8n.

## Qué se corrigió respecto de 67.6.5

- La petición directa de visitar el showroom puede iniciar la agenda sin depender de una oferta de botones aceptada previamente.
- Se incorporó selección de una propuesta por día y hora escritos o transcritos, con una confirmación posterior vinculada a esa propuesta.
- Se conservan identificación del cliente, calendario único, comprobación de disponibilidad, prevención de duplicados, reprogramación, cancelación, registro CRM y avisos.
- Se mantienen la fuente permanente IA LOLA y la prohibición de precios, negociación y rebajas. No cambió el alcance de archivos adjuntos, PDF/video, migración histórica o TikTok Messaging.

## Pruebas y estado

192 pruebas del conjunto local seleccionado pasaron, cero fallos. Diez casos nuevos cubren reconocimiento de solicitudes, interpretación de fecha/hora, confirmación numerada y el recorrido de showroom por WhatsApp: texto, audio de solicitud/elección/confirmación, petición del correo para la invitación, respuestas ambiguas, rechazo, botones antiguos y horario ocupado entre propuesta y confirmación.

Las respuestas de Meta, Calendar, correo y transcripción se simularon: no se ha probado una nota de voz real en tu instancia de n8n ni se han enviado mensajes a clientes. Cinco pruebas históricas de sockets siguen excluidas por la restricción EACCES de este entorno. Las pruebas del manejador HTTP se ejecutan en proceso. La interfaz se compiló para producción.

El workflow tiene 72 nodos y se entrega INACTIVO. Requiere instalar el CRM y workflow de esta misma versión y probar con credenciales y destinatarios de prueba antes de activarlo. La entrega local no instala ni activa nada en el servidor.
