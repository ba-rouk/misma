import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "../lib/supabase";

type Website = { id: string; name: string; domain: string; website_url: string; status: string };
type WorkspaceOption = { id: string; name: string };
type Repo = { id: number; fullName: string; name: string; defaultBranch: string; htmlUrl: string; private: boolean };
type PlatformConnection = { id: string; provider: string; external_account_name: string | null; status: string };
type InstallResult = { installationId: string; status: string; pullRequestUrl: string; repositoryUrl: string; message: string };

export const Route = createFileRoute("/dashboard/integrations")({ component: WebsiteIntegrationsPage });

const providers = [
  { id: "github", name: "GitHub", description: "Connect repositories and prepare a focused Misma installation pull request." },
  { id: "vercel", name: "Vercel", description: "Connect your Vercel account, discover projects, and associate them with Misma websites." },
  { id: "netlify", name: "Netlify", description: "Discover sites and publish changes through connected Git repositories." },
  { id: "render", name: "Render", description: "Discover services and trigger deployments after approved source changes." },
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

  const githubConnection = connections.find((connection) => connection.provider === "github" && connection.status === "connected");
  const vercelConnection = connections.find((connection) => connection.provider === "vercel" && connection.status === "connected");
  const selectedRepo = repositories.find((repo) => String(repo.id) === repositoryId);

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
      const [websiteResult, connectionResult] = await Promise.all([
        supabase.from("website_connections")
          .select("id,name,domain,website_url,status")
          .eq("workspace_id", activeWorkspaceId)
          .is("widget_deleted_at", null)
          .order("created_at", { ascending: false }),
        supabase.from("platform_connections")
          .select("id,provider,external_account_name,status")
          .eq("workspace_id", activeWorkspaceId)
          .order("created_at", { ascending: false }),
      ]);
      if (websiteResult.error) throw new Error("Could not load your connected websites.");
      if (connectionResult.error) throw new Error("Could not load your platform connections.");
      setWebsites((websiteResult.data || []) as Website[]);
      setConnections((connectionResult.data || []) as PlatformConnection[]);
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

  useEffect(() => { void load(); }, []);
  useEffect(() => { if (workspaceId) void loadWorkspaceData(workspaceId); }, [workspaceId, workspaces]);

  return (
    <main className="aichat misma-integrations-page">
      <div className="misma-integrations-content">
        <a href="/dashboard" className="misma-integrations-back">← Back to Misma dashboard</a>
        <header className="misma-integrations-header">
          <p className="misma-integrations-eyebrow">Misma · Website integrations</p>
          <h1>Connect your website platform</h1>
          <p className="misma-integrations-intro">Connect the platform that stores or deploys your website code. Misma can prepare the widget installation, open a review request, and use automatic deployment only when you authorize it.</p>
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
                  <span className={`misma-integrations-status${connected ? " is-connected" : ""}`}>{connected ? "Connected" : provider.id === "github" ? "Available first" : provider.id === "vercel" ? "Available" : "Coming next"}</span>
                </div>
                <p className="misma-integrations-provider-description">{provider.description}</p>
                {provider.id === "github" && (connected
                  ? <button type="button" onClick={() => void loadRepositories()} disabled={busy} className="misma-integrations-primary-button">{busy ? "Loading…" : "Choose repository"}</button>
                  : <button type="button" onClick={() => void connectGithub()} disabled={busy} className="misma-integrations-primary-button">{busy ? "Connecting…" : "Connect GitHub"}</button>)}
                {provider.id === "vercel" && <button type="button" onClick={() => void connectVercel()} disabled={busy} className="misma-integrations-primary-button">{busy ? "Opening Vercel…" : vercelConnection ? "Manage Vercel projects" : "Connect Vercel"}</button>}
              </article>;
            })}
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
