# R74 · Estudio de mercado + menú lateral retráctil (67.6.59-r74)

## Menú lateral retráctil
- En computadora (pantallas de 1024 px o más, con mouse) el menú izquierdo queda angosto, solo con iconos.
- Al pasar el mouse se extiende con los nombres y el buscador; al retirarlo vuelve a los iconos. Cada icono muestra su nombre como ayuda.
- En celular y tablet no cambia.

## Estudio de mercado (Evaluar → Estudio de mercado, solo Gerencia)
- Menú desplegable de distritos de Lima.
- **Pedir investigación a Claude**: se elige el distrito y los portales (Urbania, Adondevivir, Nexo, Properati, Babilonia, Mitula). Claude en la PC, conectado al ERP, toma la tarea con la herramienta `mercado_tareas_pendientes`, sube comparables con `mercado_subir_comparables` y cierra con `mercado_tarea_completar` (resumen).
- **Cargar una base propia**: Excel, CSV, Google Sheets o enlace de Drive, Markdown, JSON y PDF (el PDF se lee con la IA si el proveedor de L.O.L.A es Claude). Tiene vista previa antes de guardar.
- Reconoce encabezados en español o inglés (Precio, Moneda, Área/m², Dormitorios, Baños, Piso, Cochera, Distrito, Dirección, Proyecto, Inmobiliaria, Etapa, URL, Fuente, Fecha) y calcula el precio por m².
- Resumen: comparables, precio por m² (mediana y rango típico p25–p75) por moneda y por dormitorios, y fuentes.
- No se borra nada: un aviso repetido (mismo enlace) se actualiza; «Descartar» lo deja fuera del cálculo sin eliminarlo.

## Técnico
- `business/mercado.js` (colecciones `mercado_comparables`, `mercado_tareas`, `mercado_cargas`), RPC `mercado*`, 3 herramientas nuevas del conector MCP, `src/EstudioMercado.jsx`, dependencia `exceljs`.
- Pruebas: `tests/r74-estudio-mercado.test.cjs` (686 pruebas en verde).
