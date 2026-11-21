import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "../lib/supabase";
import { PluginBrand } from "../components/plugin-brand";
import { PLUGIN_MANIFESTS, type PluginId } from "../lib/plugin-registry";

export const Route = createFileRoute("/dashboard/plugins")({ component: PluginsPage });

type Provider = "github" | "vercel" | "render" | "netlify";
type Workspace = { id: string; name: string };
type Connection = {
  id: string;
  provider: Provider;
  external_account_name: string | null;
  status: string;
  updated_at: string;
};
type Website = { id: string; name: string; domain: string; website_url: string; status: string };
type PlatformProject = {
  id: string;
  platform_connection_id: string;
  name: string;
  full_name: string | null;
  repository_url: string | null;
  dashboard_url: string | null;
  default_branch: string | null;
  metadata: Record<string, unknown> | null;
};

const plugins: Array<{
  id: Provider;
  name: string;
  publisher: string;
  category: string;
  availability: "available" | "coming";
}> = [
  {
    id: "github", name: "GitHub", publisher: "Misma", category: "Developer",
    availability: "available",
  },
  {
    id: "vercel", name: "Vercel", publisher: "Vercel", category: "Hosting",
    availability: "available",
  },
  {
    id: "render", name: "Render", publisher: "Render", category: "Hosting",
    availability: "available",
  },
  {
    id: "netlify", name: "Netlify", publisher: "Netlify", category: "Hosting",
    availability: "coming",
  },
];

function ProviderLogo({ provider }: { provider: Provider }) {
  const labels: Record<Provider, string> = {
    github: "GitHub", vercel: "Vercel", render: "Render", netlify: "Netlify",
  };
  const paths: Record<Provider, string> = {
    github: "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12",
    vercel: "m12 1.608 12 20.784H0Z",
    netlify: "m9.793 12.405 10.299 3.13c.347.106.561.053.775-.161l2.943-2.916a.616.616 0 0 0 0-.91l-2.943-2.915c-.214-.214-.428-.268-.776-.161l-10.298 3.13c-.428.133-.428.668 0 .802m-1.846 1.391L7.92 19.36c0 .562.107.855.374 1.123l3.29 3.316c.268.268.589.268.83 0l2.835-2.835c.268-.267.268-.562 0-.83l-6.607-6.606c-.294-.295-.695-.134-.695.267m0-3.585c-.027.402.401.562.696.268l6.607-6.607c.267-.268.267-.589 0-.83L12.415.18c-.24-.24-.562-.24-.83 0l-3.29 3.317c-.267.267-.374.481-.374.83zm-4.092 5.03c-.268.268-.562.268-.83 0L.19 12.405c-.267-.24-.267-.562 0-.83L3.025 8.74c.268-.267.562-.267.83 0l2.835 2.835c.267.268.267.589 0 .83z",
    render: "M18.263.007c-3.121-.147-5.744 2.109-6.192 5.082-.018.138-.045.272-.067.405-.696 3.703-3.936 6.507-7.827 6.507-1.388 0-2.691-.356-3.825-.979a.2024.2024 0 0 0-.302.178V24H12v-8.999c0-1.656 1.338-3 2.987-3h2.988c3.382 0 6.103-2.817 5.97-6.244-.12-3.084-2.61-5.603-5.682-5.75",
  };
  return (
    <span className={"misma-plugin-mark is-" + provider} role="img" aria-label={labels[provider] + " logo"}>
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d={paths[provider]} /></svg>
    </span>
  );
}

function PluginsPage() {
  const supabase = getSupabaseClient();
  const [workspaceId, setWorkspaceId] = useState("");
  const [connections, setConnections] = useState<Connection[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Provider | null>(null);
  const [consentProvider, setConsentProvider] = useState<Provider | null>(null);
  const [currentUser, setCurrentUser] = useState<{ id: string; email: string; name: string; avatar: string | null } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pluginMenuOpen, setPluginMenuOpen] = useState<Provider | null>(null);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [renderConfigLoading, setRenderConfigLoading] = useState(false);
  const [renderWebsites, setRenderWebsites] = useState<Website[]>([]);
  const [renderProjects, setRenderProjects] = useState<PlatformProject[]>([]);
  const [renderWebsiteId, setRenderWebsiteId] = useState("");
  const [renderProjectId, setRenderProjectId] = useState("");
  const [renderProjectSearch, setRenderProjectSearch] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) throw new Error("Sign in to view plugins.");
        if (alive) setCurrentUser({ id: user.id, email: user.email || "", name: String(user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || "Misma user"), avatar: typeof user.user_metadata?.avatar_url === "string" ? user.user_metadata.avatar_url : null });
        const { data: memberships, error: membershipError } = await supabase
          .from("workspace_members").select("workspace_id,role").eq("user_id", user.id);
        if (membershipError) throw membershipError;
        const ids = [...new Set((memberships || []).filter((row) => ["owner", "admin"].includes(String(row.role))).map((row) => String(row.workspace_id)))];
        let options: Workspace[] = [];
        if (ids.length) {
          const { data, error: workspaceError } = await supabase.from("workspaces")
            .select("id,name").in("id", ids).order("created_at", { ascending: true });
          if (workspaceError) throw workspaceError;
          options = (data || []) as Workspace[];
        }
        if (alive) {
          const saved = window.sessionStorage.getItem("misma_integrations_workspace");
          const initial = options.find((item) => item.id === saved) || options[0] || null;
          setWorkspaceId(initial?.id || "");
          if (initial?.id) window.sessionStorage.setItem("misma_integrations_workspace", initial.id);
        }
      } catch (cause) {
        if (alive) setError(cause instanceof Error ? cause.message : "Could not load your workspaces.");
      } finally {
      }
    })();
    return () => { alive = false; };
  }, [supabase]);

  useEffect(() => {
    let alive = true;
    if (!workspaceId) {
      setConnections([]);
      return () => { alive = false; };
    }
    void (async () => {
      try {
        const { data, error: connectionError } = await supabase.from("platform_connections")
          .select("id,provider,external_account_name,status,updated_at")
          .eq("workspace_id", workspaceId).order("updated_at", { ascending: false });
        if (connectionError) throw connectionError;
        if (alive) setConnections((data || []) as Connection[]);
      } catch (cause) {
        if (alive) setError(cause instanceof Error ? cause.message : "Could not load installed plugins.");
      } finally {
      }
    })();
    return () => { alive = false; };
  }, [supabase, workspaceId]);

  const installedByProvider = useMemo(() => {
    const map = new Map<Provider, Connection>();
    for (const item of connections) {
      if (item.status === "connected" && !map.has(item.provider)) map.set(item.provider, item);
    }
    return map;
  }, [connections]);

  const visiblePlugins = useMemo(() => plugins.filter((plugin) => {
    const searchable = [plugin.name, plugin.category].join(" ").toLowerCase();
    return !query.trim() || searchable.includes(query.trim().toLowerCase());
  }), [query]);

  async function disconnect(plugin: Provider) {
    const connection = installedByProvider.get(plugin);
    if (!connection || !workspaceId || busy) return;
    const descriptor = plugins.find((item) => item.id === plugin);
    const confirmed = window.confirm("Disconnect " + descriptor?.name + " from this Misma workspace? Existing code and deployments will not be deleted.");
    if (!confirmed) return;
    setBusy(plugin);
    setError("");
    setNotice("");
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("misma-platform-integrations", {
        body: { action: "platform-disconnect", workspaceId, provider: plugin, platformConnectionId: connection.id },
      });
      if (invokeError) throw new Error(invokeError.message || "Could not disconnect this plugin.");
      if (data?.error) throw new Error(String(data.error));
      setConnections((current) => current.map((item) => item.id === connection.id ? { ...item, status: "disconnected" } : item));
      setNotice(descriptor?.name + " is disconnected from this workspace.");
      setSelected(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not disconnect this plugin.");
    } finally {
      setBusy("");
    }
  }

  async function startPluginConnection(plugin: Provider) {
    if (!workspaceId || busy) {
      if (!workspaceId) setError("Choose a Misma workspace first.");
      return;
    }
    setBusy(plugin);
    setError("");
    setNotice("");
    try {
      if (plugin === "github" || plugin === "vercel") {
        const action = plugin === "github" ? "github-install-url" : "vercel-install-url";
        const { data, error: invokeError } = await supabase.functions.invoke("misma-platform-integrations", {
          body: { action, workspaceId },
        });
        if (invokeError) throw new Error(invokeError.message || "Could not start the " + plugin + " connection.");
        if (data?.error) throw new Error(String(data.error));
        const installUrl = typeof data?.installUrl === "string" ? data.installUrl : "";
        const validUrl = plugin === "github"
          ? installUrl.startsWith("https://github.com/")
          : installUrl.startsWith("https://vercel.com/integrations/");
        if (!validUrl) throw new Error("Misma did not return a valid " + plugin + " authorization link.");
        window.location.assign(installUrl);
        return;
      }

      if (plugin === "render") {
        throw new Error("Render sign-in is not available for third-party apps yet. Misma needs its own OAuth client registration from Render. No API key is requested here.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not connect this plugin.");
    } finally {
      setBusy("");
    }
  }

  function connectPlugin(plugin: Provider) {
    if (plugin === "netlify") return;
    setConsentProvider(plugin);
    setPluginMenuOpen(null);
  }

  async function confirmPluginConnection() {
    if (!consentProvider) return;
    const provider = consentProvider;
    setConsentProvider(null);
    await startPluginConnection(provider);
  }

  const selectedPlugin = plugins.find((plugin) => plugin.id === selected) || null;
  const selectedConnection = selected ? installedByProvider.get(selected) : null;

  const filteredRenderProjects = renderProjects.filter((project) =>
    (project.name + " " + (project.full_name || "")).toLowerCase().includes(renderProjectSearch.trim().toLowerCase())
  );
  const visibleRenderProjects = filteredRenderProjects.length ? filteredRenderProjects : renderProjects;

  async function loadRenderConfiguration(connectionId: string) {
    if (!workspaceId || !connectionId) return;
    setRenderConfigLoading(true);
    try {
      const [websiteResult, projectResult] = await Promise.all([
        supabase.from("website_connections")
          .select("id,name,domain,website_url,status")
          .eq("workspace_id", workspaceId)
          .is("widget_deleted_at", null)
          .order("created_at", { ascending: false }),
        supabase.from("platform_projects")
          .select("id,platform_connection_id,name,full_name,repository_url,dashboard_url,default_branch,metadata")
          .eq("workspace_id", workspaceId)
          .eq("provider", "render")
          .order("name", { ascending: true }),
      ]);
      if (websiteResult.error) throw websiteResult.error;
      if (projectResult.error) throw projectResult.error;
      setRenderWebsites((websiteResult.data || []) as Website[]);
      setRenderProjects(((projectResult.data || []) as PlatformProject[]).filter((project) => project.platform_connection_id === connectionId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load Render services and websites.");
    } finally {
      setRenderConfigLoading(false);
    }
  }

  async function refreshRenderProjects() {
    if (!workspaceId || !selectedConnection || selectedConnection.provider !== "render") return;
    setBusy("render");
    setError("");
    setNotice("");
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("misma-platform-integrations", {
        body: { action: "render-refresh-projects", workspaceId, platformConnectionId: selectedConnection.id },
      });
      if (invokeError) throw new Error(invokeError.message || "Could not refresh Render services.");
      if (data?.error) throw new Error(String(data.error));
      setRenderProjects(Array.isArray(data?.projects) ? data.projects as PlatformProject[] : []);
      setRenderProjectId("");
      setNotice("Render services refreshed.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not refresh Render services.");
    } finally {
      setBusy("");
    }
  }

  async function linkRenderProject() {
    if (!workspaceId || !renderProjectId || !renderWebsiteId) {
      setError("Choose a Render service and a Misma website.");
      return;
    }
    setBusy("render-link");
    setError("");
    setNotice("");
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("misma-platform-integrations", {
        body: { action: "render-link-project", workspaceId, platformProjectId: renderProjectId, websiteConnectionId: renderWebsiteId },
      });
      if (invokeError) throw new Error(invokeError.message || "Could not associate the Render service.");
      if (data?.error) throw new Error(String(data.error));
      setNotice(data?.alreadyLinked
        ? "This Render service is already associated with that website."
        : "Render service associated with the selected Misma website.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not associate the Render service.");
    } finally {
      setBusy("");
    }
  }

  useEffect(() => {
    if (selected === "render" && selectedConnection?.provider === "render" && workspaceId) {
      void loadRenderConfiguration(selectedConnection.id);
    }
  }, [selected, selectedConnection?.id, workspaceId]);

  return (
    <main className="misma-marketplace-page">
      <div className="misma-marketplace-shell">
        <header className="misma-marketplace-header misma-marketplace-header-simple">
          <div className="misma-marketplace-title-group">
            <button type="button" className="misma-marketplace-back-button" aria-label="Go to previous page" title="Go back" onClick={() => {
              if (window.history.length > 1) window.history.back();
              else window.location.assign("/dashboard");
            }}>
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15 18 9 12l6-6M9 12h12" /></svg>
            </button>
            <h1>Plugins</h1>
          </div>
          <button type="button" className="misma-marketplace-settings-button" aria-label="Plugin permissions settings" onClick={() => setSettingsOpen(true)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.4 1.1-1.7 3-1.7-.7a7.6 7.6 0 0 1-1.5.9l-.3 1.8h-3.5l-.3-1.8a7.6 7.6 0 0 1-1.5-.9l-1.7.7-1.7-3 1.4-1.1a7.8 7.8 0 0 1 0-1.8l-1.4-1.1 1.7-3 1.7.7a7.6 7.6 0 0 1 1.5-.9l.3-1.8h3.5l.3 1.8a7.6 7.6 0 0 1 1.5.9l1.7-.7 1.7 3-1.4 1.1a7.8 7.8 0 0 1 0 1.8Z"/></svg>
          </button>
        </header>

        <label className="misma-marketplace-search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></svg>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search plugins..." aria-label="Search plugins" />
          {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search">×</button>}
        </label>

        <section className="misma-plugin-installed" aria-label="Installed plugins">
          <div className="misma-plugin-section-heading"><h2>Installed</h2><span>{installedByProvider.size}</span></div>
          {installedByProvider.size ? (
            <div className="misma-plugin-installed-strip">
              {Array.from(installedByProvider.keys()).map((provider) => (
                <button type="button" key={provider} aria-label={"Open " + provider + " plugin"} title={provider} onClick={() => window.location.assign("/dashboard/plugins/" + provider)}>
                  <PluginBrand provider={provider as PluginId} size="large" />
                </button>
              ))}
            </div>
          ) : <p className="misma-plugin-installed-empty">Your connected plugins will appear here.</p>}
        </section>

        <div className="misma-plugin-section-heading misma-plugin-available-heading"><h2>Available</h2><span>{visiblePlugins.length}</span></div>
        {notice && <p className="misma-marketplace-feedback is-success" role="status">{notice}</p>}
        {error && <p className="misma-marketplace-feedback is-error" role="alert">{error}</p>}

        <section className="misma-plugin-list" aria-label="Plugins">
          {visiblePlugins.map((plugin) => {
            const connection = installedByProvider.get(plugin.id);
            const menuOpen = pluginMenuOpen === plugin.id;
            return <article className="misma-plugin-row" key={plugin.id}>
              <button type="button" className="misma-plugin-row-main" onClick={() => window.location.assign("/dashboard/plugins/" + plugin.id)} aria-label={"View " + plugin.name + " details"}>
                <PluginBrand provider={plugin.id} size="large" />
                <span className="misma-plugin-row-copy">
                  <span className="misma-plugin-row-name">{plugin.name}</span>
                  <span className="misma-plugin-row-description">{PLUGIN_MANIFESTS[plugin.id].tagline}</span>
                  <span className={"misma-plugin-status " + (connection ? "is-connected" : plugin.availability === "coming" ? "is-coming" : "is-not-connected")}>{connection ? "Connected" : plugin.availability === "coming" ? "Coming later" : "Not connected"}</span>
                </span>
              </button>
              {connection ? (
                <div className="misma-plugin-row-actions">
                  <button type="button" className="misma-plugin-more" aria-label={plugin.name + " options"} aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setPluginMenuOpen(menuOpen ? null : plugin.id)}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>
                  </button>
                  {menuOpen && <div className="misma-plugin-context-menu" role="menu" aria-label={plugin.name + " options"}>
                    <button type="button" role="menuitem" onClick={() => {
                      window.sessionStorage.setItem("misma_try_plugin_provider", plugin.id);
                      setPluginMenuOpen(null);
                      window.location.assign("/dashboard");
                    }}>
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5a2 2 0 0 1 3.1-1.7l8 5.2a3.5 3.5 0 0 1 0 5.9l-8 5.2A2 2 0 0 1 8 18.4Z"/></svg><span>Try now</span>
                    </button>
                    <button type="button" role="menuitem" onClick={() => { window.location.assign("/dashboard/plugins/" + plugin.id + "?settings=1"); setPluginMenuOpen(null); }}>
                      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19 15.5 20 17l-3 3-1.5-1a2 2 0 0 0-2.5 1V22h-4v-2a2 2 0 0 0-2.5-1L5 20l-3-3 1-1.5A2 2 0 0 0 2 13H1v-4h2a2 2 0 0 0 1-2.5L3 5l3-3 1.5 1A2 2 0 0 0 10 2V1h4v2a2 2 0 0 0 2.5 1L18 3l3 3-1 1.5A2 2 0 0 0 21 10h2v4h-2a2 2 0 0 0-2 1.5Z"/></svg><span>Settings</span>
                    </button>
                    <div className="misma-plugin-context-divider" />
                    <button type="button" role="menuitem" className="is-danger" onClick={() => { setPluginMenuOpen(null); void disconnect(plugin.id); }}>
                      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 12h8"/></svg><span>Uninstall</span>
                    </button>
                  </div>}
                </div>
              ) : plugin.availability === "coming" ? (
                <button type="button" className="misma-plugin-info" aria-label={plugin.name + " information"} onClick={() => window.location.assign("/dashboard/plugins/" + plugin.id)}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>
                </button>
              ) : (
                <button type="button" className="misma-plugin-add" aria-label={"Connect " + plugin.name} title={plugin.availability === "coming" ? "Coming soon" : "Connect " + plugin.name} disabled={plugin.availability === "coming" || busy === plugin.id} onClick={() => void connectPlugin(plugin.id)}>
                  {busy === plugin.id ? "…" : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>}
                </button>
              )}
            </article>;
          })}
        </section>
      </div>

      {consentProvider && (
        <div className="misma-plugin-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setConsentProvider(null); }}>
          <section className="misma-plugin-modal misma-plugin-consent" role="dialog" aria-modal="true" aria-labelledby="misma-plugin-consent-title">
            <button type="button" className="misma-plugin-modal-close" aria-label="Close consent" onClick={() => setConsentProvider(null)}>×</button>
            <div className="misma-plugin-modal-heading"><PluginBrand provider={consentProvider} size="large" /><div><h2 id="misma-plugin-consent-title">Use Misma to connect {consentProvider[0].toUpperCase() + consentProvider.slice(1)}</h2><p>Review what this connection shares.</p></div></div>
            <div className="misma-plugin-consent-account">
              {currentUser?.avatar ? <img src={currentUser.avatar} alt="" /> : <span>{(currentUser?.name || "M").slice(0,1).toUpperCase()}</span>}
              <div><strong>{currentUser?.name || "Misma account"}</strong><small>{currentUser?.email || "Signed-in Misma account"}</small></div>
            </div>
            <div className="misma-plugin-permissions">
              <h3>What Misma will be able to do</h3>
              <ul>{PLUGIN_MANIFESTS[consentProvider].permissions.map((permission) => <li key={permission}>{permission}</li>)}</ul>
              <p>{PLUGIN_MANIFESTS[consentProvider].never.join(" ")}</p>
            </div>
            {consentProvider === "render" && <p className="misma-plugin-coming-note">Render account sign-in is awaiting a Render-issued OAuth client for Misma. No customer API key will be requested.</p>}
            <div className="misma-plugin-modal-actions">
              <button type="button" className="misma-plugin-secondary" onClick={() => setConsentProvider(null)}>Cancel</button>
              <button type="button" className="misma-plugin-primary" disabled={consentProvider === "render" || busy === consentProvider} onClick={() => void confirmPluginConnection()}>{busy === consentProvider ? "Connecting…" : "Connect"}</button>
            </div>
          </section>
        </div>
      )}

      {settingsOpen && (
        <div className="misma-plugin-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsOpen(false); }}>
          <section className="misma-plugin-modal misma-plugin-permission-sheet" role="dialog" aria-modal="true" aria-labelledby="misma-plugin-permission-title">
            <button type="button" className="misma-plugin-modal-close" aria-label="Close settings" onClick={() => setSettingsOpen(false)}>×</button>
            <h2 id="misma-plugin-permission-title">Plugin permissions</h2>
            <p className="misma-plugin-modal-description">Choose how Misma should ask before using connected plugins. These preferences are saved on this device; server-enforced permission checks are part of Batch 2.</p>
            <PluginPermissionChoices storageKey="misma_plugin_permission_default_v1" />
          </section>
        </div>
      )}

      {selectedPlugin && <div className="misma-plugin-modal-backdrop" role="presentation" onMouseDown={(event) => {
        if (event.target === event.currentTarget) setSelected(null);
      }}>
        <section className="misma-plugin-modal" role="dialog" aria-modal="true" aria-labelledby="misma-plugin-modal-title">
          <button type="button" className="misma-plugin-modal-close" aria-label="Close details" onClick={() => setSelected(null)}>×</button>
          <div className="misma-plugin-modal-heading">
            <ProviderLogo provider={selectedPlugin.id} />
            <div><h2 id="misma-plugin-modal-title">{selectedPlugin.name}</h2></div>
          </div>
          {selectedPlugin.availability === "coming" ? (
            <p className="misma-plugin-modal-description">This connection is not available yet.</p>
          ) : selectedConnection ? (
            <div className="misma-plugin-connected-state">
              <span className="misma-plugin-status is-connected">Connected</span>
              <strong>{selectedConnection.external_account_name || selectedPlugin.name + " account"}</strong>
            </div>
          ) : selectedPlugin.id === "render" ? (
            <p className="misma-plugin-modal-description">Render sign-in for third-party apps requires a Render-issued OAuth client. Misma does not currently have one. You will not be asked to paste an API key.</p>
          ) : (
            <p className="misma-plugin-modal-description">Connect your {selectedPlugin.name} account to Misma.</p>
          )}
          {selectedPlugin.id === "render" && selectedConnection && (
            <div className="misma-plugin-render-config">
              <div className="misma-plugin-render-heading">
                <div><h3>Render deployment target</h3><p>Choose which Render service belongs to a Misma website.</p></div>
                <button type="button" onClick={() => void refreshRenderProjects()} disabled={busy === "render"}>{busy === "render" ? "Refreshing…" : "Refresh services"}</button>
              </div>
              {renderConfigLoading ? <p className="misma-plugin-render-hint">Loading your websites and Render services…</p> : (
                <>
                  <label className="misma-plugin-credential-field">
                    <span>Misma website</span>
                    <select value={renderWebsiteId} onChange={(event) => setRenderWebsiteId(event.target.value)}>
                      <option value="">Choose a connected website</option>
                      {renderWebsites.map((website) => <option key={website.id} value={website.id}>{website.name || website.domain} · {website.domain}</option>)}
                    </select>
                  </label>
                  <label className="misma-plugin-credential-field">
                    <span>Search Render services</span>
                    <input value={renderProjectSearch} onChange={(event) => setRenderProjectSearch(event.target.value)} placeholder="Search by service or repository name" />
                  </label>
                  <label className="misma-plugin-credential-field">
                    <span>Render service</span>
                    <select value={renderProjectId} onChange={(event) => setRenderProjectId(event.target.value)}>
                      <option value="">Choose a Render service</option>
                      {visibleRenderProjects.map((project) => <option key={project.id} value={project.id}>{project.name}{project.full_name && project.full_name !== project.name ? " · " + project.full_name : ""}</option>)}
                    </select>
                  </label>
                  {!renderWebsites.length && <p className="misma-plugin-render-hint">Add a website in Misma before linking a Render service.</p>}
                  {!renderProjects.length && <p className="misma-plugin-render-hint">No Render services are stored yet. Refresh services to discover the services accessible to this account.</p>}
                  {renderProjectSearch.trim() && !filteredRenderProjects.length && <p className="misma-plugin-render-hint">No service matched that search. The accessible service list is shown instead.</p>}
                  <button type="button" className="misma-plugin-primary" disabled={busy === "render-link" || !renderWebsiteId || !renderProjectId} onClick={() => void linkRenderProject()}>{busy === "render-link" ? "Saving…" : "Use selected service"}</button>
                </>
              )}
            </div>
          )}
          {error && <p className="misma-plugin-modal-feedback is-error" role="alert">{error}</p>}
          {notice && <p className="misma-plugin-modal-feedback" role="status">{notice}</p>}
          <div className="misma-plugin-modal-actions">
            {selectedPlugin.availability !== "coming" && !selectedConnection && selectedPlugin.id !== "render" && <button type="button" className="misma-plugin-primary" disabled={busy === selectedPlugin.id} onClick={() => void connectPlugin(selectedPlugin.id)}>Connect</button>}
            {selectedConnection && <button type="button" className="misma-plugin-danger" disabled={busy === selectedPlugin.id} onClick={() => void disconnect(selectedPlugin.id)}>Uninstall</button>}
          </div>
        </section>
      </div>}
    </main>
  );
}
