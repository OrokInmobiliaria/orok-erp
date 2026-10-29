# R48 · Ventas › Estrategia de precios (67.6.31-r48) — en revisión, no publicado

- Pantalla nueva solo para Gerencia en el módulo Ventas: meta vs real vs proyectado, escenarios (meta, línea base, superar), etapas de precio por valor vendido, precios sugeridos por unidad y «Aplicar precios» con respaldo e historial.
- Importa el Excel de estrategia (hojas «Cuadro final» y «Resumen») dentro del ERP.
- Feria: preventa en planos y reserva fuera de preventa, con descuento y cupos, válidas para cualquier unidad. El vendedor elige la oferta al cotizar; el servidor fija el descuento y registra la modalidad en la cotización.
- Estudio de mercado del Evaluador: S/ por m² por dormitorios y tamaño; uso como referencia o como tope (percentil 75).
- M.O.R.A recibe en su feed de ventas el resumen real vs línea base (`precios`).
- Pruebas: `tests/r48-estrategia-precios.test.cjs` (7). Total 613/613.

## Precio especial con aprobación de Gerencia
- Ventas ya no aplica descuentos libres: propone un precio (rebaja o alza) con motivo; Gerencia aprueba (puede ajustar el monto), observa o rechaza en Ventas › Estrategia de precios. Avisos por correo con el directorio de Aprobaciones.
- La aprobación vale 7 días para esa unidad, cliente y lista; se consume al cotizar y queda en la cotización (`aprobacion_precio`). La separación y la minuta toman el precio final de la cotización.
- La oferta de feria vigente no necesita solicitud (ya está aprobada en la estrategia). Gerencia cotiza directamente.
- PDF de cotización: «Descuento aprobado por Gerencia», «Ajuste de precio aprobado por Gerencia (+x %)» o «Descuento de feria».
- Pruebas: 8 en `tests/r48-estrategia-precios.test.cjs`. Total 614/614.
