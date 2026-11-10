begin;

alter table public.scan_jobs
  add column if not exists knowledge_saved integer not null default 0 check (knowledge_saved >= 0),
  add column if not exists product_suggestions integer not null default 0 check (product_suggestions >= 0);

create table if not exists public.scan_host_limits (
  host text primary key,
  next_allowed_at timestamptz not null,
  updated_at timestamptz not null default now()
);
alter table public.scan_host_limits enable row level security;
revoke all on public.scan_host_limits from public, anon, authenticated;
grant all on public.scan_host_limits to service_role;

create or replace function public.misma_scan_claim_host_slot(
  p_host text,
  p_interval_ms integer default 700
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_next timestamptz;
  v_interval_ms integer := greatest(500, least(coalesce(p_interval_ms,700), 5000));
begin
  if p_host is null or length(trim(p_host)) < 1 or length(p_host) > 253 then
    raise exception 'Invalid website host' using errcode = '22023';
  end if;

  insert into public.scan_host_limits(host,next_allowed_at,updated_at)
  values (lower(trim(p_host)), v_now + (v_interval_ms || ' milliseconds')::interval, v_now)
  on conflict (host) do update
    set next_allowed_at = greatest(public.scan_host_limits.next_allowed_at, v_now)
      + (v_interval_ms || ' milliseconds')::interval,
        updated_at = v_now
  returning next_allowed_at into v_next;

  return greatest(0, ceil(extract(epoch from (v_next - v_now)) * 1000)::integer - v_interval_ms);
end;
$$;

revoke all on function public.misma_scan_claim_host_slot(text,integer) from public, anon, authenticated;
grant execute on function public.misma_scan_claim_host_slot(text,integer) to service_role;

comment on table public.scan_host_limits is
  'Service-role-only per-host crawl throttle used to serialize requests to a host across simultaneous scan jobs.';

commit;
