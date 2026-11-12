-- Prevent restricted support accounts from reading or changing messages
-- through the conversations -> messages relationship.
create or replace function public.is_misma_support_conversation(p_conversation_id bigint)
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

revoke all on function public.is_misma_support_conversation(bigint) from public;
grant execute on function public.is_misma_support_conversation(bigint) to authenticated;

drop policy if exists "Misma support staff blocked from conversation messages" on public.messages;
create policy "Misma support staff blocked from conversation messages"
  on public.messages
  as restrictive
  for all
  to authenticated
  using (not public.is_misma_support_conversation(conversation_id))
  with check (not public.is_misma_support_conversation(conversation_id));
