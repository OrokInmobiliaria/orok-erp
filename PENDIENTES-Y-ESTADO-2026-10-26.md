# Estado y pendientes confirmados · 26/10/2026

## Listo en este paquete

- CRM completo `67.6.17-r32c`, construido para preproducción.
- Corrección `r32c-login-clear2`: el acceso ya no recibe el desenfoque de una capa técnica del navegador.
- PostgreSQL y protección de persistencia permanecen contemplados por los scripts de migración y respaldo.
- Flujo n8n R30 de 110 nodos incluido como copia inactiva, junto con versiones anteriores de referencia.
- Panel tipo Power BI, navegación agrupada, búsqueda global, bandeja multicanal, trazabilidad de chats y llamadas, exportación de leads, paletas de color y TEA en cotizaciones incluidos según `MEMORIA-R32.md`.
- La versión oficial y el n8n activo no deben modificarse al probar este paquete.

## Pendientes prioritarios antes de producción

1. **Desestimado / Perdido.** La memoria R32c indica que la ventana «Enviar a seguimiento con subestado» sigue sin el cambio final. Debe aplicarse y probarse lo solicitado: permitir Desestimado, exigir motivo, ocultar Próxima acción y Fecha para ese caso y registrar el cambio en historial.
2. **n8n integral.** Importar únicamente el flujo principal como copia inactiva, asignar credenciales existentes, comprobar zona horaria `America/Lima`, ejecutar manualmente con un trabajo de ensayo y activar solo después de aprobar el recorrido completo.
3. **Costo de IA.** El nodo principal «Modelo Lola Comercial» continúa siendo OpenAI. Gemini está como apoyo y existen conectores HTTP de Claude para marketing. Revisar el modelo deseado y sus costos antes de activar automatizaciones.
4. **Formulario real de Meta.** Documentar una prueba completa: formulario enviado en Meta → lead visible en el CRM → fuente/campaña/fecha correctas → sin duplicado.
5. **Documentos de Drive.** Probar con datos ficticios la copia por operación de la separación oficial de 15 días y la selección de minuta bancaria o directa, sin alterar las plantillas maestras. Confirmar anexado de planos.
6. **Cierre de venta.** Probar carga de minuta firmada y voucher de notaría, fecha/responsable, cambio a Vendida/Cerrada e historial, conservando los documentos.
7. **Conectores externos de marketing.** Voz, publicación orgánica Meta/TikTok y ciclo automático siguen preparados pero apagados; las URL `.invalid` deben reemplazarse solo cuando existan cuentas, permisos y credenciales de ensayo.
8. **Promoción oficial.** Ejecutar primero en copia, comparar datos antes/después y recién entonces promover el código conservando la base y el volumen privado existentes.

## Puede quedar para después

- Extender el diseño Power BI completo a «Rendimiento de marketing» y «Análisis semanal».
- Almacén administrado de logotipos y tipografías de marca.
- Migración al número o teléfono definitivo.
- Automatización avanzada de versionado de plantillas de Drive.

## Validaciones que no deben repetirse desde cero

Las conexiones y pruebas ya aprobadas de Messenger, Instagram, WhatsApp, PostgreSQL, audio y agenda se conservan. Después de una migración basta una prueba de humo por canal para confirmar que los vínculos siguen operativos; no se deben regenerar tokens ni rehacer permisos sin evidencia de fallo.