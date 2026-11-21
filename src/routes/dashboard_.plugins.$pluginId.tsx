import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { getSupabaseClient } from "../lib/supabase";
import { getPluginAuthorizationUrl, openPluginInChat } from "../lib/plugin-connect";
import { getPluginManifest, pluginList, type PluginId } from "../lib/plugin-manifests";
import { PluginProviderLogo } from "../components/plugin-provider-logo";
import { PluginConnectConsent } from "../components/plugin-connect-consent";
import { PluginSettingsSheet, type PluginConnectionSummary } from "../components/plugin-settings-sheet";
import { Badge, Button, GlassCard, SectionHeader, StickyActionBar } from "../components/misma-glass";

export const Route = createFileRoute("/dashboard/plugins/$pluginId")({ component: PluginDetailPage });
type PlatformProject = { id: string; provider: PluginId; name: string; full_name: string | null; platform_connection_id: string };

function ExamplePreview({ kind, provider }: { kind: string; provider: PluginId }) {
  const examples = kind === "repository"
    ? [{ title: "src", detail: "Application code", icon: "folder" }, { title: "public", detail: "Static assets", icon: "folder" }, { title: "index.html", detail: "Widget installation point", icon: "file" }]
    : kind === "services"
      ? [{ title: "web-frontend", detail: "Web service", icon: "service" }, { title: "api-service", detail: "Web service", icon: "service" }, { title: "background-worker", detail: "Worker", icon: "service" }]
      : [{ title: "storefront-web", detail: "Production project", icon: "project" }, { title: "business-landing", detail: "Preview project", icon: "project" }, { title: "customer-portal", detail: "Preview project", icon: "project" }];
  return (
    <div className={"misma-plugin-example-card is-" + provider}>
      <div className="misma-plugin-example-card-brand"><PluginProviderLogo provider={provider} size="sm"/><span>{provider[0].toUpperCase() + provider.slice(1)}</span><Badge tone="neutral">Example</Badge></div>
      <div className="misma-plugin-example-window">
        <div className="misma-plugin-example-window-title">
          <div className="misma-plugin-example-window-dots"><i/><i/><i/></div>
          <strong>{kind === "repository" ? "website" : kind === "services" ? "Render services" : "Hosting projects"}</strong>
        </div>
        <div className="misma-plugin-example-window-content">
          {kind === "repository" ? (
            <div className="misma-plugin-example-repo-summary">
              <div className="misma-plugin-example-repo-mark">⌘</div>
              <div><strong>website</strong><small>Sample repository · main branch</small></div>
            </div>
          ) : (
            <div className="misma-plugin-example-project-summary">
              <strong>{kind === "services" ? "Services available" : "Projects available"}</strong>
              <small>Sample account overview</small>
            </div>
          )}
          <div className="misma-plugin-example-file-list">
            {examples.map((item) => (
              <div className="misma-plugin-example-file-row" key={item.title}>
                <span className={"misma-plugin-example-file-glyph is-" + item.icon}>{item.icon === "folder" ? "▰" : item.icon === "file" ? "◇" : item.icon === "service" ? "▦" : "◫"}</span>
                <strong>{item.title}</strong>
                <small>{item.detail}</small>
              </div>
            ))}
          </div>
          <div className="misma-plugin-example-window-foot">{kind === "repository" ? "A preview of the files Misma can inspect." : kind === "services" ? "Sample services · not live account data" : "Sample projects · not live account data"}</div>
        </div>
      </div>
    </div>
  );
}

function PluginSkillIcon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    database: "M4 6c0-2 4-3 8-3s8 1 8 3-4 3-8 3-8-1-8-3Zm0 0v6c0 2 4 3 8 3s8-1 8-3V6M4 12v6c0 2 4 3 8 3s8-1 8-3v-6",
    "git-branch": "M6 3v12a4 4 0 0 0 4 4h8M6 7a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM18 15V9a4 4 0 0 0-4-4h-2",
    "file-code": "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Zm0 0v6h6M10 13l-2 2 2 2m4-4 2 2-2 2",
    "git-pull-request": "M6 3v12m0 0a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm12-7v12m0 0a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM6 8h8a4 4 0 0 0 4-4",
    layers: "m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5m-18 5 9 5 9-5",
    link: "M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1M14 11a5 5 0 0 0-7.1 0l-2 2A5 5 0 0 0 12 20.1l1.1-1.1",
    activity: "M3 12h4l3-8 4 16 3-8h4",
    rocket: "M5 15c-1 0-2 1-2 4 3 0 4-1 4-2m-2-2 5 5m-3-7 5-5c3-3 7-3 7-3s0 4-3 7l-5 5m-4-4-3 1 2-4 4-2m6 6-1 3-4 2 2-4",
    server: "M4 4h16v6H4zM4 14h16v6H4zM7 7h.01M7 17h.01M11 7h6M11 17h6",
    globe: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20",
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={paths[name] || paths.activity}/></svg>;
}

function PluginDetailPage() {
  const { pluginId: rawPluginId } = Route.useParams();
  const manifest = getPluginManifest(rawPluginId);
  const supabase = getSupabaseClient();
  const [workspaceId, setWorkspaceId] = useState("");
  const [userId, setUserId] = useState("");
  const [connection, setConnection] = useState<PluginConnectionSummary | null>(null);
  const [allConnections, setAllConnections] = useState<PluginConnectionSummary[]>([]);
  const [projects, setProjects] = useState<PlatformProject[]>([]);
  const [websiteId, setWebsiteId] = useState("");
  const [expandedDescription, setExpandedDescription] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    if (!manifest) return () => { active = false; };
    setWebsiteId(new URLSearchParams(window.location.search).get("websiteId") || window.sessionStorage.getItem("misma_plugins_website_id") || "");
    void (async () => {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) { window.location.assign("/login"); return; }
        const { data: memberships, error: membershipError } = await supabase.from("workspace_members").select("workspace_id,role").eq("user_id", user.id);
        if (membershipError) throw membershipError;
        const ids = [...new Set((memberships || []).filter((row) => ["owner", "admin"].includes(String(row.role))).map((row) => String(row.workspace_id)))];
        const { data: workspaceRows, error: workspaceError } = await supabase.from("workspaces").select("id,name").in("id", ids).order("created_at", { ascending: true });
        if (workspaceError) throw workspaceError;
        const rows = workspaceRows || [];
        const saved = window.sessionStorage.getItem("misma_integrations_workspace") || "";
        const workspace = rows.find((item) => item.id === saved) || rows[0];
        if (!workspace) throw new Error("No Misma workspace is available for this account.");
        const [connectionResult, projectResult] = await Promise.all([
          supabase.from("platform_connections").select("id,provider,external_account_name,status,updated_at").eq("workspace_id", workspace.id).order("updated_at", { ascending: false }),
          supabase.from("platform_projects").select("id,provider,name,full_name,platform_connection_id").eq("workspace_id", workspace.id).order("name", { ascending: true }),
        ]);
        if (connectionResult.error) throw connectionResult.error;
        if (projectResult.error) throw projectResult.error;
        if (!active) return;
        setUserId(user.id);
        setWorkspaceId(workspace.id);
        setAllConnections((connectionResult.data || []) as PluginConnectionSummary[]);
        setConnection(((connectionResult.data || []) as PluginConnectionSummary[]).find((item) => item.provider === manifest.id && item.status === "connected") || null);
        setProjects((projectResult.data || []) as PlatformProject[]);
        window.sessionStorage.setItem("misma_integrations_workspace", workspace.id);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load plugin details.");
      }
    })();
    return () => { active = false; };
  }, [supabase, manifest?.id]);

  const linkedProjects = useMemo(() => {
    const grouped: Record<string, string[]> = {};
    for (const plugin of pluginList) grouped[plugin.id] = projects.filter((item) => item.provider === plugin.id).map((item) => item.full_name || item.name);
    return grouped;
  }, [projects]);

  if (!manifest) {
    return <main className="misma-plugin-detail-page"><div className="misma-plugin-detail-shell"><p>This plugin could not be found.</p><Button onClick={() => window.location.assign("/dashboard/plugins")}>Back to Plugins</Button></div></main>;
  }

  const activeManifest = manifest;
  const canAuthorize = activeManifest.authType === "github_app" || activeManifest.authType === "vercel_marketplace_oauth";
  function backToPlugins() {
    const suffix = websiteId ? "?websiteId=" + encodeURIComponent(websiteId) : "";
    window.location.assign("/dashboard/plugins" + suffix);
  }
  async function continueToProvider() {
    if (!workspaceId || !canAuthorize) return;
    const popup = window.open("about:blank", "_blank");
    if (!popup) { setError("Your browser blocked the provider tab. Allow popups and try again."); return; }
    popup.opener = null;
    setBusy(true);
    setError("");
    try {
      const url = await getPluginAuthorizationUrl(workspaceId, activeManifest.id);
      popup.location.href = url;
    } catch (cause) {
      popup.close();
      setError(cause instanceof Error ? cause.message : "Could not open provider authorization.");
    } finally {
      setBusy(false);
    }
  }
  function tryInChat() {
    openPluginInChat(activeManifest.id, websiteId);
  }
  function connectAction() {
    setError("");
    setConsentOpen(true);
  }

  const primaryAction = connection ? (
    <Button className="misma-plugin-detail-primary" onClick={tryInChat}>Try in chat</Button>
  ) : manifest.status === "coming" ? (
    <Button className="misma-plugin-detail-primary" disabled>Coming later</Button>
  ) : manifest.authType === "oauth_pending" ? (
    <Button className="misma-plugin-detail-primary" disabled>Awaiting provider authorization</Button>
  ) : (
    <Button className="misma-plugin-detail-primary" onClick={connectAction}>Connect {manifest.name}</Button>
  );

  return (
    <main className="misma-plugin-detail-page" style={{ "--plugin-brand": manifest.brandColor } as CSSProperties}>
      <div className="misma-plugin-detail-shell">

        <section className={"misma-plugin-hero misma-plugin-hero-gallery is-" + manifest.id} aria-label={manifest.name + " example previews"}>
          <header className="misma-plugin-detail-header">
            <button type="button" className="misma-plugin-detail-back" onClick={backToPlugins} aria-label="Back to Plugins"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18 9 12l6-6M9 12h12"/></svg></button>
            <h1>{manifest.name}</h1>
            <button type="button" className="misma-plugin-detail-settings" aria-label={connection ? "Plugin settings" : "Connection information"} onClick={() => connection ? setSettingsOpen(true) : connectAction()}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .4 1.9l.1.1-2.4 2.4-.1-.1a1.7 1.7 0 0 0-1.9-.4 1.7 1.7 0 0 0-1 1.6v.2h-3.4v-.2a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.4l-.1.1-2.4-2.4.1-.1a1.7 1.7 0 0 0 .4-1.9 1.7 1.7 0 0 0-1.6-1H4v-3.4h.2a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.4-1.9l-.1-.1 2.4-2.4.1.1a1.7 1.7 0 0 0 1.9.4 1.7 1.7 0 0 0 1-1.6V4h3.4v.2a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.4l.1-.1 2.4 2.4-.1.1a1.7 1.7 0 0 0-.4 1.9 1.7 1.7 0 0 0 1.6 1h.2v3.4H21a1.7 1.7 0 0 0-1.6 1Z"/></svg>
            </button>
          </header>
  
          <div className="misma-plugin-preview-scroller">
            {manifest.previewCards.map((card) => <div className="misma-plugin-preview-item" key={card.id}><ExamplePreview kind={card.kind} provider={manifest.id}/></div>)}
          </div>
          <div className="misma-plugin-gallery-hint" aria-hidden="true"><span/><span/></div>
        </section>        <section className="misma-plugin-description-section">
          <p className={"misma-plugin-detail-description" + (expandedDescription ? " is-expanded" : "")}>{manifest.description}</p>
          <button type="button" className="misma-plugin-more-link" aria-expanded={expandedDescription} onClick={() => setExpandedDescription((value) => !value)}>{expandedDescription ? "Less" : "More"}</button>
        </section>

        <section className="misma-plugin-detail-section misma-plugin-app-section">
          <SectionHeader title="App" />
          <div className="misma-plugin-app-row"><PluginProviderLogo provider={manifest.id} size="lg"/><div><strong>{manifest.name}</strong><small>{manifest.role === "Code host" ? "Code host" : "Primary"}</small></div></div>
        </section>        <section className="misma-plugin-detail-section misma-plugin-skill-section">
          <SectionHeader title="Skill" />
          <div className="misma-plugin-skills-grid">
            {manifest.skills.map((skill) => <span className="misma-plugin-skill-chip" key={skill.id}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2.8 8.2 4.6v9.2L12 21.2l-8.2-4.6V7.4L12 2.8Z"/><path d="m3.8 7.4 8.2 4.7 8.2-4.7M12 12.1v9.1M8 5l8.2 4.7"/></svg><span>{skill.name}</span></span>)}
          </div>
        </section>        <section className="misma-plugin-detail-section stessa-plugin-information-section">
          <SectionHeader title="Information" />
          <dl className="misma-plugin-information">
            <div><dt>Developer</dt><dd>{manifest.developer}</dd></div>
            <div><dt>Website</dt><dd><a href={manifest.website} target="_blank" rel="noreferrer">{manifest.website.replace(/^https?:\/\//, "")}</a></dd></div>
            <div><dt>Version</dt><dd>{manifest.version}</dd></div>
            <div><dt>Privacy Policy</dt><dd><a href={manifest.privacyUrl} target="_blank" rel="noreferrer">{manifest.privacyUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}</a></dd></div>
            <div><dt>Terms of Service</dt><dd><a href={manifest.termsUrl} target="_blank" rel="noreferrer">{manifest.termsUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}</a></dd></div>
          </dl>
        </section>        {error && <p className="misma-plugin-feedback is-error" role="alert">{error}</p>}
      </div>
      <StickyActionBar className="misma-plugin-detail-actionbar">
        <div className="misma-plugin-detail-action-inner">{primaryAction}
          {!connection && canAuthorize && <Button variant="secondary" className="misma-plugin-provider-action" onClick={() => void continueToProvider()} disabled={busy}>{busy ? "Opening…" : "Continue to " + manifest.name + " ↗"}</Button>}
          {!connection && !canAuthorize && <span className="misma-plugin-unavailable-note">{manifest.authType === "oauth_pending" ? "Waiting for Render OAuth registration" : "Connection coming later"}</span>}
        </div>
      </StickyActionBar>
      <PluginConnectConsent manifest={manifest} workspaceId={workspaceId} open={consentOpen} onClose={() => setConsentOpen(false)} />
      <PluginSettingsSheet
        open={settingsOpen}
        manifests={pluginList}
        connections={allConnections}
        workspaceId={workspaceId}
        userId={userId}
        initialProvider={manifest.id}
        linkedProjects={linkedProjects}
        onClose={() => setSettingsOpen(false)}
        onReconnect={(provider) => { setSettingsOpen(false); setConsentOpen(true); }}
        onUninstall={async (provider) => {
          const selected = allConnections.find((item) => item.provider === provider && item.status === "connected");
          if (!selected || !workspaceId) return;
          if (!window.confirm("Uninstall " + provider + " from this Misma workspace?")) return;
          const { error: invokeError } = await supabase.functions.invoke("misma-platform-integrations", { body: { action: "platform-disconnect", workspaceId, provider, platformConnectionId: selected.id } });
          if (invokeError) setError(invokeError.message || "Could not uninstall plugin.");
          else { setAllConnections((items) => items.map((item) => item.id === selected.id ? { ...item, status: "disconnected" } : item)); setConnection(null); setSettingsOpen(false); }
        }}
      />
    </main>
  );
}
