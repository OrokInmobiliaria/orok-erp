# R44 · Conector del ERP para Claude — 29/10/2026

Versión 67.6.27-r44. Rama `r44-conector-claude` → `ensayo`. Preproducción.

## Qué es

Un conector (servidor MCP remoto) dentro del mismo ERP en `https://<dominio del ERP>/mcp`. Con él, Claude puede consultar y preparar borradores en el ERP desde la app de escritorio o claude.ai. Esta es la capa 1 de «la IA entre el ERP y tu PC».

## Cómo se usa

1. Gerencia lo activa en CRM › Configuración › Conexiones de IA. Viene apagado.
2. En Claude se agrega como conector personalizado con esa URL.
3. Claude abre una página del ERP: la persona confirma con su sesión del ERP y pulsa «Permitir».

## Qué puede hacer Claude (14 herramientas)

- Resumen del día.
- CRM: buscar leads, ver un lead, agregar un comentario firmado (sin cambiar etapa ni orden del Kanban).
- Órdenes OC/OS: las que te toca aprobar y el listado.
- Evaluaciones de M.O.R.A.
- Marketing: hoy, KPIs (anuncios y formularios), radar de tendencias, crear alternativas, formularios, redactar formulario.
- Preguntar a L.O.L.A, C.L.A.R.A o G.R.E.T.A.

**No puede** aprobar órdenes ni campañas, pagar, borrar ni mover etapas. Esas decisiones siguen en el ERP.

## Seguridad

- **Mismos permisos que la pantalla.** Cada herramienta llama al mismo despachador de la pantalla con una sesión breve de la persona que autorizó: roles, áreas y empresas se aplican igual.
- **OAuth 2.1 con PKCE (S256)**, registro dinámico de clientes y metadatos estándar (RFC 9728 y RFC 8414).
- **Redirecciones permitidas:** solo hacia Claude (claude.ai, claude.com) o hacia el propio equipo (localhost).
- **Confirmación en el ERP:** la página de autorización exige la sesión del ERP abierta en ese navegador y solo acepta decisiones desde el mismo origen.
- **Tokens:**
  - Se guardan solo como hash. El acceso dura 1 hora y la renovación 30 días, con rotación.
  - Reutilizar un token de renovación viejo corta toda la conexión.
  - Si la persona cambia su contraseña, la conexión se corta.
- **Roles:** por defecto solo Gerencia puede conectar.
- **Corte inmediato:** «Cortar conexión» o apagar el conector invalida al instante.
- **Auditoría:** cada uso queda registrado con quién, qué herramienta, si funcionó y cuánto tardó. No se guardan los datos consultados.

## Técnico

- Nuevos:
  - `business/mcpConnector.js`
  - `public-mcp/autorizar.js` (sin script en línea, por la política de seguridad)
  - `src/ConexionesIA.jsx`
  - `tests/r44-conector-mcp.test.cjs` (6 pruebas)
- Cambiados:
  - `server.cjs`: rutas `/mcp`, `/mcp/oauth/*` y `/.well-known/oauth-*`.
  - `application.cjs`: instancia del conector y métodos `mcp*`.
  - `cloud-auth.cjs`: `issueFor`, sesión breve para una persona existente.
  - `src/App.jsx`, `src/cloudBridge.js`.
- Colecciones nuevas (aditivas): `mcp_clientes`, `mcp_solicitudes`, `mcp_codigos`, `mcp_tokens` y `mcp_auditoria`. Configuración en `<OROK_PRIVATE_DIR>/mcp.json`.
- Pruebas: 598/598.

## Siguiente

- Probarlo en ensayo con Claude real (requiere HTTPS).
- Más adelante, si Gerencia lo decide: aprobar órdenes desde Claude con confirmación explícita, y abrir el conector a los roles de área cuando exista «Colaborador ERP».
