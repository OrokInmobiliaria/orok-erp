# R77 · Videos automáticos con HyperFrames (67.6.64-r77)

Mejora 16. En Marketing → Plan semanal, al abrir una pieza de VIDEO aprobada aparece «🎬 Videos automáticos»:
- «Crear videos (Instagram · Facebook · TikTok)» arma un MP4 por red con su formato: Instagram y TikTok 9:16 (1080×1920), Facebook 9:16 o 4:5 (1080×1350) según su versión; duración máxima por red (IG 60 s, FB 90 s, TikTok 45 s).
- Contenido: gancho animado en los 2 primeros segundos, las escenas del guion (texto en pantalla), el CTA de cada red y la marca ÖRÖK con colores y tipografía Outfit.
- Se procesan en cola, de a uno, para no cargar el servidor (unos 20-40 s por video). Se pueden ver y descargar desde la misma pieza.
- La música (audio en tendencia) y la voz se agregan al publicar. Las imágenes y carruseles siguen en el Estudio creativo.

## Técnico
- HyperFrames 0.8.223 (Apache 2.0) + GSAP 3.13.0; render con Chromium del servidor, sin telemetría (DO_NOT_TRACK, HYPERFRAMES_NO_TELEMETRY).
- Dockerfile: se agregan chromium y fuentes (la primera construcción en Easypanel tardará más y la imagen pesa ~300 MB más).
- Archivos en la carpeta privada `videos/`; colección `greta_videos`.
