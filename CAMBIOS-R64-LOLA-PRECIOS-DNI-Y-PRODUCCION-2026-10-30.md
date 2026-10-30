# R64 · L.O.L.A: precios autorizados, DNI antes del asesor y trabajador de producción (67.6.49-r64)

Incluye todo lo de R63.

## Reglas nuevas de atención (WhatsApp, Instagram y Messenger)
- **Precios autorizados por Gerencia (por proyecto):** Bandeja WhatsApp › conexión › «LOLA · precios y promociones autorizados».
  Rango por etapa (p. ej. preventa desde S/ 316,000 hasta S/ 620,000) y hasta 5 promociones (p. ej. descuentos por feria de hasta
  S/ 20,000, hasta agotar stock, con fecha de vigencia opcional). La respuesta la arma el servidor con esos datos; la IA no escribe cifras.
- **1ª pregunta de precio** → L.O.L.A responde el rango y las promociones vigentes e invita a cita o showroom.
- **Si insiste con el precio** (2ª consulta, precio exacto, descuento, negociación) → pide el **DNI** y luego registra la solicitud de asesor.
  Nunca lo pide al iniciar la conversación. Si el cliente prefiere no darlo, igual pasa al asesor. El DNI queda en el lead (no se repite al cliente).
- **Lead de formulario que pide asesor** → pide el DNI antes de pasarlo.
- Sin rango autorizado, se mantiene la regla anterior (todo precio va directo al asesor).
- El bot antiguo de Kommo («My workflow») quedó apagado en n8n (no se borró).

## Producción
- La memoria y el historial de la conversación viajan con cada trabajo (también en PostgreSQL).
- Nuevo flujo n8n/LOLA-R64-PRODUCCION.json (`node deploy/build-lola-workflow-produccion.cjs`): pasos del ERP a erp.orok.com.pe con
  «Header Auth account 2», sin base de datos, inactivo hasta que Gerencia lo publique.

Pruebas: tests/r64-lola-precios-dni.test.cjs. 670/670.
