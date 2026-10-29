# ÖRÖK CRM 67.5.0 · preparación social y análisis publicitario

Fecha: 19/10/2026 · Preparado y validado localmente. No instalado en producción. No se enviaron mensajes, correos ni citas reales durante este desarrollo.

## Qué incluye

Esta actualización contiene todo el CRM 67.4.1. Si aún no lo instalaste, no necesitas instalarlo primero. El flujo 04 de WhatsApp se conserva sin cambios; mantiene Calendar, avisos de ventas y seguimiento. El original de Telegram y los paquetes anteriores se conservan aparte.

- **Instagram:** callback firmado, recepción de texto/adjuntos, conversación en CRM, vínculo explícito con lead existente y respuesta manual por Instagram API con Instagram Login.
- **Messenger:** callback firmado, conversación en CRM y respuesta manual con token de página y permisos correspondientes.
- **Lola social:** flujo 05 de n8n genera borradores solicitados por el usuario. Deben revisarse y enviarse manualmente. Valida límites comerciales y evidencia observada; no envía por sí solo ni ejecuta agenda en estos canales.
- **TikTok mensajería:** contrato interno autenticado y almacenamiento preparado. **Falta verificar elegibilidad/acceso y completar el adaptador del callback oficial, su firma y el envío.** El flujo 07 no es un webhook oficial TikTok ni un conector terminado. No se habilita envío TikTok desde el CRM.
- **Meta Ads y TikTok Ads:** consulta de reportes de solo lectura con tokens privados; sincronización manual o diaria mediante flujo 06; importación de JSON normalizado y exportación CSV.
- **Dashboard:** inversión diaria, impresiones, clics, CTR, CPC, CPM, leads reportados por plataforma cuando existe la métrica específica, leads CRM atribuidos, costos por lead/cita/venta y embudo acumulado. Ingresos de cohorte con importe real; relación ingresos/gasto solo en PEN, claramente distinta del ROAS de la plataforma.

## Dónde aparecen

1. **Herramientas → Bandeja social → Abrir bandeja social.** Visible para usuarios con sesión. Vincula cada identidad con el lead correcto. Para personas nuevas, registra primero el lead en Nuevo Lead y luego vincúlalo. Recibir mensajes no crea ni mueve leads automáticamente.
2. **IA y automatizaciones → Conexiones · Instagram, Messenger, TikTok y publicidad.** Solo Gerencia. Todos los canales nuevos comienzan desactivados; el entorno de pruebas permite únicamente los IDs de destinatarios autorizados.
3. **Rendimiento Mkt. → Meta y TikTok · inversión y resultados del CRM.** Solo Gerencia. El dashboard anterior se conserva; el nuevo módulo aparece debajo.

## Antes de instalar: respaldo exacto

En cPanel, **fuera de la carpeta pública**, comprime la carpeta activa completa:
`/home/bmgcfdei/orok-crm-app`
Guarda la copia como `orok-crm-app-before-v67.5.0-20261019.zip` en `/home/bmgcfdei/` o en tu equipo.

Respalda también la carpeta privada configurada por OROK_PRIVATE_DIR (habitualmente `/home/bmgcfdei/orok-crm-private`) fuera de cualquier web pública. Contiene secretos; no la compartas ni la incluyas en paquetes de instalación.

Conserva/exporta una copia de Firestore antes de pruebas de migración o cambios de datos. Las conversaciones y reportes se guardan en subcolecciones propias: `whatsapp_*`, `social_threads`, `social_receipts`, `social_outbox`, `social_jobs`, `ads_daily`, `ads_attribution`, `ads_sync_runs` y `ads_sync_locks`, con sus subcolecciones de mensajes/auditoría. El respaldo JSON tradicional del CRM no debe suponerse equivalente a una exportación completa de Firestore.

## Instalación del código

1. Sube **CRM-67.5.0-Social-Ads.zip** desde el Administrador de archivos de cPanel a `/home/bmgcfdei/orok-crm-app`.
2. Extrae en esa misma carpeta aceptando reemplazar el código. El ZIP no tiene otra carpeta exterior. No borres la carpeta privada ni bases de datos.
3. Reinicia la aplicación Node `orok-crm-app` y abre `https://crm.orok.com.pe/api/health`: debe indicar `67.5.0` y `persistence_guard:true`.
4. Recarga el CRM. Comprueba que siguen iguales los leads, posiciones, cotizaciones y separaciones.
5. Configura primero canales y cuentas de prueba. No hace falta habilitar los nuevos canales para seguir utilizando el CRM o el flujo WhatsApp 04.

## Instagram: datos y conexión pendientes

- Cuenta profesional, app Meta con Instagram API con Instagram Login y acceso otorgado por la cuenta propietaria.
- Permisos `instagram_business_basic` e `instagram_business_manage_messages`, con el nivel de acceso/revisión que Meta exija para clientes externos. Los roles de prueba y la autorización de la cuenta deben estar configurados.
- ID de cuenta profesional, versión Graph vigente indicada en la app, token de cuenta, App Secret y Verify Token propio de al menos 24 caracteres. Se guardan desde Gerencia; nunca en el JSON de n8n ni en comentarios de leads.
- Callback preparado: `https://crm.orok.com.pe/api/integrations/instagram`.
- Configura verificación y suscripción a mensajes en la app Meta. Debe llegar un evento real de prueba; una verificación GET correcta no acredita por sí sola recepción de mensajes.
- En entorno de pruebas autoriza los IDs de clientes de prueba. Primero recepción, luego envío manual. La implementación usa `graph.instagram.com/{version}/{ig-account-id}/messages`.
- El flujo Instagram con Facebook Login es otra variante y no debe mezclarse con este token sin adaptar su configuración.

## Messenger: datos y conexión pendientes

- Página Facebook administrada por ÖRÖK, app Meta con producto Messenger y token de página autorizado.
- Permisos de mensajes y suscripción de la página, incluyendo `pages_messaging` y `pages_manage_metadata` según la configuración; revisión/acceso avanzado cuando corresponda.
- ID de página, token, App Secret, Verify Token y versión Graph desde Gerencia.
- Callback preparado: `https://crm.orok.com.pe/api/integrations/messenger`.
- Suscribe la app a los eventos de mensajes y ecos disponibles para la página. Prueba recepción, envío manual y reflejo de respuestas externas. No se importa automáticamente todo el historial previo a conectar.

## TikTok: dos autorizaciones diferentes

**Publicidad:** cuenta TikTok for Business, app autorizada para Marketing API, advertiser_id y token con lectura de reportes. Confirma moneda y zona horaria exactas de esa cuenta. Se configura independientemente de mensajes.

**Mensajería:** verifica acceso a Business Messaging API, alcance de permisos y disponibilidad para esa cuenta/negocio. Debemos inspeccionar un evento real y la documentación habilitada para implementar y validar su firma, recepción y contrato de envío. Hasta entonces:

- El CRM acepta solamente eventos ya validados/normalizados por un puente interno autorizado, mediante `POST /api/integrations/lola`, Header `X-Orok-Webhook-Secret`, `action:social_message`, `channel:tiktok`.
- Ver `samples/tiktok-normalizado.json`. Es un contrato de integración propio, no un ejemplo de webhook crudo de TikTok.
- El flujo 07 exige Header Auth adicional en su entrada interna; selecciona una credencial privada distinta para ese puente. No apuntes el callback público de TikTok directamente a ese flujo.
- Envío y Lola automática TikTok permanecen deshabilitados.

## Reportes publicitarios

**Meta:** token con acceso de lectura a las cuentas autorizadas (por ejemplo ads_read), ID de cuenta, moneda y zona horaria tal como Meta las devuelve. El servidor verifica esas dos últimas antes de importar. Consulta Insights a nivel anuncio/día con desglose publisher_platform.

**TikTok:** advertiser_id, token de Marketing API autorizado, moneda y zona horaria confirmadas. Consulta `/open_api/v1.3/report/integrated/get/` con anuncio/día. La conversión genérica de TikTok no se etiqueta como lead; queda Sin datos hasta incorporar una métrica específica aprobada para el objetivo de campaña.

- Hasta 300 filas por sincronización/importación y 93 días por período. Si hay más anuncios reduce las fechas. Hasta 5000 filas por consulta del dashboard; no se presentan resultados parciales como totales.
- La importación es un **snapshot completo** de una cuenta y período: actualiza filas, elimina las que ya no estén en ese snapshot y no suma el gasto otra vez. Nunca importe un reporte parcial de una sola campaña como si fuera toda la cuenta. Archivo normalizado en `samples/reporte-publicidad-plantilla.json`.
- El formato necesita provider, account_id, from, to y rows con fecha, anuncio, plataforma, moneda, zona horaria y métricas. Usa números con punto decimal; `null` significa métrica no disponible, `0` solo cuando el reporte realmente lo confirma.
- No se mezclan monedas ni se añaden automáticamente Gastos Mkt. al gasto reportado por las APIs.
- El informe diario reconsulta los 7 días completos anteriores en Lima para recoger ajustes de atribución. En TikTok y Meta confirma zona horaria de cuenta. La agrupación comercial compara la fecha de captación con la zona de cada cuenta. Importaciones de reportes de otra zona deben usar su zona real.

## Atribución a leads

Se usa un vínculo explícito provider + cuenta + ID de anuncio. Puede venir de campos confirmados del lead, de una referencia publicitaria verificada en el primer mensaje (WhatsApp o identidad social ya vinculada), o de atribución manual en el dashboard. No se deduce campaña por nombres similares.

Cuando varias cuentas o referencias son ambiguas, queda sin atribuir para revisión. Los leads sin fecha de ingreso no entran en la cohorte. Al filtrar ubicación/plataforma, solo se cuentan leads cuya ubicación publicitaria esté confirmada; conversar por WhatsApp no demuestra si el anuncio se mostró en Facebook o Instagram.

Los avances del embudo son acumulados, con inferencia desde etapas posteriores señalada en pantalla; no se inventan fechas previas. No hay cifras de demostración en producción. Las observaciones son reglas descriptivas para revisión, no cambios automáticos de presupuesto, segmentación ni promesas de mejora.

## Flujos n8n que se importan

- **04:** WhatsApp completo anterior. No requiere reemplazarlo si ya está importado; su JSON se conserva idéntico.
- **05-Lola-Social-Sugerencias-INACTIVO.json:** selecciona Header Auth con `X-Orok-Webhook-Secret` y las credenciales de OpenAI, Sheets y Supabase. Se conservan referencias de credenciales del flujo revisado, sin claves. Genera borradores solo a petición; no envía ni agenda.
- **06-Reportes-Meta-TikTok-INACTIVO.json:** selecciona la misma credencial privada del CRM. Consulta diariamente los reportes usando los tokens guardados en el servidor, sin exponerlos en n8n. Habilítalo cuando estén conectadas las cuentas incluidas en el nodo de preparación; puedes dejar únicamente el proveedor ya autorizado.
- **07-TikTok-Entrada-Normalizada-PENDIENTE.json:** puente interno, NO conector oficial completo. Mantener inactivo hasta completar el adaptador autorizado.

Los flujos 05/06 complementan el 04 y se importan separados. No reemplazan Telegram ni el flujo WhatsApp. Todos se entregan inactivos y sin datos fijados.

## Validaciones y pruebas físicas pendientes

Validación automática: 170 pruebas locales pasaron; build de producción correcto. Incluye firmas, autenticación, permisos Gerencia, aislamiento de cuentas, deduplicación, ventana de respuesta, destinatarios de prueba, bajas, envío incierto sin reintentos, revisión humana, importaciones atómicas, paginación, atribución, monedas y regresiones de WhatsApp/Calendar/separaciones.

Pendiente en cuentas reales: validación/revisión Meta, tokens y suscripciones, recepción/envío y ecos, importación de los nuevos flujos en la versión de n8n utilizada, permisos reales de reportes, navegador de escritorio/móvil y acceso/adaptación TikTok Messaging. No se realizó una prueba visual en navegador en este entorno. Adjuntos sociales se muestran como enlaces recibidos; no incluye grabación/envío de audios sociales ni transcripción social automática. WhatsApp conserva sus funciones de audio anteriores.

## Reversión

Restaura el ZIP de código previo y reinicia Node. Conserva las carpetas privadas, Firestore y sus subcolecciones. Volver al código anterior no borra reportes ni conversaciones nuevas y no deshace mensajes enviados o citas ya creadas. No borres datos para probar una reversión. La limpieza de archivos del hosting sigue pendiente para una etapa separada.

## Fuentes oficiales consultadas

- Meta Instagram: https://www.postman.com/meta/workspace/instagram/documentation/23987686-9386f468-7714-490f-9bfc-9442db5c8f00
- Meta Messenger: https://www.postman.com/meta/messenger-platform-api/documentation/iyp204x/messenger-platform-api
- Meta Insights: https://developers.facebook.com/docs/marketing-api/insights/
- TikTok Business Messaging: https://business-api.tiktok.com/portal/docs/business-messaging-api-get-started/v1.3
- TikTok SDK Reporting: https://github.com/tiktok/tiktok-business-api-sdk/blob/main/js_sdk/docs/ReportingApi.md

Los endpoints de mensajería y reportes requieren pruebas con los permisos y la versión efectivamente habilitados. Las páginas de Meta que devolvieron límite de acceso durante la revisión se contrastaron con su colección oficial de Postman; no se tomó una respuesta de búsqueda como autorización de la cuenta.
