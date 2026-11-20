import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "../lib/supabase";

type Website = { id: string; name: string; domain: string; website_url: string; status: string };
type WorkspaceOption = { id: string; name: string };
type Repo = { id: number; fullName: string; name: string; defaultBranch: string; htmlUrl: string; private: boolean };
type PlatformConnection = { id: string; provider: string; external_account_name: string | null; status: string };
type InstallResult = { installationId: string; status: string; pullRequestUrl: string; repositoryUrl: string; message: string };
type SettingPresence = "present" | "missing" | "empty";
type ProviderHealth = {
  settings: Record<string, SettingPresence>;
  missingSettings: string[];
  emptySettings: string[];
};
type IntegrationHealth = {
  runtime: string;
  functionName: string;
  projectRef: string | null;
  secretsLocation: string;
  providers: { github: ProviderHealth; vercel: ProviderHealth };
  sharedCredentialVault: { settings: Record<string, SettingPresence>; missingSettings: string[]; note: string };
};
type SetupCheck = {
  status: "verified" | "configured" | "error";
  message: string;
  appId?: string;
  appName?: string;
  appSlug?: string;
  webhookSecretConfigured?: boolean;
  slug?: string;
  clientIdConfigured?: boolean;
  clientSecretConfigured?: boolean;
  callbackUrl?: string;
  settings?: Record<string, SettingPresence>;
  missingSettings?: string[];
  runtime?: string;
  projectRef?: string | null;
};
type IntegrationDiagnostics = { github: SetupCheck; vercel: SetupCheck; runtime?: string; projectRef?: string | null };

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
  const [diagnostics, setDiagnostics] = useState<IntegrationDiagnostics | null>(null);
  const [health, setHealth] = useState<IntegrationHealth | null>(null);

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
    setDiagnostics(null);
    setHealth(null);
    setError("");
    setNotice("");
    try {
      if (nextWorkspaceId) window.sessionStorage.setItem("misma_integrations_workspace", nextWorkspaceId);
      else window.sessionStorage.removeItem("misma_integrations_workspace");
    } catch {
      // Selection remains active for this page session even without storage.
    }
  }

  async function verifyIntegrationSetup() {
    setBusy(true); setError(""); setNotice(""); setDiagnostics(null); setHealth(null);
    try {
      let healthResult: IntegrationHealth | null = null;
      try {
        const candidate = await invoke("integration-health") as IntegrationHealth;
        if (!candidate?.providers?.github || !candidate?.providers?.vercel) {
          throw new Error("Misma returned an incomplete integration health report.");
        }
        healthResult = candidate;
        setHealth(candidate);
      } catch (healthCause) {
        const message = healthCause instanceof Error ? healthCause.message : "Could not read the integration health report.";
        // Admins may run Verify, but only a workspace owner can inspect the
        // per-setting environment checklist.
        if (!message.includes("Only workspace owners can inspect")) throw healthCause;
      }

      const result = await invoke("integration-config-check");
      if (!result?.checks?.github || !result?.checks?.vercel) {
        throw new Error("Misma returned an incomplete integration configuration check.");
      }
      const checks = {
        ...result.checks,
        runtime: healthResult?.runtime ?? result.checks.runtime,
        projectRef: healthResult?.projectRef ?? result.checks.projectRef,
      } as IntegrationDiagnostics;
      setDiagnostics(checks);

      const failedChecks = [
        (checks.github.status !== "verified" || (checks.github.missingSettings?.length || 0) > 0)
          ? "GitHub: " + checks.github.message : "",
        (checks.vercel.status !== "configured" || (checks.vercel.missingSettings?.length || 0) > 0)
          ? "Vercel: " + checks.vercel.message : "",
      ].filter(Boolean);
      if (failedChecks.length) {
        setError(failedChecks.join(" · "));
        setNotice("Verification ran in the Supabase Edge Function. The checklist shows every setting that is missing or empty; GitHub and Vercel can still be connected independently when their own requirements are satisfied.");
      } else {
        setNotice(healthResult
          ? "GitHub credentials are verified and Vercel settings are present in the Supabase Edge Function runtime. Connect either provider independently to this workspace."
          : "Provider verification completed. The detailed setup checklist is visible only to the workspace owner.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not verify the saved integration settings.");
    } finally {
      setBusy(false);
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
          <p className="misma-integrations-intro">Connect GitHub and Vercel independently, in either order. Both connections belong to the workspace selected below; neither provider requires the other. Misma can prepare website changes and use automatic deployment only when you authorize it.</p>
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

        {health && <section className="misma-integrations-detail-card" aria-labelledby="integration-health-heading">
          <div className="misma-integrations-actions" style={{ alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
            <div>
              <h2 id="integration-health-heading" style={{ margin: 0 }}>Setup checklist</h2>
              <p className="misma-integrations-help" style={{ marginBottom: 0 }}>
                Runtime: <strong>{health.runtime}</strong> · Function: <code>{health.functionName}</code> · Project ref: <code>{health.projectRef || "not detected"}</code>
              </p>
            </div>
          </div>
          <p className="misma-integrations-help">
            Set missing or empty values in {health.secretsLocation}. This check reads the running function environment, not Database Vault or Render environment variables.
          </p>
          <div className="misma-integrations-provider-grid">
            {(["github", "vercel"] as const).map((provider) => {
              const providerHealth = health.providers[provider];
              const labels: Record<string, string> = {
                GITHUB_APP_ID: "GitHub App ID",
                GITHUB_PRIVATE_KEY: "GitHub App private key (PEM)",
                GITHUB_WEBHOOK_SECRET: "GitHub webhook secret",
                VERCEL_INTEGRATION_SLUG: "Vercel Marketplace slug",
                VERCEL_CLIENT_ID: "Vercel OAuth client ID",
                VERCEL_CLIENT_SECRET: "Vercel OAuth client secret",
              };
              return <article key={provider} className="misma-integrations-provider-card">
                <div className="misma-integrations-provider-heading">
                  <strong>{provider === "github" ? "GitHub" : "Vercel"} settings</strong>
                  <span className={"misma-integrations-status" + (providerHealth.missingSettings.length === 0 ? " is-connected" : "")}>
                    {providerHealth.missingSettings.length === 0 ? "All present" : "Needs attention"}
                  </span>
                </div>
                <ul style={{ listStyle: "none", margin: "12px 0 0", padding: 0, display: "grid", gap: 9 }}>
                  {Object.entries(providerHealth.settings).map(([name, status]) => <li key={name} style={{ display: "flex", alignItems: "flex-start", gap: 9, fontSize: 13, overflowWrap: "anywhere" }}>
                    <span aria-hidden="true" style={{ color: status === "present" ? "#16a34a" : "#dc2626", fontWeight: 800, minWidth: 16 }}>
                      {status === "present" ? "✓" : "✕"}
                    </span>
                    <span><strong>{labels[name] || name}</strong> <code>{name}</code> <span style={{ color: status === "present" ? "#16a34a" : "#dc2626" }}>({status})</span></span>
                  </li>)}
                </ul>
              </article>;
            })}
          </div>
          {Object.values(health.sharedCredentialVault.settings).some((status) => status !== "present") && <p className="misma-integrations-help">
            Shared credential vault: {health.sharedCredentialVault.missingSettings.join(", ")} is missing or empty. This key is required when storing encrypted customer platform tokens, but it is separate from the GitHub App and Vercel configuration checks.
          </p>}
        </section>}

        {workspaceId && <section className="misma-integrations-detail-card" aria-labelledby="integration-config-heading">
          <div className="misma-integrations-actions" style={{ alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
            <div>
              <h2 id="integration-config-heading" style={{ margin: 0 }}>Verify saved platform settings</h2>
              <p className="misma-integrations-help" style={{ marginBottom: 0 }}>Misma checks the GitHub App credentials with GitHub and confirms the Vercel settings are present. Secret values are never shown.</p>
            </div>
            <button type="button" onClick={() => void verifyIntegrationSetup()} disabled={busy} className="misma-integrations-secondary-button">
              {busy ? "Checking…" : "Verify settings"}
            </button>
          </div>
          {diagnostics && <div className="misma-integrations-provider-grid" style={{ marginTop: 16 }}>
            <article className="misma-integrations-provider-card">
              <div className="misma-integrations-provider-heading">
                <strong>GitHub App</strong>
                <span className={"misma-integrations-status" + (diagnostics.github.status === "verified" ? " is-connected" : "")}>
                  {diagnostics.github.status === "verified" && (diagnostics.github.missingSettings?.length || 0) === 0 ? "Verified" : "Needs attention"}
                </span>
              </div>
              <p className="misma-integrations-provider-description">{diagnostics.github.message}</p>
              {diagnostics.github.status === "verified" && <p className="misma-integrations-help">
                {diagnostics.github.appName} · @{diagnostics.github.appSlug} · App ID {diagnostics.github.appId}
              </p>}
              {diagnostics.github.status === "verified" && !diagnostics.github.webhookSecretConfigured && <p className="misma-integrations-help">
                Webhook secret is not configured. Initial installation works, but GitHub webhook events need GITHUB_WEBHOOK_SECRET.
              </p>}
            </article>
            <article className="misma-integrations-provider-card">
              <div className="misma-integrations-provider-heading">
                <strong>Vercel</strong>
                <span className={"misma-integrations-status" + (diagnostics.vercel.status === "configured" ? " is-connected" : "")}>
                  {diagnostics.vercel.status === "configured" ? "Configured" : "Needs attention"}
                </span>
              </div>
              <p className="misma-integrations-provider-description">{diagnostics.vercel.message}</p>
              {diagnostics.vercel.status === "configured" && <p className="misma-integrations-help">
                Slug: {diagnostics.vercel.slug} · OAuth client ID and secret detected.
              </p>}
              {diagnostics.vercel.status === "configured" && <p className="misma-integrations-help">
                Required Redirect URL: <code>{diagnostics.vercel.callbackUrl}</code>
              </p>}
            </article>
          </div>}
        </section>}

        {loading ? <p className="misma-integrations-help">Loading your connected websites…</p> : !workspaceId ? <p className="misma-integrations-help">{workspaces.length ? "Choose a workspace to continue." : "No manageable workspace is available."}</p> : <>
          <section className="misma-integrations-provider-grid">
            {providers.map((provider) => {
              const connected = connections.some((item) => item.provider === provider.id && item.status === "connected");
              return <article key={provider.id} className="misma-integrations-provider-card">
                <div className="misma-integrations-provider-heading">
                  <strong>{provider.name}</strong>
                  <span className={`misma-integrations-status${connected ? " is-connected" : ""}`}>{connected ? "Connected" : provider.id === "github" || provider.id === "vercel" ? "Not connected" : "Coming later"}</span>
                </div>
                <p className="misma-integrations-provider-description">{provider.description}</p>
                {provider.id === "github" && (connected
                  ? <button type="button" onClick={() => void loadRepositories()} disabled={busy} className="misma-integrations-primary-button">{busy ? "Loading…" : "Choose repository"}</button>
                  : <button type="button" onClick={() => void connectGithub()} disabled={busy} className="misma-integrations-primary-button">{busy ? "Opening GitHub…" : "Connect GitHub"}</button>)}
                {provider.id === "vercel" && <button type="button" onClick={() => void connectVercel()} disabled={busy} className="misma-integrations-primary-button">{busy ? "Opening Vercel…" : vercelConnection ? "Reconnect Vercel" : "Connect Vercel"}</button>}
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
