import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "../lib/supabase";

type Website = { id: string; name: string; domain: string; website_url: string; status: string };
type Repo = { id: number; fullName: string; name: string; defaultBranch: string; htmlUrl: string; private: boolean };
type PlatformConnection = { id: string; provider: string; external_account_name: string | null; status: string };
type InstallResult = { installationId: string; status: string; pullRequestUrl: string; repositoryUrl: string; message: string };

export const Route = createFileRoute("/dashboard/integrations")({ component: WebsiteIntegrationsPage });

const providers = [
  { id: "github", name: "GitHub", description: "Connect repositories and prepare a focused Misma installation pull request." },
  { id: "vercel", name: "Vercel", description: "Discover projects and deployments linked to your repositories." },
  { id: "netlify", name: "Netlify", description: "Discover sites and publish changes through connected Git repositories." },
  { id: "render", name: "Render", description: "Discover services and trigger deployments after approved source changes." },
];

function WebsiteIntegrationsPage() {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [websites, setWebsites] = useState<Website[]>([]);
  const [connections, setConnections] = useState<PlatformConnection[]>([]);
  const [repositories, setRepositories] = useState<Repo[]>([]);
  const [websiteId, setWebsiteId] = useState("");
  const [repositoryId, setRepositoryId] = useState("");
  const [deploymentMode, setDeploymentMode] = useState<"automatic" | "manual">("manual");
  const [installResult, setInstallResult] = useState<InstallResult | null>(null);

  const githubConnection = connections.find((connection) => connection.provider === "github" && connection.status === "connected");
  const selectedRepo = repositories.find((repo) => String(repo.id) === repositoryId);

  async function invoke(action: string, extra: Record<string, unknown> = {}) {
    const { data, error: invokeError } = await supabase.functions.invoke("misma-platform-integrations", {
      body: { action, workspaceId, ...extra },
    });
    if (invokeError) throw new Error(invokeError.message || "Could not contact Misma's integration service.");
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
      const userId = sessionData.session.user.id;
      const { data: membership, error: membershipError } = await supabase.from("workspace_members")
        .select("workspace_id").eq("user_id", userId).maybeSingle();
      if (membershipError || !membership?.workspace_id) throw new Error("Could not find your Misma workspace.");
      setWorkspaceId(membership.workspace_id);

      const [websiteResult, connectionResult] = await Promise.all([
        supabase.from("website_connections")
          .select("id,name,domain,website_url,status")
          .eq("workspace_id", membership.workspace_id)
          .is("widget_deleted_at", null)
          .order("created_at", { ascending: false }),
        supabase.from("platform_connections")
          .select("id,provider,external_account_name,status")
          .eq("workspace_id", membership.workspace_id)
          .order("created_at", { ascending: false }),
      ]);
      if (websiteResult.error) throw new Error("Could not load your connected websites.");
      if (connectionResult.error) throw new Error("Could not load your platform connections.");
      setWebsites((websiteResult.data || []) as Website[]);
      setConnections((connectionResult.data || []) as PlatformConnection[]);
      const params = new URLSearchParams(window.location.search);
      if (params.get("github") === "connected") setNotice("GitHub is connected. Choose a repository and website to prepare the installation.");
      if (params.get("github") === "state-expired") setError("The GitHub installation session expired. Please connect again.");
      if (params.get("github") === "error") setError("GitHub installation was not completed. Please try again.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load integrations.");
    } finally {
      setLoading(false);
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
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not prepare the widget installation.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { void load(); }, []);

  return (
    <main style={{ minHeight: "100vh", background: "#f7f8fa", color: "#17202c", padding: "clamp(18px, 4vw, 48px)", fontFamily: "Inter, system-ui, sans-serif" }}>
      <div style={{ maxWidth: 1040, margin: "0 auto" }}>
        <a href="/dashboard" style={{ color: "#586477", textDecoration: "none", fontSize: 14 }}>← Back to Misma dashboard</a>
        <header style={{ margin: "28px 0 24px" }}>
          <p style={{ color: "#667085", fontSize: 12, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase" }}>Misma · Website integrations</p>
          <h1 style={{ fontSize: "clamp(28px, 4vw, 40px)", letterSpacing: "-.04em", margin: "8px 0" }}>Connect your website platform</h1>
          <p style={{ color: "#667085", maxWidth: 720, lineHeight: 1.65, margin: 0 }}>Connect the platform that stores or deploys your website code. Misma can prepare the widget installation, open a review request, and use automatic deployment only when you authorize it.</p>
        </header>

        {error && <div role="alert" style={{ padding: 14, borderRadius: 12, background: "#fff0f0", color: "#a12626", marginBottom: 16 }}>{error}</div>}
        {notice && <div role="status" style={{ padding: 14, borderRadius: 12, background: "#eaf8ef", color: "#17663a", marginBottom: 16 }}>{notice}</div>}

        {loading ? <p>Loading your connected websites…</p> : <>
          <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 12 }}>
            {providers.map((provider) => {
              const connected = connections.some((item) => item.provider === provider.id && item.status === "connected");
              return <article key={provider.id} style={{ background: "#fff", border: "1px solid #e5e9ef", borderRadius: 16, padding: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                  <strong style={{ fontSize: 16 }}>{provider.name}</strong>
                  <span style={{ fontSize: 11, color: connected ? "#167344" : "#7a8492", background: connected ? "#eaf8ef" : "#f0f2f5", borderRadius: 20, padding: "5px 9px" }}>{connected ? "Connected" : provider.id === "github" ? "Available first" : "Coming next"}</span>
                </div>
                <p style={{ color: "#667085", fontSize: 13, lineHeight: 1.55, minHeight: 60 }}>{provider.description}</p>
                {provider.id === "github" && (connected
                  ? <button type="button" onClick={() => void loadRepositories()} disabled={busy} style={primaryButton}>{busy ? "Loading…" : "Choose repository"}</button>
                  : <button type="button" onClick={() => void connectGithub()} disabled={busy} style={primaryButton}>{busy ? "Connecting…" : "Connect GitHub"}</button>)}
              </article>;
            })}
          </section>

          {githubConnection && <section style={{ background: "#fff", border: "1px solid #e5e9ef", borderRadius: 16, padding: 20, marginTop: 18 }}>
            <h2 style={{ margin: "0 0 6px", fontSize: 20 }}>Prepare widget installation</h2>
            <p style={{ color: "#667085", fontSize: 13, marginTop: 0 }}>Connected GitHub account: {githubConnection.external_account_name || "GitHub account"}. Misma currently edits standard HTML entrypoints named <code>index.html</code> or <code>public/index.html</code>; other frameworks will need a guided adapter.</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14 }}>
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
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
              <button type="button" onClick={() => void loadRepositories()} disabled={busy} style={secondaryButton}>Refresh repositories</button>
              <button type="button" onClick={() => void prepareInstallation()} disabled={busy || !repositories.length} style={primaryButton}>{busy ? "Preparing…" : "Prepare Misma installation"}</button>
            </div>
          </section>}

          {installResult && <section style={{ background: "#fff", border: "1px solid #dce5ee", borderRadius: 16, padding: 20, marginTop: 18 }}>
            <h2 style={{ marginTop: 0 }}>Installation changes prepared</h2>
            <p>{installResult.message}</p>
            <p style={{ color: "#667085", fontSize: 13 }}>Status: <strong>{installResult.status.replaceAll("_", " ")}</strong></p>
            <p><a href={installResult.pullRequestUrl} target="_blank" rel="noreferrer" style={{ color: "#145bb8" }}>Open GitHub pull request</a></p>
            <p><a href={installResult.repositoryUrl} target="_blank" rel="noreferrer" style={{ color: "#145bb8" }}>Open repository dashboard</a></p>
          </section>}

          <section style={{ marginTop: 18, padding: 18, borderRadius: 16, background: "#fff", border: "1px solid #e5e9ef" }}>
            <h2 style={{ fontSize: 17, margin: "0 0 8px" }}>Deployment permissions</h2>
            <p style={{ color: "#667085", fontSize: 13, lineHeight: 1.6, margin: 0 }}>Manual mode creates a separate branch and pull request for your review. Automatic mode asks GitHub to enable auto-merge; GitHub still enforces the repository's branch protection and required checks. If auto-merge is unavailable, Misma leaves the pull request for you to review and merge. Misma does not push directly to your production branch.</p>
          </section>
        </>}
      </div>
    </main>
  );
}

const primaryButton = { background: "#152238", color: "#fff", border: 0, borderRadius: 10, padding: "11px 15px", fontWeight: 650, cursor: "pointer" };
const secondaryButton = { background: "#f1f4f7", color: "#263448", border: "1px solid #dce2e9", borderRadius: 10, padding: "11px 15px", fontWeight: 600, cursor: "pointer" };
const fieldLabel = { display: "grid", gap: 7, color: "#3d4a5d", fontSize: 13, fontWeight: 650 };
const fieldStyle = { width: "100%", boxSizing: "border-box" as const, border: "1px solid #d9e0e8", borderRadius: 10, padding: "11px 12px", background: "#fff", color: "#17202c", font: "inherit" };
