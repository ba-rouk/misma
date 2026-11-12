-- Limit the support helper RPC surface to signed-in users. The functions are
-- used by authenticated RLS policies and do not need to be callable by anon.
revoke all on function public.is_misma_support_conversation(bigint) from anon;
grant execute on function public.is_misma_support_conversation(bigint) to authenticated;

revoke all on function public.is_misma_support_member(uuid) from anon;
grant execute on function public.is_misma_support_member(uuid) to authenticated;

-- Cover the staff table's single-column foreign keys as well as its composite PK.
create index if not exists workspace_staff_access_user_id_idx
  on public.workspace_staff_access (user_id);

create index if not exists workspace_staff_access_created_by_idx
  on public.workspace_staff_access (created_by);
