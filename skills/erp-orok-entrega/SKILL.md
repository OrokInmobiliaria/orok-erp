---
name: erp-orok-entrega
description: Úsalo al preparar, compilar o entregar una versión del ERP ÖRÖK (CRM L.O.L.A, Evaluador M.O.R.A, Contabilidad D.I.A.V.A, flujos n8n) sin afectar el CRM vivo.
---

# Entrega de versiones del ERP ÖRÖK

Procedimiento para cada nueva versión (R33d, R34, R35, …) del paquete del ERP ÖRÖK. Las tres apps son CRM Inmobiliario con L.O.L.A, Evaluador Inmobiliario con M.O.R.A y Contabilidad y Finanzas con D.I.A.V.A.

## Principios que nunca se rompen

1. **Hay un CRM vivo con datos reales.**
   - Todo pasa primero por preproducción (el ensayo).
   - Nunca se reemplaza el CRM vivo sin un ensayo con una copia real de sus datos y una comparación de conteos antes y después.
2. **Cambios aditivos.**
   - Colecciones, esquemas y columnas nuevas; nada se borra ni se renombra.
   - Migraciones SQL numeradas (`migrations/00N-*.sql`) con `CREATE ... IF NOT EXISTS`, dentro de `BEGIN/COMMIT`, y que se pueden repetir.
3. **n8n.**
   - Los flujos nuevos se exportan con `active: false`, sin `id` y con `pinData` vacío.
   - Se conservan los nodos y conexiones existentes.
   - No se importan varias versiones activas a la vez.
   - Zona horaria America/Lima.
4. **Secretos.** Solo en credenciales de n8n o en el directorio privado del servidor. Nunca en el código, en el JSON ni en el chat.
5. **Permisos.**
   - Evaluador y Contabilidad son solo de Gerencia.
   - El rol sale siempre de la sesión, nunca del navegador.
6. **IA.** Propone; Gerencia aprueba.
7. **Identidad visual.**
   - Fuente Outfit en CRM y ERP.
   - Colores fijos del encabezado: ÖRÖK #B3362B → #85442A → #5E2817; proyecto #85442A. No cambian con la paleta.
   - Franja sólida hasta la línea marrón y efecto cristal debajo.
8. **Fechas.** Solo se usa información desde enero de 2025; lo anterior se conserva y no se usa.
9. **Reglas de negocio en un solo lugar.** Las reglas contables viven en `skills/erp-orok-contabilidad/SKILL.md`. Si una regla cambia, se edita ahí y no en el código.

## Pasos

1. Copiar el paquete anterior a una carpeta nueva de trabajo. No editar el original.
2. Aplicar los cambios. En cada módulo nuevo:
   - lógica de servidor en `business/*.js`;
   - registro en `application.cjs` (RPC `db.*` y acciones de n8n por prefijo);
   - ruta en `server.cjs` solo si es una app aparte (`/evaluador`, `/contabilidad`), sin caché y con permiso de Gerencia;
   - app de origen en `*-src/` y script `deploy/build-*.cjs`, que saca el script a `app.js` (la CSP del CRM no admite scripts en línea);
   - menú en `src/navModel.mjs`, `src/GroupedNav.jsx`, `src/App.jsx` y `src/Access.jsx`.
3. Pruebas nuevas en `tests/rNN-*.test.cjs`: permisos por rol, validaciones, acciones de n8n con secreto, build y menú. Los flujos n8n se prueban ejecutando sus nodos Code con datos simulados.
4. `npm ci`, luego `npm test`: la suite completa debe pasar al 100 %. Reportar el total, por ejemplo «526 de 526».
5. `npm run build`, `npm run build:evaluador` y `npm run build:contabilidad`.
6. Notas:
   - `CAMBIOS-RNN-*.md` con qué cambió, archivos, verificación, lo no probado con servicios reales y los pendientes para el ensayo;
   - una línea arriba en `LEEME-PRIMERO.txt`;
   - el LEEME de cada flujo n8n nuevo.
7. Regenerar `MANIFIESTO-SHA256.txt` sin `node_modules` ni el propio manifiesto, y comprobarlo con `sha256sum -c`.
8. Comprimir sin `node_modules`: `ERP-OROK-RNN-<CONTENIDO>-PREPROD.zip`. Incluir `entregables-adicionales/` con las apps sueltas, los formatos y los diagramas.
9. Informar el SHA-256 del zip, la cantidad de archivos y la **fecha y hora de Lima** de producción.

## Antes de recomendar la salida a producción

- Respaldo del CRM vivo (`npm run backup-before-update`) y verificación de `restore-check.json`.
- Restaurar en el ensayo, migrar y comparar conteos: leads por etapa, conversaciones, unidades, cotizaciones, separaciones y Kanban.
- Prueba de humo por canal y por módulo con las 3 personas del equipo y sus roles reales.
- Ventana de mantenimiento y 48 horas de monitoreo.
- Si algo de esto falta, la recomendación es **no** reemplazar todavía, con la ruta de días que falta.
