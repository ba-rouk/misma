begin;

-- One Misma account/workspace is the user's "house". Every connected website
-- gets a dedicated Core.01 room ("apartment") so its knowledge is isolated.
alter table public.website_connections
  add column if not exists theme jsonb,
  add column if not exists theme_schema_version integer not null default 1,
  add column if not exists theme_updated_at timestamptz;

alter table public.core_01_rooms
  add column if not exists room_type text not null default 'topic',
  add column if not exists website_connection_id uuid references public.website_connections(id) on delete cascade;

alter table public.core_01_rooms
  drop constraint if exists core_01_rooms_room_key_check;
alter table public.core_01_rooms
  add constraint core_01_rooms_room_key_check
  check (room_key in (
    'business_profile','products','prices','customers','policies',
    'faq','orders','staff','procedures','general','website'
  ));
alter table public.core_01_rooms
  drop constraint if exists core_01_rooms_workspace_id_room_key_key;
create unique index if not exists core_01_rooms_topic_key_uidx
  on public.core_01_rooms(workspace_id, room_key) where room_type = 'topic';
create unique index if not exists core_01_rooms_website_uidx
  on public.core_01_rooms(website_connection_id) where website_connection_id is not null;
alter table public.core_01_rooms
  add constraint core_01_rooms_room_type_check
  check (room_type in ('topic','website'));

alter table public.knowledge_entries
  add column if not exists website_connection_id uuid references public.website_connections(id) on delete cascade,
  add column if not exists room_id bigint references public.core_01_rooms(id) on delete set null;

create index if not exists knowledge_entries_site_idx
  on public.knowledge_entries(workspace_id, website_connection_id, approved, id desc);
create index if not exists core_01_rooms_workspace_type_idx
  on public.core_01_rooms(workspace_id, room_type);

create or replace function public.misma_create_website_room()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room_id bigint;
begin
  insert into public.core_01_rooms (
    workspace_id, room_key, display_name, description, room_type, website_connection_id
  )
  values (
    new.workspace_id, 'website', left(coalesce(new.name, new.domain, 'Website'), 120),
    'Website-specific knowledge, conversations and Core.01 learning',
    'website', new.id
  )
  on conflict (website_connection_id) where website_connection_id is not null
  do update set display_name = excluded.display_name
  returning id into v_room_id;

  update public.website_connections
  set core_room_id = v_room_id
  where id = new.id;
  return new;
end;
$$;

alter table public.website_connections
  add column if not exists core_room_id bigint references public.core_01_rooms(id) on delete set null;

drop trigger if exists misma_website_room_after_insert on public.website_connections;
create trigger misma_website_room_after_insert
after insert on public.website_connections
for each row execute function public.misma_create_website_room();

-- Backfill a dedicated room for each existing website without moving or deleting data.
do $$
declare
  site record;
begin
  for site in
    select id, workspace_id, name, domain
    from public.website_connections
    where core_room_id is null
  loop
    insert into public.core_01_rooms (
      workspace_id, room_key, display_name, description, room_type, website_connection_id
    )
    values (
      site.workspace_id, 'website', left(coalesce(site.name, site.domain, 'Website'), 120),
      'Website-specific knowledge, conversations and Core.01 learning',
      'website', site.id
    )
    on conflict (website_connection_id) where website_connection_id is not null
    do update set display_name = excluded.display_name;
    update public.website_connections
      set core_room_id = (select id from public.core_01_rooms where website_connection_id = site.id)
      where id = site.id;
  end loop;
end $$;

-- Bind previously scanned website facts to their originating website room.
update public.knowledge_entries k
set website_connection_id = s.id,
    room_id = r.id
from public.website_connections s
join public.core_01_rooms r on r.website_connection_id = s.id
where k.source_type = 'website'
  and k.source_ref = s.website_url
  and k.workspace_id = s.workspace_id
  and k.website_connection_id is null;

-- Strictly validate theme payload shape. Values are data, never executable CSS.
create or replace function public.misma_valid_widget_theme(p_theme jsonb)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select
    jsonb_typeof(p_theme) = 'object'
    and coalesce(p_theme->>'schemaVersion','1') = '1'
    and coalesce(p_theme->>'fontFamily','system-ui') in
      ('system-ui','Inter','Roboto','Poppins','Open Sans','Lato','Montserrat','Nunito','serif','monospace')
    and (
      select count(*) = 0
      from jsonb_each_text(p_theme) e
      where e.key in (
        'headerBackground','headerText','chatBackground','textColor',
        'botBubbleBackground','botBubbleText','userBubbleBackground','userBubbleText',
        'sendButtonBackground','headerButtonBackground','footerBackground'
      )
      and e.value !~ '^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$'
    )
    and coalesce(p_theme->>'matchChatBackground','true') in ('true','false');
$$;

alter table public.website_connections enable row level security;
drop policy if exists "website theme owner update" on public.website_connections;
create policy "website theme owner update" on public.website_connections
for update to authenticated
using (
  exists (
    select 1 from public.workspaces w
    where w.id = website_connections.workspace_id and w.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.workspaces w
    where w.id = website_connections.workspace_id and w.owner_id = auth.uid()
  )
);

-- Long-running scans are represented as resumable jobs and page queue rows.
create table if not exists public.scan_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  website_id uuid not null references public.website_connections(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','running','completed','failed','cancelled')),
  pages_total integer not null default 0 check (pages_total >= 0),
  pages_scanned integer not null default 0 check (pages_scanned >= 0),
  pages_skipped integer not null default 0 check (pages_skipped >= 0),
  max_pages integer not null default 100 check (max_pages between 1 and 1000),
  crawl_depth integer not null default 3 check (crawl_depth between 0 and 8),
  detected_platform text,
  errors jsonb not null default '[]'::jsonb,
  discovered_urls jsonb not null default '[]'::jsonb,
  cursor integer not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create unique index if not exists scan_jobs_one_active_per_site_uidx
  on public.scan_jobs(website_id) where status in ('queued','running');
create index if not exists scan_jobs_workspace_created_idx
  on public.scan_jobs(workspace_id, created_at desc);

create table if not exists public.website_scan_pages (
  id bigint generated by default as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  website_id uuid not null references public.website_connections(id) on delete cascade,
  job_id uuid references public.scan_jobs(id) on delete cascade,
  canonical_url text not null,
  content_hash text not null,
  title text not null default '',
  content_text text not null default '',
  content_type text not null default 'text/html',
  etag text,
  last_modified text,
  scanned_at timestamptz not null default now(),
  unique (website_id, canonical_url)
);
create index if not exists website_scan_pages_site_scanned_idx
  on public.website_scan_pages(website_id, scanned_at desc);

alter table public.scan_jobs enable row level security;
alter table public.website_scan_pages enable row level security;
drop policy if exists "scan jobs workspace member access" on public.scan_jobs;
create policy "scan jobs workspace member access" on public.scan_jobs
for select to authenticated using (
  exists (select 1 from public.workspace_members wm
    where wm.workspace_id = scan_jobs.workspace_id and wm.user_id = auth.uid())
);
drop policy if exists "scan pages workspace member access" on public.website_scan_pages;
create policy "scan pages workspace member access" on public.website_scan_pages
for select to authenticated using (
  exists (select 1 from public.workspace_members wm
    where wm.workspace_id = website_scan_pages.workspace_id and wm.user_id = auth.uid())
);
grant select on public.scan_jobs, public.website_scan_pages to authenticated;
grant all on public.scan_jobs, public.website_scan_pages to service_role;

commit;
