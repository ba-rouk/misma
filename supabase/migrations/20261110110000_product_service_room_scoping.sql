begin;

alter table public.products_services
  add column if not exists room_id bigint references public.core_01_rooms(id) on delete set null;

create index if not exists products_services_workspace_room_active_idx
  on public.products_services(workspace_id, room_id, active, created_at desc);

comment on column public.products_services.room_id is
  'Optional Core.01 room assignment; null means shared account-level product/service knowledge.';

commit;
