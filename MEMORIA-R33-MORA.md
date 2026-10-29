# Memoria de cambios · LOLA CRM r32c + R33 / R33b · integración M.O.R.A y Evaluador Inmobiliario

Fecha: 26/10/2026 (America/Lima). Base: paquete 67.6.17-r32c-login-clear2. La versión interna del servidor se conserva (67.6.17-r32c) para no alterar las comprobaciones existentes; esta entrega se identifica como **R33 · M.O.R.A**.

## 1. Qué se añadió

El CRM ahora conversa con M.O.R.A, la agente del Evaluador Inmobiliario. L.O.L.A no cambia.

> **R33b cambió el acceso:** el menú "Viabilidad" ya no existe. M.O.R.A y el Evaluador viven en el módulo **Evaluador Inmobiliario**, solo para Gerencia. Ver la sección 9.

- **"M.O.R.A · consultas":** permite elegir una evaluación, ver su resumen y preguntar a M.O.R.A.
  - El resumen sale del inventario real: unidades vendidas, separadas y disponibles.
  - Las respuestas llegan por el flujo n8n de M.O.R.A.
- **"Administración M.O.R.A", solo Gerencia:**
  - activar o desactivar las consultas y la lectura semanal;
  - umbrales de alerta;
  - cargar evaluaciones desde el Evaluador;
  - aprobar o rechazar las propuestas de M.O.R.A;
  - exportar las ventas reales hacia el Evaluador;
  - ver las lecturas semanales.

- **Análisis semanal con tablero tipo Power BI**, como vista nueva por defecto. El control detallado del mes anterior sigue disponible con un botón.
  - **Indicadores de la semana elegida** frente a la semana anterior y al promedio de 4 semanas: leads, citas, asistidas, separaciones, ventas, monto vendido, inversión, costo por lead y % de leads que llegan a cita.
  - **Gráficos:** captación y resultados por semana (con clic en una semana para analizarla), inversión y costo por lead, embudo de la semana, mapa de calor de fuente por semana, día de entrada de leads, asesores de la semana y absorción del inventario.
  - **Lectura automática** de la semana.
  - **Filtros:** 8, 12 o 26 semanas, proyecto, fuente, campaña y responsable.
  - Usa solo los datos que el CRM ya carga en pantalla: no agrega lecturas a la base.

## 2. Archivos

| Archivo | Cambio |
|---|---|
| `business/moraIntegration.js` | Nuevo. Toda la lógica de M.O.R.A en el servidor |
| `application.cjs` | 5 líneas: rutas `mora_*` hacia el módulo y llamadas de pantalla de M.O.R.A |
| `src/MoraPanel.jsx` | Nuevo. Pantallas de consultas y administración |
| `src/navModel.mjs` | Grupo "Viabilidad"; `moraAdmin` agregado a las pestañas exclusivas de Gerencia |
| `src/App.jsx` | Montaje del panel de M.O.R.A (la administración exige rol Gerente); el Análisis semanal recibe leads, unidades, gastos y separaciones |
| `src/cloudBridge.js`, `src/dataService.js` | Registro de las 11 llamadas nuevas |
| `dist/` | Reconstruido con `npm run build` |
| `migrations/002-mora-postgres.sql` | Nuevo, aditivo. Función `mora.context_for_job` para el nodo PostgreSQL de n8n. No se ejecuta sola |
| `n8n/MORA-ENSAYO-67.6.17-EVALUADOR-CONVERSACIONAL-INACTIVO.json` | Nuevo flujo, inactivo y sin id |
| `src/weeklyBiModel.mjs`, `src/WeeklyBI.jsx` | Nuevos. Modelo y tablero semanal tipo Power BI |
| `src/WeeklyAnalysis.jsx` | Selector entre el tablero y el control detallado del mes |
| `tests/r33-mora.test.cjs`, `tests/fixtures/mora-evaluacion-infinity224.json` | 8 pruebas nuevas (7 de M.O.R.A y 1 del tablero semanal) |

Ninguna colección, tabla, rol ni flujo existente fue modificado.

## 3. Interfaz con n8n

Las acciones llegan por `/api/integrations/lola`, con la misma cabecera `x-orok-webhook-secret`:

| Acción | Qué hace |
|---|---|
| `mora_job_claim` | Toma la consulta más antigua con autorización temporal de 3 minutos. Las consultas vencidas vuelven a la cola y fallan al tercer intento. Con la función apagada responde `job:null` |
| `mora_job_complete` | Exige autorización vigente. Repite en el servidor el control de salida según el rol guardado en la consulta y guarda la respuesta y las propuestas pendientes de Gerencia. Con `error`, la consulta vuelve a la cola sin dejar texto |
| `mora_weekly_get` / `mora_weekly_complete` | Una lectura por semana ISO, con ventas reales frente a las metas mensuales de la evaluación |

## 4. Datos nuevos

Colecciones aditivas: `mora_jobs`, `mora_evaluations`, `mora_messages`, `mora_proposals`, `mora_editors`, `mora_weekly`. Archivo privado `mora.json`; sin él, todo queda apagado.

## 5. Seguridad y permisos

- El rol de quien pregunta se toma de la sesión, nunca del navegador.
- **Desde R33b, solo Gerencia** usa M.O.R.A y el Evaluador; el servidor rechaza a los demás roles.
- El alcance "resumen" (sin `analysis` ni `inputs`, y con las cifras financieras reemplazadas en la respuesta) se conserva como segunda barrera en PostgreSQL, n8n y el servidor.
- Cada persona ve solo su propio hilo de conversación.
- Las propuestas de la IA nunca se aplican solas. Al aprobarlas, Gerencia crea una nueva revisión de la evaluación y el historial guarda el valor anterior.
- Las rutas permitidas para propuestas son una lista cerrada. La línea base y el estado de aprobación de la estrategia no se pueden proponer.
- Hay un límite de consultas por persona y por hora; el valor por defecto es 30.

## 6. Verificación

- `npm test`: 493 de 493 pruebas aprobadas (485 previas y 8 nuevas de R33).
- `npm run build`: correcto.
- La migración 002 se aplicó sobre la 001 en PostgreSQL 16 y se reaplicó sin errores. Se verificaron los alcances por rol y el rechazo de autorizaciones incorrectas o vencidas.
- El CRM aceptó la evaluación exportada por el Evaluador M.O.R.A ("Evaluación para el CRM").

## 7. Puesta en marcha en el ensayo

1. Respaldo con `deploy/create-preupdate-snapshot.cjs` y verificación de `restore-check.json`, como exige `DEPLOY-BLOCKED.txt`.
2. Desplegar este paquete en la copia de ensayo.
3. Ejecutar `migrations/002-mora-postgres.sql` sobre la base de ensayo.
4. En n8n, crear la credencial "M.O.R.A ENSAYO - Anthropic API" e importar el flujo de M.O.R.A como copia inactiva.
5. En el CRM (desde R33b), módulo Evaluador Inmobiliario: Administración M.O.R.A → activar las consultas. Luego, en Evaluación y riesgo, usar «Guardar en el CRM».
6. Probar una consulta de Gerente de punta a punta y comprobar que un Vendedor no ve el Evaluador. Recién entonces activar el flujo.

## 8. Límites

- No se desplegó en el CRM vivo ni en el ensayo, y no se ejecutaron llamadas reales a Claude.
- La lectura semanal queda guardada en el CRM. Su envío por correo se puede sumar luego al flujo del resumen diario.
- Las ventas reales viajan al Evaluador copiando el contrato `crm.ventas@1`. Llevar el Evaluador completo al servidor del CRM es la siguiente etapa.

## 9. R33b · ÖRÖK con dos módulos: CRM Inmobiliario y Evaluador Inmobiliario

Pedido del titular: desde el encabezado, Gerencia elige entre el CRM y el Evaluador Inmobiliario. Vendedores y brokers solo ven el CRM: Inicio, Ventas y Configuración.

### Qué ve cada rol
| Rol | Encabezado | Menú |
|---|---|---|
| Gerente | Selector **CRM Inmobiliario · Evaluador Inmobiliario · M.O.R.A** en lugar del título | CRM: Inicio, Ventas, Marketing, Configuración. Evaluador: Evaluación y riesgo, Consultas a M.O.R.A, Administración M.O.R.A |
| Vendedor y Broker | Título fijo "CRM Inmobiliario", sin selector | Inicio, Ventas, Configuración |

### Qué cambió
- **El Evaluador completo vive dentro del CRM**, en `/evaluador/`, en "Evaluación y riesgo". Son las mismas 21 pestañas de la app: cabida, costos, flujo, banca, seguimiento, inversionistas y PDF.
  - **Guardar en el CRM:** guarda la evaluación con su copia de trabajo completa en PostgreSQL. Cada guardado es una nueva revisión con historial.
  - **Cargar del CRM:** trae la revisión vigente. El borrador anterior queda respaldado en el navegador.
  - **Traer ventas del CRM:** carga en Seguimiento las separaciones y ventas reales (`crm.ventas@1`), sin copiar y pegar.
  - **Protección contra pisar cambios:** si el CRM tiene una revisión más nueva (por ejemplo, una propuesta aprobada), no deja guardar hasta cargarla.
  - **El asistente M.O.R.A** responde por el flujo n8n con la evaluación guardada en el CRM. Sus propuestas quedan pendientes en Administración M.O.R.A.
  - **El PDF ejecutivo** se genera en el navegador con una copia local de jsPDF (no depende de internet).
- **Al aprobar una propuesta**, el cambio también se aplica a la copia de trabajo del Evaluador.
- **Servidor:**
  - La ruta `/evaluador` exige sesión de Gerente (403 para los demás) y sirve solo 3 archivos fijos, sin caché.
  - Todas las llamadas de M.O.R.A exigen rol Gerente.
  - Nueva llamada `getMoraEvaluation`.
- **Seguridad de contenido:** se mantiene la política actual (`script-src 'self'`); el Evaluador no usa scripts en línea.
- **Datos de ventas:** se quitó la asignación de "editores" de ventas, porque el análisis financiero queda solo en Gerencia. La colección `mora_editors` queda inerte. El control de salida del servidor sigue quitando cifras si alguna vez llega un trabajo con rol de ventas.

### Misma interfaz que el CRM
El Evaluador y M.O.R.A usan ahora la misma piel del CRM inmobiliario:
- **Paleta y fondo:** paleta terracota ÖRÖK, con el fondo de formas de color difuminadas.
- **Paneles:** de cristal esmerilado: barra lateral, cabecera, tarjetas, tablas y panel de M.O.R.A.
- **Tipografía:** Outfit.
- **Botones y menú:**
  - botón principal con degradado de marca;
  - botones secundarios de cristal;
  - selectores con pastilla blanca;
  - la sección activa del menú, resaltada como en el CRM.
- **Efectos:** las vistas y los mensajes entran con un desplazamiento suave, y los botones se comprimen al pulsarlos. Todo se desactiva si el equipo pide reducir el movimiento o la transparencia.
- **Colores del CRM:** dentro del CRM, el Evaluador toma los que Gerencia definió en Ajustes del proyecto.
- **PDF:** el resumen ejecutivo también usa la paleta ÖRÖK.

### Exportación a Excel (para el evaluador del banco)
- **Botón «Excel»** en la barra superior: descarga la sección que estás viendo.
- **"Exportar a Excel"** (menú Integración) ofrece tres opciones:
  - **Paquete para el banco:** 16 secciones, desde la cabida hasta los indicadores. Si ya hay ventas reales, suma Línea base y Ventas registradas.
  - **Compilado total:** las 20 secciones.
  - **Selección propia:** casillas por grupo.
- **Formato de cada libro:**
  - una hoja **Resumen** con los datos del proyecto, 15 indicadores, el índice con enlaces a cada hoja y una nota de alcance;
  - una hoja por sección con la marca ÖRÖK;
  - números reales con formato de soles, porcentajes y separador de miles, y los negativos en rojo;
  - filas de grupo y totales resaltadas, y encabezados y primera columna inmovilizados;
  - el calendario como diagrama de barras con celdas coloreadas;
  - preparado para imprimir en A4 horizontal, con pie de página.
- **Valores, no fórmulas:** las cifras salen del mismo motor de cálculo del Evaluador. Así cuadran con la pantalla y con el PDF.
- **Sin internet en el CRM:** usa una copia local de ExcelJS 4.4.0 en `evaluador/exceljs.min.js`, compatible con la política `script-src 'self'`.
- **Corrección en la app:** la fila "Unidades vendidas" del flujo de caja mostraba "S/" y ocultaba las fracciones de unidad. Ahora muestra unidades con 2 decimales.

### Archivos R33b
| Archivo | Cambio |
|---|---|
| `src/navModel.mjs` | `MODULES`, `modulesFor`, `moduleOf`; `navGroups(role, module)`. Sin grupo Viabilidad |
| `src/GroupedNav.jsx` | Recibe `module`. Barra rápida propia del Evaluador |
| `src/App.jsx` | Selector de módulo (solo Gerente), pestaña `evaluador` con el Evaluador embebido, y bloqueo de pestañas del Evaluador para los demás roles |
| `src/theme.css` | Estilo del selector |
| `src/MoraPanel.jsx` | Sin asignación de editores; textos según la nueva ubicación |
| `business/moraIntegration.js` | Llamadas solo de Gerencia, `getMoraEvaluation` y copia de trabajo (`workspace`) |
| `server.cjs` | Ruta `/evaluador` |
| `evaluador/` | Generado: `index.html`, `app.js`, `jspdf.umd.min.js`, `exceljs.min.js` |
| `evaluador-src/`, `deploy/build-evaluador.cjs` | Fuente de la app y su generador: `npm run build:evaluador` |
| `tests/r33-mora.test.cjs` | 9 pruebas: acceso solo de Gerencia, copia de trabajo, ruta `/evaluador` y menú por rol |

### Verificación R33b
- `npm test`: 494 de 494 pruebas aprobadas.
- `npm run build`: correcto.
- **Evaluador abierto en Chromium dentro del servidor de prueba, con la política de seguridad real:** guardó en el CRM, trajo ventas, y descargó el PDF y tres Excel (una sección, paquete para el banco y compilado total).
- **Revisión de los Excel:** se abrieron con openpyxl y se convirtieron a PDF con LibreOffice para comprobar el formato.
- **Simulación del asistente:** consulta, espera de la respuesta de n8n y propuestas mostradas.
- **Límite:** el selector del encabezado se comprobó con render en servidor y pruebas, no con un inicio de sesión real. Conviene verlo en el ensayo.

## 10. R33c · Estudio de mercado en el Evaluador

Es una pestaña nueva, **Comercial > Estudio de mercado**. Analiza departamentos (vivienda multifamiliar) de un distrito para fijar el precio de lanzamiento.

- **Fuentes de datos:**
  - **Excel o CSV:** importación directa.
  - **Tablas pegadas** desde Google Sheets o Excel. Reconoce encabezados como Proyecto, Precio, Moneda, Área, Dormitorios, Pisos, Estado y Amenidades.
  - **Enlace de Google Sheets:** n8n descarga la hoja como CSV.
  - **Páginas web de portales:** con un enlace de Urbania, Adondevivir, Nexo Inmobiliario, Babilonia o Properati, n8n lo descarga. También se puede pegar el contenido de la página. En ambos casos Claude extrae solo departamentos.
- **Clasificación de cada aviso:** lanzamiento (en planos o preventa), en venta (en construcción, estreno o entrega inmediata), últimas ventas (cierres reales) o usados. La clasificación se puede corregir aviso por aviso.
- **Análisis del S/ por m²:**
  - por etapa: mediana, promedio, P25, P75, mínimo y máximo;
  - por tipología y por altura del edificio (hasta 5 pisos, 6 a 8, 9 a 12, 13 o más);
  - por amenidades: presencia y prima de cada una;
  - efecto del tamaño de la unidad;
  - gráfico por etapa y gráfico de área frente a precio.
- **Precio sugerido:** mediana ponderada por etapa (las últimas ventas pesan 1.5 y los usados 0.5, solo si se incluyen) con un descuento de negociación sobre los precios de aviso. Se ajusta por:
  - las amenidades del proyecto, amortiguadas porque suelen venir juntas;
  - el tamaño promedio de sus unidades.

  Los ajustes tienen topes.
- **Impacto en el modelo:** muestra margen, utilidad y TIR con el precio actual y con el sugerido, el precio necesario para el margen meta, su percentil en el mercado y el precio de equilibrio.
- **«Usar … por m² en el modelo»** cambia el precio del modelo. Se puede deshacer, y dentro del CRM hay que guardar la evaluación.
- **Datos que viajan con la evaluación:**
  - el resumen del estudio va en `analysis.mercado` al guardar en el CRM, y M.O.R.A lo usa al responder por n8n;
  - el estudio entra en el paquete de Excel para el banco.
- **Ensayo incluido:** 30 avisos de Urbania de San Miguel (15 proyectos y 15 avisos), leídos el 26-oct-2026.

### Identidad fija en el encabezado
- **ÖRÖK (izquierda):** muestra el logo cargado en Ajustes > "Logo de ÖRÖK (URL)". Sin logo, muestra el texto ÖRÖK con un degradado fijo de rojo a marrón rojizo.
- **El proyecto (derecha):** muestra el "Logo del proyecto (URL)". Sin logo, muestra el nombre (por ejemplo, Infinity 224) en marrón rojizo.
- **Colores fijos:** se escribieron a propósito en hexadecimal. Ni las combinaciones de colores ni el color principal libre los cambian; el resto de la interfaz sí sigue la paleta elegida.
- **Pantalla de acceso:** el texto ÖRÖK usa el mismo color fijo.
- **Archivos:** `src/App.jsx`, `src/theme.css`, `index.html`; en `application.cjs` el logo de ÖRÖK se valida igual que el del proyecto.

### Servidor y n8n
- **Llamadas nuevas (solo Gerencia):** `requestMoraMarket` y `getMoraMarket`.
- **Colección nueva:** `mora_market_jobs`.
- **Acciones para n8n:** `mora_market_claim` y `mora_market_complete`, con autorización temporal de 3 minutos y hasta 3 intentos.
- **Controles en el servidor:**
  - solo enlaces https de los portales permitidos, sin usuario ni puerto en el enlace;
  - hasta 20 lecturas por hora por persona;
  - cada aviso se valida en tipos, rangos y largo de textos, con enlaces solo https;
  - el texto pegado se borra al terminar.
- **Si un portal bloquea la descarga,** la lectura falla de inmediato y pide pegar el contenido.
- **Flujo n8n de M.O.R.A:** ahora tiene 40 nodos. La rama nueva tiene 11 nodos de trabajo y una nota (lectura cada 15 segundos, descarga, conversión a texto, extracción con Claude y validación). El texto de terceros se trata como datos y nunca como instrucciones.

### Verificación R33c
- Suite del CRM: 495 de 495 pruebas, con una nueva para la cola de mercado.
- Pruebas del flujo n8n: 8 de 8, con 2 nuevas.
- **Prueba en Chromium dentro del CRM de prueba:** un enlace pasó por la cola, la respuesta simulada de n8n agregó los avisos, se guardaron en el CRM con `analysis.mercado` y la pestaña se exportó a Excel.
- **Límite:** no se probó la descarga real desde Urbania en n8n, porque el portal puede bloquear servidores. Si pasa, la pantalla pide pegar el contenido. Respeta los términos de uso de cada portal.

## 11. R33c · Asistente L.O.L.A para el equipo (voz o texto)

Es un botón flotante **L.O.L.A** en el módulo CRM, disponible para Gerente, Vendedor y Broker. Abre un panel de cristal donde se pregunta por escrito o con el micrófono, y L.O.L.A puede leer sus respuestas en voz alta.

**Qué responde:**
- uso del CRM: dónde está cada opción del menú del rol;
- el proceso comercial: manual y playbook de la pantalla Ayuda, que ahora viven en `src/helpContent.json` para que los usen la pantalla y el asistente;
- el proyecto y el inventario disponible: unidad, tipología, piso, áreas y precio de lista;
- el resumen de los leads de la persona: totales por etapa y acciones vencidas;
- borradores de mensajes para clientes.

No ejecuta acciones: indica los pasos.

**Privacidad por rol:**
- **Datos que nunca recibe el modelo:** nombres, teléfonos ni datos de clientes.
- **Vendedores y brokers:** solo ven sus propios leads, sin márgenes ni comisiones. Gerencia ve todo el equipo y las comisiones.
- **Conversaciones:** no se guardan; solo un contador diario por persona.

**Proveedores:** Gerencia elige entre Claude, ChatGPT (OpenAI) o Gemini con el engranaje del panel.
- **La clave:** se guarda en `lola-asistente.json`, en el directorio privado y con permisos 600, y nunca vuelve al navegador.
- **Si no se registra clave propia:** con Claude se reutiliza la clave de Campañas IA y con Gemini, la de Ajustes.
- **Botón «Probar conexión»:** verifica la clave y el modelo.
- **Modelos por defecto:** `claude-haiku-5-5`, `gpt-5-mini` y `gemini-3.8-flash`. Se pueden cambiar; confirma que estén disponibles en tu cuenta.

**Voz:**
- **Dictado:** usa el reconocimiento del navegador (Chrome, Edge o Safari, en español de Perú). Si el navegador no lo tiene, el audio se transcribe en el servidor con Gemini u OpenAI; con Claude no hay esa opción.
- **Respuestas en voz alta:** las lee la voz del propio navegador, sin costo.
- **Modo voz:** las respuestas son más cortas, de hasta unas 70 palabras.

**Control de uso:** hay un límite de consultas por persona al día, 80 por defecto.

**Archivos:**
- nuevos: `business/lolaAssistant.js` y `src/LolaAssistant.jsx`;
- modificados: `application.cjs`, `src/App.jsx`, `src/HelpCenter.jsx`, `src/cloudBridge.js`, `src/dataService.js` y `src/glass.css`;
- pruebas nuevas en `tests/r33c-lola-asistente.test.cjs` (3).

**No cambia nada de lo existente:**
- el flujo n8n de LOLA para clientes;
- WhatsApp;
- los permisos.

## 12. R33c · Encabezado sólido e identidad fija
- **Franja superior sólida:** va desde el borde superior hasta la línea, con ÖRÖK, el selector, la cuenta y el proyecto. Es sólida, sin cristal; el cristal empieza bajo la línea, en el menú y el contenido.
- **Colores fijos que no siguen la paleta:**
  - la línea y el módulo activo del selector, en marrón rojizo;
  - ÖRÖK, con su degradado de rojo a marrón rojizo;
  - el nombre del proyecto, en marrón rojizo.
- **Tipografía:** no cambió; se mantiene Outfit en el CRM y en el Evaluador.
- **Evaluador:** el nombre del proyecto también queda en marrón rojizo fijo.

### Verificación
- Suite del CRM: 498 de 498 pruebas.
- El panel del asistente se revisó en Chromium en escritorio y en celular, con el proveedor simulado.
- No se hicieron llamadas reales a Claude, OpenAI ni Gemini.
