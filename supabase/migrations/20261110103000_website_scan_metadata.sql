begin;
alter table public.website_connections
  add column if not exists theme_suggestions jsonb,
  add column if not exists detected_platform text;
alter table public.website_scan_runs
  add column if not exists pages_total integer not null default 0,
  add column if not exists pages_skipped integer not null default 0,
  add column if not exists detected_platform text,
  add column if not exists errors jsonb not null default '[]'::jsonb;
comment on column public.website_connections.theme_suggestions is
  'Brand-color suggestions extracted from the latest successful website scan.';
commit;