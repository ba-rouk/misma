-- Keep the SECURITY DEFINER message-isolation helper outside PostgREST's
-- exposed public schema. RLS may invoke it, but clients cannot call it as RPC.
create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon;
grant usage on schema private to authenticated;

create or replace function private.is_misma_support_conversation(p_conversation_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversations c
    join public.workspace_staff_access s
      on s.workspace_id = c.workspace_id
    where c.id = p_conversation_id
      and s.user_id = (select auth.uid())
      and s.role = 'support'
  );
$$;

revoke all on function private.is_misma_support_conversation(bigint) from public;
revoke all on function private.is_misma_support_conversation(bigint) from anon;
grant execute on function private.is_misma_support_conversation(bigint) to authenticated;

drop policy if exists "Misma support staff blocked from conversation messages" on public.messages;
create policy "Misma support staff blocked from conversation messages"
  on public.messages
  as restrictive
  for all
  to authenticated
  using (not private.is_misma_support_conversation(conversation_id))
  with check (not private.is_misma_support_conversation(conversation_id));

drop function if exists public.is_misma_support_conversation(bigint);
