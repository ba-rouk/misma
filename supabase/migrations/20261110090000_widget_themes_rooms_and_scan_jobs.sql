begin;

-- A workspace is the account's "house". Each connected website gets a dedicated
-- Core.01 room inside that house; existing general rooms remain unchanged.
alter table public.core_01_rooms
  drop constraint if exists core_01_rooms_room_key_check;
alter table public.core_01_rooms
  add constraint core_01_rooms_room_key_check
  check (
    room_key in (
      'business_profile','products','prices','customers','policies',
      'faq','orders','staff','procedures','general'
    )
    or room_key ~ '^website_[0-9a-f-]{36}$'
  );

alter table public.website_connections
  add column if not exists room_id bigint references public.core_01_rooms(id) on delete set null,
  add column if not exists theme_suggestions jsonb not null default '{}'::jsonb;

-- Backfill one Core.01 room for every existing connected website.
insert into public.core_01_rooms (workspace_id, room_key, display_name, description)
select
  site.workspace_id,
  'website_' || site.id::text,
  coalesce(nullif(site.name, ''), site.domain, 'Website') || ' room',
  'Website-specific knowledge room for ' || coalesce(site.domain, site.website_url, site.id::text)
from public.website_connections site
on conflict (workspace_id, room_key) do nothing;

update public.website_connections site
set room_id = room.id
from public.core_01_rooms room
where room.workspace_id = site.workspace_id
  and room.room_key = 'website_' || site.id::text
  and site.room_id is distinct from room.id;

create index if not exists website_connections_room_id_idx
  on public.website_connections(room_id);

alter table public.knowledge_entries
  add column if not exists room_id bigint references public.core_01_rooms(id) on delete set null;
create index if not exists knowledge_entries_workspace_room_approved_idx
  on public.knowledge_entries(workspace_id, room_id, approved, id desc);

-- Theme values are isolated from public website connection records. The widget
-- reads this table only after the Edge Function has validated the domain-bound key.
create table if not exists public.website_widget_themes (
  website_id uuid primary key references public.website_connections(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  schema_version integer not null default 1 check (schema_version = 1),
  theme jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create index if not exists website_widget_themes_workspace_idx
  on public.website_widget_themes(workspace_id);

alter table public.website_widget_themes enable row level security;
revoke all on public.website_widget_themes from anon;
grant select, insert, update, delete on public.website_widget_themes to authenticated;

drop policy if exists website_widget_themes_owner_select on public.website_widget_themes;
create policy website_widget_themes_owner_select
  on public.website_widget_themes for select to authenticated
  using (exists (
    select 1 from public.workspaces w
    where w.id = website_widget_themes.workspace_id
      and w.owner_id = (select auth.uid())
  ));

drop policy if exists website_widget_themes_owner_insert on public.website_widget_themes;
create policy website_widget_themes_owner_insert
  on public.website_widget_themes for insert to authenticated
  with check (exists (
    select 1 from public.workspaces w
    where w.id = website_widget_themes.workspace_id
      and w.owner_id = (select auth.uid())
  ));

drop policy if exists website_widget_themes_owner_update on public.website_widget_themes;
create policy website_widget_themes_owner_update
  on public.website_widget_themes for update to authenticated
  using (exists (
    select 1 from public.workspaces w
    where w.id = website_widget_themes.workspace_id
      and w.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.workspaces w
    where w.id = website_widget_themes.workspace_id
      and w.owner_id = (select auth.uid())
  ));

drop policy if exists website_widget_themes_owner_delete on public.website_widget_themes;
create policy website_widget_themes_owner_delete
  on public.website_widget_themes for delete to authenticated
  using (exists (
    select 1 from public.workspaces w
    where w.id = website_widget_themes.workspace_id
      and w.owner_id = (select auth.uid())
  ));

-- Durable, resumable scan queue. Edge Functions process bounded batches and
-- update this row after each batch; a failed chunk can be retried without losing
-- previously discovered URLs or page cache validators.
create table if not exists public.scan_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  website_id uuid not null references public.website_connections(id) on delete cascade,
  scan_run_id uuid references public.website_scan_runs(id) on delete set null,
  status text not null default 'queued'
    check (status in ('queued','scanning','completed','failed','cancelled')),
  pending_urls jsonb not null default '[]'::jsonb,
  seen_urls jsonb not null default '[]'::jsonb,
  collected_pages jsonb not null default '[]'::jsonb,
  skipped jsonb not null default '[]'::jsonb,
  errors jsonb not null default '[]'::jsonb,
  theme_suggestions jsonb not null default '{}'::jsonb,
  platform text not null default 'Unknown',
  pages_scanned integer not null default 0 check (pages_scanned >= 0),
  pages_skipped integer not null default 0 check (pages_skipped >= 0),
  max_pages integer not null default 80 check (max_pages between 1 and 250),
  heartbeat_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists scan_jobs_one_active_per_website_uidx
  on public.scan_jobs(website_id)
  where status in ('queued','scanning');
create index if not exists scan_jobs_workspace_created_idx
  on public.scan_jobs(workspace_id, created_at desc);
create index if not exists scan_jobs_worker_claim_idx
  on public.scan_jobs(status, updated_at);

alter table public.scan_jobs enable row level security;
revoke all on public.scan_jobs from anon;
grant select, insert, update on public.scan_jobs to authenticated;

drop policy if exists scan_jobs_member_select on public.scan_jobs;
create policy scan_jobs_member_select
  on public.scan_jobs for select to authenticated
  using (public.is_workspace_member(workspace_id));
drop policy if exists scan_jobs_manager_insert on public.scan_jobs;
create policy scan_jobs_manager_insert
  on public.scan_jobs for insert to authenticated
  with check (public.can_manage_workspace(workspace_id));
drop policy if exists scan_jobs_manager_update on public.scan_jobs;
create policy scan_jobs_manager_update
  on public.scan_jobs for update to authenticated
  using (public.can_manage_workspace(workspace_id))
  with check (public.can_manage_workspace(workspace_id));

-- Incremental page cache for ETag / Last-Modified revalidation and deduplication.
create table if not exists public.website_scan_pages (
  id bigint generated by default as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  website_id uuid not null references public.website_connections(id) on delete cascade,
  canonical_url text not null,
  content_hash text,
  etag text,
  last_modified text,
  content_type text not null default '',
  extracted_text text not null default '',
  updated_at timestamptz not null default now(),
  unique (website_id, canonical_url)
);
create index if not exists website_scan_pages_workspace_site_idx
  on public.website_scan_pages(workspace_id, website_id);
alter table public.website_scan_pages enable row level security;
revoke all on public.website_scan_pages from anon;
grant select on public.website_scan_pages to authenticated;
drop policy if exists website_scan_pages_member_select on public.website_scan_pages;
create policy website_scan_pages_member_select
  on public.website_scan_pages for select to authenticated
  using (public.is_workspace_member(workspace_id));

alter table public.website_scan_runs
  add column if not exists total_pages integer not null default 0,
  add column if not exists pages_skipped integer not null default 0,
  add column if not exists errors jsonb not null default '[]'::jsonb,
  add column if not exists theme_suggestions jsonb not null default '{}'::jsonb,
  add column if not exists platform text not null default 'Unknown';

comment on table public.website_widget_themes is
  'Validated per-website widget theme. Direct writes are restricted to the owning workspace account; public widgets read it only through the site-key-validated Edge Function.';
comment on table public.scan_jobs is
  'Durable website scan queue with URL discovery, progress, errors and resumable state. Worker writes use the Supabase service role.';
comment on column public.website_connections.room_id is
  'The Core.01 room assigned to this connected website. Each website has its own knowledge room.';

commit;
