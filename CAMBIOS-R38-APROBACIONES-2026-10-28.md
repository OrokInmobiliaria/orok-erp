# R38 · Aprobación de órdenes OC/OS por cadena, áreas y campanita

Versión 67.6.21-r38 · 28-10-2026 (Lima) · preproducción. Aditivo: no cambia leads, comentarios, etapas, el Kanban ni los roles del CRM. Sin migración SQL.

## Quién elabora
- Cualquier persona que Gerencia habilite en **Aprobaciones › Personas habilitadas** (área: administración, legal, obra, logística…) elabora órdenes con su usuario del ERP.
- En el CRM aparece para Vendedores y Brokers el grupo «Órdenes OC/OS». Sin habilitación solo ven el aviso «pide a Gerencia que te agregue».
- Las áreas ven solo sus órdenes y las que les toca aprobar. Los proveedores les llegan sin cuentas bancarias y los proyectos sin cifras. No ven pagos, bancos ni estados financieros.

## Cadenas (skill erp-orok-contabilidad, parámetro `aprobaciones`)
| Empresa / proyecto | Aprueban, en orden |
|---|---|
| MAAS · obra o construcción (o con control de obra) | Jefe de Obra → Gerencia de Operaciones → Gerencia General |
| MAAS · consultorías y asesorías | Gerencia de Operaciones → Gerencia General |
| MAAS · otros proyectos | Gerencia de Operaciones → Gerencia General |
| ÖRÖK (BMG) · área inmobiliaria | Gerencia General |
| Montezuma Arquitectos (MZA) | Gerencia General |

- Las órdenes de MAAS exigen un proyecto registrado. El Jefe de Obra se asigna en cada proyecto.
- La Gerencia de Operaciones y la Gerencia General se asignan por empresa en el directorio.

## Reglas que hace cumplir el servidor
- El número correlativo se asigna al enviar a aprobación.
- Se aprueba en orden. Nadie se salta su turno, ni Gerencia. Si una persona tiene dos pasos seguidos, los aprueba juntos.
- Nada pasa a «Aprobada», «Enviada» u otro estado posterior sin la cadena completa. Las aprobaciones no se escriben desde la pantalla.
- Enviada la orden, su contenido queda bloqueado. Para cambiarla hay que reabrirla y la cadena empieza de nuevo. Las firmas llevan la huella de la orden.
- **Observar:** vuelve a borrador con el motivo y se avisa a quien la elaboró.
- **Retirar:** lo hacen quien elaboró o Gerencia.
- **Reabrir una orden aprobada:** solo Gerencia.
- Sin la cadena completa no se emite: no hay PDF, ni HTML, ni correo al proveedor, ni copia en Drive. La vista previa sale con la marca «NO EMITIDA · pendiente de aprobación».

## Avisos
- Cada aprobador recibe un correo de **solicitud de aprobación** cuando le toca su paso. El correo trae el resumen de la orden, la cadena y el enlace a la orden.
- Quien elaboró la orden recibe un correo cuando se aprueba o cuando se observa.
- Se puede reenviar el aviso una vez por hora, o avisar desde el correo propio con «Avisar desde mi correo».
- Los correos salen por la cuenta de correo del servidor del CRM (la misma de soporte, @orok.com.pe). Si el envío falla, la aprobación sigue y el fallo queda anotado en la orden.
- **Campanita** en la barra superior: muestra lo que te toca aprobar, tus órdenes observadas, en aprobación o aprobadas y, para Gerencia, las alertas de pagos y cobros. Se actualiza cada 20 s y puede avisar también en el equipo con una notificación del navegador.

## Pruebas
- `npm test`: 552/552, con 6 nuevas en `tests/r38-aprobaciones.test.cjs`.
- Se ajustaron 2 pruebas anteriores al nuevo comportamiento.
- Prueba de punta a punta con el servidor y 4 usuarios (Legal elabora; Jefe de Obra, Operaciones y Gerencia aprueban, en orden): 4 correos, firmas válidas y emisión solo al final.
