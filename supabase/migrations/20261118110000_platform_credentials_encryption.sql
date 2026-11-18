begin;

-- Provider credentials are encrypted in the Edge Function before reaching this table.
-- No authenticated or anonymous client can read, write, or enumerate these rows.
-- A composite unique key lets the vault enforce that a credential's workspace
-- and provider always match the owning platform connection.
create unique index if not exists platform_connections_id_workspace_provider_uidx
  on public.platform_connections(id, workspace_id, provider);

create table if not exists public.platform_credentials (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  platform_connection_id uuid not null unique,
  provider text not null check (provider in ('vercel', 'netlify', 'render')),
  constraint platform_credentials_connection_scope_fk
    foreign key (platform_connection_id, workspace_id, provider)
    references public.platform_connections(id, workspace_id, provider) on delete cascade,
  credential_kind text not null check (credential_kind in ('oauth_tokens', 'api_key')),
  secret_ciphertext text not null,
  secret_iv text not null,
  key_version smallint not null check (key_version > 0),
  last_validated_at timestamptz,
  last_validation_status text not null default 'unverified'
    check (last_validation_status in ('unverified', 'valid', 'invalid', 'expired', 'error')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_credentials_ciphertext_nonempty check (length(secret_ciphertext) > 0),
  constraint platform_credentials_iv_nonempty check (length(secret_iv) > 0)
);

create index if not exists platform_credentials_workspace_provider_idx
  on public.platform_credentials(workspace_id, provider);

alter table public.platform_credentials enable row level security;

-- Do not create client policies. Only the Edge Function's service-role client may
-- read or write ciphertext. The service role bypasses RLS; explicit grants keep
-- the table unavailable to browser-facing roles through the Data API.
revoke all on public.platform_credentials from public, anon, authenticated;
grant all on public.platform_credentials to service_role;

commit;
