# Reglas permanentes del ERP ÖRÖK (lecciones de desarrollo)

Estas reglas las fijó Martín Montezuma (Gerencia ÖRÖK). Cualquier IA que programe este repositorio (Claude, Codex/GPT u otra) debe seguirlas.

## Datos y seguridad
- Nunca borrar datos de producción: desactivar, archivar o descartar. Solo cambios aditivos; nunca restaurar encima de la base de producción.
- Antes de cualquier restauración o migración, respaldo previo.
- Nunca escribir contraseñas, 2FA, tokens, secretos ni números de tarjeta. Las claves las genera y pega Gerencia en el ERP.
- El número de teléfono de Gerencia no debe aparecer en ningún archivo, plantilla, prompt ni mensaje.
- No cambiar OROK_PROJECT ni SESSION_SECRET. No renombrar archivos o flujos CLARA-* ni el encabezado X-Clara-Secret.
- Flujos de n8n se importan INACTIVOS; se activan solo con autorización de Gerencia.
- En videos o capturas que salgan del ERP: difuminar tokens y nombres de clientes.

## Diseño
- Conservar el efecto Crystal (glass) en todo el ERP. La única pantalla sin Crystal es la de acceso (usuario y clave).
- Marca: colores #85442A, #5E2817, #B3362B, #FCFAF8, #292524; tipografía Outfit.
- Interfaz en español, explicaciones simples: Gerencia no es desarrolladora.

## IA del ERP
- La IA rellena lo operativo; la persona confirma lo comercial, legal o de dinero. La IA nunca mueve dinero ni envía a clientes nuevos sin aprobación.
- Las correcciones del equipo se vuelven lecciones propuestas (business/lecciones.js); solo las aprobadas por Gerencia se aplican.

## Flujo de entrega
- Rama desde `origin/ensayo` (usar FETCH_HEAD tras `git fetch origin ensayo`) → PR a `ensayo` → squash merge → `git archive` del FETCH_HEAD actualizado a ERP-OROK-R##-PRODUCCION.zip → Gerencia lo sube a Easypanel.
- Subir la versión en package.json y package-lock.json (67.6.x-r##) y escribir CAMBIOS-R##.md.
- `npm test` en verde antes de entregar; `npm run build` actualiza dist/.
- Archivos con CRLF: editar normalizando y restaurando CRLF (no mezclar finales de línea).
- Escrituras al store: `store.db.runTransaction(tx => tx.set/delete)`.
