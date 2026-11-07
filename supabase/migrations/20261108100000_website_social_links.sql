-- Store optional website-owned social links and constrain connection edits to workspace owners.
alter table public.website_connections
  add column if not exists instagram_url text,
  add column if not exists whatsapp_country_code text,
  add column if not exists whatsapp_number text,
  add column if not exists whatsapp_message text;

alter table public.website_connections
  drop constraint if exists website_connections_instagram_url_check,
  add constraint website_connections_instagram_url_check
    check (instagram_url is null or instagram_url ~ '^https://instagram[.]com/[A-Za-z0-9._]{1,30}$'),
  drop constraint if exists website_connections_whatsapp_country_code_check,
  add constraint website_connections_whatsapp_country_code_check
    check (whatsapp_country_code is null or whatsapp_country_code ~ '^[0-9]{1,4}$'),
  drop constraint if exists website_connections_whatsapp_number_check,
  add constraint website_connections_whatsapp_number_check
    check (whatsapp_number is null or whatsapp_number ~ '^[1-9][0-9]{5,14}$'),
  drop constraint if exists website_connections_whatsapp_details_check,
  add constraint website_connections_whatsapp_details_check
    check (
      (whatsapp_country_code is null and whatsapp_number is null and whatsapp_message is null)
      or (
        whatsapp_country_code is not null
        and whatsapp_number is not null
        and whatsapp_message is not null
        and length(whatsapp_country_code || whatsapp_number) between 7 and 15
      )
    );

-- Members can continue to view registered websites, but only their workspace owner can mutate them.
drop policy if exists website_connections_member_access on public.website_connections;

create policy website_connections_select_member
  on public.website_connections
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

create policy website_connections_insert_owner
  on public.website_connections
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.workspaces as workspace
      where workspace.id = website_connections.workspace_id
        and workspace.owner_id = (select auth.uid())
    )
  );

create policy website_connections_update_owner
  on public.website_connections
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.workspaces as workspace
      where workspace.id = website_connections.workspace_id
        and workspace.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.workspaces as workspace
      where workspace.id = website_connections.workspace_id
        and workspace.owner_id = (select auth.uid())
    )
  );

create policy website_connections_delete_owner
  on public.website_connections
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.workspaces as workspace
      where workspace.id = website_connections.workspace_id
        and workspace.owner_id = (select auth.uid())
    )
  );
