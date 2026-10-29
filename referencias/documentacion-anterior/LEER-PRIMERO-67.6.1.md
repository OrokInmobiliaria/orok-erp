# Lola 67.6.1: flujo principal unificado

**Importar en n8n:** `n8n/00-Lola-Unificado-67.6.1-INACTIVO.json`.

Es un único workflow principal de 46 nodos. Incluye el agente, catálogo, características, audios, agenda, reprogramación, cancelación, avisos a ventas, seguimiento, entrada normalizada y comprobación sin escritura. Requiere el CRM 67.6.1 incluido en esta entrega. Se entrega inactivo.

## Qué se corrigió

- Una oferta vencida puede generar una nueva solicitud con sus tres opciones y un nuevo plazo después del envío confirmado.
- El prompt utiliza el nombre real de la herramienta `Catalogo_comercial_Sheets`.
- En modo automático, nombre y correo expresamente aportados por el cliente se conservan en el CRM; los datos inferidos por el modelo se mantienen como propuestas revisables. Se recuperan los campos confirmados de modalidad e inicial que existan en el CRM.
- La solicitud textual explícita `/retomar`, `/lola_retomar`, `/ensayo_retomar` o «Quiero retomar la conversación» permite reanudar después de una baja y queda auditada. Un mensaje cualquiera no la revoca.
- Se puede elegir **Lola automática** como política de consultas nuevas. Por defecto se conserva solo registro hasta configurarlo.
- Instagram y Messenger utilizan el mismo servicio de conversación y agenda que WhatsApp. WhatsApp presenta botones/listas; los otros canales muestran opciones numeradas, cuya respuesta se vincula a la solicitud vigente.
- Se añaden registro de formularios normalizados y recuperación de formularios nativos Meta mediante `leadgen` en el callback de la página.
- El lead se comparte y las conversaciones conservan identidad de canal y cuenta. Los conflictos entre teléfono/correo de leads distintos requieren conciliación.
- Los canales comparten el bloqueo de agenda para reducir reservas simultáneas del mismo horario. Los cambios y cancelaciones conservan el registro de la cita.
- La comprobación de conexión utiliza `connection_check`, sin crear un contacto de prueba.

## Orden de instalación

1. Guardar un respaldo del CRM instalado y exportar los workflows actuales de n8n. Conservar sus archivos privados y credenciales existentes.
2. Instalar el contenido de `CRM-6761.zip` en la carpeta de la aplicación que ya utiliza el servidor. La carpeta `dist/` ya está compilada. Se mantienen las mismas dependencias de producción. No colocar claves, archivos privados o el código del servidor en el directorio público `dist/`.
3. Reiniciar la aplicación de Node del CRM. Su comprobación de salud y `connection_check` deben identificar la versión 67.6.1.
4. Importar **solo** `00-Lola-Unificado-67.6.1-INACTIVO.json` como flujo comercial principal. La carpeta `referencias/n8n-anteriores/` guarda copias anteriores para consulta; no deben activarse como workers comerciales adicionales.
5. Seleccionar las credenciales de cada servicio en los nodos y comprobar los valores de cuenta existentes. Si el CRM se publica en otro dominio, cambiar las URL de sus nodos HTTP al dominio real.
6. Ejecutar `Prueba de conexión manual` → `Comprobar conexión sin escritura`. El resultado esperado es `value.ok:true`, `value.connection:true`, `value.version:"67.6.1"`, `value.writes:0`.
7. Configurar los canales primero en entorno de pruebas y usar únicamente los destinatarios de prueba habilitados. Elegir la política de consultas nuevas y habilitar recepción, envíos, Lola y agenda según el canal.
8. Detener el procesamiento comercial de los antiguos flujos 04 y 05 antes de activar este worker. Mantener una sola ruta de ingreso por evento: no reenviar el mismo mensaje desde dos conectores distintos salvo que conserven exactamente su identificador original.
9. Activar el flujo principal en pruebas y comprobar conversaciones, opciones, citas, cambios, cancelaciones, asesor, seguimiento, baja y reanudación con las cuentas reales de prueba. La activación para clientes reales se realiza después de esa validación.

No se ha instalado ni activado nada en tu servidor desde este chat.

## Credenciales de n8n

| Servicio | Configuración |
|---|---|
| HTTP hacia el CRM | Header Auth con cabecera `X-Orok-Webhook-Secret` y el secreto privado existente del CRM. La exportación solo conserva referencias de credenciales. |
| Entrada normalizada de n8n | Seleccionar una credencial Header Auth propia en `Consulta o formulario normalizado`, por ejemplo `X-Lola-Entrada` con un valor privado. Es necesaria para habilitar ese webhook. |
| Modelo y transcripción | Credencial OpenAI del ensayo. |
| Catálogo | Credencial Google Sheets y catálogo existentes. |
| Características | Supabase y embeddings existentes. |
| Agenda | Credencial Google Calendar con acceso a `ventas@orok.com.pe`, o adaptar la cuenta y reglas en el CRM antes de usar otra agenda. |
| Avisos | Credencial Gmail de ventas. |
| Postgres opcional | Credencial `Postgres account 3` solo para el nodo deshabilitado de auditoría. No se utiliza para las conversaciones comerciales de esta versión. |

El secreto del CRM, la credencial del webhook de n8n, el token de acceso de Meta y su token de verificación son configuraciones distintas.

## Dónde llegan las consultas

Las entradas nativas con firma se reciben en el CRM y generan trabajos para este mismo workflow:

- WhatsApp: `https://crm.orok.com.pe/api/integrations/whatsapp`.
- Instagram: `https://crm.orok.com.pe/api/integrations/instagram`.
- Messenger y formularios de la página: `https://crm.orok.com.pe/api/integrations/messenger`.

El callback de formularios Meta requiere suscripción al evento `leadgen` y un token autorizado para recuperar los datos del lead. Es una configuración de la aplicación/cuenta Meta; no se completa importando un JSON. La recuperación se implementa mediante una solicitud autenticada a Graph y se comprueba antes de guardar el formulario.

El nodo superior `Consulta o formulario normalizado` admite entradas de una plataforma propia o de un puente previamente autorizado. Su URL de producción la muestra n8n al abrir el nodo; utiliza el path `lola-entrada-unificada-v6761`. **No conectar callbacks nativos crudos de Meta o TikTok a esa URL.** Los callbacks nativos requieren su validación de firma específica.

Ejemplo de formulario normalizado autenticado:

```json
{
  "action": "lola_form",
  "channel": "plataforma",
  "account_id": "orok-web",
  "event_id": "formulario-0001",
  "profile": {
    "name": "Cliente de prueba",
    "email": "cliente@example.test",
    "phone": "51999999999"
  }
}
```

Conservar el mismo `event_id` cuando se reintenta entregar el mismo formulario. La recepción repetida no debe crear otro lead.

Un formulario se registra en el CRM y no abre por sí solo una conversación en WhatsApp, Instagram o Messenger. Cuando el cliente escribe por un canal, se procesa su consulta en el motor compartido. Para iniciar un mensaje desde un formulario se necesita una salida habilitada para ese caso y canal; esta entrega no convierte formularios en mensajes salientes sin ese contexto.

## Postgres y estado anterior

El nodo `Postgres origen · solo lectura · OPCIONAL` está deshabilitado y aislado del recorrido comercial. Consulta las cinco definiciones instaladas; no crea tablas, no reemplaza funciones y no borra datos. Puede habilitarse para una auditoría manual con la credencial del ensayo.

Se entregan también las consultas de solo lectura en `sql/`. La segunda exporta perfiles y estados antiguos. **No retirar Postgres hasta conciliar el resultado con los leads, citas, notas y pendientes del CRM.** Esta entrega no afirma haber importado tus datos: no se accedió a la base instalada. Las citas que solo existan en el ensayo deben verificarse en Calendar y asociarse a su lead antes de retirar ese origen. No se mezclan automáticamente historiales de personas sin identidad comprobada.

Los scripts originales de instalación están en el respaldo `SQL-recuperado-Lola.zip` de la entrega general; no se ejecutan como parte de este workflow. Supabase y cualquier base interna de n8n son dependencias diferentes del estado de ensayo y se conservan.

## TikTok

El motor acepta el contrato normalizado de entrada por un puente autenticado. **El envío automático de TikTok permanece bloqueado**: falta verificar el acceso concreto de tu cuenta y adaptar el transporte oficial. No se incluye un callback público que simule haber verificado firmas nativas de TikTok.

Los reportes publicitarios son independientes de ese acceso de mensajería. Requisitos oficiales: [Business Messaging API](https://business-api.tiktok.com/portal/docs/business-messaging-api-get-started/v1.3).

## Validación realizada

- 92 pruebas aprobadas, 0 fallidas en las suites de entrega: estructura de flujos anteriores, WhatsApp, agenda, redes/reportes, motor común, protocolo de integración y workflow final.
- Incluyen reservas, cambios y cancelaciones simuladas tanto en Instagram como en Messenger; deduplicación; perfil; ofertas vencidas; baja/reanudación; controles humanos; formularios y autenticación de trabajos.
- Los casos del protocolo ejecutan el manejador HTTP real dentro del proceso, sin sockets, y simulan las respuestas de los proveedores.
- La interfaz se compiló correctamente con Vite. El workflow final se comprobó como JSON, se compilaron sus nodos Code y se revisaron conexiones, referencias de expresiones e identificadores.
- El intento de la suite completa encontró restricciones locales para conexiones a `127.0.0.1` y una expectativa de permisos de archivos propia de Linux. No se presentan esas pruebas como aprobadas ni como fallos confirmados de producción.

Falta comprobar el flujo importado en tu versión de n8n y las credenciales, firmas, permisos, índices y respuestas de los proveedores en el entorno de pruebas del servidor. Las pruebas locales no equivalen a una certificación del funcionamiento real de todas las cuentas.

## Referencias de contratos utilizados

- [Subworkflows y datos en n8n](https://docs.n8n.io/flow-logic/subworkflows/).
- [Ejemplo oficial de Meta Lead Ads y recuperación por leadgen ID](https://github.com/fbsamples/lead-ads-webhook-sample/blob/main/postman/FB%20Lead%20Ads%20%28Part%201%20-%20The%20Webhook%29.postman_collection.json).
- [Herramientas oficiales de WhatsApp Flows](https://github.com/WhatsApp/WhatsApp-Flows-Tools).
