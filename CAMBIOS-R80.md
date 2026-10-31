# R80 · Evaluador: cuadro de áreas oficial (áreas fijas) y «Deshacer» general (67.6.67-r80)

## Cuadro de áreas oficial · proyectos avanzados (Infinity 224)
- En Cabida → «¿Proyecto avanzado? Usar el cuadro de áreas oficial»: se pega el cuadro de áreas de los planos (Nivel · Común techada · Común libre · No vendible techada · No vendible libre · Vendible techada · Vendible libre).
- Al fijarlo, el modelo usa EXACTAMENTE esas áreas: unidades con su vendible techada y libre, y área común techada = común + no vendible. Se conservan tipología y ajuste de las unidades que ya existían con el mismo número.
- Se apaga el cálculo por porcentajes (cálculo por piso y cuadre) y se bloquean los botones que recalculan; las áreas de las unidades y el área común quedan de solo lectura. Las correcciones se hacen en el mismo cuadro oficial y el modelo toma el valor exacto.
- Verificación visible: vendible techada, libre vendible, área común y área techada total del modelo con «cuadra exacto».
- Unidades sin área vendible (p. ej. 502 = 0) no cuentan como unidad.

## Deshacer general
- Botón «↶ Deshacer» abajo a la izquierda (y Ctrl/⌘+Z fuera de un campo): vuelve al estado anterior de cualquier cuadro, hasta 60 pasos.
