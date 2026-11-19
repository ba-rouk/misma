begin;

-- Short-lived encrypted handoffs for installations started from the Vercel Marketplace.
-- The browser receives only a random one-time handle; OAuth access tokens remain encrypted.
create table if not exists public.platform_oauth_handoffs (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'vercel' check (provider = 'vercel'),
  handoff_hash text not null unique,
  configuration_id text not null,
  external_account_id text not null,
  external_account_name text not null,
  team_id text,
  user_id text not null,
  installation_id text,
  source text not null default 'marketplace',
  next_url text,
  token_ciphertext text not null,
  token_iv text not null,
  key_version smallint not null check (key_version > 0),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint platform_oauth_handoffs_ciphertext_nonempty check (length(token_ciphertext) > 0),
  constraint platform_oauth_handoffs_iv_nonempty check (length(token_iv) > 0)
);

create index if not exists platform_oauth_handoffs_expiry_idx
  on public.platform_oauth_handoffs(expires_at)
  where consumed_at is null;

alter table public.platform_oauth_handoffs enable row level security;
revoke all on public.platform_oauth_handoffs from public, anon, authenticated;
grant all on public.platform_oauth_handoffs to service_role;

commit;
