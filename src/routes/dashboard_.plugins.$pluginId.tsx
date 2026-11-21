import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "../lib/supabase";
import { PLUGIN_MANIFESTS, type PluginId } from "../lib/plugin-registry";
import { PluginBrand } from "../components/plugin-brand";
import { PluginPermissionChoices } from "../components/plugin-permission-settings";
import { Badge, Button, Chip, GlassCard, GlassRow, SectionHeader } from "../components/glass-ui";

export const Route = createFileRoute("/dashboard/plugins/$pluginId")({ component: PluginDetailPage });
type Connection = { id: string; provider: PluginId; external_account_name: string | null; status: string };
type Project = { id: string; name: string; full_name: string | null; dashboard_url: string | null; repository_url: string | null };

function PluginDetailPage() {
  const { pluginId: rawId } = Route.useParams();
  const pluginId = rawId as PluginId;
  const plugin = PLUGIN_MANIFESTS[pluginId];
  const supabase = getSupabaseClient();
  const [workspaceId, setWorkspaceId] = useState("");
  const [connection, setConnection] = useState<Connection | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [account, setAccount] = useState<{ name: string; email: string; avatar: string | null } | null>(null);
  const [consentOpen, setConsentOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(new URLSearchParams(window.location.search).get("settings") === "1");
  const [expanded, setExpanded] = useState(false);
  const [authorizationUrl, setAuthorizationUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const connected = connection?.status === "connected";
  const settingsKey = "misma_plugin_permission_" + pluginId + "_v1";

  useEffect(() => {
    if (!plugin) return;
    let alive = true;
    void (async () => {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) throw new Error("Sign in to view plugin details.");
        if (alive) setAccount({
          name: String(user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || "Misma user"),
          email: user.email || "",
          avatar: typeof user.user_metadata?.avatar_url === "string" ? user.user_metadata.avatar_url : null,
        });
        const { data: memberships, error: membershipError } = await supabase.from("workspace_members").select("workspace_id,role").eq("user_id", user.id);
        if (membershipError) throw membershipError;
        const ids = [...new Set((memberships || []).filter((item) => ["owner", "admin"].includes(String(item.role))).map((item) => String(item.workspace_id)))];
        const saved = window.sessionStorage.getItem("misma_integrations_workspace");
        const workspace = ids.includes(saved || "") ? saved : ids[0];
        if (!workspace) throw new Error("No Misma workspace is available for this account.");
        if (alive) setWorkspaceId(workspace);
        const [connectionResult, projectResult] = await Promise.all([
          supabase.from("platform_connections").select("id,provider,external_account_name,status").eq("workspace_id", workspace).eq("provider", pluginId).eq("status", "connected").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
          supabase.from("platform_projects").select("id,name,full_name,dashboard_url,repository_url").eq("workspace_id", workspace).eq("provider", pluginId).order("name", { ascending: true }),
        ]);
        if (connectionResult.error) throw connectionResult.error;
        if (projectResult.error) throw projectResult.error;
        if (alive) {
          setConnection(connectionResult.data as Connection | null);
          setProjects((projectResult.data || []) as Project[]);
        }
      } catch (cause) {
        if (alive) setError(cause instanceof Error ? cause.message : "Could not load this plugin.");
      }
    })();
    return () => { alive = false; };
  }, [supabase, pluginId, plugin]);

  const previewItems = useMemo(() => plugin?.previewCards || [], [plugin]);
  if (!plugin) return <main className="misma-plugin-detail-page"><div className="misma-plugin-detail-shell"><Button variant="ghost" onClick={() => window.location.assign("/dashboard/plugins")}>← Plugins</Button><h1>Plugin not found</h1></div></main>;

  async function prepareConnection() {
    if (!workspaceId || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      if (pluginId === "github" || pluginId === "vercel") {
        const action = pluginId === "github" ? "github-install-url" : "vercel-install-url";
        const { data, error: invokeError } = await supabase.functions.invoke("misma-platform-integrations", { body: { action, workspaceId } });
        if (invokeError) throw new Error(invokeError.message || "Could not prepare provider authorization.");
        if (data?.error) throw new Error(String(data.error));
        const url = typeof data?.installUrl === "string" ? data.installUrl : "";
        const valid = pluginId === "github" ? url.startsWith("https://github.com/") : url.startsWith("https://vercel.com/integrations/");
        if (!valid) throw new Error("Misma did not receive a valid provider authorization URL.");
        setAuthorizationUrl(url);
        setConsentOpen(true);
      } else if (pluginId === "render") {
        setError("Render browser sign-in is awaiting a Render-issued OAuth client for Misma. No customer API key will be requested.");
      } else {
        setNotice("Netlify connection is coming later.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start this connection.");
    } finally { setBusy(false); }
  }

  async function disconnect() {
    if (!connection || !workspaceId || busy) return;
    if (!window.confirm("Disconnect " + plugin.name + " from this Misma workspace? Existing repositories, services and deployments will not be deleted.")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("misma-platform-integrations", { body: { action: "platform-disconnect", workspaceId, provider: pluginId, platformConnectionId: connection.id } });
      if (invokeError) throw new Error(invokeError.message || "Could not disconnect this plugin.");
      if (data?.error) throw new Error(String(data.error));
      setConnection(null); setProjects([]); setManageOpen(false); setNotice(plugin.name + " disconnected.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not disconnect this plugin.");
    } finally { setBusy(false); }
  }

  function tryInChat() {
    window.sessionStorage.setItem("misma_try_plugin_provider", pluginId);
    window.location.assign("/dashboard");
  }

  return <main className="misma-plugin-detail-page">
    <div className="misma-plugin-detail-shell">
      <header className="misma-plugin-detail-header">
        <button type="button" className="misma-plugin-detail-back" aria-label="Back to Plugins" onClick={() => window.location.assign("/dashboard/plugins")}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6M9 12h12"/></svg></button>
        <h1>{plugin.name}</h1>
        <button type="button" className="misma-plugin-detail-settings" aria-label={"Settings for " + plugin.name} onClick={() => setManageOpen(true)}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="m19 15 1.4 1.1-1.7 3-1.7-.7a7 7 0 0 1-1.5.9l-.3 1.8h-3.5l-.3-1.8a7 7 0 0 1-1.5-.9l-1.7.7-1.7-3L7 15a7 7 0 0 1 0-2L5.6 12l1.7-3 1.7.7a7 7 0 0 1 1.5-.9l.3-1.8h3.5l.3 1.8a7 7 0 0 1 1.5.9l1.7-.7 1.7 3-1.4 1.1a7 7 0 0 1 0 2Z"/></svg></button>
      </header>

      <section className={"misma-plugin-detail-hero is-" + pluginId} aria-label={plugin.name + " examples"}>
        <div className="misma-plugin-detail-hero-track">
          {previewItems.map((item, index) => <article className="misma-plugin-preview-card" key={item.title}>
            <Badge>Example</Badge>
            <div className="misma-plugin-preview-card-head"><PluginBrand provider={pluginId} size="large"/><span>{plugin.name}</span></div>
            <h2>{item.title}</h2><p>{item.description}</p>
            {item.example === "repository" ? <div className="misma-plugin-preview-demo"><span className="misma-demo-dot"/><strong>Repository context</strong><small>Selected repository · Read-only preview</small><div className="misma-demo-line"/><div className="misma-demo-line short"/></div>
              : item.example === "deployment" ? <div className="misma-plugin-preview-demo"><strong>Deployment overview</strong><small>Project status · Deployment history</small><div className="misma-demo-status"><span/> Status information</div></div>
              : item.example === "service" ? <div className="misma-plugin-preview-demo"><strong>Hosting service</strong><small>Connected service · Deploy activity</small><div className="misma-demo-status"><span/> Service status</div></div>
              : <div className="misma-plugin-preview-demo"><strong>Integration in preparation</strong><small>Preview shown as an example only</small></div>}
          </article>)}
        </div>
        <div className="misma-plugin-preview-dots" aria-hidden="true">{previewItems.map((item, index) => <span key={item.title} className={index === 0 ? "is-active" : ""}/>)}</div>
      </section>

      <section className="misma-plugin-detail-intro">
        <p className={expanded ? "is-expanded" : ""}>{plugin.description}</p>
        {plugin.description.length > 170 && <button type="button" onClick={() => setExpanded((value) => !value)}>{expanded ? "Less" : "More"}</button>}
      </section>

      <GlassCard className="misma-plugin-detail-app">
        <SectionHeader title="App"/>
        <GlassRow className="misma-plugin-detail-app-row"><PluginBrand provider={pluginId} size="large"/><div><strong>{plugin.name}</strong><small>{plugin.role}</small></div><Badge className={connected ? "is-connected" : plugin.status === "coming" ? "is-coming" : ""}>{connected ? "Connected" : plugin.status === "coming" ? "Coming later" : "Not connected"}</Badge></GlassRow>
      </GlassCard>

      <GlassCard className="misma-plugin-detail-section">
        <SectionHeader title="Skills" detail="Capabilities available through this plugin."/>
        <div className="misma-plugin-skill-list">{plugin.skills.map((skill) => <Chip key={skill.name}><span aria-hidden="true">{skill.icon}</span>{skill.name}</Chip>)}</div>
      </GlassCard>

      <GlassCard className="misma-plugin-detail-section">
        <SectionHeader title="Permissions" detail="Misma requests only the access needed for the skills listed above."/>
        <ul className="misma-plugin-permission-list">{plugin.permissions.map((item) => <li key={item}>{item}</li>)}</ul>
        <div className="misma-plugin-never-list"><strong>What Misma will not do</strong><ul>{plugin.never.map((item) => <li key={item}>{item}</li>)}</ul></div>
      </GlassCard>

      <GlassCard className="misma-plugin-detail-section">
        <SectionHeader title="Information"/>
        <dl className="misma-plugin-info-table">
          <div><dt>Developer</dt><dd>{plugin.developer}</dd></div>
          <div><dt>Website</dt><dd><a href={plugin.website} target="_blank" rel="noreferrer">{plugin.website.replace(/^https:\/\//, "")}</a></dd></div>
          <div><dt>Version</dt><dd>{plugin.version}</dd></div>
          <div><dt>Privacy Policy</dt><dd><a href={plugin.privacyUrl} target="_blank" rel="noreferrer">View policy</a></dd></div>
          <div><dt>Terms of Service</dt><dd><a href={plugin.termsUrl} target="_blank" rel="noreferrer">View terms</a></dd></div>
        </dl>
      </GlassCard>

      {error && <p className="misma-plugin-detail-feedback is-error" role="alert">{error}</p>}
      {notice && <p className="misma-plugin-detail-feedback" role="status">{notice}</p>}
    </div>

    <div className="misma-plugin-detail-sticky">
      {connected ? <Button onClick={tryInChat}>Try in chat</Button> : plugin.status === "coming" || pluginId === "render" ? <Button disabled>{plugin.status === "coming" ? "Coming later" : "OAuth approval pending"}</Button> : <Button onClick={() => void prepareConnection()} disabled={busy}>{busy ? "Preparing…" : "Connect " + plugin.name}</Button>}
    </div>

    {consentOpen && <div className="misma-plugin-sheet-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setConsentOpen(false); }}>
      <section className="misma-plugin-sheet" role="dialog" aria-modal="true" aria-labelledby="misma-plugin-consent-heading">
        <button className="misma-plugin-sheet-close" type="button" aria-label="Close" onClick={() => setConsentOpen(false)}>×</button>
        <div className="misma-plugin-sheet-title"><PluginBrand provider={pluginId} size="large"/><div><h2 id="misma-plugin-consent-heading">Use Misma to connect {plugin.name}</h2><p>Review the account and access below.</p></div></div>
        <div className="misma-plugin-consent-account">{account?.avatar ? <img src={account.avatar} alt=""/> : <span>{(account?.name || "M").slice(0,1).toUpperCase()}</span>}<div><strong>{account?.name || "Misma account"}</strong><small>{account?.email}</small></div></div>
        <div className="misma-plugin-permissions"><h3>Permissions requested</h3><ul>{plugin.permissions.map((item) => <li key={item}>{item}</li>)}</ul><p>{plugin.never.join(" ")}</p></div>
        <div className="misma-plugin-sheet-actions"><Button variant="secondary" onClick={() => setConsentOpen(false)}>Cancel</Button><a className="misma-button is-secondary" href={authorizationUrl} target="_blank" rel="noreferrer">Continue to {plugin.name} ↗</a><Button onClick={() => { setConsentOpen(false); window.location.assign(authorizationUrl); }}>Connect</Button></div>
      </section>
    </div>}

    {manageOpen && <div className="misma-plugin-sheet-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setManageOpen(false); }}>
      <section className="misma-plugin-sheet" role="dialog" aria-modal="true" aria-labelledby="misma-plugin-settings-heading">
        <button className="misma-plugin-sheet-close" type="button" aria-label="Close settings" onClick={() => setManageOpen(false)}>×</button>
        <h2 id="misma-plugin-settings-heading">{plugin.name} settings</h2>
        <p className="misma-plugin-sheet-subtitle">Choose when Misma should ask before using this plugin.</p>
        <PluginPermissionChoices storageKey={settingsKey}/>
        {connected && <div className="misma-plugin-manage-account"><strong>Connected account</strong><GlassRow><PluginBrand provider={pluginId}/><span>{connection?.external_account_name || plugin.name + " account"}</span><Badge className="is-connected">Connected</Badge></GlassRow></div>}
        {connected && <div className="misma-plugin-manage-projects"><strong>{plugin.category === "developer" ? "Selected repositories" : "Hosting projects"}</strong>{projects.length ? projects.map((project) => <GlassRow key={project.id}><span>{project.name}</span>{project.dashboard_url && <a href={project.dashboard_url} target="_blank" rel="noreferrer">Open ↗</a>}</GlassRow>) : <p>No linked projects have been discovered yet.</p>}</div>}
        {connected && <Button variant="destructive" disabled={busy} onClick={() => void disconnect()}>Disconnect account</Button>}
      </section>
    </div>}
  </main>;
}
