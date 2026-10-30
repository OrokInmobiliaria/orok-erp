# R65 · Lo que el cliente respondió en el formulario, en el Kanban (67.6.50-r65)

Incluye todo lo de R64.

- **Hojas de leads (LeadCenter «Formulario LC», Google Ads):** además de nombre, teléfono, correo y campaña, ahora se guardan las
  demás preguntas del formulario: inicial, «¿está dentro de tu presupuesto?», tipología buscada, financiamiento, etc.
  La sincronización actualiza también los leads que ya estaban (sin mover su etapa).
- **Formularios de Meta (Lead Ads):** las respuestas quedan en el lead en estructura, además del comentario.
- **Tarjeta del Kanban:** recuadro «Formulario» con hasta 3 respuestas (todas al expandir; al pasar el mouse se ve la pregunta completa).
- **Puntaje del lead:** suma o resta según lo declarado: inicial declarada (+6) o sin inicial (−4); precio dentro del presupuesto (+4) o
  fuera (−8); busca la tipología ofrecida (+3) o no (−4); indicó financiamiento (+2). El detalle aparece en las razones del puntaje.
  No usa datos sensibles (ingresos, DNI, estado civil).

Pruebas: tests/r65-formulario-kanban.test.cjs. 673/673.
