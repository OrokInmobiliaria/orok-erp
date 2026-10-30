# R49 · Estrategia de precios: escalera hacia el precio ERP, ajuste manual y estacionamientos (67.6.34-r49)

- **Escalera hacia el precio ERP** (recomendada): Etapa 1 = oferta de preventa (precio del Excel por unidad), Etapa 2 a mitad de camino (avance 0.5) y Etapa 3 = precio ERP. El precio ERP se congela como referencia al activar la escalera (botón «Tomar precios ERP de hoy» para volver a tomarlo); aplicar precios no lo mueve.
- **Rango del mercado**: el sugerido no pasa el percentil 75 del estudio de mercado del Evaluador (por dormitorios y tamaño); sin estudio, el techo es el precio ERP. Nunca baja del precio de la etapa vigente.
- **Lectura del mercado y recomendación**: oferta bajo p25, ERP o etapa sobre p75, techo de recaudación frente a la meta y opciones.
- **Ajuste manual por unidad o estacionamiento**: automático, % sobre la etapa activa (+/−) o precio fijo; también para varias marcadas a la vez. Lo manual queda fuera del ajuste automático y el resto se recalcula para la meta.
- **Estacionamientos A–D** dentro de la meta con el mismo criterio. La cotización toma su precio de la estrategia (antes S/ 56,000 fijos) y no ofrece los separados. En una separación con estacionamiento, su parte se cuenta en la cochera.
- Pruebas: tests/r49-precios-manual-cocheras.test.cjs (626/626).
