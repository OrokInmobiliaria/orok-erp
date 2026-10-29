# ÖRÖK CRM 67.6.0 · Campañas IA con Claude

19/10/2026 · Versión acumulativa, preparada localmente. No instalada en el hosting. No se realizaron llamadas reales a Claude ni se enviaron mensajes, correos, citas o anuncios reales.

## Qué instala esta versión

Incluye todo el CRM 67.5.0 (WhatsApp, agenda, preparación social y reportes), más la pestaña **Campañas IA**, visible para Gerencia en escritorio y navegación móvil. No requiere instalar antes los paquetes 67.4.1 y 67.5.0.

Los flujos 04 de WhatsApp y 05/06/07 sociales/reportes se conservan idénticos. El nuevo **08-Campanas-Claude-CRM-INACTIVO.json** se importa como flujo separado y los complementa.

### Submenús

1. **Brief y análisis:** objetivo, canales, formatos, período de métricas, audiencia a evaluar, presupuesto/notas, hechos comerciales confirmados con fuente.
2. **Propuestas y textos:** solicitar una propuesta a Claude, revisar análisis/limitaciones/hipótesis, editar textos de publicación y guiones por escena. También hay plantilla manual para trabajar sin API.
3. **Recursos:** fotos, clips y narración grabada autorizados. No se utilizan DNI, vouchers ni documentos de compradores.
4. **Gráficas:** composición de marca, foto y textos; exportación real PNG a 1080×1080, 1080×1350 o 1080×1920.
5. **Reels e historias:** secuencia de escenas con fotos animadas o clips, textos, cierre y audio de narración opcional. Exportación de video desde el navegador, MP4 o WebM según soporte.
6. **Revisión e historial:** aprobación de una revisión concreta, notas, auditoría, piezas exportadas y descarga del plan/guiones en texto legible.
7. **Conexión Claude:** clave API privada, modelo disponible, workspace opcional y límite de tokens de salida.

## Alcance real de la producción creativa

Claude prepara análisis, propuestas, mensajes, guiones e instrucciones de diseño con el contexto suministrado. Los archivos gráficos y de video los produce el editor del CRM usando recursos que tú apruebas. Esta versión **no sintetiza fotografías o metraje nuevo con un modelo de imagen/video, no genera voz automáticamente y no realiza una edición cinematográfica generativa**. Las fotos pueden tener movimiento de acercamiento y los clips reproducirse por escena; el audio de los clips de fondo queda silenciado. La narración es un archivo de audio aprobado que se incorpora al video.

No publica anuncios ni modifica campañas, segmentación, presupuestos, WhatsApp, LeadCenter o YCloud. Los planes de prueba y recomendaciones son propuestas para revisar. No garantizan una mejora en la IA de Meta ni ventas adicionales.

## Datos enviados a Claude

Se prepara un snapshot del dashboard publicitario con métricas agregadas por campaña, cobertura, moneda, gasto y avances del embudo. Se excluyen IDs de leads, nombres de clientes, teléfonos, correos, mensajes, DNI y documentos. Se envían los hechos confirmados del brief y las etiquetas/tipos de recursos; **los archivos visuales no se envían a Claude ni se interpretan mediante visión en esta versión**.

Se analizan hasta 80 grupos publicitarios por propuesta y se informa si el snapshot quedó acotado. Si falta gasto, atribución o historial, se declara la limitación; no se generan métricas de demostración. Los datos del dashboard no sustituyen estudios externos ni validaciones de audiencia. La segmentación sugerida es una hipótesis que debe verificarse en las opciones y restricciones de la cuenta y el país.

Los hechos comerciales no se obtienen automáticamente de Sheets/Supabase en este módulo: Gerencia debe incorporarlos con fuente vigente y confirmar su revisión. Sin hechos se usan mensajes generales. Las afirmaciones numéricas de áreas/dormitorios y varios diferenciales requieren respaldo en esos hechos. Precios, ofertas, descuentos, falsa escasez y promesas económicas se rechazan en los textos creativos por defecto. La revisión humana sigue siendo necesaria para cualquier afirmación.

## Conexión de Claude y n8n

1. Instala el CRM y verifica primero el funcionamiento general.
2. Abre **Campañas IA → Conexión Claude**.
3. Guarda tu clave de la Claude API con la generación deshabilitada. Se guarda en `creative-claude.json` dentro de OROK_PRIVATE_DIR; no se devuelve al navegador ni se copia al JSON de n8n.
4. Consulta los modelos disponibles con esa clave. Selecciona un ID con acceso efectivo y soporte de salidas JSON estructuradas. No se fija un nombre de modelo que pueda dejar de estar disponible.
5. Configura entre 2000 y 8000 tokens máximos de salida, 5000 por defecto. Si la propuesta se trunca, revisa el límite o solicita menos formatos; no se acepta una propuesta incompleta.
6. Habilita las solicitudes explícitas y guarda la conexión. Si tu clave exige un workspace, configura el ID correspondiente.
7. Importa el flujo **08-Campanas-Claude-CRM-INACTIVO.json** en n8n. No sustituye el 04 de WhatsApp ni el 05 social.
8. Selecciona en sus dos nodos HTTP la credencial Header Auth con nombre de cabecera `X-Orok-Webhook-Secret`, usando el secreto privado de integración del CRM ya utilizado por los demás motores.
9. Ejecuta primero manualmente. Sin solicitudes en cola devuelve job:null y no llama a Claude. Cuando la prueba sea correcta, activa el flujo; revisa solicitudes cada minuto.
10. Crea una campaña, añade recursos y solicita una propuesta desde el CRM. Comprueba estado, resultado, tokens registrados y auditoría.

El acceso de Claude API necesita su propia clave y disponibilidad de uso en la cuenta. La instalación no proporciona una clave ni acredita saldo. El CRM registra tokens devueltos por el proveedor, no estima ni modifica tus créditos de ChatGPT y no muestra un costo monetario sin tarifas verificadas.

## Control de solicitudes y errores

- Solo una generación pendiente por campaña y hasta tres solicitudes explícitas por campaña/hora.
- Cola y autorización exclusiva antes de la llamada externa. Los reintentos de n8n con el mismo trabajo no repiten una llamada ya iniciada.
- Una respuesta incierta o un reinicio durante una llamada deja el trabajo **unknown**; no se regenera automáticamente. Comprueba el uso de API antes de solicitar otro trabajo.
- Un modelo sin soporte JSON, rechazo de permisos/saldo, salida truncada o propuesta inválida queda fallido y no se aprueba.
- Si editas el brief o la propuesta mientras Claude trabaja, su resultado anterior no sobrescribe tu nueva revisión.
- La generación no escribe en leads, posiciones, inventario, cotizaciones ni separaciones.

## Flujo recomendado de trabajo

1. Sincronizar/importar reportes Meta/TikTok y revisar la atribución en Rendimiento Mkt.
2. Crear brief con período y objetivo concretos. Incorporar hechos con fuentes vigentes.
3. Cargar fotos/clips/audio propios o autorizados y etiquetarlos con claridad.
4. Solicitar propuesta a Claude o empezar con una plantilla manual.
5. Editar títulos, textos, CTA, guiones y selección de recursos por escena. Guardar los cambios antes de exportar.
6. Exportar un borrador para revisar composición y ritmo. Los borradores llevan marca visible.
7. Revisar datos, textos, derechos y restricciones; aprobar la revisión con una nota.
8. Exportar nuevamente desde la revisión aprobada: sin marca de borrador. Se conserva una copia privada y el vínculo de descarga en la campaña.
9. Descargar el plan/guiones y publicar manualmente en la plataforma, tras comprobar especificaciones y permisos. La conexión de publicación automática queda fuera de esta versión.
10. Revisar resultados nuevos en el dashboard y crear otra hipótesis o revisión, manteniendo el historial.

## Recursos y exportaciones

- Hasta 15 recursos de entrada por campaña: JPG/PNG, MP4/WebM y narración MP3/M4A compatible.
- Fotos/audio: hasta 15 MB cada uno; clips: hasta 40 MB.
- Los archivos se guardan como binarios privados en `OROK_PRIVATE_DIR/campaign-media`, no como base64 dentro de Firestore. Firestore guarda metadatos, revisiones, relaciones y auditoría.
- Solo Gerencia autenticada puede cargar o abrir estos archivos. La reproducción soporta solicitudes parciales de video/audio.
- Al añadir un recurso o cambiar contenido se invalida la aprobación anterior. Las exportaciones se registran aparte y no cambian la revisión aprobada.
- Dos a seis escenas por reel/historia, 2–8 segundos por escena, hasta 45 segundos totales. La duración de la narración debe revisarse antes de publicar.
- El navegador compone el video en tiempo real: mantén la pestaña visible. Se puede cancelar. La descarga de PNG/video queda vinculada a la revisión del contenido; si esta cambia durante la exportación se rechaza el guardado anterior.
- MP4/WebM depende de MediaRecorder/códecs disponibles. WebM puede necesitar conversión externa a MP4 para una plataforma que no lo acepte. No hay FFmpeg obligatorio en cPanel para este editor.
- El video puede requerir recursos del equipo durante la exportación; por eso queda fuera del proceso de generación de Claude en el servidor.
- Las campañas se pueden archivar sin borrar sus archivos ni auditoría. El listado muestra las 100 campañas más recientes; cada campaña conserva hasta 50 exportaciones e hitos recientes en su vista, sin borrar los registros anteriores.

## Instalación y respaldo exacto

Antes de reemplazar código, en cPanel comprime **la carpeta activa completa**:
`/home/bmgcfdei/orok-crm-app`
Guarda la copia fuera de esa carpeta, por ejemplo:
`/home/bmgcfdei/orok-crm-app-before-v67.6.0-20261019.zip`.

Respalda también la carpeta privada indicada por OROK_PRIVATE_DIR (habitualmente `/home/bmgcfdei/orok-crm-private`) fuera de cualquier sitio público. Contiene claves y documentos; no debe compartirse ni incorporarse al paquete de instalación.

1. Sube **CRM-67.6.0-Campanas-IA.zip** a `/home/bmgcfdei/orok-crm-app` desde el Administrador de archivos de cPanel.
2. Extrae allí reemplazando el código. El ZIP no contiene otra carpeta exterior. No borres bases de datos ni la carpeta privada.
3. Reinicia la aplicación Node `orok-crm-app`.
4. Comprueba `https://crm.orok.com.pe/api/health`: versión `67.6.0` y `persistence_guard:true`.
5. Verifica leads, posiciones, cotizaciones, separaciones y funciones existentes antes de habilitar conexiones nuevas.
6. Configura Claude e importa el flujo 08 separado. Los demás flujos existentes no necesitan reemplazarse por este desarrollo.

Conserva una exportación completa de Firestore cuando hagas migraciones/pruebas de datos. Además de las subcolecciones anteriores, esta versión agrega `creative_campaigns` (con `audit` y `exports`), `creative_jobs` y `creative_media`. El respaldo tradicional JSON de leads no equivale a una exportación completa de estas subcolecciones. Respalda los binarios privados junto con sus metadatos.

Reversión: restaurar el ZIP de código anterior y reiniciar Node, conservando la carpeta privada y Firestore. La reversión de código no borra campañas/archivos nuevos ni deshace acciones externas realizadas anteriormente.

## Validación y pendientes

196 pruebas locales correctas y build de producción correcto. Se probaron permisos, privacidad, colas exclusivas, reintentos, errores, ediciones concurrentes, aprobación por revisión, archivos privados, reproducción parcial, atribución y regresiones anteriores. El render de video se verificó con APIs de navegador simuladas para finalización y cancelación; no se hizo una prueba visual ni de códecs en un navegador real porque no hay un navegador instalado en este entorno.

Pendientes de validación física: clave/saldo/modelo reales de Claude, importación/ejecución del flujo en tu n8n, revisión visual en escritorio/móvil, generación PNG real con tus imágenes y exportación MP4/WebM/audio en tu navegador. No se atribuye una mejora de desempeño publicitario sin datos posteriores.

Siguen pendientes las conexiones y pruebas reales de los canales anteriores, elegibilidad/coexistencia de WhatsApp, adaptador oficial de TikTok Messaging y limpieza del hosting. La guía 67.5.0 incluida detalla esos requisitos. Este módulo no los sustituye.

## Referencias oficiales

- API Claude y autenticación: https://platform.claude.com/docs/en/api/overview
- Salida JSON estructurada: https://platform.claude.com/docs/en/build-with-claude/structured-outputs
- Modelos y capacidades: https://platform.claude.com/docs/en/models/overview

Se usa `POST https://api.anthropic.com/v1/messages`, con API version `2023-06-01` y `output_config.format.type=json_schema`. Los permisos, modelos, tarifas y saldo se confirman en la cuenta que se conecte.
