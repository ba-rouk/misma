-- Enforce a maximum of five active website connections per Misma workspace.
-- A private counter row serializes concurrent inserts and remains consistent when a
-- connection is soft-deleted, restored, or hard-deleted.

begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.website_connection_limits (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  active_count integer not null default 0 check (active_count between 0 and 5),
  updated_at timestamptz not null default pg_catalog.now()
);

revoke all on table private.website_connection_limits from public, anon, authenticated;

-- Seed exact counts before activating the trigger. Existing connections are kept.
insert into private.website_connection_limits (workspace_id, active_count)
select workspace_id, count(*)::integer
from public.website_connections
where widget_deleted_at is null
group by workspace_id
on conflict (workspace_id) do update
set active_count = excluded.active_count,
    updated_at = pg_catalog.now();

create or replace function private.enforce_website_connection_limit()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_active_count integer;
begin
  if tg_op = 'DELETE' then
    if old.widget_deleted_at is null then
      update private.website_connection_limits
      set active_count = greatest(active_count - 1, 0),
          updated_at = pg_catalog.now()
      where workspace_id = old.workspace_id;
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if new.workspace_id is distinct from old.workspace_id then
      raise exception using
        errcode = '23514',
        message = 'A website connection cannot be moved to another workspace.';
    end if;

    if old.widget_deleted_at is null and new.widget_deleted_at is not null then
      update private.website_connection_limits
      set active_count = greatest(active_count - 1, 0),
          updated_at = pg_catalog.now()
      where workspace_id = old.workspace_id;
      return new;
    end if;

    if old.widget_deleted_at is not null and new.widget_deleted_at is null then
      insert into private.website_connection_limits (workspace_id, active_count)
      values (new.workspace_id, 1)
      on conflict (workspace_id) do update
      set active_count = private.website_connection_limits.active_count + 1,
          updated_at = pg_catalog.now()
      where private.website_connection_limits.active_count < 5
      returning active_count into v_active_count;

      if v_active_count is null then
        raise exception using
          errcode = '23514',
          message = 'Your Misma workspace can connect up to 5 active websites. Remove an existing website before restoring this connection.';
      end if;
    end if;

    return new;
  end if;

  if new.widget_deleted_at is not null then
    return new;
  end if;

  insert into private.website_connection_limits (workspace_id, active_count)
  values (new.workspace_id, 1)
  on conflict (workspace_id) do update
  set active_count = private.website_connection_limits.active_count + 1,
      updated_at = pg_catalog.now()
  where private.website_connection_limits.active_count < 5
  returning active_count into v_active_count;

  if v_active_count is null then
    raise exception using
      errcode = '23514',
      message = 'Your Misma workspace can connect up to 5 active websites. Remove an existing website before adding another.';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_website_connection_limit() from public, anon, authenticated;

drop trigger if exists enforce_website_connection_limit_insert on public.website_connections;
create trigger enforce_website_connection_limit_insert
before insert on public.website_connections
for each row execute function private.enforce_website_connection_limit();

drop trigger if exists enforce_website_connection_limit_restore on public.website_connections;
create trigger enforce_website_connection_limit_restore
before update of widget_deleted_at, workspace_id on public.website_connections
for each row execute function private.enforce_website_connection_limit();

drop trigger if exists enforce_website_connection_limit_delete on public.website_connections;
create trigger enforce_website_connection_limit_delete
before delete on public.website_connections
for each row execute function private.enforce_website_connection_limit();

comment on table private.website_connection_limits is
  'Private atomic counter used to enforce the maximum of five active website connections per Misma workspace.';

commit;
