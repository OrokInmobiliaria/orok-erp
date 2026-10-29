# LOLA 67.6.9 · actualización conjunta de n8n y CRM a PostgreSQL

## Qué se entrega y qué está instalado

Entrega de código y flujo preparada e INACTIVA. El CRM 67.6.9, el JSON n8n 67.6.9 y la migración SQL deben instalarse como conjunto. El n8n comercial fue importado y guardado como borrador, sin publicación ni ejecución, en https://n8n-n8n.kvrq8w.easypanel.host/workflow/RaOagifGauJ9cEc6 . No se han sustituido los archivos de Namecheap, ejecutado esta migración en el VPS ni cambiado DNS, accesos o firewall. El diagnóstico manual de PostgreSQL de la revisión anterior es distinto del nuevo flujo comercial.

La revisión real confirmó `Postgres account 3`, base `postgres_infinity`, PostgreSQL 17.11 y unos 9,3 MiB de tamaño en el VPS de Hostinger. Conserva la memoria de Telegram y las cinco funciones originales. El servidor del CRM está en otro alojamiento: cPanel de Namecheap. Se encontró `/home/bmgcfdei/orok-crm-app`, `/home/bmgcfdei/orok-crm-private` y el dominio crm.orok.com.pe. Setup Node.js App mostró «NO APPLICATIONS FOUND» durante la consulta; los archivos y nodevenv sí existen. Ese resultado no prueba por sí solo que el CRM esté detenido. No se han inspeccionado contraseñas ni claves privadas.

## Cambio real en n8n

El workflow tiene 71 nodos, un agente y estado INACTIVO. La importación admite un único disparador manual; se conservó «Consultar cola manualmente». Las comprobaciones opcionales se ejecutan seleccionando su nodo y el análisis se solicita desde el CRM o ejecutando «Preparar solicitud de análisis del período»; no se automatiza ese consumo. Se añadió **Recuperar memoria e historial · PostgreSQL**, un nodo Postgres real con consulta parametrizada a `lola_unified.context_for_job`. Texto y audio transcrito pasan por este nodo antes del agente. Recupera contexto solo para el proyecto, canal y cliente identificados por un trabajo reservado y vigente; una autorización incorrecta, trabajo vencido, mensaje nuevo o toma de control lo bloquean.

El nodo siguiente aplica la memoria a la conversación de LOLA. Si la lectura falla o devuelve otro trabajo, no se ejecuta el agente. Se conserva la credencial identificada del original, `Postgres account 3`; una cuenta de producción con permisos acotados debe comprobarse durante el despliegue. El Postgres opcional del origen sigue deshabilitado y separado de las tablas operativas nuevas.

No se usa un subnodo LangChain que archive automáticamente la salida del modelo antes de validarla. El servidor registra el mensaje saliente después de aplicar las restricciones comerciales y obtener aceptación del proveedor; un fallo posterior queda en revisión, sin reintento ciego. Aceptación no acredita entrega ni lectura.

## Cambio real en el CRM

El servidor arranca con PostgreSQL como almacenamiento transaccional. Historial, memoria, colas, recibos, controles, seguimientos y operaciones de agenda dejan de usar colecciones conversacionales de Firestore. Si falta la conexión, el esquema o una importación completa, el servidor se detiene: no vuelve silenciosamente a almacenar chats en Firebase.

Los mismos métodos del CRM continúan leyendo la conversación y enviando respuestas por el motor común. El vendedor y LOLA consultan el mismo historial SQL. En Instagram y Messenger los mensajes nuevos tienen un historial canónico SQL; el listado social conserva metadatos y consulta ese historial, evitando otra copia del texto por cada mensaje. No se borran copias históricas existentes durante esta migración.

La memoria corta entrega hasta 16 mensajes recientes, con hasta 600 caracteres de contexto por mensaje antiguo e indicación de recorte. El mensaje actual se envía aparte. El historial almacenado no se recorta por ese límite y permanece paginado en el CRM. La memoria larga conserva el perfil y las citas actuales, hasta 12 declaraciones del cliente y 16 referencias de temas con fecha; declaraciones y temas se usan durante 180 días. No se promete recordar literalmente toda frase antigua. La conversación interna del operador queda separada.

## Una autoridad de escritura y una vista comercial en Firebase

Para no perder una cita o un movimiento comercial al fallar una de las bases, el cambio comercial y el estado conversacional se confirman juntos en SQL. Por eso PostgreSQL conserva también los registros comerciales necesarios para esas transacciones; Firebase recibe su vista comercial sincronizada. Esto concreta y ajusta la propuesta anterior: Firebase no es un segundo escritor independiente de esos mismos registros.

Firebase sigue conservando clientes, unidades, cotizaciones, separaciones y configuración comercial, y recibe publicaciones, atribución e indicadores del dashboard. Se conservan Firebase y el mecanismo actual de autenticación. Los mensajes, sus transcripciones, la memoria, las colas y los recibos nuevos no se proyectan a Firebase.

La bandeja de sincronización guarda la última versión pendiente por registro, sin copiar otra vez el cuerpo completo. En Firebase se usa un pequeño marcador de versión para impedir que un reintento antiguo sobrescriba una versión posterior. Hay lecturas y escrituras de Firebase al sincronizar cambios comerciales; no se declara consumo cero para todo el CRM. Las consultas vacías de colas y las lecturas de memoria se realizan en PostgreSQL. El indicador `firebase_projection_pending` de `/api/health` señala un error de proyección detectado, no el recuento total de pendientes; `npm run postgres:check` muestra el número pendiente real.

Los escritores antiguos que actualicen directamente esos datos en Firebase deben detenerse o adaptarse al servidor nuevo. No se pueden mantener dos versiones escribiendo el mismo CRM. El caché público del servidor se actualiza a partir del estado SQL; la proyección a Firebase es eventual y se reintenta. Una caída de Firebase no vuelve a enviar mensajes ni recrea citas. Los controles de asesor, baja y permisos se comprueban en el estado transaccional actual.

## Conexión entre los dos alojamientos: pendiente antes de instalar

El host `postgres_infinity_postgres_infinity224` pertenece a la red interna del VPS. **No sirve como dirección de conexión desde Namecheap.** El paquete no crea esa conexión ni abre puertos.

La opción más sencilla de operar es situar el servidor del CRM junto al PostgreSQL del VPS y mantener su interfaz y dominio, resolviendo previamente la publicación HTTPS, el correo de acceso, archivos privados y el cambio de destino del dominio o del proxy. Ese traslado no se ha realizado ni debe confundirse con instalar el ZIP.

Si se mantiene el servidor del CRM en Namecheap, debe habilitarse y probarse una conexión privada supervisada o un acceso PostgreSQL con TLS verificado y acceso limitado al origen necesario. El mecanismo exacto depende de lo que permita ese alojamiento y del acceso de administración del VPS. No se ha verificado un túnel, una ruta de red ni las condiciones de un servicio persistente allí. No se ofrece un enlace privado ya configurado ni se publica 5432 a todos los orígenes.

No es necesario contratar Redis o Supabase para este cambio. El coste incremental depende de la carga, disco, tráfico, copias y administración de la capacidad existente; no se garantiza coste cero ni un total mensual sin medición.

## Instalación técnica una vez resuelta la conexión

1. Realizar copia del CRM, archivos privados y base PostgreSQL; verificar restauración. Las copias semanales visibles en Hostinger no prueban una copia consistente de PostgreSQL. No se cambia ni elimina el esquema original de Telegram.
2. Preparar un usuario de aplicación con acceso al esquema nuevo y un archivo privado que contenga la URL PostgreSQL, fuera de `dist` y de cualquier carpeta pública. No enviar contraseñas por chat ni incluirlas en el JSON n8n. Mantener la misma base `postgres_infinity` del nodo n8n.
3. Configurar `LOLA_POSTGRES_URL_FILE` con la ruta de ese archivo y `LOLA_POSTGRES_POOL_MAX=5`. El límite admitido es 1–10 conexiones por proceso; las conexiones de n8n cuentan aparte. Dentro del VPS la URL puede usar el host interno comprobado. Desde Namecheap debe usar la ruta privada o TLS que se haya validado, nunca ese nombre interno por suposición. Se mantienen las variables actuales APP_ORIGIN, OROK_PRIVATE_DIR, GOOGLE_APPLICATION_CREDENTIALS y las claves privadas de sesión del servidor; no están en el paquete.
4. Instalar las dependencias del servidor con `npm ci --omit=dev`. La interfaz `dist` ya está compilada. Las pruebas SQL usan PGlite como dependencia de desarrollo; no es otro servicio de producción.
5. Revisar `migrations/001-lola-postgres.sql`. Crea solo el esquema `lola_unified`, tablas, índices, secuencia y una función de lectura. No altera las tablas originales ni las internas de n8n. Instalar ese esquema con una conexión de administración controlada. Después puede ejecutarse `npm run postgres:preview`, que cuenta la importación sin copiar registros. Si el esquema aún no existe, la vista previa tolera ese caso y sigue siendo de solo lectura, pero requiere una conexión PostgreSQL válida.
6. Detener TODOS los escritores anteriores del CRM y los flujos que lo actualicen; conservar respaldo y archivos para conciliación. Ejecutar `npm run postgres:migrate` solo durante mantenimiento. Este comando incluye la instalación del esquema y la confirmación de que los escritores están detenidos. Importa las colecciones de ese proyecto de Firestore, con sus subcolecciones, sin borrar el origen; copia la configuración y marca listo solo al terminar. No importa cuentas de autenticación. Rechaza un destino ya inicializado. Una importación parcial se debe conciliar antes de repetir; no se limpia ni sobrescribe automáticamente.
7. Ejecutar `npm run postgres:check`. Si no termina correctamente, no arrancar la atención ni activar n8n. Comprobar el arranque del CRM nuevo y `/api/health`: versión 67.6.9 y `messaging_storage: postgresql`.
8. Importar `00-Lola-Unificado-67.6.9-INACTIVO.json` en n8n sin publicarlo. Verificar PostgreSQL, la URL HTTPS del CRM y las credenciales existentes de Google, modelo, catálogo y canales. El proyecto predeterminado del nodo es `infinity224`; si cambia, debe coincidir con OROK_PROJECT. Probar un trabajo reservado, un texto, un audio, una respuesta del vendedor, `/asesor` y una cita real de prueba con supervisión.
9. Verificar listas/Kanban, sincronización comercial en Firebase, conexión de WhatsApp, plantillas Meta, alertas internas, consentimiento y horarios de SLA, Calendar/Gmail/Meet, Drive y respaldo/restauración. Solo después activar el flujo común y deshabilitar los respondedores anteriores que pudieran duplicar respuestas.

El historial original de Telegram y las sesiones de `lola_telegram_ensayo_memory` siguen en sus tablas. La importación de Firestore no vincula esas sesiones a teléfonos por suposición. Conciliar identidad e importar ese historial continúa pendiente.

## Funciones preservadas y límites de la entrega

Se conservan el agendamiento desde texto/audio, propuestas y confirmación de día/hora, cancelación y reprogramación, invitaciones Calendar/email y asesorías WhatsApp/Meet; atención humana con /asesor interno, hasta tres seguimientos configurables según SLA y plantillas fuera de ventana; fuente IA LOLA autorizada y restricciones de precios/negociación; publicaciones y dashboard. Se conservan 912971742 como canal de ventas, avisos a 987208622 y 951532021 y ventas@orok.com.pe. Los demás pendientes de Meta, TikTok Messaging y envío/archivo de adjuntos de las entregas anteriores siguen vigentes.

## Verificación realizada

212 pruebas locales del conjunto seleccionado pasaron, cero fallos. Incluyen 19 pruebas del almacenamiento y migración con PostgreSQL embebido PGlite y una comprobación nueva del enrutamiento n8n, además de las 192 anteriores. Se ejecutó el SQL real localmente: transacciones y rollback, consultas parametrizadas, deduplicación, permisos del trabajo, memoria tras reinicio, recorte del contexto, asesor invisible, aislamiento, sincronización y reintentos, borrado comercial, importación y paginación. En una prueba de tráfico de chat y colas se observaron cero operaciones de Firebase; el adaptador de Firebase y los proveedores son simulados.

No se ha validado el controlador de red contra PostgreSQL desde Namecheap, la migración de datos reales, la restauración real ni la entrega real por WhatsApp/email/Calendar. Las cinco pruebas históricas de sockets excluidas por EACCES no cuentan como aprobadas. La interfaz compiló para producción con 1491 módulos y una advertencia no bloqueante de tamaño de paquete. La nueva interfaz no se ha probado visualmente en el alojamiento.

Referencias: [transacciones node-postgres](https://node-postgres.com/features/transactions), [PGlite](https://pglite.dev/docs/), [cuota y facturación Firestore](https://firebase.google.com/docs/firestore/pricing).

## Instrucción de entrega del usuario

Entregar archivos descargables; no sustituir todavía el CRM ni los workflows originales. La instalación, migración de datos y pruebas reales se harán posteriormente. Solo existe un borrador separado guardado en n8n, sin publicar ni ejecutar. Los originales no se sustituyeron.
