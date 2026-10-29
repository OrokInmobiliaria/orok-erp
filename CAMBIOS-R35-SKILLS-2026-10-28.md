# R35 · Skills integradas al ERP ÖRÖK

Fecha: 28-oct-2026 (America/Lima). Base: R34. Preproducción: no reemplaza el CRM vivo. Los cambios son aditivos.

## Qué cambia

Las reglas de Contabilidad y Finanzas pasan a vivir en **una sola fuente**: la skill `skills/erp-orok-contabilidad/SKILL.md`. Si cambia una regla (una tasa, un umbral, la fecha de corte, el RUC o la carpeta de una empresa, los módulos por tipo de proyecto), se edita ahí y lo toman **todos**:

| Quién | Cómo la usa |
|---|---|
| Servidor del ERP | `business/claraRules.js` la lee, valida el bloque `clara-parametros` y la entrega por RPC (`claraReglas`) y a n8n (acción `clara_reglas_get`). |
| Pantalla de Contabilidad | IGV, detracción, retención, fecha de corte, tolerancia de conciliación, datos de las empresas y módulos por tipo de proyecto salen de los parámetros. |
| C.L.A.R.A (IA del ERP) | El texto de la skill son sus instrucciones; responde citando la versión. |
| n8n (flujo C.L.A.R.A · Drive) | Los nodos «Reglas · ordenar» y «Reglas · leer entrada» piden las reglas al CRM antes de cada ciclo: ID de carpetas, fecha de corte e instrucciones para leer documentos con Claude. Si el CRM no responde, usa los valores del nodo. |
| Claude (cualquier conversación) | Como skill de la cuenta: el mismo archivo. |
| App publicada en Claude | Trae la skill incorporada al compilarse y muestra su versión en Exportar e integrar. |

La segunda skill, `skills/erp-orok-entrega/SKILL.md`, es el procedimiento de cada versión del ERP: preproducción, cambios aditivos, n8n inactivo, pruebas, manifiesto y zip con hora de Lima.

## Cómo cambiar una regla

1. **Sin desplegar.**
   - Copiar `skills/erp-orok-contabilidad/SKILL.md` a `<directorio privado>/skills/erp-orok-contabilidad/SKILL.md` en el servidor y editar esa copia.
   - El ERP la toma en la siguiente consulta: la pantalla marca la fuente como «servidor» y n8n la recibe en su siguiente ciclo.
2. **En el paquete.** Editar `skills/erp-orok-contabilidad/SKILL.md` y recompilar con `npm run build:contabilidad`. Una prueba verifica que la app compilada lleva la misma versión.
3. **Si el bloque de parámetros tiene un error:**
   - el ERP mantiene la última versión válida y muestra el aviso;
   - si nunca hubo una versión válida en el servidor, usa la del paquete;
   - un error nunca deja el ERP sin reglas.

## Archivos

**Nuevos:**
- `skills/erp-orok-contabilidad/SKILL.md`
- `skills/erp-orok-entrega/SKILL.md`
- `business/claraRules.js`
- `tests/r35-clara-skill.test.cjs` (5 pruebas)

**Cambiados:**
- `business/claraErp.js`
- `contabilidad-src/clara-contabilidad.html` y `contabilidad/`
- `n8n/CLARA-ENSAYO-67.6.18-DRIVE-CONTABLE-INACTIVO.json`: 69 nodos, inactivo
- `tests/r34-clara-drive.test.cjs`: 13 pruebas

## Verificación

- **Suite completa: 532 de 532 pruebas aprobadas.** R34 tenía 526; se suman 6 nuevas.
- Compilación de la interfaz y de `contabilidad/`: correctas.
- Pruebas en navegador de la app (OS completa, bancos, bandeja y proyectos): sin errores.

**No probado con servicios reales:** Google Drive, el n8n real y la IA con clave real.
