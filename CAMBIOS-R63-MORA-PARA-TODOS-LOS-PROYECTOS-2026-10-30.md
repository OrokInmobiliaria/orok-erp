# R63 · M.O.R.A para todos los proyectos y trabajador de producción (67.6.48-r63)

Incluye todo lo de R62.

- **M.O.R.A encendida en producción** (Administración M.O.R.A: activa; se hizo con la sesión de Gerencia el 30/10/2026).
- **El trabajador de n8n sirve a todos los proyectos:** las consultas y las lecturas de avisos (Urbania, etc.) pedidas desde Ventura
  u otro proyecto nuevo ya no se quedan esperando; la respuesta vuelve al proyecto que la pidió.
- **Sin base de datos en n8n:** cada consulta trae su contexto (evaluación, alcance por rol e historial reciente), con el mismo
  criterio que `mora.context_for_job`. El trabajador de producción ya no necesita credencial de PostgreSQL.
- **Nuevo flujo:** n8n/MORA-R63-PRODUCCION.json (`node deploy/build-mora-workflow-produccion.cjs`): 6 pasos a erp.orok.com.pe con
  «Header Auth account 2» y Claude con «M.O.R.A. · Anthropic API». Inactivo hasta que Gerencia lo publique.

Pruebas: R63 en r33-mora y r50-multiproyecto. 665/665.
