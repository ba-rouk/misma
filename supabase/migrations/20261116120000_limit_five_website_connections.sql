-- Enforce a fixed maximum of five active website connections per workspace.
-- The advisory transaction lock prevents concurrent inserts from exceeding the limit.
create or replace function public.enforce_website_connection_limit()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  active_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.workspace_id::text, 0));

  select count(*)::integer
    into active_count
  from public.website_connections
  where workspace_id = new.workspace_id
    and widget_deleted_at is null;

  if active_count >= 5 then
    raise exception 'You can connect up to 5 websites per Misma workspace. Remove an existing website before adding another.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists website_connections_enforce_limit on public.website_connections;
create trigger website_connections_enforce_limit
before insert on public.website_connections
for each row
execute function public.enforce_website_connection_limit();
