begin;

create table if not exists public.memory_embedding_cache (
  user_id uuid not null references auth.users(id) on delete cascade,
  query_hash text not null check (char_length(query_hash) between 32 and 128),
  embedding extensions.vector(768) not null,
  embedding_model text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (user_id, query_hash)
);

create index if not exists memory_embedding_cache_expiry_idx
  on public.memory_embedding_cache(expires_at);

alter table public.memory_embedding_cache enable row level security;

drop policy if exists memory_embedding_cache_owner_all on public.memory_embedding_cache;
create policy memory_embedding_cache_owner_all on public.memory_embedding_cache
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.memory_embedding_cache to authenticated;

commit;
