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
  icon: string;
}> = [
  {
    id: "github", name: "GitHub", publisher: "Misma", category: "Developer",
    description: "Connect repositories and let Misma understand and prepare focused code changes.",
    purpose: "Code & Repository Management",
    permissions: ["Read repositories available to your GitHub App installation.", "Inspect repository structure and supported website entry points.", "Create a dedicated branch and prepare a pull request for widget changes.", "Merge changes only through an explicitly approved workflow."],
    availability: "available", icon: "GH",
  },
  {
    id: "vercel", name: "Vercel", publisher: "Vercel", category: "Hosting",
    description: "Discover projects, associate the correct project with a Misma website, and monitor deployments.",
    purpose: "Deployment & Hosting",
    permissions: ["Read projects accessible to the connected account.", "Associate a selected project with a Misma workspace website.", "Trigger or monitor supported deployments after an approved repository change."],
    availability: "available", icon: "▲",
  },
  {
    id: "render", name: "Render", publisher: "Render", category: "Hosting",
    description: "Connect a Render account, find web services and static sites, and manage deploy targets.",
    purpose: "Deployment & Hosting",
    permissions: ["Validate your customer-owned Render API key.", "Discover services and static sites exposed by that key.", "Associate the chosen service with a Misma website and monitor deployment status."],
    availability: "available", icon: "R",
  },
  {
    id: "netlify", name: "Netlify", publisher: "Netlify", category: "Hosting",
    description: "Prepare to connect sites and publishing workflows through your Netlify account.",
    purpose: "Deployment & Hosting",
    permissions: ["Planned: discover authorized Netlify sites and build configuration.", "Planned: trigger and monitor builds for the selected site."],
    availability: "coming", icon: "N",
  },
];

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
  const [renderApiKey, setRenderApiKey] = useState("");
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
          const initial = options.find((item) => item.id === saved) || (options.length === 1 ? options[0] : null);
          setWorkspaceId(initial?.id || "");
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
          <div>
            <span className="misma-marketplace-eyebrow">Misma ecosystem</span>
            <h1>Plugins</h1>
            <p>Connect plugins to let Misma work across your tools and deploy your websites.</p>
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
                  <span className={"misma-plugin-mark is-" + provider}>{plugin.icon}</span>
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
                  <span className={"misma-plugin-mark is-" + plugin.id}>{plugin.icon}</span>
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
            <span className={"misma-plugin-mark is-" + selectedPlugin.id}>{selectedPlugin.icon}</span>
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
