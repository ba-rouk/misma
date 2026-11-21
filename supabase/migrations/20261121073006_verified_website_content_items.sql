alter table public.website_scan_pages
  add column if not exists structured_data jsonb not null default '[]'::jsonb;

create table if not exists public.website_content_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  website_id uuid not null references public.website_connections(id) on delete cascade,
  item_type text not null check (item_type in ('product','service','movie','music','profile','article','post','video','event','book','recipe','course')),
  name text not null check (length(trim(name)) between 2 and 240),
  description text not null default '',
  image_url text,
  item_url text,
  price_text text,
  source_page_url text not null,
  source_verified boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (website_id, item_type, name, source_page_url)
);
create index if not exists website_content_items_lookup_idx
  on public.website_content_items (workspace_id, website_id, source_verified, item_type);
alter table public.website_content_items enable row level security;
drop policy if exists "Workspace members can read website content items" on public.website_content_items;
create policy "Workspace members can read website content items"
  on public.website_content_items for select to authenticated
  using (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = website_content_items.workspace_id
      and wm.user_id = (select auth.uid())
  ));
grant select on public.website_content_items to authenticated;
grant all on public.website_content_items to service_role;
