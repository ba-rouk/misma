import { getSupabaseClient } from "./supabase";
import type { PluginId } from "./plugin-manifests";

export async function getPluginAuthorizationUrl(workspaceId: string, provider: PluginId): Promise<string> {
  if (provider === "render") {
    throw new Error("Render account sign-in is not enabled yet. Misma is waiting for its own Render OAuth client registration; no personal API key is requested.");
  }
  const action = provider === "github" ? "github-install-url"
    : provider === "vercel" ? "vercel-install-url" : "netlify-install-url";
  const { data, error } = await getSupabaseClient().functions.invoke("misma-platform-integrations", {
    body: { action, workspaceId },
  });
  if (error) throw new Error(error.message || "Could not start the " + provider + " connection.");
  if (data?.error) throw new Error(String(data.error));
  const url = typeof data?.installUrl === "string" ? data.installUrl : "";
  const allowed = provider === "github"
    ? url.startsWith("https://github.com/")
    : provider === "vercel"
      ? url.startsWith("https://vercel.com/integrations/")
      : url.startsWith("https://app.netlify.com/authorize?");
  if (!allowed) throw new Error("Misma did not return a valid " + provider + " authorization link.");
  if (provider === "netlify") {
    try { sessionStorage.setItem("misma_netlify_oauth_workspace_id", workspaceId); } catch { /* callback can show a restart message */ }
  }
  return url;
}

export function openPluginInChat(provider: PluginId, websiteId?: string | null, prompt?: string) {
  try {
    sessionStorage.setItem("misma_try_plugin_provider", provider);
    sessionStorage.setItem("misma_try_plugin_prompt", prompt || "@" + provider + " ");
    if (websiteId) sessionStorage.setItem("misma_plugins_website_id", websiteId);
  } catch {
    // The dashboard can still open even when the browser blocks optional session storage.
  }
  window.location.assign("/dashboard");
}

export type PluginWorkspaceContext = {
  user: { id: string; email?: string };
  workspaceId: string;
  workspaceIds: string[];
};

/**
 * Resolve the account's provider-connection context without asking the user
 * to select a workspace. A website-scoped plugin flow stays in that
 * website's owning workspace; otherwise use the account's oldest manageable
 * workspace as the provider's default connection target.
 */
export async function getPluginWorkspaceContext(websiteId?: string | null): Promise<PluginWorkspaceContext> {
  const supabase = getSupabaseClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  const user = authData.user;
  if (authError || !user) throw new Error("Sign in to Misma before managing plugins.");

  const { data: memberships, error: membershipError } = await supabase
    .from("workspace_members")
    .select("workspace_id,role")
    .eq("user_id", user.id);
  if (membershipError) throw new Error("Could not load your Misma account access.");

  const manageableIds = [...new Set((memberships || [])
    .filter((row) => ["owner", "admin"].includes(String(row.role)))
    .map((row) => String(row.workspace_id))
    .filter(Boolean))];
  if (!manageableIds.length) {
    throw new Error("Ask a Misma account owner or admin to manage provider connections.");
  }

  const { data: workspaces, error: workspaceError } = await supabase
    .from("workspaces")
    .select("id,created_at")
    .in("id", manageableIds)
    .order("created_at", { ascending: true });
  if (workspaceError) throw new Error("Could not resolve your Misma provider account.");
  const workspaceIds = (workspaces || []).map((row) => String(row.id));
  let workspaceId = workspaceIds[0] || manageableIds[0];
  if (!workspaceId) throw new Error("No manageable Misma workspace is available.");

  if (websiteId) {
    const { data: website, error: websiteError } = await supabase
      .from("website_connections")
      .select("workspace_id")
      .eq("id", websiteId)
      .is("widget_deleted_at", null)
      .maybeSingle();
    if (websiteError) throw new Error("Could not resolve the selected website's Misma account.");
    const websiteWorkspaceId = String(website?.workspace_id || "");
    if (websiteWorkspaceId && manageableIds.includes(websiteWorkspaceId)) {
      workspaceId = websiteWorkspaceId;
    }
  }

  return { user, workspaceId, workspaceIds };
}
