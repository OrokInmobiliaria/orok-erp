-- Exportar el resultado y conciliar antes de retirar Postgres. No modifica datos.
SELECT jsonb_build_object('version',1,'exported_at',now(),'leads',COALESCE(jsonb_agg(jsonb_build_object('chat_id',chat_id,'user_id',user_id,'state',state,'updated_at',updated_at)),'[]'::jsonb)) AS respaldo FROM public.orok_lola_ensayo03_leads;
