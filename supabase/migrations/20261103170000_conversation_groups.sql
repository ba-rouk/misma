begin;
alter table public.conversations
  add column if not exists group_name text;
create index if not exists conversations_workspace_group_updated_idx
  on public.conversations(workspace_id, group_name, updated_at desc);
commit;