ALTER TABLE public.website_connections
  ADD COLUMN IF NOT EXISTS gmail_address text;

DO $constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.website_connections'::regclass
      AND conname = 'website_connections_gmail_address_check'
  ) THEN
    ALTER TABLE public.website_connections
      ADD CONSTRAINT website_connections_gmail_address_check
      CHECK (
        gmail_address IS NULL
        OR (
          length(gmail_address) <= 254
          AND gmail_address ~* $pattern$^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}$pattern$
        )
      );
  END IF;
END
$constraint$;

COMMENT ON COLUMN public.website_connections.gmail_address IS
  'Public contact email address opened in Gmail compose from this website widget. No mailbox OAuth token is stored.';
