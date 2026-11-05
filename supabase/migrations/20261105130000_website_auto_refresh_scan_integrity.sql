-- Keep website scan history tied to the active website connection model.
-- The dashboard and widget authenticate against public.website_connections;
-- the old foreign key still pointed at the legacy public.workspace_websites table.

ALTER TABLE public.website_scan_runs
  DROP CONSTRAINT IF EXISTS website_scan_runs_website_id_fkey;

DO $migr$
BEGIN
  IF to_regclass('public.website_connections') IS NULL
     OR to_regclass('public.website_scan_runs') IS NULL THEN
    RAISE EXCEPTION 'Website scan migration requires website_connections and website_scan_runs tables.';
  END IF;

  -- Re-map any historical run records from the legacy website table when the
  -- same workspace + URL exists in the active connection table.
  IF to_regclass('public.workspace_websites') IS NOT NULL THEN
    UPDATE public.website_scan_runs AS scan
    SET website_id = current_site.id
    FROM public.workspace_websites AS legacy_site
    JOIN public.website_connections AS current_site
      ON current_site.workspace_id = legacy_site.workspace_id
     AND current_site.website_url = legacy_site.website_url
    WHERE scan.website_id = legacy_site.id
      AND NOT EXISTS (
        SELECT 1
        FROM public.website_connections AS direct_site
        WHERE direct_site.id = scan.website_id
      );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.website_scan_runs AS scan
    LEFT JOIN public.website_connections AS site ON site.id = scan.website_id
    WHERE site.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Some website scan history cannot be mapped to website_connections. Resolve those rows before applying this migration.';
  END IF;
END;
$migr$;

ALTER TABLE public.website_scan_runs
  ADD CONSTRAINT website_scan_runs_website_id_fkey
  FOREIGN KEY (website_id)
  REFERENCES public.website_connections(id)
  ON DELETE CASCADE;

ALTER TABLE public.website_scan_runs
  DROP CONSTRAINT IF EXISTS website_scan_runs_status_check;

ALTER TABLE public.website_scan_runs
  ADD CONSTRAINT website_scan_runs_status_check
  CHECK (status IN ('queued', 'scanning', 'completed', 'failed'));

-- One active scan per connected website. This prevents simultaneous visitors
-- from queuing duplicate crawls when several pages load together.
CREATE UNIQUE INDEX IF NOT EXISTS website_scan_runs_one_active_per_site_uidx
  ON public.website_scan_runs (website_id)
  WHERE status IN ('queued', 'scanning');

CREATE INDEX IF NOT EXISTS website_scan_runs_site_started_idx
  ON public.website_scan_runs (website_id, started_at DESC);

