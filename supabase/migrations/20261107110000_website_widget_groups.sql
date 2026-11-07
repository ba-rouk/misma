BEGIN;

ALTER TABLE public.website_connections
  ADD COLUMN IF NOT EXISTS widget_public_key text,
  ADD COLUMN IF NOT EXISTS widget_deleted_at timestamptz;

UPDATE public.website_connections
SET widget_public_key = public_key::text
WHERE widget_public_key IS NULL;

ALTER TABLE public.website_connections
  ALTER COLUMN widget_public_key SET DEFAULT gen_random_uuid()::text;

CREATE INDEX IF NOT EXISTS website_connections_widget_key_domain_idx
  ON public.website_connections (widget_public_key, lower(domain))
  WHERE widget_deleted_at IS NULL;

COMMENT ON COLUMN public.website_connections.widget_public_key IS
  'A workspace-shared embed key. Every widget request is still resolved against an explicitly registered domain.';
COMMENT ON COLUMN public.website_connections.widget_deleted_at IS
  'Soft removal timestamp. Historical visitor conversations remain intact.';

COMMIT;
