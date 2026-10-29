# R33d · Cierre del ensayo y decisión de salida

Fecha: 26 de octubre de 2026 (America/Lima). Base: paquete `ERP-OROK-r33c-CLAUDE-MAPA-PREPROD`.

## 1. Correcciones de esta revisión

| # | Problema encontrado | Corrección |
|---|---|---|
| 1 | «Calcular distancias» reemplazaba también las distancias escritas a mano, y vaciar el campo dejaba **0 cuadras**, lo que metía el comparable dentro del radio | Una distancia escrita a mano queda marcada como **manual** y el cálculo automático la respeta. Vaciar el campo la devuelve al cálculo, sin dejarla en 0. El mensaje indica cuántas distancias se respetaron |
| 2 | El servidor bloquea la salida hacia `api.openai.com` | Ahora se permite, para el asistente L.O.L.A cuando Gerencia elija ChatGPT. Con Claude no afectaba |
| 3 | `MANIFIESTO-SHA256.txt` no coincidía con 14 archivos | Se regeneró |

**Archivos:** `evaluador-src/evaluador.html` y `evaluador/` (regenerado), `safe-network.cjs` y `tests/r33d-distancias-openai.test.cjs` (nuevo).

**Verificación:**
- **Suite completa:** 506 de 506 pruebas aprobadas.
- **Build:** correcto.
- **Prueba en Chromium dentro del servidor de prueba, con un geocodificador simulado:**
  - con una distancia manual de 2.5 cuadras, se calcularon las otras 29 y la manual quedó intacta;
  - al vaciar el campo, la distancia volvió a quedar pendiente de cálculo.

## 2. Estado de los cinco puntos del ensayo

| # | Punto | Estado | Qué falta |
|---|---|---|---|
| 1 | Distancias automáticas sin sobrescribir las manuales | **Corregido y probado** (prueba automática y en navegador, con geocodificador simulado) | Una prueba en el ensayo con Nominatim real y un comparable de prueba |
| 2 | M.O.R.A con Claude sin quedarse en «analizando» | **Pendiente en el ensayo** | Importar el flujo M.O.R.A (40 nodos) inactivo, crear la credencial Anthropic y ejecutarlo a mano con una consulta. Si n8n no responde en 4 minutos, la pantalla deja de esperar con un aviso; hay que mirar la ejecución en n8n |
| 3 | Flujo L.O.L.A en n8n | **No requiere cambios de nodos.** Las 20 acciones del flujo R30 existen en el servidor | Configurar la zona horaria `America/Lima` (hoy vacía). El flujo usa OpenAI con Gemini de apoyo; cambiarlo a Claude es una decisión aparte, que reemplaza solo el nodo del modelo y conserva las conexiones |
| 4 | Pendientes funcionales | **Abiertos** | Desestimado / Perdido en «Enviar a seguimiento» (cambio no aplicado), documentos de Drive, cierre de venta y formulario real de Meta |
| 5 | Respaldo y comparación antes/después | **Incompleto** | El ensayo tiene **2 leads, 1 unidad, 1 cotización y 1 separación**. No se ensayó la migración 67.6.10 → R28 → R33 con una copia de la base viva |

## 3. Decisión de salida

**No se recomienda reemplazar el CRM vivo mañana.** Motivos:
1. No se ensayó la migración con una copia real de los datos vivos. Es la regla principal del plan (`CONEXION-FINAL-SIN-PERDIDA.md`, punto C.1: «nunca una base vacía»).
2. Hay pendientes funcionales abiertos que el propio paquete marca como prioritarios.
3. M.O.R.A y los canales no tienen prueba de punta a punta en el ensayo.

### Ruta sugerida

**Día 1 (mañana): ensayo con datos reales**
1. Respaldar el CRM vivo con `npm run backup-before-update` y verificar `restore-check.json`.
2. Restaurar ese respaldo en el ensayo. Migrar a R28 y luego a R33d con el procedimiento de `MIGRACION-R28-SIN-PERDIDA.md`.
3. Comparar los conteos con el vivo: leads por etapa, conversaciones, unidades, cotizaciones, separaciones y posiciones del Kanban.
4. Probar en el ensayo:
   - las distancias con Nominatim real;
   - M.O.R.A con Claude;
   - L.O.L.A (zona horaria);
   - una prueba de humo por canal.

**Día 2: pendientes y equipo**
- Cerrar Desestimado / Perdido, Drive, cierre de venta y el formulario de Meta.
- Hacer una prueba con las 3 personas del equipo y con sus roles reales.

**Día 3: salida, si todo está en verde**
- Ventana de mantenimiento, respaldo verificado y reemplazo solo del código.
- Monitoreo durante 48 horas.

## 4. Costos de IA estimados

Precios publicados por Anthropic al 26-oct-2026, por millón de tokens:
- **Haiku 5.5:** US$ 0.10 de entrada y US$ 0.50 de salida, en consultas de hasta 100 mil tokens.
- **Sonnet 5.5:** US$ 2 de entrada y US$ 10 de salida.

| Uso | Modelo | Costo aproximado |
|---|---|---|
| Asistente L.O.L.A, por consulta | Haiku 5.5 | US$ 0.001 (unos 9 mil tokens de contexto) |
| Consulta a M.O.R.A | Haiku más Sonnet | US$ 0.02 a 0.03 |
| Lectura de una página de avisos | Sonnet 5.5 | US$ 0.06 a 0.10 |
| Lectura semanal | Sonnet 5.5 | US$ 0.02 |

**Mes típico para el equipo: 3 personas, 2 con uso frecuente** (unas 40 consultas diarias al asistente por cada usuario frecuente, 150 consultas a M.O.R.A al mes y 20 lecturas de mercado al mes):

| Uso | Costo al mes |
|---|---|
| Asistente L.O.L.A | US$ 2 a 3 |
| M.O.R.A | US$ 3 a 5 |
| Lecturas de mercado y lectura semanal | US$ 2 |
| **Total en Claude** | **US$ 7 a 10 al mes** (con uso intenso, alrededor de US$ 12) |

**No incluye:** el flujo n8n de L.O.L.A con clientes, que usa OpenAI y Gemini en sus propias cuentas.

**Recomendación:**
- tener **US$ 20 de saldo** en la cuenta de Anthropic, suficiente para dos meses o más;
- definir un **límite de gasto mensual de US$ 15** con alerta;
- dejar el límite del asistente en 50 consultas por persona al día;
- nombrar a una persona responsable de recargar.

El saldo real solo se ve en la consola de Anthropic.
