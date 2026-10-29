# R48 · Ventas › Estrategia de precios (67.6.31-r48) — en revisión, no publicado

- Pantalla nueva solo para Gerencia en el módulo Ventas: meta vs real vs proyectado, escenarios (meta, línea base, superar), etapas de precio por valor vendido, precios sugeridos por unidad y «Aplicar precios» con respaldo e historial.
- Importa el Excel de estrategia (hojas «Cuadro final» y «Resumen») dentro del ERP.
- Feria: preventa en planos y reserva fuera de preventa, con descuento y cupos, válidas para cualquier unidad. El vendedor elige la oferta al cotizar; el servidor fija el descuento y registra la modalidad en la cotización.
- Estudio de mercado del Evaluador: S/ por m² por dormitorios y tamaño; uso como referencia o como tope (percentil 75).
- M.O.R.A recibe en su feed de ventas el resumen real vs línea base (`precios`).
- Pruebas: `tests/r48-estrategia-precios.test.cjs` (7). Total 613/613.
