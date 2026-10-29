# R40 · Jefe de Proyecto distinto de Jefe de Obra y empresas por persona

Versión 67.6.23-r40 · 28-10-2026 (Lima) · preproducción. Aditivo, sobre R39.

- **Corrección del equipo:** Fernando Amiquero es **Jefe de Proyecto** en Montezuma Arquitectos (MZA) y BMG.
  - No es Jefe de Obra ni forma parte de ninguna cadena de aprobación.
  - Elabora órdenes solo de MZA y BMG.
- **Cargo nuevo «Jefe de Proyecto»** en la skill. No aprueba órdenes; identifica el rol.
- **Empresas por persona:** cada persona habilitada tiene las empresas donde puede elaborar órdenes.
  - El servidor rechaza las órdenes de otras empresas.
  - La pantalla solo le muestra sus empresas.
  - Gerencia lo cambia en Aprobaciones › Personas habilitadas.
- **Jefe de Obra de MAAS:** hoy no hay ninguno definido. Las órdenes de obra o construcción de MAAS no se envían hasta asignar el Jefe de Obra del proyecto (en Proyectos) o uno por defecto (en Aprobaciones).

Pruebas: `npm test` 553/553.
