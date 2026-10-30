# R54 · Dictar o adjuntar para las 4 IA (67.6.39-r54)

- Botón «<IA> · Dictar o adjuntar» abajo al centro: L.O.L.A en el CRM, G.R.E.T.A en Marketing, M.O.R.A en el Evaluador y D.I.A.V.A en Contabilidad.
- Se dicta (micrófono del navegador; si no hay, grabación y transcripción por el servidor) o se escribe, y se pueden adjuntar hasta 4 imágenes o PDF (planos, partidas, brochures, presupuestos, capturas). Las imágenes se comprimen en el navegador.
- La IA lee los campos visibles de la pantalla y propone valores: campo · actual → propuesto · fuente (dictado, imagen, historial de otro proyecto, estimado) · confianza. Pregunta lo que falta.
- Nada se aplica sin marcarlo; tras aplicar, se guarda como siempre en esa pantalla. Solo se aceptan campos existentes y tipos válidos.
- Usa el historial de otros proyectos (R52) si el proyecto lo permite. Los adjuntos se archivan en la carpeta del proyecto en Drive (Estudio de Mercado, Presupuestos, Marketing o Ventas).
- Proveedores con lectura de imágenes y PDF: Gemini, ChatGPT y Claude (mismo proveedor configurado en L.O.L.A).
- Pruebas: tests/r54-dictar-adjuntar.test.cjs (639/639); verificado en local en el Evaluador (4 campos aplicados).
