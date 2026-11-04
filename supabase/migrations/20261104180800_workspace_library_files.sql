create table if not exists public.workspace_library_files (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  uploaded_by uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  mime_type text not null default 'application/octet-stream',
  file_size bigint not null default 0 check (file_size >= 0),
  created_at timestamptz not null default now(),
  unique (workspace_id, storage_path)
);

create index if not exists workspace_library_files_workspace_created_idx
  on public.workspace_library_files (workspace_id, created_at desc);

alter table public.workspace_library_files enable row level security;

revoke all on table public.workspace_library_files from anon;
grant select, insert, delete on table public.workspace_library_files to authenticated;

drop policy if exists workspace_library_files_member_access on public.workspace_library_files;
create policy workspace_library_files_member_access
  on public.workspace_library_files
  for all
  to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

comment on table public.workspace_library_files is
  'Workspace-scoped files uploaded directly to the Misma Library, separate from chat message attachments.';
