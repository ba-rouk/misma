-- Device-specific Web Push subscriptions for authenticated workspace members.
CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  user_id uuid NOT NULL,
  endpoint text NOT NULL UNIQUE CHECK (endpoint LIKE 'https://%' AND char_length(endpoint) <= 2048),
  p256dh text NOT NULL CHECK (char_length(p256dh) BETWEEN 20 AND 200),
  auth text NOT NULL CHECK (char_length(auth) BETWEEN 10 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT push_subscriptions_workspace_member_fkey FOREIGN KEY (workspace_id, user_id) REFERENCES public.workspace_members (workspace_id, user_id) ON DELETE CASCADE
);

CREATE INDEX push_subscriptions_workspace_user_idx
  ON public.push_subscriptions (workspace_id, user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated, service_role;

CREATE POLICY push_subscriptions_select_own
  ON public.push_subscriptions FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) AND public.is_workspace_member(workspace_id));

CREATE POLICY push_subscriptions_insert_own
  ON public.push_subscriptions FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND public.is_workspace_member(workspace_id));

CREATE POLICY push_subscriptions_update_own
  ON public.push_subscriptions FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()) AND public.is_workspace_member(workspace_id))
  WITH CHECK (user_id = (SELECT auth.uid()) AND public.is_workspace_member(workspace_id));

CREATE POLICY push_subscriptions_delete_own
  ON public.push_subscriptions FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()) AND public.is_workspace_member(workspace_id));

-- Private VAPID keys never enter the API-exposed public schema.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO service_role;

CREATE TABLE private.push_vapid_keys (
  key_id text PRIMARY KEY CHECK (key_id = 'primary'),
  public_key text NOT NULL,
  private_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.push_vapid_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.push_vapid_keys FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE private.push_vapid_keys TO service_role;

CREATE OR REPLACE FUNCTION public.get_or_create_push_vapid_key_pair(
  p_public_key text,
  p_private_key text
)
RETURNS TABLE(public_key text, private_key text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF char_length(COALESCE(p_public_key, '')) NOT BETWEEN 80 AND 120
    OR char_length(COALESCE(p_private_key, '')) NOT BETWEEN 40 AND 80 THEN
    RAISE EXCEPTION 'Invalid Web Push VAPID keypair.';
  END IF;

  INSERT INTO private.push_vapid_keys (key_id, public_key, private_key)
  VALUES ('primary', p_public_key, p_private_key)
  ON CONFLICT (key_id) DO NOTHING;

  RETURN QUERY
    SELECT stored.public_key, stored.private_key
    FROM private.push_vapid_keys AS stored
    WHERE stored.key_id = 'primary';
END;
$function$;

REVOKE ALL ON FUNCTION public.get_or_create_push_vapid_key_pair(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_push_vapid_key_pair(text, text) TO service_role;
