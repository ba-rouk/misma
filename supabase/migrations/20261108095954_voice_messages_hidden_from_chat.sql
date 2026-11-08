-- Speech conversations remain available to AI context but stay out of normal dashboard/widget chat transcripts.
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS is_voice boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS messages_conversation_voice_order_idx
  ON public.messages (conversation_id, is_voice, id);
