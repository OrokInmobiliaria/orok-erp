# Migración r28 sin pérdida de datos

**Esta entrega no fue desplegada.** El CRM publicado continúa sin cambios.

## Puerta obligatoria antes de la subida oficial

1. Poner el CRM en mantenimiento para impedir nuevas escrituras durante el respaldo.
2. En la versión que está operando, confirmar proyecto y conexión PostgreSQL correctos.
3. Ejecutar:

```powershell
npm run backup-before-update
```

4. Abrir la carpeta informada por el comando y exigir estos archivos:

- `crm-data.json.gz`
- `kanban-positions.json`
- `restore-check.json`
- `manifest.json`

5. `restore-check.json` debe indicar `verified: true`.
6. Guardar los conteos de leads, unidades, cotizaciones y separaciones del manifiesto.
7. Cancelar la subida si falta un archivo, no coincide un hash, cambia el orden del Kanban o cualquier conteo no coincide.

## Qué guarda el respaldo

- Documento completo y autoritativo de PostgreSQL.
- Leads activos y archivados.
- Fichas y campos comerciales.
- Orden global y posición dentro de cada etapa del Kanban.
- Unidades, cotizaciones, separaciones y gastos.
- Metadatos de verificación y hashes SHA-256.

El respaldo es de solo lectura respecto a PostgreSQL. Solo escribe archivos dentro del directorio privado del CRM.

## Despliegue permitido

- Sustituir el código por la r28 compilada.
- Conservar el volumen privado y las variables existentes.
- Conservar PostgreSQL como fuente autoritativa.
- No ejecutar inicializadores de ensayo sobre la base existente.
- No usar `rehearsal:init` ni una migración destructiva.
- No vaciar colecciones, tablas, leads o documentos.
- Mantener n8n r28 inactivo hasta revisar sus credenciales y rutas.

## Comprobación posterior

1. Salud del servidor en versión `67.6.11-r28`.
2. Mismos conteos del manifiesto.
3. Mismos IDs, etapas, subestados y posiciones Kanban.
4. Abrir fichas existentes, cotizaciones y separaciones antiguas.
5. Crear un lead ficticio.
6. Probar GNB, separación y minuta con documentos ficticios.
7. Confirmar que no se puede cerrar una venta sin minuta firmada y voucher de notaría.
8. Activar escritura normal solo cuando todo coincida.

## Reversión

Primero se revierte el código. Los datos no se reemplazan de forma masiva. Si una restauración fuera necesaria, se hace selectivamente por ID usando el respaldo y la comparación del manifiesto; nunca se borran registros posteriores sin autorización expresa.
