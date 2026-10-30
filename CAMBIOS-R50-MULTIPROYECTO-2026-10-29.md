# R50 · Multiproyecto (67.6.35-r50)

- Proyectos independientes en la misma base PostgreSQL (cada uno con su `project_id`); Infinity 224 sigue siendo el principal con sus datos intactos (no se migra ni copia nada).
- Mis proyectos (Inicio › Mis proyectos): tarjetas por proyecto con etapa (Evaluación → Ventas → Construcción → Cierre), cifras clave, entrar y pasar de etapa (Gerencia, con historial).
- Nuevo proyecto (Gerencia): nombre, empresa (BMG/MZA/MAAS), distrito, dirección y etapa inicial. Arranca vacío.
- Selector de proyecto en la cabecera: el proyecto elegido queda en la sesión del navegador (cookie `orok_proyecto`); todo el ERP (CRM, Evaluador, Marketing, Contabilidad, precios) trabaja sobre él. Cambiar no recarga la página (recargar cierra la sesión).
- Usuarios y permisos compartidos. WhatsApp, redes y el conector de Claude siguen entrando al principal; el webhook de L.O.L.A se enruta por el nombre del proyecto que envía n8n.
- Respaldos de cada proyecto nuevo en `private/proyectos/<id>/backups`. Sin copia a Firestore para proyectos nuevos (solo el principal).
- Pruebas: tests/r50-multiproyecto.test.cjs (630/630).
