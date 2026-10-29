---
name: erp-orok-produccion
description: Úsalo para publicar una versión nueva del ERP ÖRÖK en el host (Easypanel/Docker) de forma automática, conservando la base del CRM con leads, comentarios, etapas y orden del Kanban.
---

# Publicar el ERP ÖRÖK en el host sin perder datos

El CRM vivo tiene datos reales: leads, comentarios, etapas y subetapas, orden del Kanban, unidades, cotizaciones, separaciones y gastos. Una actualización **reemplaza solo el código**. La base se conserva y se comprueba antes y después.

## Principios

- **Primero el ensayo.** No se publica en producción una versión que no pasó por el ensayo con una copia real de los datos (skill `erp-orok-entrega`).
- **Solo código.** Se conservan el volumen privado (`OROK_PRIVATE_DIR`), las variables del servicio y PostgreSQL. Nunca se inicializa una base vacía.
- **Migraciones solo aditivas** (`migrations/00N-*.sql`). `deploy/aplicar-migraciones.cjs` rechaza DROP, DELETE, TRUNCATE y ALTER … DROP/RENAME.
- **Respaldo verificado obligatorio.** Sin `restore-check.json` con `verified: true` no se publica.
- **Verificación después:** sin pérdida de leads (activos o archivados), etapa y subetapa iguales, todos los comentarios presentes, el mismo orden relativo del Kanban por etapa y ningún registro faltante. Los leads y comentarios nuevos sí se permiten.
- **Producción no es el ensayo.** `OROK_REHEARSAL=0` en las variables del servicio (el Dockerfile trae 1 por defecto).
- **Secretos fuera del código.** La URL del deploy hook va en un archivo privado (`OROK_DEPLOY_HOOK_FILE`).

## Procedimiento automático

En una ventana de mantenimiento, con la versión ACTUAL todavía corriendo y escrituras detenidas:

```bash
npm run produccion:antes
#  revisa el entorno (bloquea si OROK_REHEARSAL=1), comprueba PostgreSQL, revisa las migraciones
#  y crea el respaldo verificado (crm-data.json.gz, kanban-positions.json, restore-check.json, manifest.json)
node deploy/produccion.cjs antes --migrar --desplegar
#  además aplica las migraciones aditivas y llama al deploy hook del host para publicar la imagen nueva
```

Cuando el host termine de publicar:

```bash
npm run produccion:despues
#  espera /api/health con la versión nueva y compara la base contra el respaldo (deploy/verificar-actualizacion.cjs)
```

- **Si sale OK:** salir del mantenimiento y vigilar 48 horas (registro en `<privado>/deploy/produccion.log` y `verificacion-*.json`).
- **Si NO sale OK:** no usar la versión nueva. Volver a la imagen anterior en el host y, si hiciera falta, restaurar por id desde el respaldo (`MIGRACION-R28-SIN-PERDIDA.md`). Nunca borrar leads ni datos posteriores sin autorización expresa.

## Configuración única del host (Easypanel)

| Variable | Valor |
|---|---|
| `OROK_REHEARSAL` | 0 |
| `OROK_PRIVATE_DIR` | volumen persistente |
| `LOLA_POSTGRES_URL_FILE` | archivo con la conexión |
| `OROK_DEPLOY_HOOK_FILE` | archivo con la URL del deploy hook del servicio |

- En el volumen privado: `clara.json` (enlace con n8n para Drive), `lola-asistente.json` (IA) y, si se edita, `skills/erp-orok-contabilidad/SKILL.md`.
- Dominio con HTTPS: la app instalada y las cookies seguras lo requieren.

## Siempre actualizado: ERP instalado en PC, Mac o celular

- El ERP es una app web instalable (PWA): `manifest.webmanifest` y `sw.js`, que se generan con `npm run build`.
- Cada compilación marca `sw.js` con la versión y la huella. Los equipos instalados detectan la versión nueva al abrir, cada 30 minutos y al volver a la ventana, y muestran «Actualizar ahora». Si nadie lo pulsa, se aplica sola la próxima vez que se abra el ERP.
- El service worker nunca guarda en caché datos ni la API. Todo lo vivo viene del servidor, así que web e instalado ven lo mismo.
- Publicar en el host es lo único que hay que hacer para actualizar a todos.

## Al reportar

- Versión anterior → nueva.
- Ruta del respaldo y conteos: leads por etapa, archivados, comentarios, unidades, cotizaciones, separaciones.
- Migraciones aplicadas.
- Resultado de la verificación.
- Hora de Lima de cada paso.
