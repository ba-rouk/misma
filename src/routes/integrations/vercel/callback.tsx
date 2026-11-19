import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "../../../lib/supabase";

type Workspace = { id: string; name: string };
type Website = { id: string; name: string; domain: string };
type VercelProject = {
  id: string;
  external_project_id: string;
  name: string;
  full_name: string | null;
  repository_url: string | null;
  dashboard_url: string | null;
  default_branch: string | null;
  metadata: Record<string, unknown> | null;
};

export const Route = createFileRoute("/integrations/vercel/callback")({
  component: VercelMarketplaceCallback,
});

function VercelMarketplaceCallback() {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [callback, setCallback] = useState<{ code: string; configurationId: string; teamId: string; next: string }>({
    code: "", configurationId: "", teamId: "", next: "",
  });
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [websites, setWebsites] = useState<Website[]>([]);
  const [projects, setProjects] = useState<VercelProject[]>([]);
  const [projectId, setProjectId] = useState("");
  const [platformConnectionId, setPlatformConnectionId] = useState("");
  const [websiteId, setWebsiteId] = useState("");
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [linked, setLinked] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("Checking your Misma session…");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code") || "";
    const configurationId = params.get("configurationId") || "";
    const teamId = params.get("teamId") || "";
    const next = params.get("next") || "";
    const providerError = params.get("error") || "";
    // Remove the one-time authorization code from the address bar immediately.
    window.history.replaceState({}, document.title, window.location.pathname);
    setCallback({ code, configurationId, teamId, next });
    if (providerError) setError("Vercel returned an authorization error. Return to Vercel and try connecting again.");
    if (!code || !/^icfg_[A-Za-z0-9_-]+$/.test(configurationId)) {
      setError("The Vercel Marketplace callback is incomplete. Start the connection again from Misma.");
      return;
    }
    void loadWorkspaces();
  }, []);

  async function loadWorkspaces() {
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session) {
        setNotice("Sign in to Misma, then start the Vercel connection again.");
        return;
      }
      const { data: memberships, error: membershipError } = await supabase.from("workspace_members")
        .select("workspace_id,role").eq("user_id", sessionData.session.user.id);
      if (membershipError) throw new Error("Could not load your workspace memberships.");
      const ids = Array.from(new Set((memberships || [])
        .filter((row: any) => ["owner", "admin"].includes(String(row.role)))
        .map((row: any) => String(row.workspace_id))));
      if (!ids.length) throw new Error("You need to be a workspace owner or admin to connect Vercel.");
      const { data, error: workspaceError } = await supabase.from("workspaces")
        .select("id,name").in("id", ids).order("name");
      if (workspaceError) throw new Error("Could not load your Misma workspaces.");
      const options = (data || []).map((row: any) => ({ id: String(row.id), name: String(row.name || "Misma workspace") }));
      setWorkspaces(options);
      if (options.length === 1) {
        setWorkspaceId(options[0].id);
        await loadWebsites(options[0].id);
      }
      setNotice(options.length > 1 ? "Choose which Misma workspace should own this Vercel connection." : "Choose a website to associate with your Vercel project.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not prepare the Vercel connection.");
    }
  }

  async function loadWebsites(id: string) {
    setWebsites([]);
    setWebsiteId("");
    if (!id) return;
    const { data, error: websiteError } = await supabase.from("website_connections")
      .select("id,name,domain").eq("workspace_id", id).is("widget_deleted_at", null)
      .order("created_at", { ascending: false });
    if (websiteError) throw new Error("Could not load websites in this workspace.");
    setWebsites((data || []) as Website[]);
  }

  async function completeConnection() {
    if (!workspaceId || !callback.code) {
      setError("Choose a workspace and restart the Vercel connection if the authorization code is missing.");
      return;
    }
    setBusy(true); setError(""); setNotice("Exchanging the Marketplace authorization and discovering Vercel projects…");
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("misma-platform-integrations", {
        body: {
          action: "vercel-complete-installation",
          workspaceId,
          code: callback.code,
          configurationId: callback.configurationId,
          teamId: callback.teamId,
        },
      });
      if (invokeError) throw new Error(invokeError.message || "Could not complete Vercel authorization.");
      if (data?.error) throw new Error(String(data.error));
      setCallback((current) => ({ ...current, code: "" }));
      setPlatformConnectionId(String(data?.platformConnectionId || ""));
      setProjects(Array.isArray(data?.projects) ? data.projects as VercelProject[] : []);
      setProjectId(data?.projects?.[0]?.id || "");
      setConnected(true);
      await loadWebsites(workspaceId);
      setNotice(data?.discoveryError ? "Vercel is connected and its token is stored securely, but project discovery needs a retry: " + String(data.discoveryError) : "Vercel is connected securely. Select a discovered project and a Misma website to link them.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not complete Vercel connection.");
      setNotice("");
    } finally {
      setBusy(false);
    }
  }


  async function refreshProjects() {
    if (!platformConnectionId) return;
    setBusy(true); setError(""); setNotice("Refreshing projects from Vercel…");
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("misma-platform-integrations", {
        body: { action: "vercel-refresh-projects", workspaceId, platformConnectionId },
      });
      if (invokeError) throw new Error(invokeError.message || "Could not refresh Vercel projects.");
      if (data?.error) throw new Error(String(data.error));
      const nextProjects = Array.isArray(data?.projects) ? data.projects as VercelProject[] : [];
      setProjects(nextProjects);
      setProjectId(nextProjects[0]?.id || "");
      setNotice("Vercel project list refreshed.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not refresh Vercel projects.");
      setNotice("");
    } finally {
      setBusy(false);
    }
  }

  async function linkProject() {
    if (!projectId || !websiteId) {
      setError("Choose both a Vercel project and a Misma website.");
      return;
    }
    setBusy(true); setError(""); setNotice("Linking the project to your Misma website…");
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("misma-platform-integrations", {
        body: { action: "vercel-link-project", workspaceId, platformProjectId: projectId, websiteConnectionId: websiteId },
      });
      if (invokeError) throw new Error(invokeError.message || "Could not link the project.");
      if (data?.error) throw new Error(String(data.error));
      setLinked(true);
      setNotice(data?.alreadyLinked ? "This project was already linked to that website." : "Vercel project linked to your Misma website.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not link the project.");
      setNotice("");
    } finally {
      setBusy(false);
    }
  }

  function finish() {
    const destination = callback.next;
    if (destination) {
      try {
        const parsed = new URL(destination);
        if (parsed.protocol === "https:" && parsed.hostname === "vercel.com") {
          window.location.assign(parsed.toString());
          return;
        }
      } catch { /* Fall back to the Misma integrations page. */ }
    }
    window.location.assign("/dashboard/integrations?vercel=connected");
  }

  return (
    <main style={{ minHeight: "100vh", background: "#f7f8fa", color: "#17202c", padding: "clamp(18px, 4vw, 48px)", fontFamily: "Inter, system-ui, sans-serif" }}>
      <div style={{ maxWidth: 760, margin: "36px auto", background: "#fff", border: "1px solid #e5e9ef", borderRadius: 18, padding: "clamp(20px, 4vw, 32px)" }}>
        <a href="/dashboard/integrations" style={{ color: "#586477", textDecoration: "none", fontSize: 14 }}>← Back to integrations</a>
        <p style={{ color: "#667085", fontSize: 12, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", marginTop: 28 }}>Misma · Vercel Marketplace</p>
        <h1 style={{ fontSize: 30, letterSpacing: "-.04em", margin: "8px 0" }}>Connect Vercel to Misma</h1>
        <p style={{ color: "#667085", lineHeight: 1.65 }}>Misma exchanges the one-time Marketplace authorization code on its server, stores the resulting access token encrypted, and returns only project details to this page.</p>

        {error && <div role="alert" style={{ padding: 13, borderRadius: 10, background: "#fff0f0", color: "#a12626", margin: "16px 0" }}>{error}</div>}
        {notice && <div role="status" style={{ padding: 13, borderRadius: 10, background: "#f0f5fb", color: "#34445a", margin: "16px 0" }}>{notice}</div>}

        {!connected && <>
          <label style={fieldLabel}>Misma workspace
            <select value={workspaceId} onChange={(event) => { setWorkspaceId(event.target.value); void loadWebsites(event.target.value).catch((cause) => setError(cause.message)); }} style={fieldStyle}>
              <option value="">Choose a workspace</option>
              {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
            </select>
          </label>
          <button type="button" onClick={() => void completeConnection()} disabled={busy || !workspaceId || !callback.code} style={primaryButton}>{busy ? "Connecting…" : "Complete Vercel connection"}</button>
          {!callback.code && !connected && <p style={{ color: "#667085", fontSize: 13 }}>If you signed in after returning from Vercel, go back to Misma and start Connect Vercel again.</p>}
        </>}

        {connected && <>
          <div style={{ display: "grid", gap: 14, marginTop: 20 }}>
            <label style={fieldLabel}>Vercel project
              <select value={projectId} onChange={(event) => setProjectId(event.target.value)} style={fieldStyle}>
                <option value="">Choose a Vercel project</option>
                {projects.map((project) => <option key={project.id} value={project.id}>{project.name}{project.full_name && project.full_name !== project.name ? " · " + project.full_name : ""}</option>)}
              </select>
            </label>
            <label style={fieldLabel}>Misma website
              <select value={websiteId} onChange={(event) => setWebsiteId(event.target.value)} style={fieldStyle}>
                <option value="">Choose a connected Misma website</option>
                {websites.map((website) => <option key={website.id} value={website.id}>{website.name || website.domain} · {website.domain}</option>)}
              </select>
            </label>
            {!projects.length && <div><p style={{ color: "#667085", fontSize: 13 }}>No Vercel projects are currently listed. Retry discovery without repeating the one-time authorization.</p><button type="button" onClick={() => void refreshProjects()} disabled={busy} style={secondaryButton}>{busy ? "Refreshing…" : "Refresh Vercel projects"}</button></div>}
            {!websites.length && <p style={{ color: "#667085", fontSize: 13 }}>This workspace has no active websites yet. Add a website in Misma, then return to link a project.</p>}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button type="button" onClick={() => void linkProject()} disabled={busy || !projectId || !websiteId} style={primaryButton}>{busy ? "Saving…" : "Link project to website"}</button>
              <button type="button" onClick={finish} disabled={busy || (!linked && projects.length > 0 && websites.length > 0)} style={secondaryButton}>Finish</button>
            </div>
          </div>
        </>}
      </div>
    </main>
  );
}

const primaryButton = { background: "#152238", color: "#fff", border: 0, borderRadius: 10, padding: "12px 16px", fontWeight: 650, cursor: "pointer", marginTop: 16 } as const;
const secondaryButton = { background: "#f1f4f7", color: "#263448", border: "1px solid #dce2e9", borderRadius: 10, padding: "12px 16px", fontWeight: 600, cursor: "pointer" } as const;
const fieldLabel = { display: "grid", gap: 7, color: "#3d4a5d", fontSize: 13, fontWeight: 650, margin: "16px 0" } as const;
const fieldStyle = { width: "100%", boxSizing: "border-box" as const, border: "1px solid #d9e0e8", borderRadius: 10, padding: "11px 12px", background: "#fff", color: "#17202c", font: "inherit" };
