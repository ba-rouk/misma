begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(7);

create temporary table _memory_rls_users (user_a uuid, user_b uuid, workspace_b uuid, conversation_b bigint);
insert into _memory_rls_users (user_a, user_b, workspace_b)
select gen_random_uuid(), gen_random_uuid(), id from public.workspaces order by created_at desc limit 1;

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
select user_a, 'authenticated', 'authenticated', user_a::text || '@memory-test.invalid', '', now(), now(), now()
from _memory_rls_users
union all
select user_b, 'authenticated', 'authenticated', user_b::text || '@memory-test.invalid', '', now(), now(), now()
from _memory_rls_users;

insert into public.workspace_members (workspace_id, user_id, role)
select workspace_b, user_b, 'member' from _memory_rls_users;

insert into public.conversations (workspace_id, channel, latest_text)
select workspace_b, 'Dashboard', 'RLS test conversation' from _memory_rls_users
;

update _memory_rls_users
set conversation_b = (
  select id from public.conversations
  where workspace_id = _memory_rls_users.workspace_b
  order by id desc limit 1
);

insert into public.memory_settings (user_id, enabled)
select user_b, true from _memory_rls_users;

insert into public.memory_exchanges (user_id, workspace_id, chat_id, user_text, assistant_text, summary)
select user_b, workspace_b, conversation_b, 'My project is private', 'I will remember that', 'Private project memory'
from _memory_rls_users;

insert into public.memory_facts (user_id, workspace_id, type, fact_key, content)
select user_b, workspace_b, 'project', 'private_project', 'User B private project'
from _memory_rls_users;

insert into public.memory_backfill_jobs (user_id, status)
select user_b, 'queued' from _memory_rls_users;

insert into public.memory_embedding_cache (user_id, query_hash, embedding, embedding_model, expires_at)
select user_b, repeat('a', 64),
  ('[' || array_to_string(array_fill(0::real, ARRAY[768]), ',') || ']')::extensions.vector,
  'rls-test-vector', now() + interval '10 minutes'
from _memory_rls_users;

grant select on _memory_rls_users to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub', (select user_b::text from _memory_rls_users), true);
select extensions.is(
  (select count(*) from public.match_memory(
    null::extensions.vector,
    'private project',
    (select user_b from _memory_rls_users),
    gen_random_uuid(),
    10,
    null
  )),
  2::bigint,
  'User B recalls their own exchange and fact from a different website context'
);
delete from public.memory_facts where user_id = (select user_b from _memory_rls_users);
delete from public.memory_exchanges where user_id = (select user_b from _memory_rls_users);
select extensions.is(
  (select count(*) from public.match_memory(
    null::extensions.vector,
    'private project',
    (select user_b from _memory_rls_users),
    null,
    10,
    null
  )),
  0::bigint,
  'Deleting memory stops it from being recalled'
);
select set_config('request.jwt.claim.sub', (select user_a::text from _memory_rls_users), true);

select extensions.is(
  (select count(*) from public.memory_settings where user_id = (select user_b from _memory_rls_users)),
  0::bigint,
  'User A cannot read User B memory settings'
);
select extensions.is(
  (select count(*) from public.memory_exchanges where user_id = (select user_b from _memory_rls_users)),
  0::bigint,
  'User A cannot read User B memory exchanges'
);
select extensions.is(
  (select count(*) from public.memory_facts where user_id = (select user_b from _memory_rls_users)),
  0::bigint,
  'User A cannot read User B memory facts'
);
select extensions.is(
  (select count(*) from public.memory_backfill_jobs where user_id = (select user_b from _memory_rls_users)),
  0::bigint,
  'User A cannot read User B backfill jobs'
);

select extensions.is(
  (select count(*) from public.memory_embedding_cache where user_id = (select user_b from _memory_rls_users)),
  0::bigint,
  'User A cannot read User B embedding cache'
);

select * from extensions.finish();
rollback;
