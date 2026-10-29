# R34 · ERP ÖRÖK: Contabilidad y Finanzas con C.L.A.R.A

Fecha: 28-oct-2026 (America/Lima). Base: R33d (cierre del ensayo). **Preproducción: no reemplaza el CRM vivo.** Todos los cambios son aditivos: no se tocan colecciones, roles ni flujos existentes, y los flujos n8n se importan inactivos.

## 1. Qué cambia

El CRM pasa a ser un ERP con **tres módulos**. Se cambia de uno a otro con el selector «Módulo» del encabezado o desde el acceso.

| Módulo | Quién lo ve | IA |
|---|---|---|
| CRM Inmobiliario | todos los roles | L.O.L.A |
| Evaluador Inmobiliario | solo Gerencia | M.O.R.A |
| **Contabilidad y Finanzas** (nuevo) | solo Gerencia | **C.L.A.R.A** |

Contabilidad y Finanzas se abre en `/contabilidad`, con la misma piel ÖRÖK: franja sólida hasta la línea marrón y cristal debajo. Incluye estas pestañas:
- Panel financiero.
- **Proyectos.**
- Alertas de pago.
- Órdenes OC/OS: formato estandarizado en PDF, firmas electrónicas simples y flujo Borrador → Aprobada → Enviada → Recibida → Facturada → Pagada.
- Proveedores.
- Cuentas por pagar: detracción y retención.
- Pagos y vouchers, con el correo al proveedor desde la cuenta del usuario.
- Bancos y conciliación.
- **Bandeja de Drive.**
- Presupuesto y curva S.
- Estados financieros, con controles de consistencia.
- Exportar (Excel por sección o compilado, y paquete para la contadora).

Trabaja con las **tres empresas**, según sus fichas RUC:

| Código | Razón social | RUC |
|---|---|---|
| BMG | BMG Desarrolladora Inmobiliaria S.A.C. | 20615227685 |
| MZA | Montezuma Arquitectos Gerencia y Construcción E.I.R.L. | 20602354785 |
| MAAS | MAAS Constructora S.A.C. | 20616628144 |

La contadora de las tres es Lleny S. Camán Huablocho (C.P.C. Mat. 53753).

### Proyectos con tipo de servicio y módulos propios

Cada proyecto tiene ficha propia con **tipo de servicio**, **fase** (Prospecto, Propuesta, Contratado, En ejecución, Entregado, Cerrado) y **módulos activos**. Al elegir el tipo se proponen estos módulos:

| Tipo | Módulos que se proponen |
|---|---|
| Consultoría o asesoría | Cuentas por pagar y pagos · Honorarios y cobranzas |
| Diseño de planos | Logística OC/OS · Cuentas por pagar y pagos · Presupuesto y curva S · Honorarios |
| Desarrollo inmobiliario | Todos: logística, tesorería, presupuesto, CRM, Evaluador M.O.R.A, control de obra |
| Construcción | Logística · Tesorería · Presupuesto y curva S · Control de obra |

- Los módulos se pueden **activar o apagar en cualquier fase**.
- Al elegir un proyecto arriba, los indicadores y las pestañas muestran **solo ese proyecto**.
- Si una pestaña no está activa para el proyecto, la app lo indica y ofrece activarla.
- «Control de obra» y «Honorarios y cobranzas» quedan marcados por proyecto. Son los siguientes módulos del ERP.

### Regla de Gerencia

Solo se usa información **desde enero de 2025**. Lo anterior se conserva marcado como «histórico» y no entra en totales, alertas ni numeración. En Drive se archiva ordenado en «08 Histórico (antes de 2025)/AAAA». **Nunca se borra.**

## 2. Cómo se guardan los datos

Dentro del ERP:
- Los datos van a PostgreSQL del CRM, en colecciones nuevas `clara_*`, por RPC (`claraList`, `claraPut`, `claraDelete`).
- La pantalla se refresca cada 20 segundos, así que los tres usuarios ven los cambios de los demás.
- Lo registrado **no se borra, se anula**. Solo se retiran borradores, ejemplos y partidas, y quedan marcados en la base.

La misma app publicada en Claude usa su propia base compartida.

## 3. Google Drive

Drive es el punto de intercambio entre el ERP, n8n y Claude.

- **Guardar.**
  - El ERP manda el PDF de la orden, la factura, el voucher, el estado de cuenta o el Excel al webhook de n8n (rama 04).
  - n8n lo sube a la raíz de la carpeta Contabilidad de la empresa.
  - La rama 02 lo ordena en 02 Comprobantes, 03 Órdenes, 04 Pagos, 05 Bancos o 06 Reportes, según el tipo y el mes del documento.
- **Alimentar.**
  - Lo que se deja en «01 Entrada» lo lee n8n cada 15 minutos (rama 03): facturas, recibos y vouchers con Claude; estados de cuenta en Excel, CSV o Sheets.
  - Las lecturas llegan al ERP con la acción `clara_bandeja_put` y aparecen en «Bandeja de Drive», donde una persona las registra con un clic.
- **Orden.** C.L.A.R.A renombra lo leído con nombre estándar y la rama 02 lo archiva. Nunca borra ni cambia permisos.

Carpetas configuradas:

| Empresa | Carpeta Contabilidad (ID de Drive) |
|---|---|
| BMG | 1RqRBLFGervdPIjOHGfbA2kWUeFRHUjKY |
| MZA | 1eOPFAhtYW6L-lkSRrnOruhBrAED3VEJ0 |
| MAAS | 17Kb4z3EmySjkiBvBpMLkxlFrlFvj4HY6 |

### Conectar una sola vez, sin reconexiones manuales

1. **Google Cloud.** En el proyecto de Google Cloud de ÖRÖK, activar la *Google Drive API*.
2. **Pantalla de consentimiento OAuth.**
   - Si orok.com.pe es Google Workspace, elegir **Interna**. Así el permiso no vence.
   - Si es **Externa**, pasarla a **«En producción»**. En el estado «Prueba», Google vence el permiso **a los 7 días**: esa es la causa típica de tener que reconectar a mano.
3. **Credencial en n8n.** Crear la credencial *Google Drive OAuth2* «C.L.A.R.A - Google Drive (cuenta de contabilidad)» con ese ID y secreto, e iniciar sesión **una sola vez** con una cuenta que sea **Editor de las tres carpetas**. Las carpetas de MZA y MAAS se comparten con esa cuenta. n8n renueva el permiso solo.
4. **Alternativa sin ninguna persona: cuenta de servicio.** Solo funciona si las carpetas están en una **unidad compartida** de Workspace. En «Mi unidad», Google no deja que una cuenta de servicio cree archivos.
5. **Enlace entre el ERP y n8n.**
   - Crear la credencial «C.L.A.R.A - Webhook CRM» (Header Auth, nombre `X-Clara-Secret`, valor de 32 o más caracteres).
   - Copiar `docs/clara.json.ejemplo` como `clara.json` en el directorio privado del servidor, con la URL del webhook y el mismo valor.
   - El secreto nunca va en el código ni en el JSON del flujo.
6. **App publicada en Claude.** Terminar una vez la conexión de Google Drive en claude.ai → Configuración → Conectores. Queda conectada.

## 4. Archivos nuevos o cambiados

**Nuevos:**
- `business/claraErp.js`: colecciones `clara_*`, permisos de Gerencia, validaciones, Drive vía n8n, bandeja y C.L.A.R.A con el proveedor de L.O.L.A.
- `contabilidad-src/clara-contabilidad.html`: fuente de la app.
- `contabilidad/`: la app generada.
- `deploy/build-contabilidad.cjs` y el script `npm run build:contabilidad`.
- `n8n/CLARA-ENSAYO-67.6.18-DRIVE-CONTABLE-INACTIVO.json`: 67 nodos, inactivo.
- `migrations/003-clara-postgres.sql`: aditiva, esquema `clara`.
- `tests/r34-clara-erp.test.cjs` (8 pruebas) y `tests/r34-clara-drive.test.cjs` (12 pruebas).
- `docs/clara.json.ejemplo`.
- `LEEME-CLARA-DRIVE-R34.md`.

**Cambiados:**
- `application.cjs`: registra C.L.A.R.A y la acción `clara_*`.
- `server.cjs`: ruta `/contabilidad`, solo para Gerencia.
- `src/navModel.mjs`, `src/GroupedNav.jsx`, `src/App.jsx` y `src/Access.jsx`: el tercer módulo.
- `tests/r33-mora.test.cjs`: la lista de módulos de Gerencia ahora tiene tres.

## 5. Verificación

- **Suite completa: 526 de 526 pruebas aprobadas.** R33d tenía 506; se suman 20 nuevas.
- Compilación de la interfaz: correcta. `contabilidad/` se generó sin scripts en línea, compatible con la CSP del CRM.
- Navegador (Chromium) en modo local y con base y Drive simulados:
  - ciclo completo de una OS (crear, firmar, aprobar, correo, factura, pago con voucher, detracción, Pagada);
  - importación y conciliación bancaria;
  - bandeja de Drive registrando factura, voucher y estado de cuenta;
  - proyectos con módulos que se activan y bloquean pestañas.

**No probado con servicios reales:** Google Drive (falta la credencial), el n8n real y la IA con clave real.

## 6. Pendientes para el ensayo

1. Aplicar la migración 003 en el ensayo, con respaldo previo.
2. Importar el flujo C.L.A.R.A **inactivo**.
3. Crear las credenciales (punto 3).
4. Ejecutar «Inventario de carpetas» y revisar el resultado antes de «Preparar carpetas».
5. Registrar los proyectos reales de MZA y MAAS con su tipo de servicio.
6. Confirmar con la contadora las tasas de detracción y los casos de retención.
