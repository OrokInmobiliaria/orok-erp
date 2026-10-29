-- C.L.A.R.A · Drive contable · migración 003 (aditiva)
-- Crea solo el esquema `clara` con dos tablas de trabajo para el flujo n8n de Drive.
-- No modifica ni borra tablas, funciones o documentos existentes (lola_unified, mora quedan intactos).
-- Ejecutar una vez, primero en el ensayo y con respaldo previo.
BEGIN;

CREATE SCHEMA IF NOT EXISTS clara;

CREATE TABLE IF NOT EXISTS clara.migrations (
  version integer PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- Bitácora de archivos que n8n ordenó en Drive (rama 02).
CREATE TABLE IF NOT EXISTS clara.drive_log (
  id bigserial PRIMARY KEY,
  file_id text NOT NULL,
  nombre text,
  accion text NOT NULL,
  detalle jsonb,
  creado_en timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS clara_drive_log_file ON clara.drive_log (file_id);

-- Lecturas de la carpeta 01 Entrada (rama 03). Quedan «por revisar» hasta que una persona las registra.
CREATE TABLE IF NOT EXISTS clara.bandeja (
  file_id text PRIMARY KEY,
  empresa text NOT NULL CHECK (empresa IN ('BMG', 'MZA', 'MAAS')),
  tipo text NOT NULL,
  estado text NOT NULL DEFAULT 'por_revisar',
  datos jsonb NOT NULL,
  leido_en timestamptz NOT NULL DEFAULT clock_timestamp(),
  registrado_en timestamptz,
  registrado_por text
);
CREATE INDEX IF NOT EXISTS clara_bandeja_pendientes ON clara.bandeja (empresa, estado, leido_en DESC);

INSERT INTO clara.migrations (version) VALUES (3) ON CONFLICT DO NOTHING;
COMMIT;
