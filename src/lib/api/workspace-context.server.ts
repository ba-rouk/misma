import { getSupabaseClientForToken } from "../supabase";

export async function ensureWorkspace(
  token: string,
  requestedWorkspaceId?: string,
  allowSupportAccess = false,
) {
  const db = getSupabaseClientForToken(token);
  const { data: userData, error: userError } = await db.auth.getUser(token);
  if (userError || !userData.user) throw new Error("Your session expired. Please sign in again.");

  let membershipQuery = db
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", userData.user.id);
  if (requestedWorkspaceId) membershipQuery = membershipQuery.eq("workspace_id", requestedWorkspaceId);
  const { data: membership, error: membershipError } = await membershipQuery
    .limit(1)
    .maybeSingle();
  if (membershipError) throw new Error(`Could not load your workspace: ${membershipError.message}`);

  if (membership) {
    const { data: supportAccess, error: supportError } = await db
      .from("workspace_staff_access")
      .select("title")
      .eq("workspace_id", membership.workspace_id)
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (supportError) {
      throw new Error(`Could not verify your workspace permissions: ${supportError.message}`);
    }
    if (supportAccess) {
      if (!allowSupportAccess) {
        throw new Error("This account can only access Customers and Notifications.");
      }
      return {
        db,
        user: userData.user,
        workspaceId: membership.workspace_id as string,
        isSupport: true,
        staffTitle: String(supportAccess.title || "Customer support"),
      };
    }

    return {
      db,
      user: userData.user,
      workspaceId: membership.workspace_id as string,
      isSupport: false,
      staffTitle: null,
    };
  }

  if (allowSupportAccess) {
    throw new Error("No accessible Misma workspace was found for this account.");
  }

  const { data: workspaceId, error: createWorkspaceError } = await db.rpc("create_misma_workspace");
  if (createWorkspaceError || !workspaceId) {
    throw new Error(`Could not create your workspace: ${createWorkspaceError?.message || "No workspace returned"}`);
  }
  return { db, user: userData.user, workspaceId: workspaceId as string, isSupport: false, staffTitle: null };
}
