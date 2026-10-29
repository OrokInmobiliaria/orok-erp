# Memoria de cambios · LOLA CRM 67.6.17-r32c (incluye R29, R30, R31 y R32)

Base: `LOLA-CRM-67.6.11-r28-PREPROD-FINAL-20261024.zip`. Esta versión es **solo para ensayo (preproducción)**. No reemplaza a R28 ni toca su producción.
Flujo n8n base: `LOLA-N8N-VIGENTE-20261024.json` (84 nodos), entregado como copia **inactiva** con 6 nodos nuevos.

## 1. Qué se añadió

| # | Módulo | Qué hace | Quién lo usa |
|---|--------|----------|--------------|
| M1 | Marca multiproyecto en Campañas IA | Registra uno o más proyectos (empresa, proyecto, dirección, color). Cada campaña toma su proyecto: el prompt de Claude, las plantillas de piezas y los nombres de archivo ya no están fijos a Infinity 224. Campo opcional "línea de negocio" (hoy: `venta_departamentos`; deja la puerta abierta a construcción y diseño). Botón **Sugerir hechos del inventario**: arma hechos con unidades `AVAILABLE` (cantidad por tipo y rango de m² techados), sin precios; Gerencia los revisa y confirma. | Gerencia |
| M2 | Resumen diario de gestión | n8n pide al CRM, a las 7:30, un resumen y lo envía por Gmail: visitas de hoy, leads sin gestión +24 h, citas pasadas sin resultado, seguimientos vencidos, leads con interés alto, recomendaciones y campañas pendientes. Sin teléfonos, DNI ni correos de clientes. Un envío por día (el CRM registra la confirmación). | Gerencia (configura correos) |
| M3 | Puntaje de interés del lead | Puntaje 0–100 por reglas, sin IA: etapa alcanzada + señales registradas (presupuesto, horizonte, cita agendada, evaluación financiera, cotización, actividad reciente; resta por inasistencia, rechazo, inactividad). Insignia en la tarjeta del tablero y detalle de motivos en la ficha. No se guarda, no mueve ni descarta leads. No usa datos personales ni sensibles (probado). | Quien ya ve el lead |
| M4 | Variantes A/B por anuncio | Se vincula cada anuncio (ID de Meta/TikTok) con una pieza de la campaña y una etiqueta A–D. Reporte por variante: inversión, leads del CRM, citas, costo por lead. Sin ganador si alguna variante tiene menos de 10 leads o la diferencia es menor a 25 %. | Gerencia |
| M5 | Recomendaciones de presupuesto | A pedido, sobre el período elegido: por anuncio sugiere aumentar, mantener o reducir, con tope de 20 %, mínimo de inversión (100) y de leads (8). Gerencia aprueba o rechaza con nota; queda registrado. **No cambia nada en Meta ni TikTok.** | Gerencia |

No incluidos (decisión acordada): plan exacto por WhatsApp, reseñas, carruseles, voz.

## 2. Archivos

Nuevos: `business/budgetAdvisor.js`, `business/dailyBrief.js`, `business/marketingAssistant.js`, `src/leadScore.mjs`, `src/LeadScoreBadge.jsx`, `src/MarketingAssistant.jsx`, `scripts/build-r30-n8n.py`, `n8n/LOLA-ENSAYO-67.6.13-r30-MARKETING-CONEXIONES-INACTIVO.json`, y tres archivos de pruebas `tests/r29-*.test.cjs`.
Modificados: `business/whatsappGateway.js` (una condición), pruebas existentes corregidas (7 archivos), `application.cjs`, `server.cjs` (solo versión), `package.json`/`package-lock.json` (versión), `business/creativeCampaigns.js`, `src/App.jsx`, `src/LeadLifecycle.jsx`, `src/CampaignStudio.jsx`, `src/creativeRenderer.mjs`, `src/cloudBridge.js`, `src/dataService.js`.

## 3. Interfaz con n8n y el servidor
- Acciones nuevas en `/api/integrations/lola` (misma clave `x-orok-webhook-secret`): `daily_brief_get`, `daily_brief_confirm`.
- Llamadas nuevas de pantalla (solo rol Gerente; el vendedor recibe rechazo): `getCreativeBrand`, `saveCreativeBrand`, `getCreativeFactCandidates`, `getVariantReport`, `linkCreativeVariant`, `unlinkCreativeVariant`, `getBudgetRecommendations`, `createBudgetRecommendation`, `decideBudgetRecommendation`, `getDailyBriefConfig`, `saveDailyBriefConfig`, `previewDailyBrief`.
- Datos nuevos (aditivos, sin migración SQL): colecciones `creative_variants`, `budget_recommendations`, `daily_briefs`; archivos privados `creative-brand.json` y `daily-brief.json`. No se alteró ninguna tabla ni documento existente.
- Permisos: no se cambió ningún rol. Las llamadas nuevas están dentro del mismo control `Gerente` de las de campañas.
- `document_version` de separaciones **no** se tocó (sigue `67.6.11-r28` en el chequeo de documentos).

## 4. Flujo n8n (copia inactiva)
Se agregaron al final del lienzo: nota explicativa, **Resumen diario de gestión · 7:30** (cron `30 7 * * *`) → **Preparar resumen diario en CRM** → **¿Corresponde enviar el resumen?** → **Enviar resumen diario por correo** (Gmail, credencial existente) → **Confirmar envío del resumen**. Si Gmail falla no se confirma, y un nuevo intento del mismo día reenvía. Los 84 nodos originales y sus conexiones son idénticos al archivo de partida (verificado por el script). Se quitó el `id` y quedó `active:false`: al importar crea un flujo nuevo.

## 5. Verificación realizada
- Pruebas nuevas: 15 (puntaje 7, marca 3, asistente 5), todas pasan. Pruebas de campañas existentes: 20 pasan.
- Suite completa: 450 pruebas, **450 pasan**. Las 8 que fallaban ya en R28 se corrigieron (ver sección 5.1).
- `npm run build` correcto; `dist/` incluido.

### 5.1 Corrección de las 8 pruebas que fallaban desde R28
Siete eran pruebas desactualizadas frente a reglas que R28 sí implementó; una requirió un ajuste mínimo de código.
| Prueba | Causa | Corrección |
|---|---|---|
| connection_check; protocolo unificado | esperaban versión fija `67.6.0`/`67.6.10` | ahora comparan con la versión de `package.json` |
| Formularios Meta en español | el CRM guarda el teléfono normalizado (`51955318057`) | la prueba espera el formato normalizado |
| Chat social en SQL; protocolo unificado (2) ; leadgen nativo | en ensayo, contactos y formularios fuera de la lista de prueba se ignoran | las pruebas declaran el contacto y el formulario de prueba |
| Callbacks de Instagram | el CRM ahora crea un lead para el contacto de prueba | la prueba verifica que los leads existentes no cambian y que se crea uno solo (sin duplicados) |
| Audio (2 pruebas) | dependían de que el servidor no tuviera FFmpeg; aquí sí lo tiene y se detecta solo | `whatsappGateway.js`: la detección automática de `/usr/bin/ffmpeg` solo aplica si `ffmpegPath` no está definido; una ruta vacía explícita la desactiva. Las pruebas la fijan vacía. Sin efecto en producción si no se configura la ruta. |
Solo se modificó un archivo de código fuente por esto (`business/whatsappGateway.js`, una condición).

## 6. Límites y pendientes
1. Nada se probó con Meta, TikTok, Claude ni Gmail reales; solo con simulaciones. Primero ensayo.
2. Las llamadas a Claude siguen sujetas a la configuración existente (clave, modelo, límites por hora).
3. Quedan textos fijos de Infinity 224/ÖRÖK fuera del estudio de campañas (documentos legales, identidad de LOLA, cotizaciones). El cambio multiproyecto cubre marketing, no esos textos.
4. La atribución A/B depende de que el lead llegue con el ID del anuncio; sin él, no se vincula a la variante.
5. Un costo por lead menor no prueba más ventas: validar con citas y ventas antes de escalar.
6. Verifica la zona horaria de n8n (America/Lima) antes de activar el cron de 7:30.
7. No se transcribió el audio del video de referencia; el análisis se basó en imágenes y subtítulos.

## 7. Puesta en marcha en ensayo
1. Respaldar la base y los archivos privados como indica `MIGRACION-R28-SIN-PERDIDA.md`.
2. Desplegar este zip (`Dockerfile` sin cambios; `npm ci --omit=dev`; el `dist/` ya viene construido).
3. Comprobar `/health` → versión `67.6.17-r32c`.
4. En Campañas IA: guardar los proyectos y crear una campaña de prueba.
5. En Asistente de marketing: configurar el correo y pulsar **Ver resumen de hoy**.
6. Importar el JSON de n8n, asignar credenciales, ejecutar manualmente una vez y recién entonces activar.
7. Para volver atrás: restaurar R28 y su respaldo; los datos nuevos son aditivos.

---
# PARTE R30 · Módulos que faltaban, listos para conectar

Esta parte añade lo pendiente del alcance de marketing. Lo que depende de servicios externos queda **construido, probado con simulaciones y APAGADO**: sin claves, sin conexión y sin que el CRM publique o llame a nadie por sí mismo.

## R30.1 Qué se resolvió

| Punto del alcance | Estado en R30 |
|---|---|
| Carruseles | **Resuelto.** Nuevo formato "Carrusel" de 2 a 10 láminas con las mismas reglas (sin precios, ofertas ni datos sin respaldo). Vista previa por lámina y exportación de todas las láminas como PNG a la campaña. |
| Biblioteca de marca | **Resuelto en texto, parcial en archivos.** Por proyecto: empresa, dirección, color, **tono de voz, palabras prohibidas y hashtags**. Claude los recibe y el CRM rechaza piezas con palabras prohibidas. **Falta** guardar logotipos y tipografías (no hay almacén de archivos de marca). |
| Subtítulos | **Resuelto.** Botones SRT y VTT para reels e historias, generados desde la narración (o el texto en pantalla) y la duración de cada escena. |
| Voz | **Listo para conectar.** Cola en el CRM + flujo n8n con un único nodo `CONECTAR · Generar voz con el proveedor`. El MP3 vuelve como recurso "Voz IA · …" de la campaña. |
| Publicación | **Listo para conectar.** Cola con fecha, canal y variante A–D; solo campañas aprobadas y piezas exportadas sin borrador; modo ensayo; límite diario; cancelación. Nodo `CONECTAR · Publicar en Meta o TikTok`. Publica la pieza **orgánica**; el **anuncio pagado** se sigue creando en el administrador de anuncios y su ID se vincula en Variantes A/B. |
| Pruebas A/B | Medición (R29) + la publicación puede llevar la etiqueta de variante. No crea anuncios pagados. |
| Retroalimentación automática | **Listo para conectar (CRM + n8n, sin claves externas).** Cada N días crea campañas nuevas en **borrador** desde las campañas base, con métricas recientes, y solicita propuesta a Claude. No aprueba ni publica. Requiere Claude habilitado en el CRM. |

## R30.2 Interruptores (todo apagado)
Pantalla: Campañas > Asistente de marketing > "Conexiones: voz, publicación y ciclo". Archivos privados que se crean al guardar: `voice-provider.json`, `publishing.json`, `creative-cycle.json`, `creative-brand.json`. Sin estos archivos o con `enabled:false`, las colas rechazan solicitudes y entregan "sin trabajo" a n8n.

## R30.3 Nodos n8n nuevos (inactivos; flujo total 110 nodos)
- Voz: cron cada 2 min → tomar trabajo → ¿hay? → **CONECTAR proveedor** → preparar audio → entregar al CRM (cabecera `x-orok-payload: audio`, límite 12 MB) / aviso de fallo.
- Publicación: cron cada 5 min → tomar trabajo → traer archivo → ¿ensayo? → confirmar, o **CONECTAR red social** → confirmar / aviso de fallo.
- Ciclo: cron lunes 9:00 → pedir al CRM el ciclo.
- Los 84 nodos originales y las conexiones previas son idénticos (el script lo verifica). Las URLs de los nodos CONECTAR terminan en `.invalid`: no resuelven hasta que las cambies.

## R30.4 Lista para conectar (lo que debes aportar)
1. **Voz:** cuenta con un proveedor de voz; en n8n crea su credencial; en el nodo CONECTAR pon la URL y el cuerpo que pida el proveedor (devuelve MP3). Activa "Voz" en el CRM.
2. **Meta (Facebook/Instagram):** app de Meta con permisos de publicación en la página o cuenta de Instagram profesional, y token de larga duración en una credencial de n8n. La revisión de la app de Meta es un trámite tuyo ante Meta.
3. **TikTok:** acceso a la API de publicación de contenido (requiere aprobación de TikTok) y su token en n8n.
4. **Ciclo:** Claude habilitado y con clave en el CRM (ya existente); elegir campañas base.
5. Probar en este orden: modo ensayo de publicación → una voz → una publicación real en una cuenta de prueba → recién entonces producción.

## R30.5 Verificación R30
- Pruebas nuevas: 5 (biblioteca y carrusel) + 6 (voz, publicación, ciclo, permisos) + 1 (subtítulos). Suite completa **462/462**.
- Compilación correcta. Permisos: las 10 llamadas nuevas exigen rol Gerente; las acciones de n8n exigen la clave de integración.
- Cambios de servidor: la acción de voz acepta cuerpos de hasta 12 MB solo con la cabecera `x-orok-payload: audio` y clave válida; el resto sigue en 256 KB.

## R30.6 Límites
- Nada se probó con proveedores reales, Meta, TikTok ni Claude. Las pruebas usan simulaciones.
- Las pantallas nuevas (carrusel, biblioteca, conexiones) compilan y su lógica está probada, pero **no se vieron en un navegador**: revísalas en ensayo.
- La exportación de carruseles se apoya en el lienzo del navegador, como los reels; probar en Chrome.
- Logotipos y tipografías de marca: pendiente (R31).
- Un ciclo automático gasta llamadas a Claude (hay un tope de 3 propuestas por hora por campaña).

---
# PARTE R31 · Panel tipo Power BI, menú de Marketing, look cristal y exportación desde el Kanban

## R31.1 Qué cambió
| Pedido | Qué se hizo |
|---|---|
| Dashboards estilo Power BI | Nuevo **Panel de control** (pestaña Inicio): barra de filtros (período rápido 7/30 días, mes, 90 días, año, todo; fechas; fuente; proyecto; responsable; campaña), 8 indicadores con variación contra el período anterior, tendencia semanal de leads y citas con lectura al pasar el cursor, embudo con % por paso, leads por fuente, citas y ventas por responsable, matriz fuente × etapa, inventario y tabla de campañas con inversión y CPL. **Filtro cruzado:** al tocar una barra, una etapa o una fila, todo el panel se filtra; los filtros activos aparecen como fichas que se quitan con un toque. Cada gráfico tiene "Ver tabla" y se puede exportar CSV. La vista anterior sigue disponible con "Vista clásica". |
| Más partes de Marketing en el menú | Menú agrupado en 4 secciones: **Inicio, Ventas, Marketing, Configuración**. Marketing tiene ahora entradas propias: Rendimiento, Campañas IA, Biblioteca de marca, Variantes A/B, Presupuesto, Publicación y voz, Resumen diario y Gastos. |
| Web y celular | En celular: barra inferior de cristal (Inicio, Leads, Marketing, Más), hoja deslizante con todas las secciones, filtros del panel plegables, gráficos que se ajustan al ancho y botones de al menos 44 px. |
| Look "crystal clear" | Archivo `src/theme.css`: menús, ventanas, panel de exportación, barra móvil y hojas con fondo translúcido y desenfoque; velo suave detrás de las ventanas; radios, sombras y botones unificados; interruptores tipo iOS; foco visible con teclado; respeta "reducir movimiento". Si el navegador no soporta desenfoque, usa fondo blanco sólido. |
| Exportar leads desde el Kanban | Botón **Exportar leads**: elige "Lo que veo" (grupo y búsqueda actuales) o "Todos", y descarga **Excel (.xlsx real, encabezado fijo y filtros)** o **CSV**, o envía a **Google Sheets** (crea una pestaña nueva con fecha y hora en la hoja que indiques). |

## R31.2 Decisiones de seguridad
- La exportación es **solo para Gerencia** y cada una queda registrada (quién, cuándo, cuántos, formato, destino) en `lead_exports`.
- Exporta código, nombre, teléfono, correo, etapa, subestado, fuente, campaña, proyecto, responsable, fechas, próxima acción, interés y horizonte. **No exporta DNI, dirección ni datos financieros.**
- El Excel y Google Sheets guardan los textos como texto: un nombre que empiece con "=" no se ejecuta como fórmula. El CSV antepone un apóstrofo.
- Google Sheets usa la cuenta de servicio que el CRM ya tiene; hay que compartir la hoja con ella como **Editor**. Si falta el permiso, el CRM lo dice.
- El menú solo reorganiza el acceso: cada pantalla mantiene su control de rol. Una prueba verifica que un vendedor no ve ninguna entrada de Gerencia.

## R31.3 Archivos
Nuevos: `src/PowerDashboard.jsx`, `src/biModel.mjs`, `src/bi.css`, `src/theme.css`, `src/GroupedNav.jsx`, `src/navModel.mjs`, `src/LeadExportMenu.jsx`, `business/leadExport.js`, pruebas `tests/r31-*.test.cjs` (4 archivos), capturas en `docs/capturas-r31/`.
Modificados: `src/App.jsx` (menú, panel, botón de exportar), `src/MarketingAssistant.jsx` (secciones propias), `src/main.jsx` (carga del tema), `application.cjs` (5 llamadas nuevas solo Gerencia), `src/cloudBridge.js`, `src/dataService.js`, versión.
n8n: sin cambios en R31 (sigue `LOLA-ENSAYO-67.6.13-r30-MARKETING-CONEXIONES-INACTIVO.json`).

## R31.4 Verificación
- Suite completa **473/473** pruebas. Nuevas: modelo del panel (4), exportación (5 + 1 por HTTP con permisos), menú por rol (1).
- El Excel generado se abrió con openpyxl y con LibreOffice sin errores; "=1+1" quedó como texto.
- Se renderizó la aplicación completa con datos de ejemplo en Chromium (escritorio 1440 px y celular 390 px) y se revisaron las capturas. Esa revisión encontró y corrigió 3 defectos antes de entregar: un estado del panel declarado en el componente equivocado (rompía la pantalla), el gráfico que no se ajustaba al ancho cuando los datos llegaban después, y el botón de exportar sin nombre accesible en celular.
- Las capturas usan **datos ficticios**, no los de tu CRM.

## R31.5 Límites
- "Rendimiento de marketing" y "Análisis semanal" conservan su diseño actual (heredan el tema nuevo); el estilo Power BI completo está en el Panel de control. Pueden migrarse en R32.
- El modo oscuro no está incluido.
- Las tarjetas del Kanban y la ficha del lead conservan su contenido; solo cambian de apariencia (ventana de cristal).
- No se probó contra tu servidor real ni contra Google Sheets real (sí con simulación de la API).

---
# PARTE R32 · Bandeja omnicanal, chat como panel lateral y trazabilidad desde el Kanban

## R32.1 Qué cambió
| Pedido | Qué se hizo |
|---|---|
| Bandeja social separada por red con íconos | La Bandeja ahora muestra pestañas **Todas, WhatsApp, Instagram, Messenger y TikTok**, cada una con su ícono, color y contador; búsqueda por nombre o mensaje; conversaciones ordenadas por la más reciente; marca "Sin lead" en contactos aún no vinculados. Antes WhatsApp no aparecía en la Bandeja. |
| Chat como "ventana extensión" | Al tocar una conversación se abre un **panel lateral** a la derecha (pantalla completa en celular) con el historial, modo de atención (Manual / Sugerencias de Lola / Lola automática / Solo registro), respuesta y vínculo a lead. WhatsApp usa su panel existente; Instagram, Messenger y TikTok usan el nuevo panel con el mismo formato. |
| Abrir la red correcta desde el Kanban | Cada tarjeta muestra, debajo de "Próxima acción", un botón por cada red del lead: WhatsApp (si tiene teléfono o conversación) y cada red por la que haya escrito. Un punto indica que ya hay mensajes. Cada botón abre **ese chat específico**. Los botones se ven incluso con la tarjeta contraída. |
| Trazabilidad (elegiste "historial y comentario visible") | Al **abrir** un chat se registra en el historial del lead el evento "Chat abierto · Instagram · desde el Kanban" (quién y cuándo) y se agrega el comentario visible "💬 Abrió el chat de Instagram desde el Kanban." Para no llenar la tarjeta, el comentario se agrega como máximo una vez cada 30 minutos por persona y red; el evento se registra siempre. Al **responder** se registra el evento "Respuesta enviada por chat" (sin comentario, porque el mensaje ya queda en la conversación). Nada de esto cambia la etapa del lead. |

## R32.2 Archivos
Nuevos: `src/chatChannels.mjs` (modelo de canales), `src/ChannelIcon.jsx`, `src/SocialChatPanel.jsx`, pruebas `tests/r32-chat-channels.test.cjs` y `tests/r32-chat-trace.test.cjs`, capturas en `docs/capturas-r32/`.
Reemplazado: `src/SocialInbox.jsx` (la versión anterior se conserva en el historial de R31).
Modificados: `src/App.jsx` (panel de chat único, botones por red en la tarjeta), `src/WhatsAppConversation.jsx` (registra la respuesta), `src/LeadLifecycle.jsx` (nombres de los eventos de chat), `business/queries.js` (`logChatAccess`), `application.cjs` (`logChatAccess` como cambio de datos y `getChatIndex` de lectura), `src/cloudBridge.js`, `src/dataService.js`, `src/theme.css`, versión.

## R32.3 Seguridad y permisos
- `getChatIndex` requiere sesión, igual que la Bandeja actual (sin cambio de roles).
- `logChatAccess` valida red (whatsapp, instagram, messenger, tiktok), origen (kanban, bandeja, ficha) y acción (abrir, responder); rechaza leads inexistentes.
- Los íconos son genéricos (no son los logotipos oficiales de cada red) y siempre van con el nombre de la red.

## R32.4 Verificación
- Suite completa **478/478**. Nuevas: modelo de canales (2), trazabilidad (2) y sesión (1).
- Se renderizó la aplicación con datos ficticios en Chromium (escritorio y celular) y se revisaron 9 capturas: bandeja, pestaña Instagram, chat abierto, íconos en tarjetas, Instagram y WhatsApp abiertos desde el Kanban, comentarios de trazabilidad en la tarjeta y vistas de celular.

## R32.5 Límites y pendientes
- La Bandeja lista hasta 300 conversaciones de WhatsApp y las 50 más recientes de redes sociales por carga (se actualiza cada 20 s; el Kanban cada 60 s).
- **Ventana "Enviar a seguimiento con subestado":** en la versión actual ya no existe el recuadro "Clasificar como perdido" de tu captura antigua; "Desestimado" es ahora una opción del subestado. Los campos que tachaste (Subestado, Motivo, Próxima acción, Fecha) **son hoy el contenido completo de esa ventana** y la única forma de pasar un lead a Seguimiento desde la tarjeta, por eso **no se eliminaron**. Confírmalo antes de quitarlos.

---
# PARTE R32b · El botón "Llamar" también deja rastro
- Cada vez que alguien toca **Llamar** en una tarjeta del Kanban, el CRM registra en el historial el evento "Llamada iniciada · Teléfono · desde el Kanban" (quién y cuándo) y agrega el comentario visible "📞 Llamó por teléfono al 519… desde el Kanban.", y luego abre el marcador del teléfono.
- Cada intento de llamada deja su comentario. Solo se ignora un segundo toque de la misma persona dentro de 2 minutos (doble clic).
- Registrar la llamada **no** marca contacto efectivo ni cambia la etapa: el CRM sabe que se intentó llamar, no si contestaron. El resultado se sigue registrando en "Gestión y seguimiento".
- Al pasar WhatsApp a la fila de redes de la tarjeta, los botones "Agendar cita" y "Llamar" se reparten el ancho completo (antes "Llamar" quedaba recortado).
- Pruebas: 479/479 (nueva: llamada con evento, comentario, protección contra doble clic y validación de canal). Captura: `docs/capturas-r32/10-llamada-trazada.png`.

---
# PARTE R32c · Cabecera del Kanban, buscador, cristal con 4 paletas y TEA en la cotización

## 1. Cabecera del Kanban
- Defecto: los títulos de etapa (Lead Inicial, Contactado…) se fijaban a una altura que sumaba la barra de filtros, aunque esa barra ya se había ido con el scroll; quedaba un hueco por donde se veían las fichas.
- Corrección: los títulos quedan **pegados justo debajo del menú** y solo las fichas pasan por detrás al desplazarse. En celular, donde el menú no queda fijo, los títulos se pegan al borde superior.

## 2. Buscador de leads
- **Buscador global** en el menú ("Buscar leads…", atajo **Ctrl/⌘ + K**; en celular, botón "Buscar" en la barra inferior). Muestra hasta 30 resultados ordenados por relevancia, indica en qué campo coincidió y permite **abrir la ficha, verlo en el Kanban o abrir directamente su chat** (cada apertura queda trazada como "desde el buscador").
- El buscador del Kanban usa el mismo motor.
- Busca por: **código (LD-0171 o ld0171), ID, nombre y apellidos, DNI, teléfono en cualquier formato (con o sin +51, espacios o guiones), correo, usuario de Instagram/Messenger/TikTok (@usuario), código de cotización y departamento cotizado, campaña, fuente, responsable y proyecto.**
- Varias palabras se combinan: «pérez 302», «zubiate 5191». Ignora tildes y mayúsculas. Las coincidencias exactas de código, DNI o teléfono van primero.

## 3. Efecto cristal y paletas
- Fondo con formas de color difuminadas y **paneles esmerilados** (translúcidos, con desenfoque, borde claro fino y brillo interior) en: menú y submenús, barra inferior y hoja del celular, ventanas (ficha, cotización, chats, buscador, exportar), filtros del panel y cabecera de etapas del Kanban. Tarjetas e indicadores son translúcidos sobre el fondo de color.
- **Herramientas > Apariencia:** 4 paletas — **Terracota ÖRÖK** (predeterminada), **Océano**, **Lavanda** y **Esmeralda**. Es una preferencia **por navegador**: no cambia lo que ven otros usuarios ni los PDF.
- Decisión técnica: la cabecera y las tarjetas no usan el filtro de desenfoque del navegador porque ese filtro desplaza los paneles fijos que contienen (la barra inferior del celular aparecía arriba); se detectó en las capturas y se corrigió antes de entregar.
- Accesibilidad: si el sistema pide "reducir transparencia" o el navegador no soporta desenfoque, los paneles pasan a blanco sólido.

## 4. TEA en "Generar Cotización Avanzada"
- Con **Crédito Hipotecario** aparece "TEA autorizada por el banco (%)": opciones rápidas (7,50 a 10,00%) o la tasa exacta con dos decimales (1% a 30%). Recuerda la última TEA usada en ese navegador; si no hay, usa 7,80%.
- El PDF calcula la cuota mensual a 20 años con esa TEA y la muestra en el título ("TEA 9,00%") y en la nota al pie. La TEA queda guardada en el registro de la cotización (`tea_pct`).
- El servidor rechaza una TEA fuera de rango. El Crédito Directo no usa TEA.

## 5. Verificación
- Suite completa **485/485**. Nuevas: buscador (4), trazabilidad desde el buscador, TEA (cálculo, PDF válido, rango).
- PDF de prueba revisado: muestra "TEA 9,00%" y las cuotas recalculadas (`docs/capturas-r32c/13-pdf-tea.png`).
- 12 capturas de pantalla con datos ficticios en `docs/capturas-r32c/`.

## 6. Límites
- Algunos textos y bordes de pantallas antiguas tienen el color terracota escrito directamente y no cambian con la paleta (por ejemplo, el logotipo, que es de marca).
- La ventana "Enviar a seguimiento con subestado" sigue sin cambios: falta tu confirmación.
