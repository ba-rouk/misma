-- Durable website scan worker scheduler.
-- The worker token is generated in Postgres and held only in Supabase Vault.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $vault$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'misma_scan_project_url') THEN
    PERFORM vault.create_secret(
      'https://grlrrmebnthxguluybgb.supabase.co',
      'misma_scan_project_url',
      'Project URL used by the Misma scan worker cron job'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'misma_scan_publishable_key') THEN
    PERFORM vault.create_secret(
      'sb_publishable_5Zcw-BLkC9lPBlvKF3QIVg_dnlVDAj2',
      'misma_scan_publishable_key',
      'Public Supabase publishable key used by pg_net to invoke the widget Edge Function'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'misma_scan_worker_token') THEN
    PERFORM vault.create_secret(
      gen_random_uuid()::text || gen_random_uuid()::text,
      'misma_scan_worker_token',
      'Private bearer value for scheduled Misma website scan worker requests'
    );
  END IF;
END
$vault$;

CREATE OR REPLACE FUNCTION public.misma_validate_scan_worker_token(p_token text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $function$
  SELECT COALESCE(
    p_token IS NOT NULL
    AND length(p_token) >= 64
    AND EXISTS (
      SELECT 1
      FROM vault.decrypted_secrets
      WHERE name = 'misma_scan_worker_token'
        AND decrypted_secret = p_token
    ),
    false
  );
$function$;

REVOKE ALL ON FUNCTION public.misma_validate_scan_worker_token(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.misma_validate_scan_worker_token(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.misma_validate_scan_worker_token(text) TO service_role;

CREATE OR REPLACE FUNCTION public.misma_scan_worker_tick()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, net, pg_temp
AS $function$
DECLARE
  request_id bigint;
  project_url text;
  publishable_key text;
  worker_token text;
BEGIN
  SELECT decrypted_secret INTO project_url
  FROM vault.decrypted_secrets
  WHERE name = 'misma_scan_project_url';

  SELECT decrypted_secret INTO publishable_key
  FROM vault.decrypted_secrets
  WHERE name = 'misma_scan_publishable_key';

  SELECT decrypted_secret INTO worker_token
  FROM vault.decrypted_secrets
  WHERE name = 'misma_scan_worker_token';

  IF project_url IS NULL OR publishable_key IS NULL OR worker_token IS NULL THEN
    RAISE EXCEPTION 'Misma scan worker Vault configuration is incomplete';
  END IF;

  SELECT net.http_post(
    url := rtrim(project_url, '/') || '/functions/v1/misma-widget',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', publishable_key,
      'x-misma-scan-worker', worker_token
    ),
    body := jsonb_build_object('action', 'scan-worker'),
    timeout_milliseconds := 10000
  ) INTO request_id;

  RETURN request_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.misma_scan_worker_tick() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.misma_scan_worker_tick() FROM anon, authenticated;

DO $schedule$
DECLARE
  existing_job bigint;
BEGIN
  SELECT jobid INTO existing_job
  FROM cron.job
  WHERE jobname = 'misma-scan-worker';

  IF existing_job IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job);
  END IF;

  PERFORM cron.schedule(
    'misma-scan-worker',
    '* * * * *',
    'select public.misma_scan_worker_tick();'
  );
END
$schedule$;

COMMENT ON FUNCTION public.misma_scan_worker_tick() IS
  'Invokes the Misma scan worker once per minute. The project URL, publishable key and worker token are read from Supabase Vault.';
