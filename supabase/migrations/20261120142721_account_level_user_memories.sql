create table if not exists public.user_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  memory_key text not null check (char_length(btrim(memory_key)) between 1 and 160),
  category text not null check (category in ('preference','infrastructure','workspace','technology','workflow')),
  content text not null check (char_length(btrim(content)) between 1 and 700),
  metadata jsonb not null default '{}'::jsonb,
  source_conversation_id bigint references public.conversations(id) on delete set null,
  confidence numeric(3,2) not null default 0.80 check (confidence >= 0 and confidence <= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, memory_key)
);

create index if not exists user_memories_user_updated_idx
  on public.user_memories (user_id, updated_at desc);

alter table public.user_memories enable row level security;

drop policy if exists "Users can view their own memories" on public.user_memories;
create policy "Users can view their own memories"
  on public.user_memories for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own memories" on public.user_memories;
create policy "Users can create their own memories"
  on public.user_memories for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own memories" on public.user_memories;
create policy "Users can update their own memories"
  on public.user_memories for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own memories" on public.user_memories;
create policy "Users can delete their own memories"
  on public.user_memories for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.user_memories to authenticated;
