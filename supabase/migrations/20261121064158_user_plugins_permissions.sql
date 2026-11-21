create table if not exists public.user_plugins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('github', 'vercel', 'render', 'netlify')),
  permission_mode text not null default 'low_risk'
    check (permission_mode in ('always_ask', 'read', 'low_risk', 'all')),
  is_installed boolean not null default true,
  account_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_plugins_user_provider_key unique (user_id, provider),
  constraint user_plugins_account_label_length check (account_label is null or char_length(account_label) <= 80)
);

create index if not exists user_plugins_user_provider_idx
  on public.user_plugins (user_id, provider);

alter table public.user_plugins enable row level security;

grant select, insert, update, delete on public.user_plugins to authenticated;
grant select, insert, update, delete on public.user_plugins to service_role;

drop policy if exists user_plugins_select_own on public.user_plugins;
create policy user_plugins_select_own on public.user_plugins
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists user_plugins_insert_own on public.user_plugins;
create policy user_plugins_insert_own on public.user_plugins
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists user_plugins_update_own on public.user_plugins;
create policy user_plugins_update_own on public.user_plugins
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists user_plugins_delete_own on public.user_plugins;
create policy user_plugins_delete_own on public.user_plugins
  for delete to authenticated using ((select auth.uid()) = user_id);

insert into public.user_plugins (user_id, provider)
select distinct wm.user_id, pc.provider
from public.workspace_members wm
join public.platform_connections pc on pc.workspace_id = wm.workspace_id
where pc.status = 'connected'
  and wm.role in ('owner', 'admin')
on conflict (user_id, provider) do nothing;
