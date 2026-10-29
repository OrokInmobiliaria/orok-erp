# R47 · Leads desestimados fuera del Kanban (67.6.30-r47)

**Problema (producción, 29/10/2026):** al desestimar un lead (Gestión y seguimiento → subestado «Desestimado»), el servidor lo guardaba correctamente con etapa `Desestimado`, pero la pantalla lo normalizaba a «Lead Inicial». El lead seguía en el tablero y no aparecía en «Perdidos / Desestimados», por lo que Gerencia no podía eliminar leads de prueba.

**Cambio (solo vista, `src/App.jsx`):**
- `Desestimado` pasa a ser una etapa reconocida (`OPERATIONAL_STAGES`) y cerrada (`CLOSED_LOST_STAGES`, junto con `Perdido`).
- Los desestimados salen del tablero, de la cola diaria y de los candidatos a cotización, y aparecen en «Perdidos / Desestimados» con el color de perdido.
- No cambia la base de datos ni el servidor: `deleteLostLead` ya aceptaba `Perdido` y `Desestimado`, con respaldo previo.

**Pruebas:** `tests/r47-desestimados.test.cjs` (2). Total 606/606.
