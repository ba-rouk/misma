BEGIN;

-- Recover an owner's existing workspace if a previous signup/bootstrap was
-- interrupted after creating the workspace but before creating membership.
-- Otherwise create the normal default workspace. The advisory lock makes this
-- safe when dashboard bootstrap and another first-use request race.
CREATE OR REPLACE FUNCTION public.create_misma_workspace()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  current_user_id uuid := (SELECT auth.uid());
  new_workspace_id uuid;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(current_user_id::text, 0));

  SELECT member.workspace_id
  INTO new_workspace_id
  FROM public.workspace_members AS member
  WHERE member.user_id = current_user_id
  LIMIT 1;

  IF new_workspace_id IS NOT NULL THEN
    RETURN new_workspace_id;
  END IF;

  -- A workspace may already exist for this owner if an earlier request
  -- stopped between the workspace and membership inserts.
  SELECT workspace.id
  INTO new_workspace_id
  FROM public.workspaces AS workspace
  WHERE workspace.owner_id = current_user_id
  LIMIT 1;

  IF new_workspace_id IS NOT NULL THEN
    INSERT INTO public.workspace_members (workspace_id, user_id, role)
    VALUES (new_workspace_id, current_user_id, 'owner')
    ON CONFLICT (workspace_id, user_id) DO NOTHING;
    RETURN new_workspace_id;
  END IF;

  INSERT INTO public.workspaces (owner_id)
  VALUES (current_user_id)
  RETURNING id INTO new_workspace_id;

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (new_workspace_id, current_user_id, 'owner')
  ON CONFLICT (workspace_id, user_id) DO NOTHING;

  RETURN new_workspace_id;
END;
$function$;

COMMIT;
