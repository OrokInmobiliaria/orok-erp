# Reglas permanentes del ERP ÖRÖK (lecciones de desarrollo)

Estas reglas las fijó Martín Montezuma (Gerencia ÖRÖK). Cualquier IA que programe este repositorio (Claude, Codex/GPT u otra) debe seguirlas.

## Datos y seguridad
- Nunca borrar datos de producción: desactivar, archivar o descartar. Solo cambios aditivos; nunca restaurar encima de la base de producción.
- Antes de cualquier restauración o migración, respaldo previo.
- Nunca escribir contraseñas, 2FA, tokens, secretos ni números de tarjeta. Las claves las genera y pega Gerencia en el ERP.
- El número de teléfono de Gerencia no debe aparecer en ningún archivo, plantilla, prompt ni mensaje.
- No cambiar OROK_PROJECT ni SESSION_SECRET. No renombrar archivos o flujos CLARA-* ni el encabezado X-Clara-Secret.
- Flujos de n8n se importan INACTIVOS; se activan solo con autorización de Gerencia.
- En videos o capturas que salgan del ERP: difuminar tokens y nombres de clientes.

## Diseño
- Conservar el efecto Crystal (glass) en todo el ERP. La única pantalla sin Crystal es la de acceso (usuario y clave). Cristal 3.0 (R103): fondo de color más oscuro (mezcla del color de marca de la paleta) para que el cristal se note; paneles esmerilados claros con borde de luz y reflejo, texto siempre legible. Las capas internas (tablas, encabezados, avisos, campos, tarjetas dentro de tarjetas) también son cristal, más fino; nada sólido dentro de un panel (R104). R106: +20% de transparencia, realce más fuerte al pasar el mouse y menú lateral (barra de iconos y desplegado) también en cristal.
- Marca: colores #85442A, #5E2817, #B3362B, #FCFAF8, #292524; tipografía Outfit.
- Interfaz en español, explicaciones simples: Gerencia no es desarrolladora.

## IA del ERP
- La IA rellena lo operativo; la persona confirma lo comercial, legal o de dinero. La IA nunca mueve dinero ni envía a clientes nuevos sin aprobación.
- Las correcciones del equipo se vuelven lecciones propuestas (business/lecciones.js); solo las aprobadas por Gerencia se aplican.

## Flujo de entrega
- Rama desde `origin/ensayo` (usar FETCH_HEAD tras `git fetch origin ensayo`) → PR a `ensayo` → squash merge → `git archive` del FETCH_HEAD actualizado a ERP-OROK-R##-PRODUCCION.zip → Gerencia lo sube a Easypanel.
- Subir la versión en package.json y package-lock.json (67.6.x-r##) y escribir CAMBIOS-R##.md.
- `npm test` en verde antes de entregar; `npm run build` actualiza dist/.
- Archivos con CRLF: editar normalizando y restaurando CRLF (no mezclar finales de línea).
- Escrituras al store: `store.db.runTransaction(tx => tx.set/delete)`.

## Evaluador inmobiliario: conceptos base (valen para TODOS los proyectos)
- Costo de construcción: costo por m² × área total (techada + libre), como el presupuesto de obra. Sin cargos extra. El área total (techada común + techada vendible + libre vendible) se muestra arriba en Costos de construcción. El área libre puede costearse a un % del m² techado (100% por defecto = presupuesto original; sin muros ni techo suele ser ≤ 40%).
- Costo directo = partidas (S/ por m² × área total). GG = total del detalle de «Gastos generales» (fijos + % sobre el presupuesto); utilidad = % sobre el subtotal: subtotal = (CD + GG) / (1 − utilidad). El costo total por m² se deriva.
- Partidas: cada una tiene su S/ por m²; cambiar su S/ por m² o su incidencia cambia esa partida y el total, no las demás.
- Área libre (balcones, terrazas) es vendible y siempre entra al precio (precio general o diferenciado por unidad).
- Cabida: el cálculo por piso es ayuda; el modelo usa el mix del cuadro de unidades (dúplex/tríplex, varios dptos. por piso, balcones distintos). Cuadro oficial de planos = áreas exactas, sin recalcular.
- Predial y arbitrios año por año (situación al 1 de enero), siempre con evidencia (HR/PU, recibos, ordenanza del distrito y zona): antes del inicio de obra los paga el propietario del terreno (no la empresa); durante la obra se paga como terreno; terminada la obra se carga solo 1 año de las unidades (se venden en unos 6 meses). Impuestos municipales sin IGV. Se calculan solo en «Impuesto predial año por año» y ese total entra a egresos una vez: no se repiten como líneas de costos inmobiliarios.
- Egresos: Gastos financieros con su propia línea de banco (p. ej. 0.45% sobre 50% de ventas) además de estructuración, supervisión, gastos bancarios y notariales; no se mezclan con intereses de flujo. Marketing, Ventas y Posventa son tres estructuras separadas. Cada línea en % puede aplicarse «sobre X% de ventas».
- Banco y preventa: el saldo de los compradores (crédito hipotecario) lo desembolsa el banco 48 h después de la firma de la minuta, una vez cumplida la preventa exigida (las minutas previas se liberan con la última de la preventa). Preventa según perfil: promotor nuevo (p. ej. Infinity, primer proyecto: 5 dptos. o 45% del valor de venta, lo que se cumpla primero) o con experiencia (≈30%). Ambos escenarios y «con la entrega» son elegibles.
- Aporte: el terreno propio es aporte en especie (no sale dinero); el aporte en efectivo se compara con el capital propio disponible. El banco puede exigir demostrar gastos (sin terreno) antes de desembolsar; el desembolso es el mes en que se cumplen preventa y gastos. Las cuotas iniciales pueden estar retenidas por el banco hasta el desembolso (escenario elegible).
- TIR: si el flujo cambia de signo varias veces se usa TIR modificada a la tasa de descuento.
- Gráficos: colores claros y distinguibles (sin líneas o puntos marrón oscuro o negros juntos); puntos con borde blanco.
- Fases y precio: preventa en planos (descuento alto) → demolición → venta con descuento medio (construcción) → casco habitable → descuento bajo (acabados) → levantamiento de observaciones → precio regular → entrega → independización. Criterios: escalera descendente, regular vs obra nueva en venta (P25–P75), preventa vs lanzamientos, precio más bajo ≥ equilibrio, descuento de preventa vs costo del dinero, preventa del banco antes de la obra y cupos para que queden unidades al precio regular.
- Política de descuentos: cada condición (inicial 10%, inicial fuerte, contado, bróker/primeras unidades…) se aplica solo a las unidades esperadas y al precio de su fase; se combina con el descuento por fase (1−(1−a)(1−b)) y se controla contra el precio de equilibrio. Puede usarse como descuento promedio del modelo.
- Precio mínimo: el piso de decisión es el precio por m² del margen objetivo (no el equilibrio). Colchón = precio final − mínimo (≈60% llega a utilidad neta). Tope de negociación por fase = descuento máximo sin bajar del mínimo. Al «Guardar en el CRM» la política pasa a la Estrategia de precios y a las solicitudes de precio especial; M.O.R.A recibe estos criterios (CRITERIOS_MORA). Las ventas de ejemplo nunca cuentan como reales.
- Estructura de costos: los grupos fuera de rango tienen «Simular» (vista que no cambia nada); al aplicar, el nuevo monto se reparte en proporción entre las partidas del grupo y se puede deshacer.
- Estudio de mercado: solo obra nueva (sin segundo uso ni remodelados); alturas elegidas con casillas.
- Calendario: inicio oficial (mes 0) y hito de aprobación bancaria; la duración del proyecto va del arranque a la entrega e independización.
- Los datos propios de un proyecto (p. ej. HR/PU de Infinity 224) son datos, no fórmulas: nunca se copian a otro proyecto.
