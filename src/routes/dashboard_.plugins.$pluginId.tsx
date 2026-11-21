import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type CSSProperties } from "react";
import { getSupabaseClient } from "../lib/supabase";
import { getPluginAuthorizationUrl, getPluginWorkspaceContext, openPluginInChat } from "../lib/plugin-connect";
import { getPluginManifest, type PluginId } from "../lib/plugin-manifests";
import { PluginProviderLogo } from "../components/plugin-provider-logo";
import { PluginConnectConsent } from "../components/plugin-connect-consent";
import type { PluginConnectionSummary } from "../components/plugin-settings-sheet";
import { Badge, Button, SectionHeader, StickyActionBar } from "../components/misma-glass";

export const Route = createFileRoute("/dashboard/plugins/$pluginId")({ component: PluginDetailPage });

function ExamplePreview({ kind, provider, title, description }: { kind: string; provider: PluginId; title: string; description: string }) {
  const examples = kind === "repository"
    ? [{ title: "src", detail: "Application code", icon: "folder" }, { title: "public", detail: "Static assets", icon: "folder" }, { title: "index.html", detail: "Widget installation point", icon: "file" }]
    : kind === "services"
      ? [{ title: "web-frontend", detail: "Web service", icon: "service" }, { title: "api-service", detail: "Web service", icon: "service" }, { title: "background-worker", detail: "Worker", icon: "service" }]
      : [{ title: "storefront-web", detail: "Production project", icon: "project" }, { title: "business-landing", detail: "Preview project", icon: "project" }, { title: "customer-portal", detail: "Preview project", icon: "project" }];
  return (
    <div className={"misma-plugin-example-slide is-" + provider}>
      <div className="misma-plugin-example-art">
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
          </div>
        </div>
      </div>
      <div className="misma-plugin-example-copy"><strong>{title}</strong><p>{description}</p></div>
    </div>
  );
}


export function PluginDetailPage() {
  const { pluginId } = Route.useParams();
  return <PluginDetailContent pluginId={pluginId} />;
}

export function VercelPluginDetailPage() {
  return <PluginDetailContent pluginId="vercel" />;
}

function PluginDetailContent({ pluginId: rawPluginId }: { pluginId: string }) {
  const manifest = getPluginManifest(rawPluginId);
  const supabase = getSupabaseClient();
  const [workspaceId, setWorkspaceId] = useState("");
  const [connection, setConnection] = useState<PluginConnectionSummary | null>(null);
  const [accountLabel, setAccountLabel] = useState("");
  const [websiteId, setWebsiteId] = useState("");
  const [expandedDescription, setExpandedDescription] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    if (!manifest) return () => { active = false; };
    const requestedWebsite = new URLSearchParams(window.location.search).get("websiteId") || window.sessionStorage.getItem("misma_plugins_website_id") || "";
    setWebsiteId(requestedWebsite);
    void (async () => {
      try {
        const context = await getPluginWorkspaceContext(requestedWebsite);
        const [connectionResult, pluginResult] = await Promise.all([
          supabase.from("platform_connections")
            .select("id,provider,external_account_name,status,updated_at,created_at,workspace_id")
            .in("workspace_id", context.workspaceIds).eq("provider", manifest.id)
            .order("updated_at", { ascending: false }),
          supabase.from("user_plugins")
            .select("is_installed,account_label").eq("user_id", context.user.id).eq("provider", manifest.id).maybeSingle(),
        ]);
        if (connectionResult.error) throw connectionResult.error;
        if (pluginResult.error) throw pluginResult.error;
        if (!active) return;
        const connectedRow = (connectionResult.data || []).find((item) => item.status === "connected");
        setWorkspaceId(String((connectedRow as { workspace_id?: string } | undefined)?.workspace_id || context.workspaceId));
        setAccountLabel(String(pluginResult.data?.account_label || ""));
        const isInstalled = pluginResult.data?.is_installed === true;
        setConnection(isInstalled ? (connectedRow as PluginConnectionSummary | undefined) || null : null);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load plugin details.");
      }
    })();
    return () => { active = false; };
  }, [supabase, manifest?.id]);

  if (!manifest) {
    return <main className="misma-plugin-detail-page"><div className="misma-plugin-detail-shell"><p>This plugin could not be found.</p><Button onClick={() => window.location.assign("/dashboard/plugins")}>Back to Plugins</Button></div></main>;
  }

  const activeManifest = manifest;
  const canAuthorize = activeManifest.authType === "github_app" || activeManifest.authType === "vercel_marketplace_oauth" || activeManifest.authType === "netlify_oauth";
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
  function tryInChat(prompt = "@" + activeManifest.id + " ") {
    openPluginInChat(activeManifest.id, websiteId, prompt);
  }
  const examplePrompts = activeManifest.id === "github" ? [
    "@GitHub Inject the Misma chat widget script into my website repo and prepare a pull request",
    "@GitHub Explain this repo's authentication flow and file structure",
    "@GitHub Review recent commits and summarize the changes",
  ] : activeManifest.id === "vercel" ? [
    "@Vercel Show the projects available in my connected account",
    "@Vercel Find the project associated with my Misma website",
    "@Vercel Summarize the repository and framework metadata for a selected project",
  ] : activeManifest.id === "render" ? [
    "@Render Show how my services will be associated with Misma websites",
    "@Render Explain the service information Misma will access after authorization",
    "@Render Prepare a checklist for connecting my hosting services",
  ] : [
    "@Netlify Show how authorized sites will appear in my Misma workspace",
    "@Netlify Prepare a checklist for connecting a site",
    "@Netlify Explain the information needed for site discovery",
  ];
  function connectAction() {
    setError("");
    setConsentOpen(true);
  }

  const primaryAction = connection ? (
    <Button className="misma-plugin-detail-primary" onClick={() => tryInChat()}>Try in chat</Button>
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
            <button type="button" className="misma-page-back-button" onClick={backToPlugins} aria-label="Back to Plugins"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18 9 12l6-6M9 12h12"/></svg></button>
            <h1>{manifest.name}</h1>
            <button type="button" className="misma-plugin-detail-settings" aria-label="Plugin settings" onClick={() => window.location.assign("/dashboard/plugins/" + manifest.id + "/settings")}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .4 1.9l.1.1-2.4 2.4-.1-.1a1.7 1.7 0 0 0-1.9-.4 1.7 1.7 0 0 0-1 1.6v.2h-3.4v-.2a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.4l-.1.1-2.4-2.4.1-.1a1.7 1.7 0 0 0 .4-1.9 1.7 1.7 0 0 0-1.6-1H4v-3.4h.2a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.4-1.9l-.1-.1 2.4-2.4.1.1a1.7 1.7 0 0 0 1.9.4 1.7 1.7 0 0 0 1-1.6V4h3.4v.2a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.4l.1-.1 2.4 2.4-.1.1a1.7 1.7 0 0 0-.4 1.9 1.7 1.7 0 0 0 1.6 1h.2v3.4H21a1.7 1.7 0 0 0-1.6 1Z"/></svg>
            </button>
          </header>
          <div className="misma-plugin-identity">
            <PluginProviderLogo provider={manifest.id} size="lg" />
            <div><strong>{manifest.name}</strong><small>By {manifest.developer}</small></div>
            <Badge tone={connection ? "success" : manifest.status === "coming" || manifest.authType === "oauth_pending" ? "warning" : "neutral"}>{connection ? "Connected" : manifest.status === "coming" || manifest.authType === "oauth_pending" ? "Unavailable" : "Not connected"}</Badge>
          </div>
  
          <div className="misma-plugin-preview-scroller">
            {manifest.previewCards.map((card) => <div className="misma-plugin-preview-item" key={card.id}><ExamplePreview kind={card.kind} provider={manifest.id} title={card.title} description={card.description}/></div>)}
          </div>
          <div className="misma-plugin-gallery-hint" aria-hidden="true"><span/><span/></div>
        </section>        <section className="misma-plugin-description-section">
          <p className={"misma-plugin-detail-description" + (expandedDescription ? " is-expanded" : "")}>{manifest.description}</p>
          <button type="button" className="misma-plugin-more-link" aria-expanded={expandedDescription} onClick={() => setExpandedDescription((value) => !value)}>{expandedDescription ? "Less" : "More"}</button>
        </section>

        <section className="misma-plugin-prompt-showcase">
          <h2>Try an example</h2>
          <div className="misma-plugin-prompt-list">
            {examplePrompts.map((prompt) => (
              <button type="button" className="misma-plugin-prompt-card" key={prompt} disabled={!connection} onClick={() => tryInChat(prompt)}>
                <span>{prompt}</span><b aria-hidden="true">→</b>
              </button>
            ))}
          </div>
        </section>

        <section className="misma-plugin-detail-section misma-plugin-connected-accounts">
          <SectionHeader title="Apps" />
          <div className="misma-plugin-connected-account-row">
            <PluginProviderLogo provider={manifest.id} size="md" />
            <div><strong>{accountLabel || connection?.external_account_name || manifest.name + " account"}</strong><small>{connection ? "Primary connected account" : "No account connected yet"}</small></div>
            <Badge tone={connection ? "success" : "neutral"}>{connection ? "Connected" : "Not connected"}</Badge>
          </div>
        </section>

        <section className="misma-plugin-detail-section misma-plugin-app-section">
          <SectionHeader title="App" />
          <div className="misma-plugin-app-row"><PluginProviderLogo provider={manifest.id} size="lg"/><div><strong>{manifest.name}</strong><small>{manifest.role === "Code host" ? "Code host" : "Primary"}</small></div></div>
        </section>        <section className="misma-plugin-detail-section misma-plugin-skill-section">
          <SectionHeader title="Skill" />
          <div className="misma-plugin-skills-grid">
            {manifest.skills.map((skill) => <span className="misma-plugin-skill-chip" key={skill.id}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2.8 8.2 4.6v9.2L12 21.2l-8.2-4.6V7.4L12 2.8Z"/><path d="m3.8 7.4 8.2 4.7 8.2-4.7M12 12.1v9.1M8 5l8.2 4.7"/></svg><span>{skill.name}</span></span>)}
          </div>
        </section>        <section className="misma-plugin-detail-section misma-plugin-information-section">
          <SectionHeader title="Information" />
          <dl className="misma-plugin-information">
            <div><dt>Capabilities</dt><dd>{manifest.skills.map((skill) => skill.name).join(" · ")}</dd></div>
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

    </main>
  );
}
