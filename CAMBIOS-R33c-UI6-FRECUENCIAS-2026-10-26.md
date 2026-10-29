# R33c UI6 · Frecuencias de M.O.R.A. y respaldos

Fecha: 26 de octubre de 2026.

## Ajustes

- Vigilancia de revisión de PostgreSQL: de 2 a 5 segundos. Es una lectura ligera y solo recarga datos cuando cambia la revisión.
- Cola conversacional de M.O.R.A. en n8n: 10 segundos explícitos.
- Pantalla de conversación: comprueba la respuesta cada 3 segundos únicamente mientras existe una consulta pendiente.
- Lecturas de mercado en n8n: 15 segundos para conservar una detección inferior o igual a 15 segundos; la pantalla comprueba su resultado cada 5 segundos.
- Respaldos generales: se conserva el máximo existente de 4; el quinto elimina la copia más antigua después de crear y verificar la nueva.

## Alcance

- El tiempo propio de procesamiento del modelo de IA no puede garantizarse. El objetivo de 15 segundos corresponde a la detección y recogida del trabajo, no a la generación completa de la respuesta.
- M.O.R.A. continúa sin proyectar sus colecciones de trabajo a Firestore.
- El flujo n8n permanece incluido como copia inactiva; no se modifica el flujo activo.
