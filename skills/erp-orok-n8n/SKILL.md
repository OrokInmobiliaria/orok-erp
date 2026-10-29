---
name: erp-orok-n8n
description: Úsalo para modificar, evaluar o preparar los flujos n8n del ERP ÖRÖK (L.O.L.A, M.O.R.A, D.I.A.V.A) para su conexión final a producción sin perder nodos ni conexiones.
---

# n8n del ERP ÖRÖK: modificar, evaluar y preparar la conexión final

Flujos vigentes en `n8n/` del paquete:

| Flujo | Archivo | Nodos aprox. | Credenciales que usa |
|---|---|---|---|
| L.O.L.A (atención y marketing) | `LOLA-ENSAYO-67.6.13-r30-MARKETING-CONEXIONES-INACTIVO.json` | 110 | CRM, PostgreSQL, OpenAI, Gemini, Gmail, Calendar, Sheets |
| M.O.R.A (Evaluador) | `MORA-ENSAYO-67.6.17-EVALUADOR-CONVERSACIONAL-INACTIVO.json` | 40 | CRM, PostgreSQL, Anthropic |
| D.I.A.V.A (Drive contable) | `CLARA-ENSAYO-67.6.18-DRIVE-CONTABLE-INACTIVO.json` | 69 | Google Drive, CRM, PostgreSQL, Anthropic, Webhook CRM |

Los otros JSON son versiones anteriores: se conservan, pero no se importan.

## Reglas que no se rompen

- **Nunca se activa un flujo desde el JSON.** Se exporta con `active: false`, sin `id` y con `pinData` vacío. La activación la hace una persona en n8n, después de la prueba de punta a punta.
- **Se conservan los nodos y las conexiones existentes.** Toda modificación se comprueba con `comparar`: `conserva_todo` debe salir `true`, salvo un retiro que Gerencia haya pedido.
- **Las claves solo van en credenciales de n8n**, referidas por nombre. Nunca en encabezados, código o URLs. El mapa de producción solo lleva hosts, nombres e ID de credenciales.
- **Zona horaria America/Lima** en todos los flujos.
- **Todo webhook lleva autenticación** (Header Auth). Los trabajos con el CRM pasan por `/api/integrations/lola` con el secreto del servidor.
- **La IA propone y Gerencia aprueba.** Ningún flujo envía mensajes a clientes, publica ni registra pagos sin un paso humano o una regla aprobada.
- **Las reglas contables salen de la skill `erp-orok-contabilidad`**, que los flujos piden al CRM con la acción `clara_reglas_get`. No se copian a mano dentro de los nodos.

## Herramientas (en el paquete)

```bash
npm run n8n:auditar            # revisa los 3 flujos: bloqueos, advertencias, credenciales, hosts, disparadores
node deploy/n8n-herramientas.cjs comparar n8n/ANTES.json n8n/DESPUES.json   # ¿se conservan nodos y conexiones?
cp n8n/produccion-mapa.ejemplo.json n8n/produccion-mapa.json   # completar hosts e ID de credenciales de producción
npm run n8n:preparar           # genera n8n/produccion/*-PRODUCCION-*-INACTIVO.json y AUDITORIA-N8N.md
```

La auditoría sale con código 2 si hay bloqueos. Estos son los más comunes:
- flujo activo;
- zona horaria distinta de America/Lima (el de L.O.L.A la tiene vacía);
- código con error de sintaxis;
- webhook sin autenticación;
- posible secreto escrito en un nodo;
- `pinData` con datos.

## Para modificar un flujo

1. Partir siempre del JSON vigente del paquete y guardar una copia como «antes».
2. Editar el JSON con un script (Python o Node) que cambie solo los nodos necesarios:
   - mantener los nombres de nodo (las conexiones dependen de ellos) y el `typeVersion`;
   - nodo nuevo: `id` nuevo y conexiones explícitas;
   - nodo Code: `jsCode` compilable; leer datos de nodos anteriores con `$('Nodo').itemMatching(i)` o `.first()`;
   - HTTP: `options.timeout` entre 10 000 y 120 000 ms; credenciales con `authentication: predefinedCredentialType` o `genericCredentialType`.
3. Si el flujo trae pruebas en `tests/`, ejecutar sus nodos Code con datos simulados (como `tests/r34-clara-drive.test.cjs`).
4. Ejecutar `npm run n8n:auditar` y `comparar` contra «antes». Reportar qué nodos cambiaron, cuáles se agregaron y que no se perdió ninguna conexión.

## Conexión final (de ensayo a producción)

1. **Evaluar:** `npm run n8n:auditar`. Resolver los bloqueos en el JSON (por ejemplo, poner la zona horaria) y anotar las advertencias.
2. **Mapa:** copiar `n8n/produccion-mapa.ejemplo.json` y completar:
   - el host de ensayo y su reemplazo de producción (por ejemplo, `lola-pruebas-crm…easypanel.host` → `crm.orok.com.pe`);
   - para cada credencial de ensayo, el nombre e ID de la credencial de producción en n8n.

   Sin claves.
3. **Preparar:** `npm run n8n:preparar`. Revisar `n8n/produccion/AUDITORIA-N8N.md`: los tres deben salir «LISTO para importar (inactivo)» y `comparar` debe decir `conserva_todo: true`.
4. **En el n8n de producción:**
   - crear o vincular las credenciales con los nombres del mapa;
   - importar los JSON de `n8n/produccion/` como flujos nuevos, sin activar;
   - desactivar o archivar las versiones anteriores (nunca dos versiones activas del mismo flujo).
5. **Probar:** ejecutar una vez cada flujo de forma manual con un caso ficticio:
   - L.O.L.A: un trabajo de prueba sin enviar a clientes;
   - M.O.R.A: una consulta;
   - D.I.A.V.A: «Inventario de carpetas» y una factura de prueba en 01 Entrada.

   Revisar las ejecuciones.
6. **Activar** uno por uno, en este orden: D.I.A.V.A (solo lectura e inventario primero), M.O.R.A y L.O.L.A. Vigilar las primeras 24 horas de ejecuciones.
7. **Si algo falla:** desactivar el flujo nuevo y reactivar el anterior. Los flujos no borran datos.

## Al reportar

Lista de flujos con su estado (LISTO o BLOQUEADO), los cambios aplicados, las credenciales que faltan crear en n8n y el siguiente paso concreto. Fecha y hora de Lima.
