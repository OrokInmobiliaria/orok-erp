# R37 · Control de obra, Honorarios y cobranzas y Equipos instalados

Versión 67.6.20-r37 · 28-10-2026 (Lima) · preproducción. Aditivo: no cambia leads, comentarios, etapas ni el Kanban, y no requiere migración SQL (las colecciones nuevas usan el mismo almacenamiento de documentos del ERP).

## Qué hay de nuevo

En el módulo Contabilidad y Finanzas (`/contabilidad`, solo Gerencia), grupo **Obra y cobranzas**:

### Control de obra (`clara_obra`)
- Valorizaciones mensuales por proyecto, con el avance **acumulado** de cada partida del presupuesto (0 a 100 %). El monto del periodo es la diferencia con la valorización aprobada anterior.
- Indicadores: avance físico, avance programado (de la curva del presupuesto), valorizado acumulado y comprometido en órdenes, con índice de cronograma y relación valorizado ÷ comprometido.
- Gráfico de avance programado, real y costo comprometido.
- Revisión antes de aprobar: avance menor que el anterior, avance mayor a 100 % y atraso mayor a la tolerancia de la skill.
- Gerencia aprueba. Aprobada no se reescribe (lo controla también el servidor): se anula y se crea otra.
- Cuaderno de obra: asientos por tipo (ocurrencia, consulta, instrucción, seguridad, calidad, visita). No se editan ni se borran.
- Con el módulo de cobranzas activo, la valorización aprobada genera el cobro al cliente por el monto del periodo.

### Honorarios y cobranzas (`clara_cobranzas`)
- Hitos de cobro por proyecto: monto sin IGV, factura o recibo por honorarios, fecha prevista. Plantillas de hitos por tipo de proyecto (en la skill).
- Facturar (serie SUNAT, fecha y plazo) → cobros parciales → cobrado. Detracción del cliente (4 % construcción, 12 % demás servicios, referencial) y retención de 4.ª categoría en recibos.
- Datos del cliente y honorario pactado en el proyecto; aviso si los hitos no suman el honorario.
- Correo de recordatorio al cliente (Gmail, Outlook o app de correo).
- El servidor no deja quitar ni cambiar cobros registrados, ni el monto o comprobante de un hito facturado.
- En Proyectos: avance físico, facturado, cobrado, por cobrar y caja del proyecto (cobrado − pagado).

### Alertas nuevas
Cobros por facturar, cobros vencidos, por vencer en 7 días, detracciones de clientes por confirmar, valorizaciones en borrador, falta de valorización del mes y obras con atraso.

### Equipos instalados (Integración)
Pantalla de Gerencia para generar códigos de instalación (se muestran una sola vez), ver los equipos registrados, anular códigos y revocar equipos. Usa las mismas operaciones del servidor de R36 (`createInstallCode`, `getInstallDevices`, `cancelInstallCode`, `revokeInstallDevice`). Las llamadas del módulo instalado envían la marca de equipo instalado igual que el CRM.

## Skill erp-orok-contabilidad
- «Construcción» activa también honorarios y cobranzas.
- Parámetros nuevos `obra` (tolerancia de atraso, días de borrador) y `cobranzas` (plazo, detracción por tipo, plantillas), validados al leer la skill.
- Secciones nuevas «Control de obra» y «Honorarios y cobranzas».

## Otros
- Excel: hojas «Valorizaciones de obra» y «Honorarios y cobranzas».
- Celular: se corrigió el desborde horizontal de la barra superior y del menú.

## Pruebas
`npm test`: 546/546 (6 nuevas en `tests/r37-obra-cobranzas.test.cjs`). Prueba de pantalla con Playwright: valorizaciones, aprobación, observaciones, cuaderno, plantilla de hitos, facturación, cobros parciales y detracción, cobro desde valorización y vista en celular.

## Publicar
Igual que R36: `npm run produccion:antes`, publicar, `npm run produccion:despues`. Los equipos instalados reciben la versión solos.
