begin;

create extension if not exists vector with schema extensions;

alter table public.conversations
  add column if not exists incognito boolean not null default false;

create table if not exists public.memory_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  retention_days integer null check (retention_days is null or retention_days between 1 and 3650),
  backfill_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.memory_exchanges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid null references public.workspaces(id) on delete set null,
  website_id uuid null references public.website_connections(id) on delete set null,
  chat_id bigint not null references public.conversations(id) on delete cascade,
  message_ids bigint[] not null default '{}',
  source_user_message_id bigint null,
  source_assistant_message_id bigint null,
  user_text text not null,
  assistant_text text not null,
  summary text not null,
  topics text[] not null default '{}',
  entities text[] not null default '{}',
  embedding extensions.vector(768),
  embedding_model text null,
  search_tsv tsvector not null default ''::tsvector,
  importance numeric(3,2) not null default 0.50 check (importance between 0 and 1),
  pinned boolean not null default false,
  recall_count integer not null default 0 check (recall_count >= 0),
  last_recalled_at timestamptz null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz null
);

create table if not exists public.memory_facts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid null references public.workspaces(id) on delete set null,
  website_id uuid null references public.website_connections(id) on delete set null,
  type text not null check (type in ('profile','preference','project','decision','infrastructure','workflow','general')),
  fact_key text not null check (char_length(btrim(fact_key)) between 1 and 180),
  content text not null check (char_length(btrim(content)) between 1 and 1200),
  embedding extensions.vector(768),
  embedding_model text null,
  confidence numeric(3,2) not null default 0.80 check (confidence between 0 and 1),
  supersedes_id uuid null references public.memory_facts(id) on delete set null,
  source_exchange_id uuid null references public.memory_exchanges(id) on delete set null,
  pinned boolean not null default false,
  search_tsv tsvector not null default ''::tsvector,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null
);

create or replace function public.set_memory_search_tsv()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if tg_table_name = 'memory_exchanges' then
    new.search_tsv := to_tsvector(
      'simple'::regconfig,
      coalesce(new.user_text, '') || ' ' ||
      coalesce(new.assistant_text, '') || ' ' ||
      coalesce(new.summary, '') || ' ' ||
      array_to_string(new.topics, ' ') || ' ' ||
      array_to_string(new.entities, ' ')
    );
  else
    new.search_tsv := to_tsvector(
      'simple'::regconfig,
      coalesce(new.content, '') || ' ' ||
      coalesce(new.fact_key, '') || ' ' ||
      coalesce(new.type, '')
    );
  end if;
  return new;
end;
$function$;

create trigger memory_exchanges_search_tsv_trigger
before insert or update of user_text, assistant_text, summary, topics, entities
on public.memory_exchanges
for each row execute function public.set_memory_search_tsv();

create trigger memory_facts_search_tsv_trigger
before insert or update of content, fact_key, type
on public.memory_facts
for each row execute function public.set_memory_search_tsv();

create table if not exists public.memory_backfill_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','running','completed','failed','paused')),
  cursor_conversation_id bigint not null default 0,
  processed_count integer not null default 0,
  error_message text null,
  started_at timestamptz null,
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists memory_exchanges_user_created_idx
  on public.memory_exchanges(user_id, created_at desc) where deleted_at is null;
create index if not exists memory_exchanges_chat_idx
  on public.memory_exchanges(chat_id, created_at desc);
create unique index if not exists memory_exchanges_source_user_message_uidx
  on public.memory_exchanges(user_id, source_user_message_id)
  where source_user_message_id is not null and deleted_at is null;
create index if not exists memory_exchanges_search_gin
  on public.memory_exchanges using gin(search_tsv);
create index if not exists memory_exchanges_embedding_hnsw
  on public.memory_exchanges using hnsw(embedding extensions.vector_cosine_ops)
  where embedding is not null and deleted_at is null;
create index if not exists memory_facts_user_updated_idx
  on public.memory_facts(user_id, updated_at desc) where deleted_at is null;
create index if not exists memory_facts_search_gin
  on public.memory_facts using gin(search_tsv);
create index if not exists memory_facts_embedding_hnsw
  on public.memory_facts using hnsw(embedding extensions.vector_cosine_ops)
  where embedding is not null and deleted_at is null;
create index if not exists memory_facts_key_idx
  on public.memory_facts(user_id, fact_key) where deleted_at is null;
create index if not exists memory_backfill_user_status_idx
  on public.memory_backfill_jobs(user_id, status, created_at desc);

alter table public.memory_settings enable row level security;
alter table public.memory_exchanges enable row level security;
alter table public.memory_facts enable row level security;
alter table public.memory_backfill_jobs enable row level security;

drop policy if exists memory_settings_owner_all on public.memory_settings;
create policy memory_settings_owner_all on public.memory_settings
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists memory_exchanges_owner_all on public.memory_exchanges;
create policy memory_exchanges_owner_all on public.memory_exchanges
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists memory_facts_owner_all on public.memory_facts;
create policy memory_facts_owner_all on public.memory_facts
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists memory_backfill_owner_all on public.memory_backfill_jobs;
create policy memory_backfill_owner_all on public.memory_backfill_jobs
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.memory_settings to authenticated;
grant select, insert, update, delete on public.memory_exchanges to authenticated;
grant select, insert, update, delete on public.memory_facts to authenticated;
grant select, insert, update, delete on public.memory_backfill_jobs to authenticated;

insert into public.memory_facts
  (user_id, type, fact_key, content, confidence, created_at, updated_at)
select
  legacy.user_id,
  case legacy.category
    when 'preference' then 'preference'
    when 'technology' then 'project'
    when 'infrastructure' then 'infrastructure'
    when 'workspace' then 'project'
    else 'general'
  end,
  'legacy.' || legacy.memory_key,
  legacy.content,
  legacy.confidence,
  legacy.created_at,
  legacy.updated_at
from public.user_memories legacy
where not exists (
  select 1 from public.memory_facts current
  where current.user_id = legacy.user_id
    and current.fact_key = 'legacy.' || legacy.memory_key
    and current.deleted_at is null
);

create or replace function public.match_memory(
  p_query_embedding extensions.vector(768),
  p_query_text text,
  p_user_id uuid,
  p_website_id uuid,
  p_k integer,
  p_exclude_chat_id bigint default null
)
returns table (
  memory_type text,
  exchange_id uuid,
  fact_id uuid,
  chat_id bigint,
  content text,
  created_at timestamptz,
  importance numeric,
  pinned boolean,
  website_id uuid,
  chat_title text,
  score double precision
)
language sql
stable
security invoker
set search_path = ''
as $function$
  with query_data as (
    select case
      when nullif(btrim(p_query_text), '') is null then null::tsquery
      else websearch_to_tsquery('simple', p_query_text)
    end as tsq
  ),
  exchange_rows as (
    select
      'exchange'::text as memory_type,
      exchange.id as exchange_id,
      null::uuid as fact_id,
      exchange.chat_id,
      left(exchange.summary, 1600) as content,
      exchange.created_at,
      exchange.importance,
      exchange.pinned,
      exchange.website_id,
      coalesce(nullif(conversation.latest_text, ''), 'Past conversation') as chat_title,
      (
        (case when p_query_embedding is null or exchange.embedding is null then 0
          else greatest(0, 1 - (exchange.embedding <=> p_query_embedding)) end) * 0.62
        + coalesce(ts_rank_cd(exchange.search_tsv, query_data.tsq), 0) * 0.24
        + (1.0 / (1.0 + greatest(0, extract(epoch from (now() - exchange.created_at)) / 2592000))) * 0.08
        + (case when exchange.pinned then 0.14 else 0 end)
        + (case when p_website_id is not null and exchange.website_id = p_website_id then 0.10 else 0 end)
      )::double precision as score
    from public.memory_exchanges exchange
    left join public.conversations conversation on conversation.id = exchange.chat_id
    cross join query_data
    where exchange.user_id = p_user_id
      and exchange.deleted_at is null
      and (p_exclude_chat_id is null or exchange.chat_id <> p_exclude_chat_id)
      and (p_query_embedding is not null or (query_data.tsq is not null and exchange.search_tsv @@ query_data.tsq))
  ),
  fact_rows as (
    select
      'fact'::text as memory_type,
      fact.source_exchange_id as exchange_id,
      fact.id as fact_id,
      source.chat_id,
      left(fact.content, 1200) as content,
      fact.created_at,
      1.0::numeric as importance,
      fact.pinned,
      fact.website_id,
      coalesce(nullif(conversation.latest_text, ''), 'Saved memory') as chat_title,
      (
        (case when p_query_embedding is null or fact.embedding is null then 0
          else greatest(0, 1 - (fact.embedding <=> p_query_embedding)) end) * 0.62
        + coalesce(ts_rank_cd(fact.search_tsv, query_data.tsq), 0) * 0.24
        + (1.0 / (1.0 + greatest(0, extract(epoch from (now() - fact.updated_at)) / 2592000))) * 0.08
        + (case when fact.pinned then 0.14 else 0 end)
        + (case when p_website_id is not null and fact.website_id = p_website_id then 0.10 else 0 end)
      )::double precision as score
    from public.memory_facts fact
    left join public.memory_exchanges source on source.id = fact.source_exchange_id
    left join public.conversations conversation on conversation.id = source.chat_id
    cross join query_data
    where fact.user_id = p_user_id
      and fact.deleted_at is null
      and (p_exclude_chat_id is null or source.chat_id is null or source.chat_id <> p_exclude_chat_id)
      and not exists (
        select 1 from public.memory_facts newer
        where newer.supersedes_id = fact.id and newer.deleted_at is null
      )
      and (p_query_embedding is not null or (query_data.tsq is not null and fact.search_tsv @@ query_data.tsq))
  )
  select candidates.memory_type, candidates.exchange_id, candidates.fact_id,
    candidates.chat_id, candidates.content, candidates.created_at,
    candidates.importance, candidates.pinned, candidates.website_id,
    candidates.chat_title, candidates.score
  from (
    select * from exchange_rows
    union all
    select * from fact_rows
  ) candidates
  where (select auth.uid()) = p_user_id or current_user = 'service_role'
  order by candidates.score desc, candidates.created_at desc
  limit least(greatest(coalesce(p_k, 10), 1), 40);
$function$;

revoke all on function public.match_memory(extensions.vector, text, uuid, uuid, integer, bigint) from public, anon;
grant execute on function public.match_memory(extensions.vector, text, uuid, uuid, integer, bigint) to authenticated, service_role;

commit;
