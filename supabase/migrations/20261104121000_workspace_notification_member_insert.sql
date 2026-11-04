begin;

do $policies$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'workspace_notifications'
      and policyname = 'workspace_notifications_member_insert'
  ) then
    create policy workspace_notifications_member_insert
      on public.workspace_notifications
      for insert to authenticated
      with check (public.is_workspace_member(workspace_id));
  end if;
end
$policies$;

grant insert on public.workspace_notifications to authenticated;

commit;
