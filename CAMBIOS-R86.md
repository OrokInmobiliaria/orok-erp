# R86 · Cristal 2.0 con movimiento (67.6.73-r86)

- Tarjetas, columnas del Kanban, indicadores y paneles: cristal más transparente con desenfoque real del fondo, borde de luz y brillo superior.
- Fondo vivo: las manchas de color de la paleta se desplazan muy despacio (46-60 s por ciclo) para dar profundidad sin distraer.
- Movimiento: entrada suave de las tarjetas al abrir una pantalla, destello de luz al pasar el mouse por una tarjeta, tarjetas del Kanban que se elevan levemente y botón principal con brillo.
- La pantalla de acceso (usuario y clave) sigue sin cristal. Las ventanas emergentes mantienen un cristal más opaco para leer bien.
- Si el equipo tiene activado «reducir movimiento» o «reducir transparencia», se respeta automáticamente.
- Técnico: el desenfoque va en un pseudo-elemento para no afectar ventanas y menús fijos; archivo src/cristal2.css.
