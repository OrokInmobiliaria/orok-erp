# Revisión de dependencias del ensayo · 22/10/2026

El primer contenedor informó tres dependencias con avisos. Se actualizaron únicamente @grpc/grpc-js 1.14.4 → 1.14.6, brace-expansion 2.1.4 → 2.1.7 y nodemailer 10.0.9 → 10.2.1. El archivo package-lock conserva las versiones concretas para npm ci.

La auditoría npm de dependencias de ejecución del archivo actualizado informa 0 vulnerabilidades conocidas. Esto no certifica ausencia de otros problemas. Pasaron 223 pruebas de regresión y 44 de marketing: 267 aprobadas, una comprobación POSIX omitida en Windows; cinco pruebas históricas de sockets siguen excluidas. Proveedores simulados, sin mensajes enviados.

Las tres versiones nuevas se instalaron y comprobaron en un directorio local independiente. Nodemailer generó un correo MIME con archivo de calendario en memoria, sin conexión SMTP. La instalación completa local del CRM encontró EPERM al crear node_modules en Windows; por ello la instalación completa de estas versiones debe verificarse con la construcción Linux en VPS. Las pruebas que cargan dependencias antiguas de Firebase desde el directorio compartido no sustituyen esa comprobación.

Fuentes: [gRPC](https://github.com/advisories/GHSA-m9gg-hp2v-232j), [brace-expansion](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr), [Nodemailer](https://github.com/advisories/GHSA-39m8-27wv-hr27). Los JSON de auditoría adjuntos enumeran los avisos detectados.
