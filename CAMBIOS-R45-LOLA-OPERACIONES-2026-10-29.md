# R45 · L.O.L.A Operaciones (capa 1): que no se pierda nada — 29/10/2026

Versión 67.6.28-r45. Rama `r45-lola-operaciones` (depende de R44). Preproducción.

## Por qué

El ERP, su base PostgreSQL y n8n viven en un solo VPS de Hostinger con Easypanel. Hasta ahora los respaldos del CRM quedaban en el mismo servidor: si el VPS se pierde, se pierden también. R45 saca una copia cifrada fuera del servidor y avisa si algo se cae.

## Resguardo externo cifrado

**Qué guarda en cada resguardo:**
- La base PostgreSQL completa con `pg_dump`. Si no está disponible, hace una exportación por tablas.
- El CRM en formato legible.
- Los usuarios y accesos (Firestore).
- El directorio privado: fotos y videos de campañas, documentos y configuraciones.
- Un manifiesto con conteos de control: leads, comentarios, firma del orden del Kanban, unidades, cotizaciones y separaciones.

**Cifrado:**
- Llave pública RSA-4096 más AES-256-GCM.
- La llave privada se descarga una sola vez y no queda en el servidor. Aunque alguien obtenga el servidor o el Drive, no puede abrir los respaldos.

**Dónde lo guarda:**
- En una carpeta de Google Drive de la empresa: una copia nueva cada día y una copia «última hora» que se actualiza (Drive guarda sus versiones).
- En Drive nunca se borra nada. En el servidor quedan las últimas 24.

**Frecuencia y verificación:**
- Cada hora (configurable entre 1 y 24 horas). Es apagado por defecto: Gerencia lo activa.
- Verificación diaria: descarga la copia de Drive y compara su huella. Si pasan dos ciclos sin resguardo, lo marca como «atrasado».

**Restauración segura:**
- `deploy/restaurar-resguardo.cjs` abre el respaldo con la llave en una carpeta nueva y muestra los conteos.
- Indica cómo cargar la base en una base nueva. Nunca restaura sobre la vigente.

## Vigilancia externa

`.github/workflows/vigilancia.yml` revisa cada 10 minutos, desde GitHub (fuera del VPS), el `/api/health` del ERP y el `/healthz` de n8n. Si falla tres veces seguidas, GitHub avisa por correo; opcionalmente avisa también a un webhook.

## Pantalla y Claude

- CRM › Configuración › **L.O.L.A Operaciones**: salud de la base, Drive y n8n; último resguardo, conteos, verificación e historial. Botones para generar la llave, activar, resguardar ahora y verificar.
- El conector de Claude suma la herramienta `estado_operaciones` (solo Gerencia).

## Límites (honestos)

- **n8n:** sus flujos y credenciales viven en la base propia de n8n dentro del mismo VPS. Hasta la capa 2, se protegen con las copias automáticas e instantáneas del VPS de Hostinger. Hay que activarlas: Fase 4b2 del checklist.
- **pg_dump:** la imagen usa la versión 17 de las herramientas de PostgreSQL, que sirve para servidores PostgreSQL 17 o anteriores. Se confirma en ensayo con «Resguardar ahora». Si falla, el resguardo usa la exportación por tablas y lo avisa.
- **Supabase:** la tabla de características que usa L.O.L.A en n8n queda para la capa 2, igual que reiniciar servicios por la API de Easypanel, revisar errores de nodos de n8n y renovar permisos.

## Técnico

- Nuevos:
  - `business/resguardo.js`
  - `deploy/restaurar-resguardo.cjs`
  - `src/OperacionesLola.jsx`
  - `.github/workflows/vigilancia.yml`
  - `tests/r45-resguardo.test.cjs` (5 pruebas)
- Cambiados: `application.cjs`, `server.cjs` (inicio y cierre del programador), `cloud-auth.cjs` (`snapshot`), `Dockerfile` (`tar` y `postgresql17-client`), `src/App.jsx`, `src/cloudBridge.js` y `business/mcpConnector.js`.
- Colecciones nuevas (aditivas): `resguardo_registro` y `resguardo_lease`. Configuración en `<OROK_PRIVATE_DIR>/resguardo.json`; la llave pública en `resguardo-publica.pem`.
