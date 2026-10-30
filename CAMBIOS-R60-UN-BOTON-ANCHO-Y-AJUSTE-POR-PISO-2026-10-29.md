# R60 · Un solo botón de IA (de verdad), pantalla a todo el ancho y «Ajustar a las unidades» (67.6.45-r60)

Incluye todo lo de R59 (versión integrada).

- **Doble botón de IA:** el navegador conservaba una copia vieja del programa del botón y seguía mostrando la píldora flotante
  «M.O.R.A · Dictar o adjuntar». Ahora el programa se pide con la versión en la dirección (cada versión nueva se descarga sí o sí)
  y, si quedara una copia vieja, la píldora se retira. Queda solo «Llenar esta pantalla · dictar o adjuntar» dentro del panel de la IA.
- **Ancho:** el Evaluador, Contabilidad y Órdenes ocupan todo el ancho de la ventana; el resto del ERP llega hasta 1600 px (antes 1400).
- **Cabida › Del cálculo por piso al cuadro de áreas vendibles:**
  - Varios departamentos en un piso = una fila por departamento con el mismo número de piso (se suman solos).
  - Botón **«Ajustar a las unidades»** por piso y **«Ajustar todos los pisos a las unidades»**: el piso toma el área real de sus
    departamentos (techada = vendible ÷ eficiencia del piso; libre vendible y número de unidades también).
  - Mensajes más claros: «el cálculo permite X m² más» / «las unidades superan al cálculo en X m²».

Pruebas: tests/r60-ajustes-cabida-ancho.test.cjs. 657/657.
