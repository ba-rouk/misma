begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(4);

create temporary table _memory_rls_users (user_a uuid, user_b uuid, workspace_b uuid, conversation_b bigint);
insert into _memory_rls_users (user_a, user_b, workspace_b)
values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid());

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
select user_a, 'authenticated', 'authenticated', user_a::text || '@memory-test.invalid', '', now(), now(), now()
from _memory_rls_users
union all
select user_b, 'authenticated', 'authenticated', user_b::text || '@memory-test.invalid', '', now(), now(), now()
from _memory_rls_users;

insert into public.workspaces (id, owner_id, name)
select workspace_b, user_b, 'Memory RLS test workspace' from _memory_rls_users;

insert into public.workspace_members (workspace_id, user_id, role)
select workspace_b, user_b, 'owner' from _memory_rls_users;

insert into public.conversations (workspace_id, channel, latest_text)
select workspace_b, 'Dashboard', 'RLS test conversation' from _memory_rls_users
returning id;

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

grant select on _memory_rls_users to authenticated;
set local role authenticated;
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

select * from extensions.finish();
rollback;
