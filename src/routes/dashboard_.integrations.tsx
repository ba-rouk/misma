import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "../lib/supabase";

type Website = { id: string; name: string; domain: string; website_url: string; status: string };
type WorkspaceOption = { id: string; name: string };
type Repo = { id: number; fullName: string; name: string; defaultBranch: string; htmlUrl: string; private: boolean };
type PlatformConnection = { id: string; provider: string; external_account_name: string | null; status: string };
type InstallResult = { installationId: string; status: string; pullRequestUrl: string; repositoryUrl: string; message: string };
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

export const Route = createFileRoute("/dashboard/integrations")({ component: WebsiteIntegrationsPage });

const providers = [
  { id: "github", name: "GitHub", description: "Connect repositories and prepare a focused Misma installation pull request." },
  { id: "vercel", name: "Vercel", description: "Connect your Vercel account, discover projects, and associate them with Misma websites." },
  { id: "netlify", name: "Netlify", description: "Discover sites and publish changes through connected Git repositories." },
  { id: "render", name: "Render", description: "Connect your Render account, discover services, and choose the service that belongs to each website." },
];

async function invokeErrorMessage(invokeError: unknown, fallback: string) {
  const error = invokeError as { message?: unknown; context?: unknown } | null;
  const context = error?.context as { clone?: () => { json?: () => Promise<unknown> } } | undefined;
  if (context && typeof context.clone === "function") {
    try {
      const response = context.clone();
      if (typeof response.json === "function") {
        const payload = await response.json() as { error?: unknown; message?: unknown };
        if (typeof payload?.error === "string" && payload.error.trim()) return payload.error;
        if (typeof payload?.message === "string" && payload.message.trim()) return payload.message;
      }
    } catch {
      // Keep the SDK message when the Edge Function did not return JSON.
    }
  }
  return typeof error?.message === "string" && error.message.trim() ? error.message : fallback;
}

function normalizeProjectLabel(value: string) {
  return value.toLowerCase().trim().replace(/^www\./, "").replace(/[^a-z0-9]/g, "");
}

function exactWebsiteProjectMatch(projects: PlatformProject[], website?: Website) {
  if (!website) return null;
  const domain = website.domain.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  const domainBase = domain.split(".")[0];
  const candidates = new Set([website.name, website.domain, domain, domainBase].map(normalizeProjectLabel).filter(Boolean));
  return projects.find((project) => {
    const values = [project.name, project.full_name || "", (project.full_name || "").split("/").pop() || ""]
      .map(normalizeProjectLabel).filter(Boolean);
    return values.some((value) => candidates.has(value));
  }) || null;
}

function WebsiteIntegrationsPage() {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([]);
  const [websites, setWebsites] = useState<Website[]>([]);
  const [connections, setConnections] = useState<PlatformConnection[]>([]);
  const [repositories, setRepositories] = useState<Repo[]>([]);
  const [websiteId, setWebsiteId] = useState("");
  const [repositoryId, setRepositoryId] = useState("");
  const [deploymentMode, setDeploymentMode] = useState<"automatic" | "manual">("manual");
  const [installResult, setInstallResult] = useState<InstallResult | null>(null);
  const [renderApiKey, setRenderApiKey] = useState("");
  const [renderProjects, setRenderProjects] = useState<PlatformProject[]>([]);
  const [renderProjectId, setRenderProjectId] = useState("");
  const [renderWebsiteId, setRenderWebsiteId] = useState("");
  const [renderProjectSearch, setRenderProjectSearch] = useState("");
  const [renderConnectionId, setRenderConnectionId] = useState("");

  const githubConnection = connections.find((connection) => connection.provider === "github" && connection.status === "connected");
  const vercelConnection = connections.find((connection) => connection.provider === "vercel" && connection.status === "connected");
  const renderConnection = connections.find((connection) => connection.provider === "render" && connection.status === "connected");
  const selectedRepo = repositories.find((repo) => String(repo.id) === repositoryId);
  const selectedRenderProject = renderProjects.find((project) => project.id === renderProjectId);
  const selectedRenderWebsite = websites.find((website) => website.id === renderWebsiteId);
  const matchingRenderProject = exactWebsiteProjectMatch(renderProjects, selectedRenderWebsite);
  const filteredRenderProjects = renderProjects.filter((project) =>
    (project.name + " " + (project.full_name || "")).toLowerCase().includes(renderProjectSearch.toLowerCase().trim())
  );
  const visibleRenderProjects = filteredRenderProjects.length ? filteredRenderProjects : renderProjects;

  async function invoke(action: string, extra: Record<string, unknown> = {}) {
    const { data, error: invokeError } = await supabase.functions.invoke("misma-platform-integrations", {
      body: { action, workspaceId, ...extra },
    });
    if (invokeError) throw new Error(await invokeErrorMessage(invokeError, "Could not contact Misma's integration service."));
    if (data?.error) throw new Error(String(data.error));
    return data;
  }

  async function load() {
    setLoading(true);
    setError("");
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session) {
        window.location.assign("/login");
        return;
      }

      const { data: memberships, error: membershipError } = await supabase.from("workspace_members")
        .select("workspace_id,role")
        .eq("user_id", sessionData.session.user.id)
        .order("workspace_id", { ascending: true });
      if (membershipError) throw new Error("Could not load your Misma workspace memberships.");

      const manageableIds = Array.from(new Set((memberships || [])
        .filter((membership: any) => ["owner", "admin"].includes(String(membership.role)))
        .map((membership: any) => String(membership.workspace_id))
        .filter(Boolean)));
      if (!manageableIds.length) {
        setWorkspaces([]);
        setWorkspaceId("");
        setWebsites([]);
        setConnections([]);
        throw new Error("No workspace is available to connect platforms. Ask a workspace owner or admin to grant you access.");
      }

      const { data: workspaceRows, error: workspaceError } = await supabase.from("workspaces")
        .select("id,name")
        .in("id", manageableIds)
        .order("name", { ascending: true });
      if (workspaceError) throw new Error("Could not load your workspace names.");

      const options = (workspaceRows || []).map((workspace: any) => ({
        id: String(workspace.id),
        name: String(workspace.name || "Misma workspace"),
      })).filter((workspace: WorkspaceOption) => manageableIds.includes(workspace.id));
      if (!options.length) throw new Error("No manageable Misma workspace was found for this account.");

      setWorkspaces(options);
      let savedWorkspaceId = "";
      try {
        savedWorkspaceId = window.sessionStorage.getItem("misma_integrations_workspace") || "";
      } catch {
        // The workspace can still be selected when session storage is unavailable.
      }
      const selected = options.find((workspace) => workspace.id === savedWorkspaceId)
        || (options.length === 1 ? options[0] : null);
      setWorkspaceId(selected?.id || "");
      if (!selected) {
        setWebsites([]);
        setConnections([]);
        setNotice("Choose the workspace you want to connect to GitHub.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load integrations.");
    } finally {
      setLoading(false);
    }
  }

  async function loadWorkspaceData(activeWorkspaceId: string) {
    if (!activeWorkspaceId || !workspaces.some((workspace) => workspace.id === activeWorkspaceId)) return;
    setLoading(true);
    setError("");
    setWebsites([]);
    setConnections([]);
    setRepositories([]);
    setWebsiteId("");
    setRepositoryId("");
    try {
      const [websiteResult, connectionResult, renderProjectResult] = await Promise.all([
        supabase.from("website_connections")
          .select("id,name,domain,website_url,status")
          .eq("workspace_id", activeWorkspaceId)
          .is("widget_deleted_at", null)
          .order("created_at", { ascending: false }),
        supabase.from("platform_connections")
          .select("id,provider,external_account_name,status")
          .eq("workspace_id", activeWorkspaceId)
          .order("created_at", { ascending: false }),
        supabase.from("platform_projects")
          .select("id,platform_connection_id,name,full_name,repository_url,dashboard_url,default_branch,metadata")
          .eq("workspace_id", activeWorkspaceId).eq("provider", "render")
          .order("name", { ascending: true }),
      ]);
      if (websiteResult.error) throw new Error("Could not load your connected websites.");
      if (connectionResult.error) throw new Error("Could not load your platform connections.");
      if (renderProjectResult.error) throw new Error("Could not load your Render services.");
      const nextConnections = (connectionResult.data || []) as PlatformConnection[];
      const currentRenderConnection = nextConnections.find((connection) => connection.provider === "render" && connection.status === "connected");
      const nextRenderProjects = (renderProjectResult.data || []) as PlatformProject[];
      setWebsites((websiteResult.data || []) as Website[]);
      setConnections(nextConnections);
      setRenderConnectionId(currentRenderConnection?.id || "");
      setRenderProjects(currentRenderConnection
        ? nextRenderProjects.filter((project) => project.platform_connection_id === currentRenderConnection.id)
        : []);
      setRenderProjectId("");
      setRenderWebsiteId("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load this workspace's integrations.");
    } finally {
      setLoading(false);
    }
  }

  function changeWorkspace(nextWorkspaceId: string) {
    setWorkspaceId(nextWorkspaceId);
    setWebsiteId("");
    setRepositoryId("");
    setRepositories([]);
    setWebsites([]);
    setConnections([]);
    setInstallResult(null);
    setRenderApiKey("");
    setRenderProjects([]);
    setRenderProjectId("");
    setRenderWebsiteId("");
    setRenderProjectSearch("");
    setRenderConnectionId("");
    setError("");
    setNotice("");
    try {
      if (nextWorkspaceId) window.sessionStorage.setItem("misma_integrations_workspace", nextWorkspaceId);
      else window.sessionStorage.removeItem("misma_integrations_workspace");
    } catch {
      // Selection remains active for this page session even without storage.
    }
  }

  async function connectGithub() {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await invoke("github-install-url");
      if (!result?.installUrl || typeof result.installUrl !== "string") throw new Error("Misma did not return a GitHub installation link.");
      window.location.assign(result.installUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start GitHub connection.");
      setBusy(false);
    }
  }


  async function connectVercel() {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await invoke("vercel-install-url");
      if (!result?.installUrl || typeof result.installUrl !== "string" || !result.installUrl.startsWith("https://vercel.com/integrations/")) {
        throw new Error("Misma did not return a valid Vercel Marketplace installation link.");
      }
      window.location.assign(result.installUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start the Vercel connection.");
      setBusy(false);
    }
  }

  async function loadRepositories() {
    setBusy(true); setError("");
    try {
      const result = await invoke("github-repositories");
      setRepositories(Array.isArray(result.repositories) ? result.repositories : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load GitHub repositories.");
    } finally {
      setBusy(false);
    }
  }

  async function prepareInstallation() {
    if (!websiteId || !selectedRepo) { setError("Select both a Misma website and a GitHub repository."); return; }
    setBusy(true); setError(""); setNotice(""); setInstallResult(null);
    try {
      const result = await invoke("prepare-github-install", {
        websiteConnectionId: websiteId,
        repositoryId: selectedRepo.id,
        fullName: selectedRepo.fullName,
        defaultBranch: selectedRepo.defaultBranch,
        deploymentMode,
      });
      setInstallResult(result as InstallResult);
      setNotice(String(result.message || "Installation changes prepared."));
      await loadWorkspaceData(workspaceId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not prepare the widget installation.");
    } finally {
      setBusy(false);
    }
  }

  async function connectRender() {
    if (!renderApiKey.trim()) { setError("Enter your Render API key."); return; }
    setBusy(true); setError(""); setNotice("Validating your Render API key and loading all services…");
    try {
      const result = await invoke("render-connect", { apiKey: renderApiKey.trim() });
      setRenderApiKey("");
      setRenderConnectionId(String(result.platformConnectionId || ""));
      setRenderProjects(Array.isArray(result.projects) ? result.projects as PlatformProject[] : []);
      setRenderProjectId("");
      await loadWorkspaceData(workspaceId);
      setNotice(String(result.message || "Render is connected. Choose a service and Misma website."));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not connect Render.");
      setNotice("");
    } finally {
      setBusy(false);
    }
  }

  async function refreshRenderProjects() {
    const connectionId = renderConnectionId || renderConnection?.id;
    if (!connectionId) return;
    setBusy(true); setError(""); setNotice("Refreshing all Render services…");
    try {
      const result = await invoke("render-refresh-projects", { platformConnectionId: connectionId });
      const nextProjects = Array.isArray(result.projects) ? result.projects as PlatformProject[] : [];
      setRenderProjects(nextProjects);
      setRenderProjectId("");
      setNotice(nextProjects.length
        ? "Render services refreshed. Choose the service to associate with your website."
        : "No services were found in this Render account. Check the selected Render workspace and API key access.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not refresh Render services.");
      setNotice("");
    } finally {
      setBusy(false);
    }
  }

  async function linkRenderProject() {
    if (!renderProjectId || !renderWebsiteId) {
      setError("Choose a Render service and a Misma website.");
      return;
    }
    setBusy(true); setError(""); setNotice("Associating the selected Render service with your website…");
    try {
      const result = await invoke("render-link-project", {
        platformProjectId: renderProjectId,
        websiteConnectionId: renderWebsiteId,
      });
      setNotice(result?.alreadyLinked
        ? "This Render service is already associated with that website."
        : "Render service associated with your Misma website as its deployment target.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not associate the Render service.");
      setNotice("");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { void load(); }, []);
  useEffect(() => { if (workspaceId) void loadWorkspaceData(workspaceId); }, [workspaceId, workspaces]);

  return (
    <main className="aichat misma-integrations-page">
      <div className="misma-integrations-content">
        <a href="/dashboard" className="misma-integrations-back">← Back to Misma dashboard</a>
        <header className="misma-integrations-header">
          <p className="misma-integrations-eyebrow">Misma · Website integrations</p>
          <h1>Connect your website platform</h1>
          <p className="misma-integrations-intro">Connect GitHub, Vercel, and Render independently. Choose the exact repository or hosting project that belongs to each Misma website; when a name does not match, Misma shows the available projects for you to select.</p>
        </header>

        {error && <div role="alert" className="misma-integrations-message is-error">{error}</div>}
        {notice && <div role="status" className="misma-integrations-message is-notice">{notice}</div>}

        <section className="misma-integrations-workspace">
          <label style={fieldLabel}>Workspace
            <select value={workspaceId} onChange={(event) => changeWorkspace(event.target.value)} style={fieldStyle} disabled={workspaces.length <= 1}>
              <option value="">Choose a workspace</option>
              {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
            </select>
          </label>
          {workspaces.length > 1 && <p className="misma-integrations-help">Choose which workspace owns the website connection and GitHub installation.</p>}
        </section>

        {loading ? <p className="misma-integrations-help">Loading your connected websites…</p> : !workspaceId ? <p className="misma-integrations-help">{workspaces.length ? "Choose a workspace to continue." : "No manageable workspace is available."}</p> : <>
          <section className="misma-integrations-provider-grid">
            {providers.map((provider) => {
              const connected = connections.some((item) => item.provider === provider.id && item.status === "connected");
              return <article key={provider.id} className="misma-integrations-provider-card">
                <div className="misma-integrations-provider-heading">
                  <strong>{provider.name}</strong>
                  <span className={`misma-integrations-status${connected ? " is-connected" : ""}`}>{connected ? "Connected" : provider.id === "netlify" ? "Coming later" : "Not connected"}</span>
                </div>
                <p className="misma-integrations-provider-description">{provider.description}</p>
                {provider.id === "github" && (connected
                  ? <button type="button" onClick={() => void loadRepositories()} disabled={busy} className="misma-integrations-primary-button">{busy ? "Loading…" : "Choose repository"}</button>
                  : <button type="button" onClick={() => void connectGithub()} disabled={busy} className="misma-integrations-primary-button">{busy ? "Opening GitHub…" : "Connect GitHub"}</button>)}
                {provider.id === "vercel" && <button type="button" onClick={() => void connectVercel()} disabled={busy} className="misma-integrations-primary-button">{busy ? "Opening Vercel…" : vercelConnection ? "Reconnect Vercel" : "Connect Vercel"}</button>}
                {provider.id === "render" && !renderConnection && <span className="misma-integrations-help">Connect with your own Render API key below.</span>}
              </article>;
            })}
          </section>

          <section className="misma-integrations-detail-card" aria-labelledby="render-project-heading">
            <h2 id="render-project-heading">Render services</h2>
            {!renderConnection ? <>
              <p className="misma-integrations-provider-description">Connect your own Render account. Misma validates the key, encrypts it in Supabase, and lists the services that key can access. Your API key is never shown again or shared with other workspaces.</p>
              <label style={fieldLabel}>Render API key
                <input type="password" autoComplete="off" value={renderApiKey} onChange={(event) => setRenderApiKey(event.target.value)} placeholder="Paste your Render API key" style={fieldStyle} />
              </label>
              <button type="button" onClick={() => void connectRender()} disabled={busy || !renderApiKey.trim()} className="misma-integrations-primary-button">{busy ? "Connecting…" : "Connect Render"}</button>
            </> : <>
              <p className="misma-integrations-provider-description">Connected to {renderConnection.external_account_name || "your Render account"}. Search your available services or view the full list, then associate the correct service with a Misma website.</p>
              <div className="misma-integrations-field-grid">
                <label style={fieldLabel}>Misma website
                  <select value={renderWebsiteId} onChange={(event) => {
                    const nextId = event.target.value;
                    setRenderWebsiteId(nextId);
                    const website = websites.find((item) => item.id === nextId);
                    const match = exactWebsiteProjectMatch(renderProjects, website);
                    setRenderProjectId(match?.id || "");
                    setNotice(match
                      ? "Matched the website to the Render service " + match.name + ". You can change the selection below."
                      : nextId ? "No Render service is associated with that website name or domain. All accessible Render services are listed below—choose the correct one." : "");
                  }} style={fieldStyle}>
                    <option value="">Choose a connected Misma website</option>
                    {websites.map((website) => <option key={website.id} value={website.id}>{website.name || website.domain} · {website.domain}</option>)}
                  </select>
                </label>
                <label style={fieldLabel}>Search Render services
                  <input value={renderProjectSearch} onChange={(event) => setRenderProjectSearch(event.target.value)} placeholder="Search by service or repository name" style={fieldStyle} />
                </label>
                <label style={fieldLabel}>Render service / project
                  <select value={renderProjectId} onChange={(event) => setRenderProjectId(event.target.value)} style={fieldStyle}>
                    <option value="">Choose a Render service</option>
                    {visibleRenderProjects.map((project) => <option key={project.id} value={project.id}>{project.name}{project.full_name && project.full_name !== project.name ? " · " + project.full_name : ""}</option>)}
                  </select>
                </label>
              </div>
              {renderWebsiteId && !matchingRenderProject && !renderProjectId && <p className="misma-integrations-help" role="status">No Render service matched this website by name or domain. Misma is showing the available services so you can choose the correct deployment target.</p>}
              {renderProjectSearch.trim() && !filteredRenderProjects.length && <p className="misma-integrations-help" role="status">No service matched “{renderProjectSearch}”. The complete accessible service list is shown instead.</p>}
              {!renderProjects.length && <p className="misma-integrations-help">No Render services are available for this API key yet. Refresh the list or check that the API key can read services in the correct Render workspace.</p>}
              <div className="misma-integrations-actions">
                <button type="button" onClick={() => void refreshRenderProjects()} disabled={busy} className="misma-integrations-secondary-button">Refresh services</button>
                <button type="button" onClick={() => void linkRenderProject()} disabled={busy || !renderProjectId || !renderWebsiteId} className="misma-integrations-primary-button">{busy ? "Saving…" : "Use selected service"}</button>
              </div>
              {selectedRenderProject && <p className="misma-integrations-help">Selected: <strong>{selectedRenderProject.name}</strong>. This associates the service with the website as its deployment target; it does not trigger a production deploy by itself.</p>}
            </>}
          </section>

          {githubConnection && <section className="misma-integrations-detail-card">
            <h2>Prepare widget installation</h2>
            <p className="misma-integrations-provider-description">Connected GitHub account: {githubConnection.external_account_name || "GitHub account"}. Misma currently edits standard HTML entrypoints named <code>index.html</code> or <code>public/index.html</code>; other frameworks will need a guided adapter.</p>
            <div className="misma-integrations-field-grid">
              <label style={fieldLabel}>Misma website
                <select value={websiteId} onChange={(event) => setWebsiteId(event.target.value)} style={fieldStyle}>
                  <option value="">Choose a connected website</option>
                  {websites.map((website) => <option key={website.id} value={website.id}>{website.name || website.domain} · {website.domain}</option>)}
                </select>
              </label>
              <label style={fieldLabel}>GitHub repository
                <select value={repositoryId} onChange={(event) => setRepositoryId(event.target.value)} style={fieldStyle}>
                  <option value="">Load and choose a repository</option>
                  {repositories.map((repo) => <option key={repo.id} value={String(repo.id)}>{repo.fullName}{repo.private ? " · Private" : ""}</option>)}
                </select>
              </label>
              <label style={fieldLabel}>Deployment preference
                <select value={deploymentMode} onChange={(event) => setDeploymentMode(event.target.value as "automatic" | "manual")} style={fieldStyle}>
                  <option value="automatic">Automatic deployment (if repository rules allow)</option>
                  <option value="manual">Let me review and publish manually</option>
                </select>
              </label>
            </div>
            <div className="misma-integrations-actions">
              <button type="button" onClick={() => void loadRepositories()} disabled={busy} className="misma-integrations-secondary-button">Refresh repositories</button>
              <button type="button" onClick={() => void prepareInstallation()} disabled={busy || !repositories.length} className="misma-integrations-primary-button">{busy ? "Preparing…" : "Prepare Misma installation"}</button>
            </div>
          </section>}

          {installResult && <section className="misma-integrations-detail-card">
            <h2 style={{ marginTop: 0 }}>Installation changes prepared</h2>
            <p>{installResult.message}</p>
            <p className="misma-integrations-help">Status: <strong>{installResult.status.replaceAll("_", " ")}</strong></p>
            <p><a href={installResult.pullRequestUrl} target="_blank" rel="noreferrer" style={{ color: "#145bb8" }}>Open GitHub pull request</a></p>
            <p><a href={installResult.repositoryUrl} target="_blank" rel="noreferrer" style={{ color: "#145bb8" }}>Open repository dashboard</a></p>
          </section>}

          <section className="misma-integrations-permissions">
            <h2>Deployment permissions</h2>
            <p className="misma-integrations-help">Manual mode creates a separate branch and pull request for your review. Automatic mode asks GitHub to enable auto-merge; GitHub still enforces the repository's branch protection and required checks. If auto-merge is unavailable, Misma leaves the pull request for you to review and merge. Misma does not push directly to your production branch.</p>
          </section>
        </>}
      </div>
    </main>
  );
}

const primaryButton = { background: "#152238", color: "#fff", border: 0, borderRadius: 10, padding: "11px 15px", fontWeight: 650, cursor: "pointer" } as const;
const secondaryButton = { background: "#f1f4f7", color: "#263448", border: "1px solid #dce2e9", borderRadius: 10, padding: "11px 15px", fontWeight: 600, cursor: "pointer" } as const;
const fieldLabel = { display: "grid", gap: 7, color: "#3d4a5d", fontSize: 13, fontWeight: 650 } as const;
const fieldStyle = { width: "100%", boxSizing: "border-box" as const, border: "1px solid #d9e0e8", borderRadius: 10, padding: "11px 12px", background: "#fff", color: "#17202c", font: "inherit" };
