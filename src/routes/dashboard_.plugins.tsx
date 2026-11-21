import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "../lib/supabase";

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
  description: string;
  purpose: string;
  permissions: string[];
  availability: "available" | "coming";
}> = [
  {
    id: "github", name: "GitHub", publisher: "Misma", category: "Developer",
    description: "Connect repositories and let Misma understand and prepare focused code changes.",
    purpose: "Code & Repository Management",
    permissions: ["Read repositories available to your GitHub App installation.", "Inspect repository structure and supported website entry points.", "Create a dedicated branch and prepare a pull request for widget changes.", "Merge changes only through an explicitly approved workflow."],
    availability: "available",
  },
  {
    id: "vercel", name: "Vercel", publisher: "Vercel", category: "Hosting",
    description: "Discover projects, associate the correct project with a Misma website, and monitor deployments.",
    purpose: "Deployment & Hosting",
    permissions: ["Read projects accessible to the connected account.", "Associate a selected project with a Misma workspace website.", "Trigger or monitor supported deployments after an approved repository change."],
    availability: "available",
  },
  {
    id: "render", name: "Render", publisher: "Render", category: "Hosting",
    description: "Connect a Render account, find web services and static sites, and manage deploy targets.",
    purpose: "Deployment & Hosting",
    permissions: ["Validate your customer-owned Render API key.", "Discover services and static sites exposed by that key.", "Associate the chosen service with a Misma website and monitor deployment status."],
    availability: "available",
  },
  {
    id: "netlify", name: "Netlify", publisher: "Netlify", category: "Hosting",
    description: "Prepare to connect sites and publishing workflows through your Netlify account.",
    purpose: "Deployment & Hosting",
    permissions: ["Planned: discover authorized Netlify sites and build configuration.", "Planned: trigger and monitor builds for the selected site."],
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
  const [loading, setLoading] = useState(true);
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [connections, setConnections] = useState<Connection[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"All" | "Installed" | "Developer & Hosting">("All");
  const [selected, setSelected] = useState<Provider | null>(null);
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
      setWorkspaceLoading(true);
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) throw new Error("Sign in to manage plugins.");
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
          setWorkspaces(options);
          const saved = window.sessionStorage.getItem("misma_integrations_workspace");
          const initial = options.find((item) => item.id === saved) || options[0] || null;
          setWorkspaceId(initial?.id || "");
          if (initial?.id) window.sessionStorage.setItem("misma_integrations_workspace", initial.id);
        }
      } catch (cause) {
        if (alive) setError(cause instanceof Error ? cause.message : "Could not load your workspaces.");
      } finally {
        if (alive) setWorkspaceLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [supabase]);

  useEffect(() => {
    let alive = true;
    if (!workspaceId) {
      setConnections([]);
      setLoading(false);
      return () => { alive = false; };
    }
    setLoading(true);
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
        if (alive) setLoading(false);
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
    const installed = installedByProvider.has(plugin.id);
    const searchable = [plugin.name, plugin.description, plugin.category, plugin.purpose].join(" ").toLowerCase();
    if (query.trim() && !searchable.includes(query.trim().toLowerCase())) return false;
    if (filter === "Installed" && !installed) return false;
    if (filter === "Developer & Hosting" && !["Developer", "Hosting"].includes(plugin.category)) return false;
    return true;
  }), [filter, installedByProvider, query]);

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

  async function connectPlugin(plugin: Provider) {
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
        if (!renderApiKey.trim()) throw new Error("Enter your Render API key.");
        const { data, error: invokeError } = await supabase.functions.invoke("misma-platform-integrations", {
          body: { action: "render-connect", workspaceId, apiKey: renderApiKey.trim() },
        });
        if (invokeError) throw new Error(invokeError.message || "Could not connect Render.");
        if (data?.error) throw new Error(String(data.error));
        setRenderApiKey("");
        const { data: refreshed, error: refreshError } = await supabase.from("platform_connections")
          .select("id,provider,external_account_name,status,updated_at")
          .eq("workspace_id", workspaceId).order("updated_at", { ascending: false });
        if (refreshError) throw refreshError;
        setConnections((refreshed || []) as Connection[]);
        setNotice(String(data?.message || "Render is connected to this Misma workspace."));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not connect this plugin.");
    } finally {
      setBusy("");
    }
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
        <header className="misma-marketplace-header">
          <div className="misma-marketplace-title-group">
            <button
              type="button"
              className="misma-marketplace-back-button"
              aria-label="Go to previous page"
              title="Go back"
              onClick={() => {
                if (window.history.length > 1) window.history.back();
                else window.location.assign("/dashboard");
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15 18 9 12l6-6M9 12h12" /></svg>
            </button>
            <div>
              <h1>Plugins</h1>
              <p>Connect plugins to let Misma work across your tools and deploy your websites.</p>
            </div>
          </div>
          <label className="misma-marketplace-workspace">
            <span>Workspace</span>
            <select value={workspaceId} onChange={(event) => {
              setWorkspaceId(event.target.value);
              if (event.target.value) window.sessionStorage.setItem("misma_integrations_workspace", event.target.value);
              else window.sessionStorage.removeItem("misma_integrations_workspace");
              setNotice("");
            }} disabled={workspaceLoading || workspaces.length <= 1}>
              <option value="">Choose a workspace</option>
              {workspaces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
        </header>

        <label className="misma-marketplace-search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></svg>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search plugins..." aria-label="Search plugins" />
          {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search">×</button>}
        </label>

        <nav className="misma-marketplace-filters" aria-label="Plugin filters">
          {(["All", "Installed", "Developer & Hosting"] as const).map((item) => (
            <button key={item} type="button" className={filter === item ? "is-active" : ""} onClick={() => setFilter(item)}>{item}</button>
          ))}
        </nav>

        {notice && <p className="misma-marketplace-feedback is-success" role="status">{notice}</p>}
        {error && <p className="misma-marketplace-feedback is-error" role="alert">{error}</p>}

        <section className="misma-installed-section">
          <div className="misma-marketplace-section-heading">
            <div><h2>Installed plugins</h2><p>Connected tools for this workspace</p></div>
            <span>{installedByProvider.size} connected</span>
          </div>
          {workspaceLoading || loading ? <div className="misma-marketplace-skeleton">Loading connections…</div>
            : !workspaceId ? <div className="misma-marketplace-empty">Choose a workspace to see its installed plugins.</div>
            : installedByProvider.size ? <div className="misma-installed-strip">
              {[...installedByProvider.entries()].map(([provider, connection]) => {
                const plugin = plugins.find((item) => item.id === provider)!;
                return <button type="button" className="misma-installed-chip" key={connection.id} onClick={() => setSelected(provider)}>
                  <ProviderLogo provider={provider} />
                  <span><strong>{plugin.name}</strong><small>{connection.external_account_name || "Connected"}</small></span>
                  <i aria-label="Connected" />
                </button>;
              })}
            </div> : <div className="misma-marketplace-empty">No plugins are connected to this workspace yet. Choose a plugin below to get started.</div>}
        </section>

        <section className="misma-plugin-directory">
          <div className="misma-marketplace-section-heading">
            <div><h2>Plugin directory</h2><p>Each plugin has a separate permission boundary and responsibility.</p></div>
            <span>{visiblePlugins.length} plugins</span>
          </div>
          {visiblePlugins.length ? <div className="misma-plugin-grid">
            {visiblePlugins.map((plugin) => {
              const connection = installedByProvider.get(plugin.id);
              return <article className="misma-plugin-card" key={plugin.id}>
                <button type="button" className="misma-plugin-card-main" onClick={() => setSelected(plugin.id)} aria-label={"View " + plugin.name + " details"}>
                  <ProviderLogo provider={plugin.id} />
                  <span className="misma-plugin-card-meta"><strong>{plugin.name}</strong><small>{plugin.publisher} · {plugin.category}</small></span>
                  <span className={"misma-plugin-status" + (connection ? " is-connected" : plugin.availability === "coming" ? " is-coming" : "")}>{connection ? "Installed" : plugin.availability === "coming" ? "Coming soon" : "Available"}</span>
                </button>
                <p>{plugin.description}</p>
                <div className="misma-plugin-card-footer">
                  <span>{plugin.purpose}</span>
                  <button type="button" onClick={() => setSelected(plugin.id)}>{connection ? "Manage" : plugin.availability === "coming" ? "Details" : "View plugin"} <span>↗</span></button>
                </div>
              </article>;
            })}
          </div> : <div className="misma-marketplace-empty">No plugins match this search.</div>}
        </section>
      </div>

      {selectedPlugin && <div className="misma-plugin-modal-backdrop" role="presentation" onMouseDown={(event) => {
        if (event.target === event.currentTarget) setSelected(null);
      }}>
        <section className="misma-plugin-modal" role="dialog" aria-modal="true" aria-labelledby="misma-plugin-modal-title">
          <button type="button" className="misma-plugin-modal-close" aria-label="Close details" onClick={() => setSelected(null)}>×</button>
          <div className="misma-plugin-modal-heading">
            <ProviderLogo provider={selectedPlugin.id} />
            <div><span className="misma-marketplace-eyebrow">{selectedPlugin.publisher} · Verified publisher</span><h2 id="misma-plugin-modal-title">{selectedPlugin.name}</h2><p>{selectedPlugin.purpose}</p></div>
          </div>
          <p className="misma-plugin-modal-description">{selectedPlugin.description}</p>
          <div className="misma-plugin-permissions">
            <h3>Permissions and scope</h3>
            <ul>{selectedPlugin.permissions.map((permission) => <li key={permission}>{permission}</li>)}</ul>
            <p>Access is limited to the selected Misma workspace and the connected account's granted permissions. GitHub changes and production deployments must follow the approval flow.</p>
            <p className="misma-plugin-storage-note">Misma validates provider access on the server and stores supported credentials encrypted in Supabase. Provider secrets are not stored in this browser.</p>
          </div>
          {selectedPlugin.availability === "coming" ? <div className="misma-plugin-coming-note">Netlify authorization and build actions are not enabled yet.</div> : selectedConnection
            ? <div className="misma-plugin-connected-state"><span className="misma-plugin-status is-connected">Connected</span><strong>{selectedConnection.external_account_name || selectedPlugin.name + " account"}</strong><small>Connected to the selected workspace.</small></div>
            : <div className="misma-plugin-coming-note">This plugin is not connected to the selected workspace.</div>}
          {selectedPlugin.id === "render" && !selectedConnection && selectedPlugin.availability !== "coming" && (
            <label className="misma-plugin-credential-field">
              <span>Render API key</span>
              <input type="password" autoComplete="off" value={renderApiKey} onChange={(event) => setRenderApiKey(event.target.value)} placeholder="Paste your Render API key" />
              <small>The key is sent to Misma's Supabase Edge Function for validation and encrypted storage.</small>
            </label>
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
            {selectedPlugin.availability !== "coming" && !selectedConnection && <button type="button" className="misma-plugin-primary" disabled={busy === selectedPlugin.id || (selectedPlugin.id === "render" && !renderApiKey.trim())} onClick={() => void connectPlugin(selectedPlugin.id)}>{busy === selectedPlugin.id ? "Connecting…" : selectedPlugin.id === "github" ? "Continue to GitHub" : selectedPlugin.id === "vercel" ? "Continue to Vercel" : "Connect Render"}</button>}
            {selectedConnection && <button type="button" className="misma-plugin-danger" disabled={busy === selectedPlugin.id} onClick={() => void disconnect(selectedPlugin.id)}>{busy === selectedPlugin.id ? "Disconnecting…" : "Disconnect"}</button>}
          </div>
        </section>
      </div>}
    </main>
  );
}
