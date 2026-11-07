-- Delete visitor-created website chat history only when no human handoff exists.
-- The website Edge Function uses the service role to invoke this exact-session guard.
begin;

create or replace function public.delete_website_visitor_conversation_if_ephemeral(
  p_conversation_id bigint,
  p_workspace_id uuid,
  p_website_connection_id uuid,
  p_visitor_session_id text
)
returns boolean
language plpgsql
set search_path = ''
as $function$
declare
  v_deleted_count integer := 0;
begin
  perform 1
  from public.conversations as conversation
  where conversation.id = p_conversation_id
    and conversation.workspace_id = p_workspace_id
    and conversation.website_connection_id = p_website_connection_id
    and conversation.visitor_session_id = p_visitor_session_id
    and conversation.channel = 'Website'
  for update;

  if not found then
    return false;
  end if;

  -- Keep all history whenever a visitor has asked the business for human help.
  if exists (
    select 1
    from public.human_requests as request
    where request.conversation_id = p_conversation_id
  ) or exists (
    select 1
    from public.human_handoff_requests as handoff
    where handoff.conversation_id = p_conversation_id
  ) then
    return false;
  end if;

  delete from public.conversations as conversation
  where conversation.id = p_conversation_id
    and conversation.workspace_id = p_workspace_id
    and conversation.website_connection_id = p_website_connection_id
    and conversation.visitor_session_id = p_visitor_session_id
    and conversation.channel = 'Website';

  get diagnostics v_deleted_count = row_count;
  return v_deleted_count > 0;
end;
$function$;

revoke all on function public.delete_website_visitor_conversation_if_ephemeral(bigint, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.delete_website_visitor_conversation_if_ephemeral(bigint, uuid, uuid, text)
  to service_role;

comment on function public.delete_website_visitor_conversation_if_ephemeral(bigint, uuid, uuid, text)
  is 'Deletes one website visitor conversation only when no human handoff request is associated with it.';

commit;
