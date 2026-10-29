# R46 · C.L.A.R.A ahora es D.I.A.V.A — 29/10/2026

Versión 67.6.29-r46. Rama `r46-diava` (depende de R45).

**D.I.A.V.A = Dirección Integral de Administración, Valorizaciones y Activos.** Es la IA del módulo Contabilidad y Finanzas: OC/OS con aprobaciones, pagos, bancos, presupuesto, control de obra, honorarios y cobranzas.

## Qué cambia (solo lo visible)

- El botón y el panel del asistente en Contabilidad, sus textos de ayuda y el título.
- Las instrucciones de la IA («Eres D.I.A.V.A…»).
- La firma de los correos de aprobación de OC/OS.
- El selector de módulos, el marco de Contabilidad en el ERP y el manifiesto de la app instalable.
- La skill `erp-orok-contabilidad` y su copia dentro de la app. La versión de la skill quedó actualizada en ambas y el texto coincide.
- Las skills de n8n y de entrega, el conector de Claude y G.R.E.T.A.

## Qué NO cambia (a propósito, para no romper lo validado)

- **Drive:** la carpeta «07 Procesados por C.L.A.R.A» de cada empresa conserva su nombre. La usa el flujo n8n; si se renombrara, el flujo crearía carpetas nuevas. Lo mismo para los archivos `CLARA-BANDEJA.json`, `CLARA-INVENTARIO-*.json` y los reportes «CLARA EMPRESA …».
- **n8n:** los flujos, sus nombres de archivo (`CLARA-…-INACTIVO.json`), sus nodos y la cabecera `X-Clara-Secret` del webhook. Cambiar el nombre del flujo exigiría reimportarlo; se puede renombrar a mano en n8n cuando convenga, sin tocar sus nodos.
- **Código interno:** métodos `clara*`, colecciones, esquema SQL `clara` y archivos de configuración (`clara.json`).
- **Documentos de versiones anteriores:** quedan como antecedentes, con el nombre que tenían.

## Pruebas

`tests/r46-diava.test.cjs` revisa que ningún texto visible diga C.L.A.R.A (salvo el nombre histórico de la carpeta), que la IA se presente como D.I.A.V.A, que los correos firmen así y que la cabecera de n8n no cambie. Total: 604/604.
