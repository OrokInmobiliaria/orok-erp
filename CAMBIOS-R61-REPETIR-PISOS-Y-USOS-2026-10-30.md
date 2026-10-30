# R61 · Repetir pisos y unidades comerciales/oficinas (67.6.46-r61)

Incluye todo lo de R60.

## Cuadro de áreas vendibles
- **Repetir distribución:** piso modelo + rango («en los pisos del X al Y»). Copia los departamentos (tipología, uso, techada,
  libre y ajuste) y los numera solos (302 → 402, 502…). Si un piso del rango ya tenía unidades se reemplazan tras confirmar.
- **Uso de cada unidad:** Vivienda, Comercial u Oficina (columna «Uso»; las filas comerciales/oficinas se distinguen por color).
- **Indicadores de cabida:** vendible por uso (m² y %), área promedio de vivienda, de local comercial y de oficina.
- **Mix de tipologías:** agrupado por Vivienda / Comercial / Oficinas con subtotales.
- **Datos generales › Comercio y oficinas:** precio de venta y costo de construcción por m² propios para comercio y oficinas
  (0 = igual que vivienda). Entran al modelo: ventas por unidad y costo de construcción (+ techada × diferencia de costo).
- Cálculo por piso: nuevo uso de nivel «Comercial (locales)»; «Llevar al cuadro de unidades» los crea como «Local comercial».

Pruebas: tests/r61-repetir-pisos.test.cjs. 662/662.
