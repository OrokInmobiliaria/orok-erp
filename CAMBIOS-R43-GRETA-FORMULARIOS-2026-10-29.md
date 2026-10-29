# R43 · G.R.E.T.A: armado automático y formularios instantáneos — 29/10/2026

Versión 67.6.26-r43. Base: `ERP-OROK-R42b-PROYECTOS-DRIVE-ENSAYO.zip`. Solo se tocaron los archivos de `PROCEDENCIA-R43-GRETA-FORMULARIOS.json`. Solo Gerencia. Preproducción.

## Armado automático de piezas (Estudio › Recursos › «Armar piezas»)

- G.R.E.T.A elige, para cada escena o lámina sin recurso, la foto o el clip propio más adecuado (video para reels e historias, foto para carruseles).
- Casilla opcional: si ninguna foto encaja, genera hasta 4 imágenes referenciales con el proveedor de Marca › G.R.E.T.A y las asigna.
- Si la generación está apagada, asigna lo propio y avisa qué escenas siguen vacías.
- Si la IA no responde, reparte los recursos propios en orden.
- La campaña queda en revisión: Gerencia revisa, ajusta y aprueba. No toca campañas aprobadas.

## Formularios instantáneos (Crear › Formularios)

- **Redactar con G.R.E.T.A:** a partir de una campaña o sin ella. Propone bienvenida, 2 a 4 preguntas que califican, pantalla final y botón (WhatsApp, llamar o página).
- **Todo editable:** nombre, tipo (más volumen o mayor intención), bienvenida, preguntas (opciones o respuesta libre, ordenar, quitar), datos de contacto, enlace y texto de privacidad, pantalla final y botón. Tiene vista previa tipo celular por pasos.
- **Reglas:** límites de caracteres; sin precios, descuentos, escasez ni promesas; sin las palabras prohibidas del proyecto; nombre y teléfono o correo obligatorios; política de privacidad https obligatoria.
- **Ciclo:** Borrador → Aprobado (por Gerencia, por revisión) → Creándose en Meta → En Meta. Editar anula la aprobación.
- **En Meta no se edita:** Meta no permite editar un formulario creado. «Nueva versión» copia el formulario en borrador; al crearla, n8n archiva la anterior en Meta.
- **TikTok:** se aprueba igual y se usa «Descargar ficha» para copiarla en TikTok Ads Manager.
- **CRM:** cuando entra un lead por formulario de Meta (webhook que ya existía), el lead guarda de qué formulario vino y sus respuestas quedan como comentario (una sola vez, sin repetir datos de contacto). La pregunta de tipología llega como interés. No cambia etapa ni orden del Kanban.
- **KPIs:** Pauta y KPIs muestra por formulario los leads, citas, ventas y la tasa lead → cita.
- **Configuración:** Marca › G.R.E.T.A guarda una vez la política de privacidad y el WhatsApp de ventas.

## n8n

- Nuevo `n8n/GRETA-R43-FORMULARIOS-META-ENSAYO-INACTIVO.json` (12 nodos, inactivo), generado por `deploy/build-greta-formularios-workflow.cjs`.
- Cada 10 minutos toma un trabajo (`lead_form_claim`) y crea el formulario con `POST /{page-id}/leadgen_forms` o lo archiva (`status: ARCHIVED`). Luego confirma (`lead_form_complete`) o avisa el error (`lead_form_fail`).
- Requiere la credencial «Facebook Graph API» con token de página y el ID de la página en el nodo «Configuración».
- El formato exacto del cuerpo se valida en la prueba de ensayo antes de activarlo.

## Técnico

- Nuevos: `business/leadForms.js`, colecciones `greta_formularios` y `greta_formularios_trabajos`; 10 métodos RPC (`gretaArmar`, `gretaFormulario*`), todos solo para Gerente; acciones n8n `lead_form_*`; pestaña `mkForms`.
- Cambiados: `business/greta.js`, `business/omnichannel.js` (form_meta y comentario de respuestas), `application.cjs`, `src/Greta.jsx`, `src/greta.css`, `src/App.jsx`, `src/CampaignStudio.jsx`, `src/navModel.mjs`, `src/cloudBridge.js`, skill `greta-marketing`.
- Pruebas: `tests/r43-greta-formularios.test.cjs` (7) y `tests/r43-greta-formularios-ui-smoke.cjs` (escritorio y celular, sin desborde). Total 592/592.

## Límites

- Un formulario solo funciona dentro de un anuncio: el anuncio y su presupuesto se siguen creando en el administrador de anuncios.
- Meta cambia a menudo permisos y campos: el flujo se activa solo después de la prueba de ensayo.
