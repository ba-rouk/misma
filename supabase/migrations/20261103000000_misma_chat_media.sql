BEGIN;

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('misma-media', 'misma-media', false, 26214400, NULL)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = 26214400,
    allowed_mime_types = NULL;

DROP POLICY IF EXISTS misma_media_workspace_select ON storage.objects;
DROP POLICY IF EXISTS misma_media_workspace_insert ON storage.objects;
DROP POLICY IF EXISTS misma_media_workspace_delete ON storage.objects;

CREATE POLICY misma_media_workspace_select
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'misma-media'
  AND (storage.foldername(name))[2] = (SELECT auth.uid())::text
  AND CASE
    WHEN (storage.foldername(name))[1] ~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN public.is_workspace_member(((storage.foldername(name))[1])::uuid)
    ELSE false
  END
);

CREATE POLICY misma_media_workspace_insert
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'misma-media'
  AND (storage.foldername(name))[2] = (SELECT auth.uid())::text
  AND CASE
    WHEN (storage.foldername(name))[1] ~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN public.is_workspace_member(((storage.foldername(name))[1])::uuid)
    ELSE false
  END
);

CREATE POLICY misma_media_workspace_delete
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'misma-media'
  AND (storage.foldername(name))[2] = (SELECT auth.uid())::text
  AND CASE
    WHEN (storage.foldername(name))[1] ~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN public.is_workspace_member(((storage.foldername(name))[1])::uuid)
    ELSE false
  END
);

COMMIT;
