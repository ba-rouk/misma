import { getSupabaseClient } from "./supabase";
import type { PluginId } from "./plugin-manifests";

export async function getPluginAuthorizationUrl(workspaceId: string, provider: PluginId): Promise<string> {
  if (provider === "render") {
    throw new Error("Render account sign-in is not enabled yet. Misma is waiting for its own Render OAuth client registration; no personal API key is requested.");
  }
  if (provider === "netlify") {
    throw new Error("Netlify account authorization is coming later.");
  }
  const action = provider === "github" ? "github-install-url" : "vercel-install-url";
  const { data, error } = await getSupabaseClient().functions.invoke("misma-platform-integrations", {
    body: { action, workspaceId },
  });
  if (error) throw new Error(error.message || "Could not start the " + provider + " connection.");
  if (data?.error) throw new Error(String(data.error));
  const url = typeof data?.installUrl === "string" ? data.installUrl : "";
  const allowed = provider === "github"
    ? url.startsWith("https://github.com/")
    : url.startsWith("https://vercel.com/integrations/");
  if (!allowed) throw new Error("Misma did not return a valid " + provider + " authorization link.");
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
