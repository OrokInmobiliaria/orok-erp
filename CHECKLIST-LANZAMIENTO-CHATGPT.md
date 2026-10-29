# Checklist de lanzamiento ERP ÖRÖK R42

28-oct-2026 · Martín Montezuma · Versión en línea (editable): https://claude.ai/artifact/M6fwQTGVHLXnSne665R5eu

## Cómo usar esta guía con ChatGPT

Copia esta guía completa en ChatGPT y pídele que te acompañe paso a paso. El objetivo es dejar el ERP ÖRÖK R42 (CRM con L.O.L.A + Marketing con G.R.E.T.A + Evaluador M.O.R.A + Contabilidad C.L.A.R.A + n8n) publicado y en operación sin perder datos del CRM vivo.

Instrucción sugerida para pegar al inicio:

```markdown
Actúa como mi asistente de despliegue del ERP ÖRÖK. Sigue esta lista de comprobación en orden, una casilla a la vez. Antes de cada paso dime qué voy a hacer, qué comando o pantalla usar y qué resultado esperar. No pases a la siguiente fase sin que yo confirme que la anterior quedó en OK. Nunca me pidas que pegue claves, contraseñas ni tokens en el chat. Si algo falla, detente y ayúdame a diagnosticar con el plan de vuelta atrás.
```

Reglas que ChatGPT debe respetar:

- **Datos primero:** el CRM tiene leads, comentarios y etapas del Kanban reales. Nada se publica en producción sin respaldo verificado y sin la verificación de después.
- **Secretos fuera del chat:** claves, contraseñas, tokens y URLs con secreto van solo en las variables del servidor, en el directorio privado o en las credenciales de n8n.
- **Flujos n8n inactivos:** se importan apagados y se activan uno por uno después de probarlos.
- **Migraciones solo aditivas:** si un script pide borrar o vaciar algo, se detiene.
- **La IA propone, Gerencia aprueba.**

Cómo reportar avance: marca cada casilla al terminarla y anota la hora de Lima y cualquier error textual en una línea.

## Qué trae el paquete y qué no

El paquete repositorio privado `Orokinmobiliaria/orok-erp` (rama `main`) contiene la versión vigente (R34 a R44, versión 67.6.28-r45, 603/603 pruebas). Los zips anteriores no hacen falta.

| Parte | Dónde está en el zip | Para qué |
| --- | --- | --- |
| CRM compilado | `dist/`, `src/`, `server.cjs`, `application.cjs` | Leads, Kanban y ventas con L.O.L.A |
| Marketing G.R.E.T.A | `business/greta.js`, `src/Greta.jsx`, `skills/greta-marketing/` | Tendencias, Estudio, Publicar, Pauta y KPIs (solo Gerencia) |
| Evaluador M.O.R.A | `evaluador/` | Factibilidad y riesgo (solo Gerencia) |
| Contabilidad y Finanzas C.L.A.R.A | `contabilidad/`, `business/clara*.js` | OC/OS con aprobaciones, pagos, bancos, presupuesto, obra, cobranzas, campanita |
| Flujos n8n | `n8n/` | L.O.L.A, M.O.R.A y C.L.A.R.A Drive contable (inactivos) |
| Skills | `skills/` | Reglas y procedimientos: contabilidad, entrega, n8n, producción, instalación, marketing (G.R.E.T.A) |
| Base de datos | `migrations/001..003` | Solo agregan tablas; no borran |
| Publicación | `Dockerfile`, `deploy/` | Respaldo, migraciones, verificación, códigos de instalación |
| Documentación | `LEEME-PRIMERO.txt`, `CAMBIOS-R34..R42`, `MIGRACION-R28-SIN-PERDIDA.md` | Qué cambió y cómo restaurar |
| Esta guía | `CHECKLIST-LANZAMIENTO-CHATGPT.md` | Paso a paso para dejarlo en operación |

No trae, a propósito (se configuran una vez en el servidor o en n8n):

- Conexión a PostgreSQL y variables del servicio.
- Cuenta de correo de salida @orok.com.pe y su clave de aplicación.
- `clara.json` (enlace ERP ↔ n8n para Drive), `lola-asistente.json` (proveedor de IA) y `greta.json` (proveedor de imágenes; se crea desde la pantalla).
- Credenciales de n8n: Google Drive, PostgreSQL, Anthropic/OpenAI/Gemini, Gmail, CRM.
- `node_modules` (el Dockerfile los instala).

## Fase 0 · Preparación (antes de tocar nada)

Objetivo: tener accesos, respaldos y variables listos para que el ensayo y la producción sean repetibles.

- [ ] Acceso al panel del host (Easypanel) con permiso para crear servicios y ver variables. Guía: [Easypanel docs](https://easypanel.io/docs).
- [ ] Acceso a n8n como administrador (crear credenciales e importar flujos).
- [ ] Acceso a la cuenta de Google que es Editora de las 3 carpetas Contabilidad (BMG, MZA, MAAS).
- [ ] Descargar `ERP-OROK-R41-JEFATURAS-PREPROD.zip` y verificar su integridad: dentro del zip, `sha256sum -c MANIFIESTO-SHA256.txt --quiet` no debe mostrar errores.
- [ ] Respaldo manual adicional de PostgreSQL de producción (`pg_dump`) guardado fuera del servidor, con fecha.
- [ ] Exportar desde n8n los flujos activos actuales (L.O.L.A vigente) como JSON de respaldo. Guía: [exportar e importar en n8n](https://docs.n8n.io/workflows/export-import/).
- [ ] Elegir ventana de mantenimiento (recomendado: noche o domingo) y avisar al equipo.

Variables del servicio (se definen en el panel del host, nunca en el código):

| Variable | Valor en producción | Nota |
| --- | --- | --- |
| `OROK_REHEARSAL` | `0` | El Dockerfile trae `1` (ensayo) por defecto |
| `OROK_PRIVATE_DIR` | Volumen persistente, p. ej. `/app/private` | Aquí viven `clara.json`, respaldos y códigos de instalación |
| `LOLA_POSTGRES_URL_FILE` | Ruta a un archivo con la cadena de conexión | No poner la cadena directo |
| `SESSION_SECRET_FILE` | Ruta a un archivo con 40+ caracteres aleatorios | El mismo que usa hoy el CRM |
| `APP_ORIGIN` | `https://<dominio del CRM>` | Con HTTPS |
| `OROK_PROJECT` | El mismo valor que hoy | No cambiarlo |
| `OROK_DEPLOY_HOOK_FILE` | Archivo con la URL del deploy hook (opcional) | Permite publicar con un comando |

- [ ] Confirmar con el valor actual del servicio vivo que `OROK_PROJECT`, `SESSION_SECRET_FILE` y la base son los mismos (si cambian, los usuarios pierden sesión o se apunta a otra base).

## Fase 1 · Ensayo en preproducción

Objetivo: probar R41 con una copia real de la base sin tocar el CRM vivo. Detalle en `ENSAYO-LEER-PRIMERO.md` y en la skill `erp-orok-entrega`.

1. Crear en el host un servicio nuevo de ensayo (no el de producción) con el código del zip y `OROK_REHEARSAL=1`.
2. Darle una base PostgreSQL de ensayo con una **copia** de la base de producción (restaurar el `pg_dump` de la Fase 0).
3. En la consola del servicio de ensayo: `npm run postgres:check` y luego `npm run migraciones` (solo revisa); si todo sale `ok`, `node deploy/aplicar-migraciones.cjs --aplicar`.
4. Abrir `https://<dominio de ensayo>/api/health` y confirmar `ok: true` y versión `67.6.28-r45`.

Comprobaciones en el ensayo:

- [ ] Ingresar como Gerencia: los leads, comentarios, etapas y el orden del Kanban son iguales a producción.
- [ ] Abrir el Evaluador (`?modulo=evaluador`) y Contabilidad (`?modulo=contabilidad`).
- [ ] En Contabilidad › Exportar e integrar, la skill aparece con versión y fuente «paquete».
- [ ] Crear una OC de prueba en BMG como Gerencia y aprobarla: pasa por Gerencia General y solo entonces permite el PDF.
- [ ] Revisar la campanita: muestra lo pendiente.
- [ ] Probar la app instalable en una PC o Mac con un código de instalación de prueba (Fase 5).
- [ ] Anotar cualquier error textual y resolverlo antes de pasar a producción.
- [ ] Al terminar, anular la OC de prueba (no se borra; queda anulada).

## Fase 2 · Producción con respaldo verificado

Objetivo: reemplazar solo el código del servicio vivo, conservando base, volumen privado y variables. Detalle en la skill `erp-orok-produccion`.

Antes (con la versión ACTUAL todavía corriendo, en mantenimiento):

- [ ] Confirmar en las variables del servicio de producción: `OROK_REHEARSAL=0` y el resto como en la Fase 0.
- [ ] Subir el código R41 al repositorio o fuente que usa el servicio (sin publicar todavía).
- [ ] En la consola del servicio: `npm run produccion:antes`. Debe terminar con «Respaldo verificado» y el número de leads. Si dice BLOQUEO, detenerse.
- [ ] Si las migraciones salieron `ok`: `node deploy/produccion.cjs antes --migrar` (solo agregan tablas).

Publicar:

- [ ] Pulsar «Deploy» en el host (o `node deploy/produccion.cjs antes --migrar --desplegar` si hay deploy hook).

Después (con R41 corriendo):

- [ ] `npm run produccion:despues`: espera `/api/health` con `67.6.28-r45` y compara la base con el respaldo. Debe decir «Actualización verificada: se conservaron leads, comentarios, etapas y orden del Kanban».
- [ ] Si dice VERIFICACIÓN FALLIDA: no usar; ir al plan de vuelta atrás.
- [ ] Ingresar como Gerencia y revisar 5 leads al azar (etapa, comentarios, posición en el Kanban).
- [ ] Salir del mantenimiento y vigilar 48 horas el registro `<OROK_PRIVATE_DIR>/deploy/produccion.log`.

## Fase 3 · Correo, usuarios y aprobaciones

Objetivo: que cada persona entre con su usuario, vea solo lo de su área y reciba los avisos de aprobación.

Correo de salida (avisos de aprobación):

- [ ] Abrir en el CRM Configuración › Ajustes del proyecto › Usuarios y contraseñas › «Conectar correo de aprobación». Es la misma cuenta que el CRM ya usa para enviar los códigos de validación de usuarios a soportetecnologico@orok.com.pe. Si dice que está conectada, no hay que hacer nada más.
- [ ] Solo si no está conectada: en la cuenta @orok.com.pe que enviará, activar la verificación en dos pasos, crear una [contraseña de aplicación de Google](https://myaccount.google.com/apppasswords) de 16 caracteres y cargarla ahí (servidor `smtp.gmail.com`, puerto 465). El CRM la guarda cifrada en el servidor.

Usuarios del CRM (Configuración › Usuarios, como Gerencia). Crear los que falten, con nombre y apellido exactos:

| Persona | Nombre del usuario | Rol en el CRM | Área en el ERP | Correo de avisos | Elabora en |
| --- | --- | --- | --- | --- | --- |
| Martín Montezuma | Martín Montezuma | Gerente | Gerencia · Gerencia General | mmontezuma@orok.com.pe | BMG, MZA, MAAS |
| César Dávalos | César Dávalos | Vendedor (por ahora) | Obra · Gerencia de Operaciones | cdavalos@orok.com.pe | BMG, MZA, MAAS |
| Fernando Amiquero | Fernando Amiquero | Vendedor (por ahora) | Proyectos · Jefe de Proyecto | teoc151@gmail.com | BMG, MZA |
| Antonio Garcés | Antonio Garcés | Vendedor | Ventas | ventas@orok.com.pe | BMG, MZA, MAAS |
| Carla García | Carla García | Vendedor (por ahora) | Marketing | kkmgledesign@gmail.com | BMG, MZA, MAAS |

- [ ] Entregar a cada persona su contraseña temporal por un canal privado. En su primer ingreso el CRM le pide un código de validación que llega a soportetecnologico@orok.com.pe; soporte se lo entrega y luego cambia su contraseña.
- [ ] En Contabilidad › Aprobaciones › Equipo definido en la skill, pulsar «Vincular con los usuarios del CRM». Todos deben quedar «Vinculado». Si tu usuario se llama solo «Martín», agrégate con «Agregar persona».
- [ ] Revisar la tabla «Reglas de aprobación vigentes»: ningún cargo debe decir «sin asignar» (salvo el Jefe de Obra, que es por obra).
- [ ] En Proyectos, registrar las obras y proyectos activos de cada empresa con su tipo; en cada obra de MAAS que empiece, asignar su Jefe de Obra (debe estar habilitado en Aprobaciones).

Advertencia: con rol Vendedor, César, Fernando y Carla también ven los leads del CRM. Si no debe ser así, pedir la versión con el rol «Colaborador ERP» antes de entregarles accesos.

Cadenas que deben verse:

| Quién elabora | MAAS · obra o construcción | MAAS · consultoría o asesoría | BMG / MZA |
| --- | --- | --- | --- |
| Cualquier área | Jefe de Obra → G. Operaciones → G. General | G. Operaciones → G. General | G. General |
| Gerencia (Martín o César) | G. Operaciones → G. General | G. Operaciones → G. General | G. General |

## Fase 4 · Google Drive y n8n

Objetivo: que n8n guarde y lea los documentos de la carpeta Contabilidad de cada empresa sin reconexiones manuales, y que L.O.L.A, M.O.R.A y C.L.A.R.A queden activos. Detalle en la skill `erp-orok-n8n` y en `LEEME-CLARA-DRIVE-R34.md`.

Google (una sola vez):

- [ ] En Google Cloud, pantalla de consentimiento OAuth en modo **Interna** (Workspace) o **En producción**; en modo Prueba el token vence a los 7 días: [pantalla de consentimiento](https://console.cloud.google.com/apis/credentials/consent).
- [ ] Habilitar la API de Google Drive: [Drive API](https://console.cloud.google.com/apis/library/drive.googleapis.com).
- [ ] Crear el cliente OAuth (aplicación web) con la URL de redirección que muestra n8n: [credenciales de Google en n8n](https://docs.n8n.io/integrations/builtin/credentials/google/oauth-single-service/).

Carpetas Contabilidad (la cuenta que conecta n8n debe ser Editora de las tres):

| Empresa | ID de carpeta |
| --- | --- |
| BMG | `1RqRBLFGervdPIjOHGfbA2kWUeFRHUjKY` |
| MZA | `1eOPFAhtYW6L-lkSRrnOruhBrAED3VEJ0` |
| MAAS | `17Kb4z3EmySjkiBvBpMLkxlFrlFvj4HY6` |

n8n:

- [ ] Crear las credenciales en n8n: Google Drive OAuth2 (un solo inicio de sesión), PostgreSQL, Anthropic (lectura de facturas), proveedores de L.O.L.A (OpenAI/Gemini, Gmail, Calendar, Sheets) y Header Auth para los webhooks.
- [ ] En la base de n8n, aplicar `migrations/003-clara-postgres.sql` (tabla `clara.bandeja`; solo agrega).
- [ ] En una copia del paquete: `npm run n8n:auditar`. Anotar bloqueos; el de zona horaria vacía de L.O.L.A se corrige al preparar.
- [ ] Copiar `n8n/produccion-mapa.ejemplo.json` a `n8n/produccion-mapa.json` y completar hosts de producción y nombre/ID de cada credencial (sin claves).
- [ ] `npm run n8n:preparar` → genera `n8n/produccion/*-PRODUCCION-*-INACTIVO.json` y `AUDITORIA-N8N.md`; los tres deben decir «LISTO para importar (inactivo)».
- [ ] Importar los tres JSON en n8n como flujos nuevos, sin activar. Desactivar (no borrar) las versiones anteriores.
- [ ] Copiar la URL del webhook «04» del flujo C.L.A.R.A y su secreto de Header Auth.
- [ ] En el servidor del ERP, crear `<OROK_PRIVATE_DIR>/clara.json` (permisos 600) siguiendo `docs/clara.json.ejemplo`: `drive_webhook_url`, `drive_webhook_secret` (24+ caracteres) y `drive_webhook_header`.
- [ ] Ejecutar a mano «01 Preparar carpetas» y «01b Inventario» del flujo C.L.A.R.A; revisar que creó las carpetas 01 a 08 sin borrar nada.
- [ ] Probar: subir una factura PDF de prueba a «01 Entrada» de BMG y ver que aparece en Contabilidad › Bandeja de Drive.
- [ ] Activar en este orden, vigilando 24 horas cada uno: C.L.A.R.A → M.O.R.A → L.O.L.A.

## Fase 4b · Marketing con G.R.E.T.A

Objetivo: dejar el módulo Marketing operativo para Gerencia. Detalle en la skill `greta-marketing` y en `CAMBIOS-R42-MARKETING-GRETA-2026-10-28.md`.

- [ ] Entrar como Gerencia → selector superior «Marketing». Ver Hoy, Crear, Publicar, Medir y Marca. En «CRM Inmobiliario» ya no aparece Marketing.
- [ ] En Marketing aparece el botón flotante «G.R.E.T.A» (como L.O.L.A en el CRM, M.O.R.A en el Evaluador y C.L.A.R.A en Contabilidad): abrirlo, preguntar por escrito o por voz y recibir respuesta.
- [ ] Confirmar que L.O.L.A tiene proveedor y clave activos (G.R.E.T.A usa el mismo). Para tendencias con búsqueda web, el proveedor debe ser Claude o Gemini.
- [ ] Crear › Tendencias › «Actualizar radar»: aparecen tendencias con fuentes. «Crear alternativas» abre la campaña en Estudio con su propuesta.
- [ ] Marketing › Marca › G.R.E.T.A: proveedor OpenAI, pegar la clave en el campo (no en el chat), activar y guardar. La clave queda en el servidor y la pantalla solo dice «Guardada». Crear la clave en [OpenAI › API keys](https://platform.openai.com/api-keys); la organización puede requerir verificación para `gpt-image-1`.
- [ ] Estudio › Recursos: crear una imagen y editar una foto propia; deben quedar marcadas «referencial».
- [ ] Aprobar una campaña de prueba, exportar una pieza y en Publicar usar «Descargar para editar».
- [ ] Opcional (borradores automáticos): en el flujo de publicación de n8n, agregar las ramas de TikTok (Content Posting API, envío a la bandeja/borradores) y Facebook (publicación con `published: false`) y enviar `soporta_borrador: true` en «Tomar publicación pendiente en CRM». Sin esto, los borradores esperan en la cola y no se pierden. Referencias: [TikTok Content Posting API](https://developers.tiktok.com/doc/content-posting-api-get-started), [Facebook Pages API](https://developers.facebook.com/docs/pages-api/posts).
- [ ] En el flujo L.O.L.A de n8n, incluir `memoria.marketing` (campañas vigentes) en el prompt para que responda en línea con el anuncio.
- [ ] Medir › Pauta y KPIs: tras sincronizar el reporte de Meta y TikTok, la tabla muestra costo por lead y por cita del CRM.
- [ ] Estudio › Recursos › «Armar piezas»: G.R.E.T.A asigna una foto o clip a cada escena; con la casilla marcada, genera las imágenes que falten como «referencial».
- [ ] Marca › G.R.E.T.A: escribir el enlace https de la política de privacidad y el WhatsApp de ventas (con 51). Los usan todos los formularios.
- [ ] Crear › Formularios: «Redactar formulario», editar los textos con la vista previa, Guardar y Aprobar. Con TikTok: «Descargar ficha» y copiarla en [TikTok Ads Manager](https://ads.tiktok.com/).
- [ ] Formularios en Meta (opcional, para crearlos solos): en la app de Meta del negocio, token de página con permisos `pages_manage_ads`, `leads_retrieval`, `pages_read_engagement` y `pages_show_list` ([formularios de clientes potenciales](https://developers.facebook.com/docs/marketing-api/guides/lead-ads/create)). En n8n crear la credencial «Facebook Graph API» con ese token (no en el chat).
- [ ] Importar `n8n/GRETA-R43-FORMULARIOS-META-ENSAYO-INACTIVO.json` inactivo; en el nodo «Configuración» poner el ID de la página; en los nodos del CRM, el host y la credencial del CRM de ese entorno.
- [ ] Prueba: aprobar un formulario de ensayo → «Crear en Meta» → ejecutar el flujo a mano → el ERP muestra «En Meta» con su ID. Si Meta rechaza, el formulario vuelve a «Error de Meta» con el motivo. Archivar el de ensayo.
- [ ] Prueba de lead: con la [herramienta de prueba de anuncios para clientes potenciales](https://developers.facebook.com/tools/lead-ads-testing) enviar un lead de ese formulario; en el CRM entra con las respuestas como comentario y aparece en Pauta y KPIs › Formularios. En ensayo, agregar el ID del formulario a los formularios de prueba permitidos de Meta en el CRM.
- [ ] Recordar: un formulario ya creado en Meta no se edita. Se usa «Nueva versión»; al crearla, la anterior se archiva sola.

## Fase 4b2 · L.O.L.A Operaciones: que no se pierda nada

Objetivo: copia cifrada de todo el ERP fuera del VPS de Hostinger y aviso si algo se cae.

- [ ] Google Drive de la empresa: crear (o elegir) una carpeta «Respaldos ERP», idealmente en una unidad compartida. Compartirla como Editor con el correo de la cuenta de servicio del ERP (el `client_email` del archivo de credenciales de Google del servidor; no pegarlo completo en chats).
- [ ] CRM › Configuración › L.O.L.A Operaciones › «Generar llave de los respaldos» → «Descargar llave privada». Guardarla en dos lugares (USB y gestor de contraseñas de la empresa). El ERP no la conserva: sin ella no se abren los respaldos.
- [ ] Pegar el enlace de la carpeta de Drive y la dirección de n8n → Guardar → «Activar resguardo» → «Resguardar ahora». Debe decir «en Drive» y mostrar los conteos de leads y comentarios.
- [ ] Al día siguiente: «Verificar copia en Drive» debe decir que coincide.
- [ ] Prueba de apertura (una vez al mes): en una PC, con la llave privada, `node deploy/restaurar-resguardo.cjs --llave llave.pem --archivo respaldo.orokbak --salida carpeta-nueva`. Comparar los conteos con el ERP. Nunca restaurar sobre la base vigente.
- [ ] Vigilancia externa: en GitHub › Settings › Secrets and variables › Actions › Variables, crear `ERP_URL` y `N8N_URL`. En la pestaña Actions, ejecutar «Vigilancia ERP ÖRÖK» una vez a mano. Activar los avisos de correo de GitHub (Watch › All activity, o Settings › Notifications › Actions).
- [ ] Hostinger: activar las copias automáticas del VPS y tomar una instantánea antes de cada actualización grande (protege también a n8n y a su base, que viven en el mismo VPS).

## Fase 4c · Conector del ERP para Claude

Objetivo: que Claude (app de escritorio o claude.ai) consulte el ERP con los permisos de quien lo conecta. Requiere HTTPS en el dominio del ERP.

- [ ] Como Gerencia: CRM › Configuración › Conexiones de IA › activar el conector. Copiar la URL que muestra (termina en `/mcp`).
- [ ] En Claude: Configuración › Conectores › «Agregar conector personalizado» → nombre «ERP ÖRÖK» y la URL copiada → «Conectar».
- [ ] Se abre la página del ERP: si pide sesión, iniciar sesión en el ERP en otra pestaña y pulsar «Ya inicié sesión»; luego «Permitir».
- [ ] Probar en un chat: «¿Cuántos leads nuevos hay esta semana?» y «¿Qué órdenes me toca aprobar?».
- [ ] Verificar en Conexiones de IA que aparece la conexión y la actividad. «Cortar conexión» la invalida al instante; apagar el conector corta todas.
- [ ] Recordar: Claude no aprueba órdenes ni campañas, no paga, no borra y no mueve etapas. Solo consulta, agrega comentarios firmados y prepara borradores.

## Fase 5 · App instalable y códigos de instalación

Objetivo: usar el ERP en el navegador con usuario y contraseña, o instalarlo en PC, Mac o celular con un código que solo existe en el servidor. Detalle en la skill `erp-orok-instalacion`.

- [ ] Confirmar que el dominio tiene HTTPS (la instalación y las cookies seguras lo requieren).
- [ ] Como Gerencia: Contabilidad › Equipos instalados › «Generar código» (24 horas, 1 equipo, con el nombre de la persona). El código se muestra una sola vez.
- [ ] Entregar el código en persona o por mensaje privado (nunca en grupos ni en un chat con IA).
- [ ] En el equipo: abrir el dominio en Chrome o Edge → «Instalar» (Mac con Safari: Archivo › Agregar al Dock; iPhone: Compartir › Agregar a inicio; Android: menú › Instalar app).
- [ ] Al abrir la app instalada, «Registrar este equipo» con el código, y luego entrar con usuario y contraseña.
- [ ] Verificar en Equipos instalados que el equipo aparece «Activo». Un equipo perdido se revoca ahí mismo.
- [ ] Comprobar la actualización automática: tras la próxima publicación, la app instalada muestra «Actualizar ahora».

## Fase 6 · Pruebas de aceptación y salida en vivo

El ERP queda lanzado cuando todas estas pruebas salen bien en producción:

- [ ] **CRM intacto:** un lead nuevo de L.O.L.A entra al Kanban; los comentarios y etapas de leads antiguos siguen iguales.
- [ ] **Orden de un área en MAAS (obra):** Antonio crea una OC con proyecto de obra → la aprueban el Jefe de Obra, luego César y luego Martín; cada uno recibe su correo cuando le toca; Antonio recibe «Orden aprobada».
- [ ] **Orden de Gerencia en MAAS:** César crea una OC de obra → solo César (G. Operaciones) y Martín aprueban; dice «elaborada por Gerencia».
- [ ] **Orden en BMG o MZA:** la aprueba solo Martín.
- [ ] **Observar:** Martín observa una orden → vuelve a borrador con el motivo y llega el correo a quien la elaboró.
- [ ] **Bloqueo de emisión:** una orden sin todas las aprobaciones muestra «NO EMITIDA» y no permite PDF, correo al proveedor ni Drive.
- [ ] **Permisos:** Fernando no puede crear órdenes de MAAS; Antonio no ve pagos ni bancos.
- [ ] **Campanita:** cada aprobador ve su pendiente; Gerencia ve también alertas de pagos y cobros.
- [ ] **Drive:** el PDF de una orden aprobada se guarda en «03 Órdenes OC-OS/AAAA-MM» de su empresa.
- [ ] **Control de obra y cobranzas:** registrar una valorización de prueba y un hito de cobro en un proyecto real; luego anularlos.
- [ ] **Contadora:** Lleny recibe el paquete Excel del mes y confirma los porcentajes de detracción (4 % construcción, 12 % servicios).
- [ ] **Marketing:** una tendencia se convierte en campaña con propuesta; una imagen IA sale «referencial»; Publicar descarga el paquete; un vendedor no ve el módulo Marketing.
- [ ] Anular las órdenes de prueba y anotar fecha y hora de Lima del lanzamiento.

## Vuelta atrás, enlaces y pendientes

Si algo sale mal en producción:

1. No borrar nada. Volver en el host a la imagen o versión anterior (la base no cambió: las migraciones solo agregan).
2. Si la verificación mostró diferencias en leads o Kanban, restaurar por id desde el respaldo con `MIGRACION-R28-SIN-PERDIDA.md` (nunca borrar leads posteriores sin autorización).
3. En n8n, desactivar el flujo nuevo y reactivar el anterior.
4. Anotar el error textual y la hora para diagnosticarlo.

Enlaces útiles:

- [Easypanel: documentación](https://easypanel.io/docs)
- [n8n: exportar e importar flujos](https://docs.n8n.io/workflows/export-import/)
- [n8n: credenciales de Google (OAuth)](https://docs.n8n.io/integrations/builtin/credentials/google/oauth-single-service/)
- [Google Cloud: pantalla de consentimiento OAuth](https://console.cloud.google.com/apis/credentials/consent)
- [Google Cloud: API de Google Drive](https://console.cloud.google.com/apis/library/drive.googleapis.com)
- [Google: contraseñas de aplicación](https://myaccount.google.com/apppasswords)
- Carpetas Contabilidad: [BMG](https://drive.google.com/drive/folders/1RqRBLFGervdPIjOHGfbA2kWUeFRHUjKY) · [MZA](https://drive.google.com/drive/folders/1eOPFAhtYW6L-lkSRrnOruhBrAED3VEJ0) · [MAAS](https://drive.google.com/drive/folders/17Kb4z3EmySjkiBvBpMLkxlFrlFvj4HY6)

Pendientes conocidos (no bloquean el lanzamiento de Gerencia):

- [ ] Rol «Colaborador ERP» para que las áreas no vean los leads (recomendado antes de dar acceso a César, Fernando y Carla).
- [ ] Logo y color de MAAS para el formato de las órdenes.
- [ ] Confirmación de la contadora sobre detracciones y retenciones.
- [ ] Registrar los proyectos de MZA y MAAS en Proyectos con su tipo y fase.
