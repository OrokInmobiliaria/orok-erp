# R58 · Cabida por altura máxima y borrado de proyectos con doble confirmación (67.6.43-r58)

## Evaluador › Cabida
- **Sin coeficiente de edificación.** La altura máxima se ingresa como la entrega la municipalidad: **en número de pisos** o **en metros**.
  En metros: pisos = 1 + ⌊(altura − altura del primer piso) / altura de entrepiso⌋ (por defecto 3.00 m y 2.70 m, editables).
  El indicador compara los pisos del cálculo con esa altura y muestra la altura aproximada resultante.
- **El cálculo por piso alimenta el «Cuadro de áreas vendibles»; no lo reemplaza.** Nuevo cuadre piso por piso (vendible y libre del
  cálculo vs. lo asignado a las unidades) y botón **«Llevar al cuadro de unidades»**: crea las unidades de los pisos que aún no
  tienen ninguna (área repartida en partes iguales, tipología «Por definir»). Los pisos con unidades no se tocan.
- «Usar en el modelo» pasa a llamarse «Usar área común en el modelo» (mismo comportamiento).

## Mis proyectos › Borrar proyecto
- Botón **«Borrar proyecto»** junto a «+ Nuevo proyecto».
- **Doble confirmación**: una Gerencia lo solicita escribiendo el nombre exacto (y un motivo) y **otra** Gerencia lo confirma.
  Una de las dos debe ser la **Gerencia General** (cargo «Gerencia General» en Contabilidad › Aprobaciones). La solicitud vence en 7 días
  y cualquier Gerencia puede cancelarla.
- Borrar = **archivar**: el proyecto deja de verse en Mis proyectos y en el selector; sus datos y su historial se conservan
  (no se elimina nada). El proyecto principal (Infinity 224) no se puede borrar. Si el proyecto estaba abierto, se vuelve al principal.

## Pruebas
- tests/r58-cabida-altura.test.cjs, tests/r58-borrar-proyecto.test.cjs; ajuste en r57 (sin coeficiente). 652/652.
