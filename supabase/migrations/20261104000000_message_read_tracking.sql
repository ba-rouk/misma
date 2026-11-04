ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS read_at timestamptz;

UPDATE public.messages
SET read_at = created_at
WHERE role = 'customer'
  AND read_at IS NULL;

CREATE INDEX IF NOT EXISTS messages_unread_visitor_idx
  ON public.messages (conversation_id, created_at DESC)
  WHERE role = 'customer' AND read_at IS NULL;
