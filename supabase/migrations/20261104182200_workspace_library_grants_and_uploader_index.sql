revoke all on table public.workspace_library_files from anon, authenticated;
grant select, insert, delete on table public.workspace_library_files to authenticated;
create index if not exists workspace_library_files_uploaded_by_idx
  on public.workspace_library_files (uploaded_by);
