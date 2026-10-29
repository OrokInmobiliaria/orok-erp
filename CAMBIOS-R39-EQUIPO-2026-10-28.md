# R39 · Equipo ÖRÖK y vinculación con el CRM

Versión 67.6.22-r39 · 28-10-2026 (Lima) · preproducción. Aditivo, sobre R38.

## Equipo (skill erp-orok-contabilidad › aprobaciones.equipo)
| Persona | Área | Correo de avisos | Cargo de aprobación |
|---|---|---|---|
| Martín Montezuma | Gerencia | mmontezuma@orok.com.pe | Gerencia General (BMG, MZA, MAAS) |
| César Dávalos | Obra | cdavalos@orok.com.pe | Gerencia de Operaciones (BMG, MZA, MAAS) |
| Fernando Amiquero | Proyectos | teoc151@gmail.com | Jefe de Obra / de Proyecto por defecto (BMG, MZA, MAAS) |
| Antonio Garcés | Ventas | ventas@orok.com.pe | — elabora órdenes |
| Carla García | Marketing | kkmgledesign@gmail.com | — elabora órdenes |

Las cinco personas pueden elaborar órdenes en las tres empresas. Cada una ve solo sus órdenes y las que le toca aprobar.

## Nuevo
- **Aprobaciones › Equipo definido en la skill › «Vincular con los usuarios del CRM»** (Gerencia): busca a cada persona por nombre y apellido, le asigna su correo, área y cargos, y muestra a quién le falta usuario. Se puede repetir sin duplicar y no borra nada.
- **Jefe de Obra por defecto por empresa:** si el proyecto no tiene un Jefe de Obra asignado, aprueba el de la empresa (Fernando). Un Jefe de Obra asignado en el proyecto tiene prioridad.
- Al agregar a mano un usuario cuyo nombre coincide con el equipo, se completan sus datos solos.

## Para activarlo en el servidor
1. Crear en el CRM (Configuración › Usuarios) los usuarios que falten, con nombre y apellido como en la tabla. Hoy el rol disponible es Vendedor.
2. Entrar a Contabilidad › Aprobaciones y pulsar «Vincular con los usuarios del CRM».
3. Revisar que la cuenta de correo de salida del servidor (@orok.com.pe) esté configurada.

## Pruebas
`npm test`: 553/553.
