# R91 · Evaluador: partidas de construcción editables a tu criterio (67.6.78-r91)

- Cada partida tiene su propio S/ por m². Al cambiar el **S/ por m²** de una partida (subir o bajar), cambia solo esa partida; el costo total por m² y las incidencias se recalculan.
- Al cambiar la **incidencia %** de una partida, cambia su S/ por m² (las demás conservan el suyo) y el total se ajusta. Antes la incidencia repartía el resto sin mover el total.
- Corrige que el S/ por m² mostrado incluía el costo del área libre construida y de usos con otro costo: por eso al escribir un valor menor el resultado subía. Ahora ese adicional va en su propia fila («Adicional: área libre construida… · se edita en Datos generales»).
- Casillas de incidencia más anchas; S/ por m² con 2 decimales y costo total por m² redondeado al céntimo.
