# R41 · Jefe de Obra por obra y órdenes elaboradas por Gerencia

Versión 67.6.24-r41 · 28-10-2026 (Lima) · preproducción. Aditivo, sobre R40.

## Órdenes elaboradas por Gerencia (por ahora)
Si quien elabora la orden es de Gerencia (Gerencia General o Gerencia de Operaciones, o área «Gerencia»), la orden no necesita la firma del Jefe de Obra, del Jefe de Proyecto ni del jefe de área. Solo firman las gerencias de su cadena.

| Elabora | MAAS · obra | MAAS · consultoría | BMG / MZA |
|---|---|---|---|
| Cualquier área | Jefe de Obra → G. Operaciones → G. General | G. Operaciones → G. General | G. General |
| Gerencia (Martín o César) | G. Operaciones → G. General | G. Operaciones → G. General | G. General |

Se cambia en la skill con los parámetros `aprobaciones.cargos_gerencia` y `aprobaciones.gerencia_omite`.

## Jefe de Obra por obra
- No hay un Jefe de Obra fijo. Se asigna en Proyectos cuando empieza la obra y puede cambiar.
- Debe ser una persona habilitada en Aprobaciones.
- **Al cambiarlo:**
  - las órdenes que esperaban la firma del Jefe de Obra pasan al nuevo;
  - el nuevo recibe el aviso si le toca;
  - queda anotado en el historial de cada orden.
- Cada proyecto guarda el historial de Jefes de Obra (quién y desde/hasta qué fecha).
- La campanita de Gerencia avisa «Asigna el Jefe de Obra de …» cuando una obra en ejecución no tiene uno.

Pruebas: `npm test` 554/554.
