import { getSupabaseClientForToken } from "../supabase";

export async function ensureWorkspace(token: string) {
  const db = getSupabaseClientForToken(token);
  const { data: userData, error: userError } = await db.auth.getUser(token);
  if (userError || !userData.user) throw new Error("Your session expired. Please sign in again.");

  const { data: membership, error: membershipError } = await db
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", userData.user.id)
    .limit(1)
    .maybeSingle();
  if (membershipError) throw new Error(`Could not load your workspace: ${membershipError.message}`);
  if (membership) return { db, user: userData.user, workspaceId: membership.workspace_id as string };

  const { data: workspaceId, error: createWorkspaceError } = await db.rpc("create_misma_workspace");
  if (createWorkspaceError || !workspaceId) {
    throw new Error(`Could not create your workspace: ${createWorkspaceError?.message || "No workspace returned"}`);
  }
  return { db, user: userData.user, workspaceId: workspaceId as string };
}
