-- Misma restricted customer-support staff accounts.
-- The staff-access marker is stored in a server-managed table and is not user-editable.
create table if not exists public.workspace_staff_access (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Customer support'
    check (char_length(btrim(title)) between 2 and 60),
  role text not null default 'support' check (role = 'support'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

alter table public.workspace_staff_access enable row level security;
revoke all on public.workspace_staff_access from anon;
grant select on public.workspace_staff_access to authenticated;

drop policy if exists "Misma staff can read own access marker" on public.workspace_staff_access;
create policy "Misma staff can read own access marker"
  on public.workspace_staff_access
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.is_misma_support_member(p_workspace_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_staff_access s
    where s.workspace_id = p_workspace_id
      and s.user_id = (select auth.uid())
      and s.role = 'support'
  );
$$;

revoke all on function public.is_misma_support_member(uuid) from public;
grant execute on function public.is_misma_support_member(uuid) to authenticated;

-- Staff are only allowed to read customers/requests/notifications. The server
-- actions grant the narrow request-status, read-state and delete operations.
do $$
declare
  t text;
begin
  foreach t in array array[
    'conversations',
    'messages',
    'orders',
    'knowledge_entries',
    'audit_events',
    'channel_connections',
    'website_connections',
    'workspace_websites',
    'core_01_experiences',
    'core_01_lessons',
    'core_01_rooms',
    'core_01_training_examples',
    'human_handoff_requests',
    'workspace_library_files',
    'push_subscriptions',
    'scan_jobs',
    'website_scan_pages',
    'website_scan_runs',
    'workspace_products',
    'products_services'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', 'Misma support staff blocked', t);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated using (not public.is_misma_support_member(workspace_id)) with check (not public.is_misma_support_member(workspace_id))',
      'Misma support staff blocked',
      t
    );
  end loop;
end;
$$;

-- Staff may read customer records, but cannot directly create, edit or delete them.
drop policy if exists "Misma support staff cannot insert contacts" on public.contacts;
create policy "Misma support staff cannot insert contacts"
  on public.contacts as restrictive for insert to authenticated
  with check (not public.is_misma_support_member(workspace_id));
drop policy if exists "Misma support staff cannot update contacts" on public.contacts;
create policy "Misma support staff cannot update contacts"
  on public.contacts as restrictive for update to authenticated
  using (not public.is_misma_support_member(workspace_id))
  with check (not public.is_misma_support_member(workspace_id));
drop policy if exists "Misma support staff cannot delete contacts" on public.contacts;
create policy "Misma support staff cannot delete contacts"
  on public.contacts as restrictive for delete to authenticated
  using (not public.is_misma_support_member(workspace_id));

-- Staff cannot create new requests/notifications. They can update a request's
-- status/handled timestamp, read notifications, and delete request entries.
drop policy if exists "Misma support staff cannot insert requests" on public.human_requests;
create policy "Misma support staff cannot insert requests"
  on public.human_requests as restrictive for insert to authenticated
  with check (not public.is_misma_support_member(workspace_id));

drop policy if exists "Misma support staff cannot insert notifications" on public.workspace_notifications;
create policy "Misma support staff cannot insert notifications"
  on public.workspace_notifications as restrictive for insert to authenticated
  with check (not public.is_misma_support_member(workspace_id));

create or replace function public.guard_misma_support_updates()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if public.is_misma_support_member(old.workspace_id) then
    if tg_table_name = 'human_requests' then
      if (to_jsonb(new) - 'status' - 'handled_at') <> (to_jsonb(old) - 'status' - 'handled_at') then
        raise exception 'Support staff may only update a request status.';
      end if;
    elsif tg_table_name = 'workspace_notifications' then
      if (to_jsonb(new) - 'is_read') <> (to_jsonb(old) - 'is_read') then
        raise exception 'Support staff may only mark a notification as read.';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_misma_support_human_request_updates on public.human_requests;
create trigger guard_misma_support_human_request_updates
  before update on public.human_requests
  for each row execute function public.guard_misma_support_updates();

drop trigger if exists guard_misma_support_notification_updates on public.workspace_notifications;
create trigger guard_misma_support_notification_updates
  before update on public.workspace_notifications
  for each row execute function public.guard_misma_support_updates();
