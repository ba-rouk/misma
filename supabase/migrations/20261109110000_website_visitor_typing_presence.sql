-- Lightweight typing presence for website conversations in human handoff.
-- The timestamp expires automatically; no heartbeat rows or cleanup job are required.
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS visitor_typing_until timestamptz;

COMMENT ON COLUMN public.conversations.visitor_typing_until IS
  'Short-lived website visitor typing indicator; only the verified website widget Edge Function writes this field.';
