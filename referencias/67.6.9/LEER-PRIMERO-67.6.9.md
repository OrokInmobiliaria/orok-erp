# LOLA 67.6.9 · LEER PRIMERO

Esta entrega conjunta sustituye 67.6.7 al instalarse y validarse. Contiene CRM compilado, n8n de 71 nodos INACTIVO y migración a PostgreSQL. 67.6.8 fue una exploración local no publicada y no se utiliza.

Leer `MIGRACION-POSTGRESQL-67.6.9.md` antes de instalar. El CRM está en Namecheap y PostgreSQL en Hostinger: la conexión privada entre esos alojamientos NO está configurada. No basta con subir el ZIP ni con importar el JSON. No se ha cambiado producción.

El nodo «Recuperar memoria e historial · PostgreSQL» está conectado antes del único agente, tanto para texto como para audio. El CRM usa SQL para conversaciones y operación, y sincroniza la vista comercial a Firebase. No requiere Redis. El nuevo servidor exige conexión SQL e importación completa; no cambia silenciosamente a memoria Firestore si falla.

Los archivos privados, credenciales, sesiones y datos reales no están incluidos. Conservar los del servidor y validar respaldos antes del cambio. No ejecutar las tablas antiguas de ensayo como instalador del nuevo motor ni activar dos respondedores.

Validación: 212 pruebas seleccionadas locales aprobadas e interfaz compilada. Los proveedores, Firebase y transcripciones se simulan; la conexión Namecheap–VPS y las pruebas reales de canales siguen pendientes.
