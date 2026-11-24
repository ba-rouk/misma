import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getSupabaseClient } from "../lib/supabase";
import { getPluginAuthorizationUrl, getPluginWorkspaceContext } from "../lib/plugin-connect";
import { getPluginManifest, type PluginId } from "../lib/plugin-manifests";
import { PluginProviderLogo } from "../components/plugin-provider-logo";
import { Badge, Button, GlassCard } from "../components/misma-glass";

type PermissionMode = "always_ask" | "read" | "low_risk" | "all";
type ConnectedRow = { id: string; status: string; workspace_id: string };

export const Route = createFileRoute("/dashboard/plugins/$pluginId/connect")({
  component: PluginConnectPage,
});

function PluginConnectPage() {
  const navigate = useNavigate();
  const { pluginId } = Route.useParams();
  const manifest = getPluginManifest(pluginId);
  const supabase = getSupabaseClient();
  const [userId, setUserId] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [email, setEmail] = useState("");
  const [connected, setConnected] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [permission, setPermission] = useState<PermissionMode>("low_risk");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const canAuthorize = manifest?.authType === "github_app" || manifest?.authType === "vercel_marketplace_oauth" || manifest?.authType === "netlify_oauth";
  const websiteId = typeof window === "undefined"
    ? ""
    : new URLSearchParams(window.location.search).get("websiteId") || "";

  useEffect(() => {
    let active = true;
    if (!manifest) {
      setLoading(false);
      return () => { active = false; };
    }
    void (async () => {
      try {
        const context = await getPluginWorkspaceContext(websiteId);
        const [connectionResult, preferenceResult] = await Promise.all([
          supabase.from("platform_connections")
            .select("id,status,workspace_id")
            .in("workspace_id", context.workspaceIds)
            .eq("provider", manifest.id)
            .order("updated_at", { ascending: false }),
          supabase.from("user_plugins")
            .select("is_installed,permission_mode")
            .eq("user_id", context.user.id)
            .eq("provider", manifest.id)
            .maybeSingle(),
        ]);
        if (connectionResult.error) throw connectionResult.error;
        if (preferenceResult.error) throw preferenceResult.error;
        if (!active) return;
        const connection = ((connectionResult.data || []) as ConnectedRow[]).find((item) => item.status === "connected");
        setUserId(context.user.id);
        setEmail(context.user.email || "");
        setWorkspaceId(connection?.workspace_id || context.workspaceId);
        setConnected(Boolean(connection));
        setInstalled(preferenceResult.data?.is_installed === true);
        const configured = String(preferenceResult.data?.permission_mode || "low_risk");
        setPermission((["always_ask", "read", "low_risk", "all"].includes(configured) ? configured : "low_risk") as PermissionMode);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Could not prepare this plugin connection.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [manifest?.id, supabase, websiteId]);

  function back() {
    const suffix = websiteId ? "?websiteId=" + encodeURIComponent(websiteId) : "";
    window.location.assign("/dashboard/plugins" + suffix);
  }

  async function connect() {
    if (!manifest || !userId || !workspaceId || busy) return;
    setBusy(true);
    setError("");
    try {
      if (connected) {
        if (!installed) {
          const { error: restoreError } = await supabase.from("user_plugins").upsert({
            user_id: userId,
            provider: manifest.id,
            is_installed: true,
            permission_mode: permission,
            updated_at: new Date().toISOString(),
          }, { onConflict: "user_id,provider" });
          if (restoreError) throw restoreError;
        }
        window.location.assign("/dashboard/plugins/" + manifest.id);
        return;
      }
      if (!canAuthorize) {
        throw new Error(manifest.authType === "oauth_pending"
          ? manifest.name + " sign-in is awaiting provider authorization. Misma will not ask you to paste a personal API key."
          : manifest.name + " authorization is not available yet.");
      }
      const url = await getPluginAuthorizationUrl(workspaceId, manifest.id as PluginId);
      window.location.assign(url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start the provider connection.");
      setBusy(false);
    }
  }

  if (!manifest) {
    return <main className="misma-plugin-connect-page"><div className="misma-plugin-connect-shell"><Button variant="secondary" onClick={back}>← Back to plugins</Button><p>This plugin could not be found.</p></div></main>;
  }

  const isUnavailable = manifest.status === "coming" || manifest.authType === "oauth_pending";
  const permissionLabel = permission === "always_ask" ? "Always ask"
    : permission === "read" ? "Allow read actions"
      : permission === "all" ? "Allow all actions" : "Allow low-risk actions";

  return (
    <main className="misma-plugin-connect-page">
      <div className="misma-plugin-connect-shell">
        <header className="misma-plugin-connect-topbar">
          <button type="button" className="misma-page-back-button" aria-label="Back to plugins" onClick={back}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18 9 12l6-6M9 12h12"/></svg>
          </button>
          <span>Add integration</span>
          <span />
        </header>

        <section className="misma-plugin-connect-hero">
          <PluginProviderLogo provider={manifest.id} size="hero" />
          <h1>Add {manifest.name} to Misma</h1>
          <p>By {manifest.developer}</p>
          <Badge tone={connected ? "success" : isUnavailable ? "warning" : "neutral"}>
            {connected ? "Account connected" : isUnavailable ? "Authorization unavailable" : "Secure provider sign-in"}
          </Badge>
          <p className="misma-plugin-connect-intro">{manifest.tagline}</p>
        </section>

        {error && <p className="misma-plugin-feedback is-error" role="alert">{error}</p>}

        <section className="misma-plugin-connect-section">
          <h2>What this plugin does</h2>
          <GlassCard>
            <p className="misma-plugin-connect-description">{manifest.description}</p>
            <ul className="misma-plugin-connect-checklist">
              {manifest.skills.map((skill) => (
                <li key={skill.id}><span aria-hidden="true">✓</span><div><strong>{skill.name}</strong><small>{skill.description}</small></div></li>
              ))}
            </ul>
          </GlassCard>
        </section>

        <section className="misma-plugin-connect-section">
          <h2>Access requested</h2>
          <GlassCard>
            <ul className="misma-plugin-connect-permissions">
              {manifest.permissions.map((item) => <li key={item}>{item}</li>)}
            </ul>
            <p className="misma-plugin-connect-note">Misma can only use the provider scopes you approve on the provider's own authorization screen. Sensitive operations remain subject to Misma's approval checks.</p>
          </GlassCard>
        </section>

        <section className="misma-plugin-connect-section">
          <h2>Account & permission preview</h2>
          <GlassCard className="misma-plugin-connect-account-card">
            <div className="misma-plugin-connect-account-avatar">{(email[0] || "M").toUpperCase()}</div>
            <div><strong>{email || "Signed-in Misma account"}</strong><small>Your Misma account</small></div>
            <Badge tone="success">Signed in</Badge>
          </GlassCard>
          <GlassCard className="misma-plugin-connect-permission-card">
            <div><strong>Default permission level</strong><small>Change this any time in plugin settings.</small></div>
            <Badge tone="neutral">{permissionLabel}</Badge>
          </GlassCard>
        </section>

        <div className="misma-plugin-connect-footer">
          <Button className="misma-plugin-connect-primary" disabled={loading || busy || (!connected && !canAuthorize)} onClick={() => void connect()}>
            {loading ? "Loading account…" : busy ? "Opening secure sign-in…" : connected ? installed ? "Open " + manifest.name : "Add connected account" : "Add & Connect " + manifest.name}
          </Button>
          {isUnavailable && !connected && <p className="misma-plugin-connect-unavailable" role="status">
            {manifest.authType === "oauth_pending"
              ? manifest.name + " has not yet enabled Misma's customer OAuth authorization. No personal API key will be requested."
              : "This integration is listed for visibility but its customer authorization flow is not available yet."}
          </p>}
          {!isUnavailable && !connected && <p className="misma-plugin-connect-note">You will be redirected to {manifest.name} to review and approve access. Misma does not receive your provider password.</p>}
          {connected && <p className="misma-plugin-connect-note">This provider account is already connected. Add it to your installed plugins or open its details.</p>}
        </div>
      </div>
    </main>
  );
}
