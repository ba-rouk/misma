create table if not exists public.channel_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  channel text not null check (channel in ('phone', 'whatsapp')),
  provider text not null check (provider in ('twilio', 'meta_whatsapp')),
  display_name text not null default '',
  external_id text not null default '',
  phone_number text not null default '',
  status text not null default 'pending' check (status in ('pending', 'connected', 'paused')),
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, channel)
);

create index if not exists channel_connections_channel_external_id_idx
  on public.channel_connections (channel, external_id);

alter table public.channel_connections enable row level security;

drop policy if exists channel_connections_member_access on public.channel_connections;
create policy channel_connections_member_access
  on public.channel_connections
  for all
  to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

comment on table public.channel_connections is
  'Workspace-scoped mapping for inbound phone and WhatsApp provider identifiers. Access tokens and webhook secrets are never stored here.';