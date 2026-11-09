-- Limit VAPID key table policies to the Edge Function service role.
CREATE POLICY push_vapid_keys_service_role_only
  ON private.push_vapid_keys
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
