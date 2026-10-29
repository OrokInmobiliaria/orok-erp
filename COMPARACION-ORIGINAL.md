# Comparación funcional con TELEGRAM ENSAYO1

Se revisó el export original de 147 nodos y la rama seleccionada de 96 nodos alcanzables, incluidas dependencias de modelo/herramientas. El número de nodos del nuevo flujo no es una medida de equivalencia: parte del comportamiento original ahora reside en el CRM compartido. La revisión anterior detallada y el SQL recuperado se mantienen en la entrega.

| Función del original | Situación en 67.6.1 | Corrección / ubicación en 67.6.3 |
|---|---|---|
| Entrada de texto, callback y audio Telegram | Migrada a motor común; adaptadores sociales | Mismo núcleo para WhatsApp/Instagram/Messenger y entrada CRM. Telegram deja de ser disparador comercial. |
| Perfil de seis campos y memoria | Nombre/correo explícitos; seis campos como propuesta revisable | Se conserva revisión de perfil, modalidad e inicial confirmadas. No se equivale una inferencia del modelo a un dato confirmado. Memoria histórica SQL aún sin importar. |
| Catálogo Sheets y características Supabase | Presentes; nombre de herramienta corregido | Presentes y verificables; respuestas sin evidencia o cifras comerciales se bloquean/derivan. |
| Tres opciones: agendar, asesor, showroom | Botones WhatsApp; texto numerado en redes | Se conserva. La selección se vincula a la oferta vigente; un callback viejo no realiza otra gestión. |
| Esperar 24 h desde envío y pasar a Seguimiento | Servicio CRM por vencimientos | Se conserva el plazo desde envío confirmado. No convierte en Perdido ni degrada una cita/venta o un lead intervenido. |
| Consultar Calendar y calcular disponibilidad | Existía detrás de un HTTP genérico | Rama explícita «Calendar consultar disponibilidad y verificar cita». Reglas del ensayo, seis opciones, doble comprobación y bloqueo compartido. |
| Horarios con botones y validación del pulsado | WhatsApp mostraba lista de seis filas | Ahora dos botones + Ver más; CRM seis botones. Redes conservan números. No se copian seis botones inline de Telegram a un formato incompatible. |
| Crear cita e invitar al cliente | Existía en servicio de agenda; UI CRM interna desconectada | Rama explícita de creación e invitación; controles de tablero y ficha conectados a la misma agenda. |
| Reprogramar sin duplicar evento | Existía en agenda de canales | Rama explícita PATCH; se puede iniciar desde CRM o canal, con confirmación por horario y mismo ID de evento. |
| Confirmar cancelación sí/no, comprobar y eliminar | Existía en agenda de canales | Rama explícita DELETE con confirmación vinculada a evento/fecha. Guardas evitan cancelar solo el registro CRM y dejar vivo el evento. |
| Conservar cita, detectar ausencia, horario ocupado/vencido | Existía en motor | Se conserva. Las citas consultadas desde otro canal usan el estado vigente del CRM; una cancelación no resucita por memoria de otro chat. |
| Confirmación posterior a registro | Existía; faltaba claridad visual | Registro de resultado antes de respuesta. Se bloquea que un texto libre del modelo invente confirmación, cambio o cancelación. |
| Correo de ventas/asesor y pausa | Existía en servicio | Aviso Gmail y tarea CRM; acceso desde usuario o LOLA. No acredita lectura ni presencia del asesor. |
| Invitación por email y calendario | Calendar sendUpdates=all; Gmail solo ventas | Se mantiene y se hace explícito. Abrir una cita vinculada abre el evento existente; no prepara otra copia. |
| Ramas HTTP de lead, cita, cambio, cancelación y seguimiento | Reemplazadas por eventos al mismo CRM | Necesarias como conexión n8n↔CRM y proveedor; estados en un solo núcleo. No se eliminó su función por no reproducir cada nodo. |
| Postgres de ficha, selección y auditoría | Origen preservado, sin doble escritura | Cinco funciones recuperadas + consultas de solo lectura. Conservar hasta conciliar datos reales. No es memoria migrada automáticamente. |
| Recuperar conversación fuera de ventana | Faltaba plantilla Meta específica | Preparación automática, verificación de plantilla APPROVED en Meta y permiso del contacto; usuario ejecuta envío template desde CRM. Respuesta y baja se gestionan en el mismo núcleo. |
| Analizar publicaciones realizadas y dashboard | Solo pauta pagada y generación de propuestas; no equivalía a posts | Nuevo registro por publicación/captura, lectura básica/importación, atribución explícita y análisis con Claude bajo demanda en el mismo CRM. |
| TikTok | Entrada normalizada, envío pendiente | Mensajería sigue pendiente de acceso/adaptador. Analítica Display API implementada pero requiere autorización real; no se confunden sus permisos. |

Equivalencia funcional no significa copiar los instaladores SQL ni los disparadores Telegram al circuito nuevo. Las diferencias deliberadas son: un solo estado comercial en CRM, revisión de datos inferidos, plazo de 15 minutos para horarios, opciones adaptadas por canal y conciliación obligatoria del historial antes de retirar Postgres.

La ejecución con servicios reales y la migración histórica siguen pendientes. El inventario de 96 nodos adjunto permite localizar cada pieza de la rama original; sus familias son una guía de correspondencia, no una certificación individual de ejecución en producción.

## Ampliación comprobada localmente en 67.6.6

La visita puede iniciarse por WhatsApp escrito o transcrito sin oferta previa. La elección escrita/dictada de un horario propuesto requiere repetir fecha y hora y aceptar expresamente antes de volver a consultar Calendar y reservar. Los botones de fecha/hora conservan su confirmación explícita. El correo es para la invitación, no el canal obligatorio de origen. Ver `VISITAS-SHOWROOM-WHATSAPP.md`.

## Ampliación 67.6.7

Memoria persistente y continuidad, tres seguimientos configurables vinculados al SLA, avisos internos a dos números y Ventas, asesorías por WhatsApp/Meet y control interno /asesor. Ver `MEMORIA-SEGUIMIENTO-Y-ASESOR.md`. Los avisos y citas no están probados con proveedores reales.

## Entrega 67.6.9

Operación y memoria en PostgreSQL, lectura visible en n8n, historial común del CRM y proyección comercial versionada a Firebase. Ver MIGRACION-POSTGRESQL-67.6.9.md. Las tablas originales se conservan; no se ha conciliado todavía la identidad de sesiones Telegram.
