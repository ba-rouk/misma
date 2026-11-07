-- Website visitor transcripts are ephemeral unless the visitor requests a human.
-- This function is callable only by the server-side service role. It deletes only
-- the exact website session passed by the widget and preserves any session that
-- has ever created a human request or human handoff.
CREATE OR REPLACE FUNCTION public.delete_website_visitor_conversation_if_ephemeral(
  p_conversation_id bigint,
  p_workspace_id uuid,
  p_website_connection_id uuid,
  p_visitor_session_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_deleted_count integer := 0;
BEGIN
  PERFORM 1
  FROM public.conversations AS conversation
  WHERE conversation.id = p_conversation_id
    AND conversation.workspace_id = p_workspace_id
    AND conversation.website_connection_id = p_website_connection_id
    AND conversation.visitor_session_id = p_visitor_session_id
    AND conversation.channel = 'Website'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.human_requests AS request
    WHERE request.conversation_id = p_conversation_id
  ) OR EXISTS (
    SELECT 1
    FROM public.human_handoff_requests AS handoff
    WHERE handoff.conversation_id = p_conversation_id
  ) THEN
    RETURN false;
  END IF;

  DELETE FROM public.conversations AS conversation
  WHERE conversation.id = p_conversation_id
    AND conversation.workspace_id = p_workspace_id
    AND conversation.website_connection_id = p_website_connection_id
    AND conversation.visitor_session_id = p_visitor_session_id
    AND conversation.channel = 'Website';

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_website_visitor_conversation_if_ephemeral(bigint, uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_website_visitor_conversation_if_ephemeral(bigint, uuid, uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_website_visitor_conversation_if_ephemeral(bigint, uuid, uuid, text) TO service_role;
