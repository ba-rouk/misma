import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "../lib/supabase";
import { getPluginAuthorizationUrl, getPluginWorkspaceContext } from "../lib/plugin-connect";
import { getPluginManifest } from "../lib/plugin-manifests";
import { PluginProviderLogo } from "../components/plugin-provider-logo";
import { Badge, Button, GlassCard, GlassModal } from "../components/misma-glass";

type PermissionMode = "always_ask" | "read" | "low_risk" | "all";
type Connection = { id: string; provider: string; external_account_name: string | null; status: string; created_at: string; updated_at: string; workspace_id: string };
const permissionOptions: Array<{ id: PermissionMode; title: string; description: string; badge?: string; elevated?: boolean }> = [
  { id: "always_ask", title: "Always ask", description: "Misma will ask before reading or making changes." },
  { id: "read", title: "Allow read actions", description: "Misma can read without asking, but will ask before making changes." },
  { id: "low_risk", title: "Allow low-risk actions", description: "Misma will automatically approve low-risk actions but may deny actions involving sensitive information.", badge: "DEFAULT" },
  { id: "all", title: "Allow all actions", description: "Misma won't ask before reading or taking action. This comes with elevated risk.", elevated: true },
];

export const Route = createFileRoute("/dashboard/plugins/$pluginId/settings")({ component: PluginSettingsRoute });

function PluginSettingsRoute() {
  const { pluginId } = Route.useParams();
  if (pluginId === "github") {
    return (
      <main className="misma-github-settings-empty-page">
        <h1>GitHub plugin settings</h1>
      </main>
    );
  }
  return <PluginSettingsPage pluginId={pluginId} />;
}

export function PluginSettingsPage({ pluginId }: { pluginId: string }) {
  const manifest = getPluginManifest(pluginId);
  const supabase = getSupabaseClient();
  const [userId, setUserId] = useState("");
  const [internalWorkspaceId, setInternalWorkspaceId] = useState("");
  const [connections, setConnections] = useState<Connection[]>([]);
  const [permission, setPermission] = useState<PermissionMode>("low_risk");
  const [accountLabel, setAccountLabel] = useState("");
  const [renameDraft, setRenameDraft] = useState("");
  const [renameOpen, setRenameOpen] = useState(false);
  const [permissionsOpen, setPermissionsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [readOpen, setReadOpen] = useState(false);
  const [writeOpen, setWriteOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const connection = useMemo(() => connections.find((item) => item.status === "connected") || null, [connections]);
  const canAuthorize = manifest?.authType === "github_app" || manifest?.authType === "vercel_marketplace_oauth" || manifest?.authType === "netlify_oauth";
  const readActions = manifest?.id === "github"
    ? ["Check whether a repository is initialized", "List repositories granted to the GitHub App", "Compare commits and inspect selected repository files"]
    : manifest?.id === "vercel"
      ? ["List accessible projects", "Read project metadata and deployment status"]
      : manifest?.id === "render"
        ? ["List services available through the connected provider adapter", "Read service metadata"]
        : ["Site discovery and build-status access are planned."];
  const writeActions = manifest?.id === "github"
    ? ["Create a dedicated feature branch", "Commit an approved widget installation patch", "Open a pull request for review"]
    : ["Project association is available where supported; direct provider deployment triggers are not enabled in this release."];

  useEffect(() => {
    let active = true;
    if (!manifest) { setLoading(false); return () => { active = false; }; }
    void (async () => {
      try {
        const websiteId = new URLSearchParams(window.location.search).get("websiteId") || "";
        const context = await getPluginWorkspaceContext(websiteId);
        const [connectionResult, pluginResult] = await Promise.all([
          supabase.from("platform_connections").select("id,provider,external_account_name,status,created_at,updated_at,workspace_id")
            .in("workspace_id", context.workspaceIds).eq("provider", manifest.id).order("created_at", { ascending: false }),
          supabase.from("user_plugins").select("permission_mode,account_label")
            .eq("user_id", context.user.id).eq("provider", manifest.id).maybeSingle(),
        ]);
        if (connectionResult.error) throw connectionResult.error;
        if (pluginResult.error) throw pluginResult.error;
        if (!active) return;
        const rows = (connectionResult.data || []) as Connection[];
        const connectedRow = rows.find((item) => item.status === "connected") || null;
        setUserId(context.user.id);
        setInternalWorkspaceId(connectedRow?.workspace_id || context.workspaceId);
        setConnections(rows);
        const configuredPermission = String(pluginResult.data?.permission_mode || "low_risk");
        setPermission((permissionOptions.some((option) => option.id === configuredPermission)
          ? configuredPermission : "low_risk") as PermissionMode);
        setAccountLabel(String(pluginResult.data?.account_label || ""));
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load plugin settings.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [supabase, manifest?.id]);

  function backToDetail() {
    window.location.assign(manifest ? "/dashboard/plugins/" + manifest.id : "/dashboard/plugins");
  }

  async function savePluginRow(fields: Record<string, unknown>) {
    if (!manifest || !userId) throw new Error("Your Misma account is not ready.");
    const { error: saveError } = await supabase.from("user_plugins").upsert({
      user_id: userId,
      provider: manifest.id,
      permission_mode: permission,
      is_installed: true,
      account_label: accountLabel || null,
      ...fields,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,provider" });
    if (saveError) throw saveError;
  }

  async function savePermission(value: PermissionMode) {
    if (!manifest || !userId) return;
    setBusy(true); setError("");
    try {
      await savePluginRow({ permission_mode: value });
      setPermission(value);
      setNotice("Permission preference saved to your Misma account.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the permission preference.");
    } finally { setBusy(false); }
  }

  async function reconnect() {
    if (!manifest || !canAuthorize || !internalWorkspaceId) {
      setError(manifest?.id === "render"
        ? "Render sign-in is not available until Render issues Misma an OAuth client."
        : "This provider authorization is not available yet.");
      return;
    }
    setBusy(true); setError("");
    try {
      const url = await getPluginAuthorizationUrl(internalWorkspaceId, manifest.id);
      window.location.assign(url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not reopen provider authorization.");
    } finally { setBusy(false); }
  }

  async function renameAccount() {
    setBusy(true); setError("");
    const next = renameDraft.trim().slice(0, 80);
    try {
      await savePluginRow({ account_label: next || null });
      setAccountLabel(next);
      setRenameOpen(false);
      setNotice("Account label updated.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not rename the account.");
    } finally { setBusy(false); }
  }

  async function disconnectAccount() {
    if (!manifest || !connection || !internalWorkspaceId) return;
    if (!window.confirm("Disconnect this " + manifest.name + " account from Misma?")) return;
    setBusy(true); setError("");
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("misma-platform-integrations", {
        body: { action: "platform-disconnect", workspaceId: internalWorkspaceId, provider: manifest.id, platformConnectionId: connection.id },
      });
      if (invokeError) throw new Error(invokeError.message || "Could not disconnect the provider account.");
      if (data?.error) throw new Error(String(data.error));
      setConnections((rows) => rows.map((row) => row.id === connection.id ? { ...row, status: "disconnected" } : row));
      setNotice("Provider account disconnected. Your provider resources were not deleted.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not disconnect this account.");
    } finally { setBusy(false); setMenuOpen(false); }
  }

  async function uninstallPlugin() {
    if (!manifest || !userId) return;
    if (!window.confirm("Uninstall " + manifest.name + " from your Misma account? This leaves the provider authorization intact until you disconnect it separately.")) return;
    setBusy(true); setError("");
    try {
      const { error: uninstallError } = await supabase.from("user_plugins").upsert({
        user_id: userId, provider: manifest.id, permission_mode: permission, is_installed: false,
        account_label: accountLabel || null, updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,provider" });
      if (uninstallError) throw uninstallError;
      window.location.assign("/dashboard/plugins");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not uninstall this plugin.");
    } finally { setBusy(false); setMenuOpen(false); }
  }

  if (!manifest) return <main className="misma-plugin-settings-page"><p>Plugin not found.</p><Button onClick={backToDetail}>Back</Button></main>;

  return (
    <main className="misma-plugin-settings-page">
      <div className="misma-plugin-settings-shell">
        <header className="misma-plugin-settings-topbar">
          <button type="button" className="misma-page-back-button" onClick={backToDetail} aria-label="Back to plugin detail">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18 9 12l6-6M9 12h12"/></svg>
          </button>
          <h1>{manifest.name}</h1><span />
        </header>

        {error && <p className="misma-plugin-feedback is-error" role="alert">{error}</p>}
        {notice && <p className="misma-plugin-feedback" role="status">{notice}</p>}

        <section className="misma-plugin-settings-summary-section">
          <GlassCard className="misma-plugin-settings-summary">
            <PluginProviderLogo provider={manifest.id} size="lg"/>
            <div className="misma-plugin-settings-summary-copy">
              <strong>{manifest.name}</strong><small>{manifest.permissions[0]}</small>
            </div>
            <div className="misma-plugin-settings-menu-wrap">
              <button type="button" className="misma-plugin-overflow" aria-label="Plugin account actions" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((value) => !value)}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>
              </button>
              {menuOpen && <div className="misma-plugin-overflow-menu" role="menu">
                <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); backToDetail(); }}>ⓘ View plugin detail</button>
                <button type="button" role="menuitem" disabled={!connection} onClick={() => { setRenameDraft(accountLabel || connection?.external_account_name || ""); setRenameOpen(true); setMenuOpen(false); }}>✎ Rename account</button>
                <button type="button" role="menuitem" disabled={!canAuthorize || busy} onClick={() => { setMenuOpen(false); void reconnect(); }}>↻ Reconnect</button>
                <button type="button" role="menuitem" className="is-danger" disabled={!connection || busy} onClick={() => void disconnectAccount()}>⊖ Disconnect account</button>
                <div/>
                <button type="button" role="menuitem" className="is-danger" disabled={busy} onClick={() => void uninstallPlugin()}>⊖ Uninstall</button>
              </div>}
            </div>
          </GlassCard>
          <div className="misma-plugin-settings-connected-account">
            <PluginProviderLogo provider={manifest.id} size="sm"/>
            <span><strong>{accountLabel || connection?.external_account_name || "No connected account"}</strong><small>{connection ? "Primary · " + new Date(connection.created_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "Not connected"}</small></span>
            {connection && <Badge tone="success">Primary</Badge>}
          </div>
          <Button variant="secondary" className="misma-plugin-settings-connect-another" disabled={!canAuthorize || busy || !internalWorkspaceId} onClick={() => void reconnect()}>＋ Connect another account</Button>
        </section>

        <button type="button" className="misma-plugin-settings-permissions-row" onClick={() => setPermissionsOpen(true)}>
          <strong>Permissions</strong><span>{permissionOptions.find((option) => option.id === permission)?.title || "Allow low-risk actions"} <b>›</b></span>
        </button>

        <section className="misma-plugin-settings-info-section">
          <h2>Information</h2>
          <dl className="misma-plugin-settings-info">
            <div><dt>Connected on</dt><dd>{connection ? new Date(connection.created_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "Not connected"}</dd></div>
            <div><dt>Capabilities</dt><dd>{manifest.id === "github" ? "Read, prepare changes and open pull requests" : "Read account metadata and link projects"}</dd></div>
          </dl>
          <button type="button" className="misma-plugin-settings-accordion" aria-expanded={readOpen} onClick={() => setReadOpen((value) => !value)}><span>Read actions</span><b>{readOpen ? "−" : "+"}</b></button>
          {readOpen && <ul className="misma-plugin-settings-action-list">{readActions.map((item) => <li key={item}>{item}</li>)}</ul>}
          <button type="button" className="misma-plugin-settings-accordion" aria-expanded={writeOpen} onClick={() => setWriteOpen((value) => !value)}><span>Write actions</span><b>{writeOpen ? "−" : "+"}</b></button>
          {writeOpen && <ul className="misma-plugin-settings-action-list">{writeActions.map((item) => <li key={item}>{item}</li>)}</ul>}
        </section>
      </div>

      <GlassModal open={permissionsOpen} title={manifest.name} description="Choose when Misma should ask before using this plugin." onClose={() => setPermissionsOpen(false)} size="md" position="bottom">
        <div className="misma-plugin-settings-permissions-sheet">
          <fieldset disabled={busy}>
            <legend className="misma-sr-only">{manifest.name} permissions</legend>
            {permissionOptions.map((option) => (
              <label className={"misma-plugin-permission-option" + (permission === option.id ? " is-selected" : "")} key={option.id}>
                <span className="misma-plugin-permission-copy"><strong>{option.title}</strong>{option.badge && <Badge tone="neutral">{option.badge}</Badge>}{option.elevated && <Badge tone="warning">ELEVATED RISK</Badge>}<small>{option.description}</small></span>
                <input type="radio" name={"plugin-permission-" + manifest.id} value={option.id} checked={permission === option.id} onChange={() => void savePermission(option.id)}/>
              </label>
            ))}
          </fieldset>
          <p className="misma-plugin-permission-note">Provider scopes remain limited to the access you granted. Sensitive production actions still require their own approval.</p>
          <Button variant="secondary" className="misma-plugin-settings-reset" disabled={busy || permission === "low_risk"} onClick={() => void savePermission("low_risk")}>Reset to default</Button>
        </div>
      </GlassModal>

      <GlassModal open={renameOpen} title="Rename account" description="Choose a label to recognize this connected provider account." onClose={() => setRenameOpen(false)} size="sm" position="bottom">
        <form className="misma-plugin-settings-rename" onSubmit={(event) => { event.preventDefault(); void renameAccount(); }}>
          <input value={renameDraft} maxLength={80} onChange={(event) => setRenameDraft(event.target.value)} aria-label="Account label" placeholder={connection?.external_account_name || manifest.name + " account"}/>
          <div><Button variant="secondary" onClick={() => setRenameOpen(false)}>Cancel</Button><Button type="submit" disabled={busy}>Save name</Button></div>
        </form>
      </GlassModal>
      {loading && <div className="misma-plugin-settings-loading">Loading account settings…</div>}
    </main>
  );
}
