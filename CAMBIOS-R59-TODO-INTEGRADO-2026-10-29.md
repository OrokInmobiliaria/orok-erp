# R59 · Versión integrada (67.6.44-r59)

Incluye todo lo anterior: R56 (un solo botón de IA), R57 (cabida por piso, IA activa en proyectos nuevos),
R58 (altura máxima en pisos o metros, cuadro de unidades alimentado por el cálculo, borrar proyecto con doble confirmación).

## Carpetas en Drive (causa encontrada y corregida)
- Producción no tenía configurada la carpeta de cada empresa, así que el ERP nunca encargaba carpetas («Drive no configurado»).
- Ahora vienen predeterminadas: **BMG → Mi unidad › 1.BMG › ÖRÖK**, MZA → 2.Montezuma Arquitectos, MAAS → 3. MAAS Constructora.
- Gerencia las ve y cambia en **Ajustes › Herramientas › Carpetas en Drive** (pegar el enlace de la carpeta). Se pueden apagar.
- Evaluador › Datos del proyecto: botón **«Crear carpetas en Drive»** (guarda en el CRM y encarga la carpeta con el nombre del proyecto y sus 14 carpetas).

## n8n
- El mensajero de producción («ERP PRODUCCIÓN · Carpetas de proyectos y archivo en Drive») quedó publicado el 29/10/2026:
  8 pasos a erp.orok.com.pe con la llave «Header Auth account 2». Su copia queda en n8n/PROYECTOS-R59-DRIVE-PRODUCCION.json
  (`node deploy/build-project-drive-workflow.cjs produccion`). El flujo de ensayo sigue apagado.

## Pruebas
- tests/r59-carpetas-drive.test.cjs. 655/655.
