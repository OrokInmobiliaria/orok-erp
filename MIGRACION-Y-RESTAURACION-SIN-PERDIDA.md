# Migración y restauración sin pérdida

## Regla principal

La actualización cambia el código, no reemplaza la información operativa. Deben mantenerse exactamente los datos y vínculos de la versión original o de la versión anterior que esté funcionando.

## Elementos que se deben conservar

- Base PostgreSQL completa y el mismo espacio/proyecto de datos.
- Leads, responsables, etapas, subestados, notas, comentarios e historial.
- Conversaciones y asociaciones de WhatsApp, Messenger, Instagram y otros canales.
- Posiciones y orden de las tarjetas del Kanban, incluido `kanban-positions.json` cuando corresponda.
- Cotizaciones, separaciones, minutas, documentos firmados, vouchers y planos.
- Volumen privado `/app/private` y todos sus archivos de configuración.
- Variables de entorno, enlaces, URLs de webhook, IDs de proyecto y carpeta, credenciales y conexiones ya validadas.
- Usuarios, roles y contraseñas existentes; no ejecutar una activación inicial sobre una instalación ya operativa.

## Antes de conectar o promover

1. Crear respaldo verificable de PostgreSQL, volumen privado y código en ejecución.
2. Registrar conteos de leads, conversaciones, unidades, cotizaciones, separaciones, ventas y posiciones Kanban.
3. Desplegar el ZIP en una copia/preproducción conectada según el plan de migración, nunca sobre una base vacía si se desea conservar la operación.
4. Ejecutar migraciones únicamente aditivas. Prohibidos `DROP`, `TRUNCATE`, reinicialización y reemplazo masivo de datos.
5. Comparar los conteos y abrir muestras de leads de distintas etapas antes de aprobar la promoción.

## Restauración segura

- La restauración predeterminada es **solo de código/imagen**: volver a la imagen anterior manteniendo la misma base PostgreSQL y el mismo volumen privado actual.
- No copiar sobre producción una base, `crm-data.json.gz`, archivo de posiciones Kanban o volumen privado antiguo: podría borrar trabajo registrado después del respaldo.
- Si un dato concreto requiere recuperación, restaurarlo selectivamente por ID y con autorización expresa, después de comparar fecha y conteos.
- No restaurar tokens o claves antiguas sobre conexiones nuevas que ya estén funcionando.
- Después de volver atrás, comprobar `/api/health`, conteos, posiciones Kanban, archivos y una conversación por canal.

## Criterio de aprobación

La migración o restauración solo se considera correcta si los conteos coinciden, los leads conservan su etapa y posición, los enlaces abren, las conversaciones permanecen asociadas y no aparece una pantalla de activación inicial en una instalación que ya tenía usuarios.