# R36 · Conexión final: n8n, publicación sin pérdida de datos, ERP instalable y registro de equipos

Fecha: 28-oct-2026 (America/Lima). Base: R35. Preproducción: no reemplaza el CRM vivo. Los cambios son aditivos.

## 1. Skills nuevas (en `skills/`)

| Skill | Para qué |
|---|---|
| `erp-orok-n8n` | Modificar, evaluar y preparar los flujos L.O.L.A, M.O.R.A y C.L.A.R.A para producción, conservando nodos y conexiones. |
| `erp-orok-produccion` | Publicar una versión en el host de forma automática, conservando leads, comentarios, etapas y orden del Kanban. |
| `erp-orok-instalacion` | Primera conexión del servidor e instalación en PC, Mac o celular con un código de instalación que solo vive en el servidor. |

Estas tres se suman a `erp-orok-contabilidad` (fuente única de reglas) y `erp-orok-entrega` (procedimiento de cada versión).

## 2. Herramientas

| Comando | Qué hace |
|---|---|
| `npm run n8n:auditar` | Revisa los tres flujos: activo, zona horaria, código, webhooks sin autenticación, secretos, credenciales, hosts de ensayo. |
| `node deploy/n8n-herramientas.cjs comparar A B` | Confirma que una modificación conserva nodos y conexiones. |
| `npm run n8n:preparar` | Con `n8n/produccion-mapa.json` (solo hosts, nombres e ID de credenciales) genera las versiones PRODUCCIÓN inactivas y su auditoría. |
| `npm run migraciones` | Revisa las migraciones y rechaza cualquier borrado. `--aplicar` las ejecuta. |
| `npm run produccion:antes` | Revisa el entorno (bloquea si es el ensayo), PostgreSQL y las migraciones, y crea el respaldo verificado. Con `--migrar --desplegar` también aplica migraciones y llama al deploy hook. |
| `npm run produccion:despues` | Espera la versión nueva en `/api/health` y compara la base con el respaldo. |
| `npm run verificar-actualizacion` | La misma comparación, por separado. |
| `npm run codigo-instalacion -- crear/listar/revocar/anular` | Códigos de instalación y equipos. |

La auditoría actual encontró que **el flujo de L.O.L.A tiene la zona horaria vacía**. Ya estaba pendiente desde R33d. `n8n:preparar` la deja en America/Lima.

## 3. ERP instalable y siempre actualizado

- **Manifiesto e íconos ÖRÖK** (`public/manifest.webmanifest`, `public/icons/`): se instala en Windows o Mac (Chrome, Edge, Safari) y en el celular. Tiene accesos directos al CRM, a Contabilidad y al Evaluador.
- **`sw.js`:**
  - se marca con versión y huella en cada `npm run build`;
  - los equipos detectan la versión nueva y ofrecen «Actualizar ahora»; si nadie lo pulsa, se aplica sola al volver a abrir;
  - nunca guarda en caché datos ni la API.
- **Servidor:** `sw.js`, `manifest.webmanifest` y `version.json` se sirven sin caché.
- **Versión:** `/api/health` y `connection_check` informan la versión del paquete, **67.6.19-r36**.

## 4. Registro de equipos (código de instalación)

**Web:** solo usuario y contraseña; no cambia nada.

**Instalado:** la primera vez pide un **código de instalación** que genera Gerencia en el servidor.
- Se guarda solo su huella (scrypt), vence y tiene un solo uso por defecto.
- El equipo recibe una credencial propia (cookie HttpOnly segura) que Gerencia puede revocar.
- Ocho intentos fallidos bloquean por 15 minutos.
- Si el equipo no está registrado o fue revocado, el servidor rechaza sus llamadas, incluido el inicio de sesión.

**Límite:** el código protege la instalación, no el acceso a los datos. El acceso lo sigue dando la contraseña y el rol de cada usuario.

## 5. Archivos

**Nuevos:**
- `deploy/n8n-herramientas.cjs`, `deploy/aplicar-migraciones.cjs`, `deploy/verificar-actualizacion.cjs`, `deploy/produccion.cjs`, `deploy/codigo-instalacion.cjs`
- `business/deviceEnrollment.js`
- `n8n/produccion-mapa.ejemplo.json`
- `public/` (manifiesto, `sw.js` e íconos), `src/pwa.js`
- `skills/erp-orok-n8n`, `skills/erp-orok-produccion`, `skills/erp-orok-instalacion`
- `tests/r36-produccion-n8n-pwa.test.cjs` (8 pruebas)

**Cambiados:**
- `server.cjs`: registro de equipos, cabeceras de la PWA y versión.
- `application.cjs`
- `src/cloudBridge.js`: marca las llamadas del ERP instalado.
- `src/main.jsx`, `src/App.jsx` (accesos directos), `src/glass.css`
- `index.html`, `build.mjs`, `package.json` (versión 67.6.19-r36 y scripts)

## 6. Verificación

- **Suite completa: 540 de 540 pruebas aprobadas.** R35 tenía 532; se suman 8 nuevas.
- Las pruebas cubren:
  - auditoría real de los tres flujos;
  - preparación para producción que conserva el 100 % de nodos y conexiones;
  - rechazo de migraciones con borrados;
  - detección de lead perdido, etapa cambiada, comentario faltante, orden del Kanban alterado y archivados perdidos;
  - bloqueo si el entorno es el ensayo;
  - espera de la versión nueva;
  - PWA servida sin caché;
  - el ciclo completo de registro y revocación de equipos con el servidor real en memoria.

**No probado con servicios reales:** el host Easypanel y su deploy hook, el n8n de producción, Google Drive y la instalación en equipos físicos.
