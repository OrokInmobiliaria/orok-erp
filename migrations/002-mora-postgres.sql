-- M.O.R.A · Evaluador Inmobiliario · migración 002 (aditiva)
-- Crea solo el esquema `mora` con una función de lectura y un índice nuevo sobre
-- lola_unified.documents. No modifica ni borra tablas, funciones o documentos existentes.
-- Ejecutar una vez, en mantenimiento, primero en el ensayo y con respaldo previo.
BEGIN;

CREATE SCHEMA IF NOT EXISTS mora;

CREATE TABLE IF NOT EXISTS mora.migrations (
  version integer PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- Historial por hilo: acelera la lectura de los últimos turnos de una persona.
CREATE INDEX IF NOT EXISTS mora_thread_messages
  ON lola_unified.documents (project_id, collection_path, (body->>'thread_id'), (body->>'sort_key') DESC);

-- Contexto de solo lectura, atado a la autorización temporal del trabajo.
-- El alcance se decide aquí, con el rol que el CRM copió de la sesión al crear el trabajo:
--   Gerente                          -> 'completo'
--   editor activo de esa evaluación  -> 'completo'
--   Vendedor, Broker y demás         -> 'resumen' (sin analysis ni inputs)
CREATE OR REPLACE FUNCTION mora.context_for_job(p_project text, p_job text, p_lease text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = pg_catalog, lola_unified AS $$
DECLARE
  root text := 'orok_projects/' || p_project;
  job jsonb; ev jsonb; editor jsonb; scope text; history jsonb;
BEGIN
  IF p_project !~ '^[a-zA-Z0-9_-]{1,100}$' OR p_job !~ '^[a-zA-Z0-9_-]{1,100}$'
     OR p_lease IS NULL OR length(p_lease) < 16 THEN
    RAISE EXCEPTION 'Consulta M.O.R.A no autorizada';
  END IF;

  SELECT body INTO job FROM lola_unified.documents
   WHERE project_id = p_project AND path = root || '/mora_jobs/' || p_job;
  IF job IS NULL
     OR job->>'engine' IS DISTINCT FROM 'mora'
     OR job->>'state' IS DISTINCT FROM 'processing'
     OR job->>'lease_token' IS DISTINCT FROM p_lease
     OR COALESCE((job->>'lease_until')::timestamptz, '-infinity') <= CURRENT_TIMESTAMP
     OR COALESCE(job->>'evaluation_id', '') !~ '^[a-zA-Z0-9_-]{1,100}$'
     OR COALESCE(job->>'actor_uid', '') = '' THEN
    RAISE EXCEPTION 'Consulta M.O.R.A vencida o no autorizada';
  END IF;

  SELECT body INTO ev FROM lola_unified.documents
   WHERE project_id = p_project AND path = root || '/mora_evaluations/' || (job->>'evaluation_id');
  IF ev IS NULL OR COALESCE(ev->>'active', 'true') = 'false' THEN
    RAISE EXCEPTION 'Evaluación no disponible';
  END IF;

  IF job->>'actor_role' = 'Gerente' THEN
    scope := 'completo';
  ELSE
    SELECT body INTO editor FROM lola_unified.documents
     WHERE project_id = p_project AND path = root || '/mora_editors/' || (job->>'actor_uid');
    scope := CASE
      WHEN editor IS NOT NULL
       AND COALESCE(editor->>'active', 'false') = 'true'
       AND jsonb_typeof(editor->'evaluations') = 'array'
       AND (editor->'evaluations') ? (job->>'evaluation_id')
      THEN 'completo' ELSE 'resumen' END;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'role', CASE WHEN body->>'role' = 'assistant' THEN 'assistant' ELSE 'user' END,
           'text', left(COALESCE(body->>'text', ''), 1200),
           'at', body->>'at') ORDER BY body->>'sort_key'), '[]'::jsonb)
    INTO history
    FROM (SELECT body FROM lola_unified.documents
           WHERE project_id = p_project
             AND collection_path = root || '/mora_messages'
             AND body->>'thread_id' = job->>'thread_id'
             AND body->>'actor_uid' = job->>'actor_uid'
           ORDER BY body->>'sort_key' DESC
           LIMIT 12) recent;

  RETURN jsonb_build_object(
    'ok', true,
    'job_id', p_job,
    'scope', scope,
    'evaluation', CASE WHEN scope = 'completo'
      THEN jsonb_build_object('project', ev->'project', 'summary', ev->'summary', 'analysis', ev->'analysis', 'inputs', ev->'inputs', 'engine_version', ev->'engine_version')
      ELSE jsonb_build_object('project', ev->'project', 'summary', ev->'summary') END,
    'history', history,
    'memory', jsonb_build_object('storage', 'postgresql', 'turns', jsonb_array_length(history), 'scope', scope)
  );
END $$;

INSERT INTO mora.migrations(version) VALUES (2) ON CONFLICT DO NOTHING;

COMMIT;

-- Comprobación de solo lectura después de migrar:
-- SELECT version, applied_at FROM mora.migrations;
-- SELECT proname FROM pg_proc JOIN pg_namespace n ON n.oid = pronamespace WHERE n.nspname = 'mora';
