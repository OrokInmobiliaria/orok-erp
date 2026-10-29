# C.L.A.R.A · Drive contable · R34 (ensayo)

Fecha: 28-oct-2026 (America/Lima). No reemplaza ni modifica los flujos de L.O.L.A ni de M.O.R.A, ni el CRM vivo.

## Qué contiene

| Archivo | Para qué sirve |
|---|---|
| `n8n/CLARA-ENSAYO-67.6.18-DRIVE-CONTABLE-INACTIVO.json` | Flujo nuevo de **67 nodos**. Se importa como copia nueva e inactiva. |
| `migrations/003-clara-postgres.sql` | Migración aditiva: solo crea el esquema `clara` (bitácora y bandeja). |
| `tests/r34-clara-drive.test.cjs` | 12 pruebas del flujo. Las 12 pasan. |
| `app/clara-contabilidad.html` | Módulo de Contabilidad y Finanzas, la misma versión publicada en Claude, para integrarlo al CRM. |
| `app/CLARA-respaldo-inicial-desde-2025.json` | Órdenes y proveedores desde enero de 2025, con datos de ejemplo marcados. |

## Cómo circula la información

Drive es el punto de intercambio entre la app y n8n.

- **App → Drive.** La app guarda en la raíz de cada carpeta Contabilidad, con nombres estándar: el PDF de la OC/OS, las facturas, los vouchers, los estados de cuenta y el Excel.
- **Rama 02 · Ordenar (cada 10 minutos).** Mueve cada archivo a su carpeta y su mes:
  - OC y OS → 03 Órdenes OC-OS / AAAA-MM
  - Voucher → 04 Pagos y vouchers / AAAA-MM
  - Factura, recibo o boleta → 02 Comprobantes de proveedores / AAAA-MM
  - Estado de cuenta → 05 Bancos / AAAA-MM
  - Excel de C.L.A.R.A → 06 Reportes / AAAA-MM
  - Lo que no reconoce → 01 Entrada
- **Rama 03 · Alimentar (cada 15 minutos).**
  - Lee lo que haya en **01 Entrada**: facturas, recibos y vouchers en PDF o foto se leen con Claude Haiku; los estados de cuenta en Excel, CSV o Google Sheets se leen directamente.
  - Escribe el resultado en `CLARA-BANDEJA.json`, en la raíz de Contabilidad.
  - **C.L.A.R.A mantiene el orden:** renombra cada archivo leído con un nombre estándar (tipo, serie u operación, emisor o beneficiario, fecha del documento, por ejemplo `Factura electrónica F001-950 TUNOPAL S.A. 2026-10-20.pdf`) y lo devuelve a la raíz. En el siguiente ciclo, la rama 02 lo archiva por tipo y por el mes del documento.
  - Los documentos anteriores a 2025 van a 08 Histórico; lo que no se pudo clasificar va a 07 Procesados; lo que falló se queda en Entrada.
- **Drive → App.** En la pestaña «Bandeja de Drive» una persona revisa cada lectura y la registra: el comprobante se asocia a su orden, el voucher a su pago y el estado de cuenta pasa a Bancos. Nada se registra solo.
- **Rama 04 · Webhook del CRM.** Sirve para cuando el módulo viva dentro del CRM: guarda archivos enviados por el servidor y responde con el enlace.
- **Rama 01b · Inventario (manual, solo lectura).** Escribe `CLARA-INVENTARIO-AAAA-MM-DD.json` con las carpetas y archivos actuales. No mueve nada.

## Carpetas configuradas

| Empresa | RUC | Carpeta Contabilidad (ID de Drive) |
|---|---|---|
| BMG | 20615227685 | 1RqRBLFGervdPIjOHGfbA2kWUeFRHUjKY (2.Contabilidad) |
| MZA | 20602354785 | 1eOPFAhtYW6L-lkSRrnOruhBrAED3VEJ0 (Contabilidad) |
| MAAS | 20616628144 | 17Kb4z3EmySjkiBvBpMLkxlFrlFvj4HY6 (2.Contabilidad) |

**Regla de Gerencia:** solo se usa información desde el 1 de enero de 2025.
- **No se borra nada.** Lo anterior a 2025 no se lee ni se usa en cálculos: se archiva ordenado por año en **«08 Histórico (antes de 2025)/AAAA»**.
- En la app, las 6 OC de Montezuma Arquitectos de 2020 y 2021 se conservan marcadas como «histórico» y no entran en totales, alertas ni numeración.
- Los movimientos bancarios anteriores a 2025 se descartan de la lectura, sin tocar el archivo.

La contadora de las tres empresas es Lleny S. Camán Huablocho (C.P.C. Mat. 53753, lleny_caman@hotmail.com). Su correo queda como destinatario del paquete contable en la app.

## Orden de instalación en el ensayo

1. Hacer el respaldo de PostgreSQL y aplicar `migrations/003-clara-postgres.sql`.
2. Importar el flujo. Debe quedar **inactivo**.
3. Crear la credencial **«C.L.A.R.A - Google Drive (cuenta de contabilidad)»**, de tipo Google Drive OAuth2, con la cuenta que tiene acceso de edición a las tres carpetas.
4. Vincular las credenciales «M.O.R.A ENSAYO - Anthropic API» y PostgreSQL de ensayo. Para la rama 04, crear **«C.L.A.R.A - Webhook CRM»** (Header Auth).
5. Ejecutar **«Inventario de carpetas»** y revisar el JSON de cada empresa. Con ese inventario se decide cómo encajan las carpetas que ya existen.
6. Ejecutar **«Preparar carpetas (ejecutar una vez)»**. Solo crea las subcarpetas 01 a 08 que falten.
7. Probar con un archivo de prueba: dejar una factura en 01 Entrada y ejecutar «Leer Entrada manualmente».
8. Recién después, activar el flujo.

## Las facultades de C.L.A.R.A y sus márgenes

**Hace:**
- Leer 01 Entrada.
- Renombrar con el nombre estándar.
- Mover cada archivo dentro de la carpeta Contabilidad de su empresa.
- Crear subcarpetas por tipo, mes o año.
- Escribir la bandeja y el inventario.
- Registrar cada movimiento en la bitácora (`clara.drive_log`).

**Revisa en la app:** la herramienta «revisar_orden_drive» lista la raíz de Contabilidad para explicar qué falta ordenar. Es de solo lectura.

**Margen:** solo trabaja dentro de las tres carpetas Contabilidad configuradas.

## Lo que el flujo nunca hace

- Borrar archivos ni enviarlos a la papelera.
- Cambiar permisos.
- Registrar pagos sin una persona.
- Leer información anterior a 2025.
- Guardar claves dentro del JSON.

## Límites conocidos

- No se ejecutó en un n8n real: las pruebas simulan los nodos. Los parámetros de los nodos de Drive se tomaron del código de n8n-nodes-base 2.15.1.
- Las carpetas que ya existen dentro de Contabilidad no se reorganizan de forma automática. El inventario las muestra y la reorganización se aplica después, con la aprobación de Gerencia.
- La lectura de PDF e imágenes depende de la calidad del escaneo. Cada lectura queda «por revisar».
