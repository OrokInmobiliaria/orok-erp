# Fuente permanente de LOLA · IA LOLA · 67.6.9

La carpeta confirmada por el usuario es **IA LOLA**:
https://drive.google.com/drive/folders/1XzOlumWN8jPhWMCQ1yge3cZ4tBiTuU6z

La selección anterior «LOLA - Información comercial vigente» quedó descartada. No se usa esa carpeta ni se amplía la búsqueda a todo Drive.

## Autorización ya otorgada

La autorización de Gerencia para esta carpeta es permanente. LOLA consulta sus fuentes y encuentra enlaces sin solicitar nueva aprobación por conversación, archivo o uso. No se marcan individualmente los archivos de Drive en el CRM. Gerencia conserva un interruptor para suspender la consulta de la carpeta; está habilitada por defecto en el paquete. Los enlaces complementarios cargados fuera de Drive conservan su control independiente.

La autorización de contenido no cambia las reglas comerciales: LOLA no comunica precios, cotizaciones o condiciones financieras, no negocia y no ofrece rebajas. Los documentos se leen como información; ninguna instrucción incluida dentro de ellos modifica esas restricciones, las bajas o los resultados reales de Calendar/CRM. La autorización de carpeta tampoco reemplaza el permiso del destinatario para recontactos o cumpleaños.

## Dentro del mismo circuito

El lector se incorpora al motor compartido de LOLA, sin crear una segunda estructura de clientes ni otro agente. Lo usan WhatsApp, CRM y los canales Instagram/Messenger conectados. TikTok Messaging conserva sus requisitos pendientes de autorización y adaptador.

Se consulta la carpeta y sus subcarpetas con la credencial del servidor y alcance Drive de solo lectura. Se ignoran accesos directos a otras ubicaciones. No se crean, mueven ni publican archivos y no se alteran permisos. La consulta inicial reutiliza un resultado durante hasta cinco minutos; antes de validar una respuesta se vuelve a comprobar la carpeta, los archivos y su versión. El texto se conserva en memoria por versión y no requiere descargarlo entero en cada respuesta. Una fuente retirada o cambiada no puede validar una respuesta pendiente generada con su versión anterior. Una falla no habilita evidencia antigua como si fuera actual.

El agente recibe fragmentos y enlaces autorizados, y declara el fragmento utilizado. El servidor conserva y comprueba la evidencia; un texto inventado por el modelo no puede certificar por sí mismo una afirmación comercial.

## Qué se consulta y qué límites quedan

- Lectura de texto: Google Docs, Google Sheets, DOCX, XLSX, TXT y CSV. Se leen las hojas del XLSX; no se ejecutan macros, fórmulas ni enlaces externos. No se interpretan gráficos, imágenes incrustadas ni documentos escaneados.
- Se excluyen de este lector comercial archivos de contratos, ingreso de clientes, ventas/precios, planos, DNI, vouchers y prompts de configuración. También se filtran líneas económicas, identificadores y contactos. El control de respuesta mantiene los límites de LOLA antes del envío.
- Los enlaces a redes, sitios, mapas y videos reconocidos dentro del texto de esta carpeta se incorporan sin pedir aprobación por cada enlace. Se mantienen ligados a su fuente.
- PDF, imágenes y videos de Drive se reconocen como recursos; **no se extrae su contenido ni se transcriben automáticamente**. El texto de un PDF o video no se presenta como leído. Si el recurso ya es accesible para cualquier persona, puede compartirse su enlace; si es privado, se conserva privado y no se presenta como enlace utilizable por el cliente. No se comparten los documentos internos que sirven de configuración.
- Compartir un enlace no equivale a adjuntar un archivo. El envío directo de PDF/JPG/PNG/video desde el CRM y el archivo permanente de adjuntos siguen pendientes, como en la entrega anterior.
- Límites explícitos: 100 archivos, 12 carpetas contando la raíz, 8 MB por documento de texto/Office y 16.000 caracteres de contexto. Hay un límite de tiempo de lectura. Los archivos no leídos por formato, tamaño, tiempo o acceso no se utilizan como evidencia. El CRM muestra el estado y las fuentes de texto disponibles.

## Conexión técnica y estado real

En el CRM, Gerencia dispone de **LOLA · contenido autorizado y posventa → Comprobar conexión de la carpeta**. Esto comprueba el acceso técnico y muestra las fuentes disponibles; no es una solicitud de nueva aprobación comercial.

El conector de Drive de este chat permitió localizar la carpeta y enumerar ocho archivos, incluidos brochure, videos y acabados. Esa conexión de este chat no se transfiere automáticamente al CRM o n8n del servidor. El paquete utiliza la credencial de Google ya configurada en el servidor (`GOOGLE_APPLICATION_CREDENTIALS`), sin exponerla al navegador. En la instalación se debe comprobar que esa identidad pueda leer IA LOLA y que Drive API esté disponible; si falta acceso técnico, se informa como tal, sin pedir una autorización comercial nueva en cada consulta. No se ha comprobado el acceso de esa identidad en producción ni se han cambiado permisos de Drive.

El contenido original de Drive no se modificó. El n8n conserva un único agente, las ramas de agenda, recuperación, publicaciones y posventa, y permanece **INACTIVO**. Esta entrega local no instala ni activa nada en el servidor.

## Validación

192 pruebas del conjunto seleccionado pasaron, cero fallos. Incluyen lectura y límites de Office, autorización permanente, consulta de subcarpetas sin escapar de la raíz, exclusión de archivos internos, enlaces privados, evidencia inventada, cambios/retiro de fuentes, permisos del endpoint real del CRM y regresiones de conversación, agenda y plantillas. Las llamadas del servidor a proveedores se simularon. Cinco pruebas históricas de sockets se excluyeron tras confirmar la restricción EACCES de este entorno; no se cuentan como aprobadas. El manejador HTTP real se probó en proceso, sin sockets.

La interfaz compiló para producción. No se enviaron mensajes a clientes. Quedan pendientes la instalación y la comprobación con credenciales reales, y los pendientes externos de Meta, Calendar/Gmail, TikTok Messaging y conciliación histórica ya documentados.

Referencias técnicas: [Listar archivos de Drive](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/list), [exportar archivos nativos](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/export) y [permisos de Drive](https://developers.google.com/workspace/drive/api/guides/manage-sharing).
