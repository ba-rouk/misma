-- Keep Core.01 topic seeding compatible with the partial unique index.
-- Website rooms intentionally have separate uniqueness semantics.
CREATE OR REPLACE FUNCTION public.core_01_seed_workspace_rooms()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.core_01_rooms
    (workspace_id, room_key, display_name, description, room_type)
  VALUES
    (NEW.id, 'business_profile', 'Business Profile', 'Identity, location, hours and business information', 'topic'),
    (NEW.id, 'products', 'Products', 'Product details, inventory, variants and catalog information', 'topic'),
    (NEW.id, 'prices', 'Prices', 'Pricing, payments, discounts, quotes and fees', 'topic'),
    (NEW.id, 'customers', 'Customers', 'Customer, client and lead knowledge', 'topic'),
    (NEW.id, 'policies', 'Policies', 'Returns, refunds, privacy, terms and business rules', 'topic'),
    (NEW.id, 'faq', 'FAQ', 'Frequently asked questions and approved answers', 'topic'),
    (NEW.id, 'orders', 'Orders', 'Orders, purchases, delivery and fulfilment', 'topic'),
    (NEW.id, 'staff', 'Staff', 'Team roles, permissions and staff information', 'topic'),
    (NEW.id, 'procedures', 'Procedures', 'Repeatable workflows, operating procedures and steps', 'topic'),
    (NEW.id, 'general', 'General', 'General workspace learning and other topics', 'topic')
  ON CONFLICT (workspace_id, room_key) WHERE room_type = 'topic' DO NOTHING;
  RETURN NEW;
END;
$$;

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

  SELECT member.workspace_id INTO new_workspace_id
  FROM public.workspace_members AS member
  WHERE member.user_id = current_user_id
  LIMIT 1;
  IF new_workspace_id IS NOT NULL THEN RETURN new_workspace_id; END IF;

  SELECT workspace.id INTO new_workspace_id
  FROM public.workspaces AS workspace
  WHERE workspace.owner_id = current_user_id
  LIMIT 1;
  IF new_workspace_id IS NOT NULL THEN
    INSERT INTO public.workspace_members (workspace_id, user_id, role)
    VALUES (new_workspace_id, current_user_id, 'owner')
    ON CONFLICT DO NOTHING;
    RETURN new_workspace_id;
  END IF;

  INSERT INTO public.workspaces (owner_id)
  VALUES (current_user_id)
  ON CONFLICT (owner_id) DO NOTHING
  RETURNING id INTO new_workspace_id;

  IF new_workspace_id IS NULL THEN
    SELECT workspace.id INTO new_workspace_id
    FROM public.workspaces AS workspace
    WHERE workspace.owner_id = current_user_id
    LIMIT 1;
  END IF;
  IF new_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Could not provision a default workspace';
  END IF;

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (new_workspace_id, current_user_id, 'owner')
  ON CONFLICT DO NOTHING;
  RETURN new_workspace_id;
END;
$function$;
