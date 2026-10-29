# R42 · Módulo Marketing con G.R.E.T.A — 28/10/2026

Versión 67.6.25-r42. Base: ERP-OROK-R41-CIERRE-OC-VALIDADA-20261028.zip (validado; solo se tocaron los archivos de esta lista). Solo Gerencia.

G.R.E.T.A = **G**estión de **R**edes, **E**strategia, **T**endencias y **A**nuncios. Es la IA del módulo Marketing y trabaja con L.O.L.A, la IA principal.

## Qué cambia para el usuario

- **Marketing sale del CRM** y pasa a ser un módulo propio en el selector superior: CRM Inmobiliario · Marketing · Evaluador · Contabilidad y Finanzas. El menú del CRM queda en Inicio, Ventas y Configuración.
- **Menú del módulo (5 pasos, sin duplicados):**
  1. **Hoy:** pendientes de aprobación, pauta de 7 días, leads de 30 días por origen, sugerencias del día, temas que preguntan los clientes (desde L.O.L.A).
  2. **Crear › Tendencias:** radar del nicho en Instagram y TikTok (departamentos en Lima, arquitectura, interiorismo, construcción, inversión), con fuentes citadas, hashtags que suben y límites. «Crear alternativas» arma una campaña en Estudio con piezas listas (gráfica, carrusel, reel, historia) con texto, hashtags y llamado.
  3. **Crear › Estudio:** las Campañas IA de siempre. Nuevo bloque en Recursos: «Crear imágenes / Editar mi foto con G.R.E.T.A» (OpenAI por defecto; Google configurable). Toda imagen IA queda marcada «referencial». Los reels se siguen armando con tus clips y fotos.
  4. **Publicar:** por pieza aprobada y exportada. TikTok: a borradores o programar. Instagram: «Descargar para editar» (archivo + texto con hashtags) o programar. Facebook: no publicada en Business Suite o programar. Casilla «lleva pauta» que lleva a Pauta y KPIs. La programación avanzada (variantes A/B y voz) queda plegada abajo.
  5. **Medir › Pauta y KPIs:** inversión, impresiones, CTR, costo por clic, costo por lead del CRM y costo por cita, con la tabla por anuncio y la recomendación subir, mantener o reducir. «Lectura de G.R.E.T.A» explica qué decidir. Debajo quedan Variantes A/B y Presupuesto. **Medir › Ventas atribuidas** reúne el panel de marketing, los anuncios y los gastos de marketing.
  6. **Marca:** biblioteca de marca, configuración de G.R.E.T.A (proveedor de imágenes, modelo, calidad, máximo diario, clave) y resumen diario.
- Las pestañas antiguas (Variantes, Presupuesto, Conexiones, Resumen, Finanzas de marketing) llevan solas a su nuevo lugar.
- Diseño Crystal en todo el módulo; el selector de módulos también es Crystal y ya no desborda en celular.

## G.R.E.T.A como asistente (igual que las otras IA)

- En el módulo Marketing aparece el botón flotante «G.R.E.T.A», con el mismo panel que L.O.L.A (CRM), M.O.R.A (Evaluador) y C.L.A.R.A (Contabilidad): conversación con historial, micrófono, respuesta en voz alta opcional, nueva conversación y engranaje (lleva a Marca › G.R.E.T.A).
- Sabe en qué pantalla estás y responde con los datos del módulo (pendientes, pauta, tendencias y temas de L.O.L.A). Cada IA aparece solo en su módulo.
- Usa el proveedor y la cuota de L.O.L.A; si L.O.L.A está apagada, el panel lo indica.
- La caja «Pregúntale a G.R.E.T.A» de Hoy se retiró para no duplicar: ahora se pregunta desde el panel.

## Intercambio G.R.E.T.A ↔ L.O.L.A

- De L.O.L.A a G.R.E.T.A: temas resumidos y conteos (sin nombres, teléfonos ni mensajes).
- De G.R.E.T.A a L.O.L.A: campañas aprobadas y vigentes (título, objetivo, mensaje y llamado) en `greta-para-lola.json` del directorio privado. L.O.L.A las recibe en su memoria de conversación como `marketing`, y n8n puede leerlas con la acción `greta_para_lola`.

## Técnico

- Nuevo `business/greta.js` (11 métodos RPC `greta*`, solo Gerente), `src/Greta.jsx`, `src/greta.css`, `skills/greta-marketing/SKILL.md` (fuente única de reglas; el servidor puede usar una copia en `<OROK_PRIVATE_DIR>/skills/greta-marketing/SKILL.md`).
- G.R.E.T.A usa el proveedor y la clave de L.O.L.A para texto (Claude con búsqueda web, Gemini con Google Search; OpenAI sin búsqueda web, avisado en «límites»).
- Imágenes: `greta.json` en el directorio privado (permisos 600). Si no hay clave propia, usa la de OpenAI o Gemini de L.O.L.A. Apagado por defecto, 30 por día.
- Cola de publicación: nuevo campo `modo` (`publicar` | `borrador`). Los borradores solo se entregan a un flujo n8n que pida `soporta_borrador: true`; el flujo actual no los toma. Instagram rechaza borrador.
- Colecciones nuevas en el documento del proyecto: `greta_tendencias`, `greta_uso` (aditivas, no tocan leads ni Kanban).
- Pruebas: `tests/r42-greta.test.cjs` (9), ajustes en r31, r33, r34 y r36 por el nuevo módulo, y `tests/r42-greta-ui-smoke.cjs` (visual, escritorio y celular, sin desborde).

## Pendiente para usar todo

- Activar imágenes en Marketing › Marca › G.R.E.T.A con una clave de OpenAI (o Google).
- Flujo n8n de borradores: TikTok (Content Posting API, inbox) y Facebook (publicación con `published:false`), declarando `soporta_borrador: true` al tomar el trabajo. Mientras tanto, «Descargar para editar» funciona en las tres redes.
- En el flujo L.O.L.A de n8n, usar `memoria.marketing` en el prompt para responder en línea con la campaña vigente.
- Video con IA (Veo) queda preparado y apagado.
