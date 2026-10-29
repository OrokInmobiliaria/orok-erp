---
name: erp-orok-instalacion
description: Úsalo para la primera conexión del ERP ÖRÖK en el servidor y para instalarlo en una PC, Mac o celular con el código de instalación que solo vive en el servidor.
---

# Primera conexión e instalación del ERP ÖRÖK

Hay dos formas de usar el ERP:

| Forma | Cómo se entra | Qué pide |
|---|---|---|
| **Web** (navegador) | La dirección del ERP | Solo usuario y contraseña |
| **Instalado** (PC, Mac o celular) | Ícono propio, ventana propia, se actualiza solo | **La primera vez**, un código de instalación que genera Gerencia en el servidor; después, usuario y contraseña |

El código de instalación **no reemplaza la contraseña**. Registra el equipo una sola vez.
- El servidor guarda solo la huella del código (scrypt), con vencimiento (24 horas por defecto, máximo 14 días) y usos limitados.
- El equipo registrado recibe una credencial propia (cookie segura, HttpOnly) que Gerencia puede revocar.
- Ocho intentos fallidos bloquean los intentos por 15 minutos.

## 1. Primera conexión del servidor (una vez)

1. Publicar la versión según la skill `erp-orok-produccion`: `OROK_REHEARSAL=0`, volumen privado, PostgreSQL y dominio HTTPS.
2. Comprobar `https://<dominio>/api/health`: `ok: true` y la versión esperada.
3. Ingresar por la web como Gerencia y confirmar los módulos (CRM, Evaluador y Contabilidad), los datos y el Kanban.
4. Configurar las integraciones: n8n (skill `erp-orok-n8n`), `clara.json` para Drive y la IA en el engranaje de L.O.L.A.

## 2. Generar un código de instalación (Gerencia, en el servidor)

```bash
npm run codigo-instalacion -- crear --horas 24 --usos 1 --etiqueta "Laptop de Martín"
# Código de instalación: ORK-XXXX-XXXX-XXXX  (se muestra solo esta vez)
npm run codigo-instalacion -- listar          # códigos vigentes y equipos registrados
npm run codigo-instalacion -- revocar <id>    # el equipo deja de funcionar instalado
npm run codigo-instalacion -- anular <id>     # anula un código no usado
```

También existen las llamadas para Gerencia: `createInstallCode`, `getInstallDevices`, `revokeInstallDevice` y `cancelInstallCode`.

Entregar el código en persona o por un canal privado. **Nunca** se pega en grupos, correos masivos ni en el chat con la IA.

## 3. Instalar en el equipo

- **Windows o Mac con Chrome o Edge:** abrir la dirección del ERP y pulsar «Instalar» en el aviso del ERP o en el ícono de instalar de la barra de direcciones.
- **Mac con Safari:** menú Archivo › Agregar al Dock.
- **iPhone o iPad:** Compartir › Agregar a inicio.
- **Android:** menú › Instalar app.

Al abrir el ERP instalado por primera vez aparece «Registrar este equipo». Se ingresan el **código de instalación** y el nombre del equipo, y luego el usuario y la contraseña de siempre.

## 4. Mantenimiento

- **Equipo perdido o persona que deja el equipo:** `revocar` ese equipo. Su acceso web sigue dependiendo de su usuario, que se gestiona aparte.
- **Actualizaciones:** automáticas. Al publicar una versión en el host, todos los equipos instalados la reciben (aviso «Actualizar ahora»).
- **Si un equipo dice «Este equipo no está registrado o fue revocado»:** generar un código nuevo y registrarlo otra vez.

## Límite honesto

El código protege la **instalación**: quién tiene el ERP como app en su equipo y qué equipos puede revocar Gerencia. El acceso a los datos lo protege siempre la contraseña de cada usuario y su rol. Quien tiene usuario puede entrar por la web, que es lo previsto.
