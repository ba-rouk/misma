import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "../../../lib/supabase";

type Website = { id: string; name: string | null; domain: string };
type NetlifyProject = {
  id: string;
  external_project_id: string;
  name: string;
  full_name: string | null;
  repository_url: string | null;
  dashboard_url: string | null;
  default_branch: string | null;
  metadata: Record<string, unknown> | null;
};

export const Route = createFileRoute("/integrations/netlify/callback")({
  component: NetlifyOAuthCallback,
});

function NetlifyOAuthCallback() {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [workspaceId, setWorkspaceId] = useState("");
  const [accountName, setAccountName] = useState("Netlify account");
  const [projects, setProjects] = useState<NetlifyProject[]>([]);
  const [websites, setWebsites] = useState<Website[]>([]);
  const [projectId, setProjectId] = useState("");
  const [websiteId, setWebsiteId] = useState("");
  const [busy, setBusy] = useState(true);
  const [linked, setLinked] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("Securing your Netlify authorization…");

  useEffect(() => {
    let active = true;
    const query = new URLSearchParams(window.location.search);
    const requestedWorkspace = query.get("workspaceId") || "";
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const accessToken = fragment.get("access_token") || "";
    const state = fragment.get("state") || "";
    const providerError = fragment.get("error") || "";
    // Netlify returns its OAuth access token in the URL fragment. Remove it from
    // browser history immediately; it is never persisted in local/session storage.
    window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
    setWorkspaceId(requestedWorkspace);

    if (providerError) {
      setError("Netlify did not approve the authorization. Return to Misma and try again.");
      setNotice("");
      setBusy(false);
      return () => { active = false; };
    }
    if (!requestedWorkspace || !accessToken || !state) {
      setError("The Netlify callback is incomplete or expired. Start the connection again from Misma.");
      setNotice("");
      setBusy(false);
      return () => { active = false; };
    }

    void (async () => {
      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !sessionData.session) {
          throw new Error("Sign in to Misma, then return to Plugins and start the Netlify connection again.");
        }
        const { data, error: invokeError } = await supabase.functions.invoke("misma-platform-integrations", {
          body: {
            action: "netlify-complete-installation",
            workspaceId: requestedWorkspace,
            accessToken,
            state,
          },
        });
        if (invokeError) throw new Error(invokeError.message || "Could not complete Netlify authorization.");
        if (data?.error) throw new Error(String(data.error));
        if (!active) return;
        const siteRows = Array.isArray(data?.projects) ? data.projects as NetlifyProject[] : [];
        setProjects(siteRows);
        setAccountName(String(data?.accountName || "Netlify account"));
        const { data: websiteRows, error: websiteError } = await supabase.from("website_connections")
          .select("id,name,domain")
          .eq("workspace_id", requestedWorkspace)
          .is("widget_deleted_at", null)
          .order("created_at", { ascending: false });
        if (websiteError) throw new Error("Netlify is connected, but Misma could not load the websites in this workspace.");
        if (!active) return;
        const options = (websiteRows || []) as Website[];
        setWebsites(options);
        setNotice(String(data?.message || "Netlify is connected. Choose a site and Misma website to associate."));
      } catch (cause) {
        if (active) {
          setError(cause instanceof Error ? cause.message : "Could not complete Netlify authorization.");
          setNotice("");
        }
      } finally {
        if (active) setBusy(false);
      }
    })();
    return () => { active = false; };
  }, [supabase]);

  async function refreshSites() {
    if (!workspaceId || busy) return;
    const connectionResult = await supabase.from("platform_connections")
      .select("id").eq("workspace_id", workspaceId).eq("provider", "netlify")
      .eq("status", "connected").order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (connectionResult.error || !connectionResult.data?.id) {
      setError("No connected Netlify account was found. Start the Netlify connection again.");
      return;
    }
    setBusy(true); setError(""); setNotice("Refreshing sites from Netlify…");
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("misma-platform-integrations", {
        body: { action: "netlify-refresh-projects", workspaceId, platformConnectionId: connectionResult.data.id },
      });
      if (invokeError) throw new Error(invokeError.message || "Could not refresh Netlify sites.");
      if (data?.error) throw new Error(String(data.error));
      setProjects(Array.isArray(data?.projects) ? data.projects as NetlifyProject[] : []);
      setNotice("Netlify site list refreshed.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not refresh Netlify sites.");
      setNotice("");
    } finally {
      setBusy(false);
    }
  }

  async function linkSite() {
    if (!workspaceId || !projectId || !websiteId || busy) return;
    setBusy(true); setError(""); setNotice("Associating the Netlify site with your Misma website…");
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("misma-platform-integrations", {
        body: { action: "netlify-link-project", workspaceId, platformProjectId: projectId, websiteConnectionId: websiteId },
      });
      if (invokeError) throw new Error(invokeError.message || "Could not associate the Netlify site.");
      if (data?.error) throw new Error(String(data.error));
      setLinked(true);
      setNotice(data?.alreadyLinked ? "This Netlify site is already associated with that Misma website." : "Netlify site associated with your Misma website.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not associate the Netlify site.");
      setNotice("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="aichat misma-vercel-callback-page">
      <div className="misma-vercel-callback-card">
        <a href="/dashboard/plugins" className="misma-integrations-back">← Back to plugins</a>
        <p className="misma-integrations-eyebrow">Misma · Netlify</p>
        <h1>Connect Netlify to Misma</h1>
        <p className="misma-integrations-intro">Misma verifies your authorization, discovers your Netlify sites and stores the access token in its encrypted server-side credential vault. The token is not returned to the browser.</p>
        {error && <div role="alert" className="misma-integrations-message is-error">{error}</div>}
        {notice && <div role="status" className="misma-integrations-message is-notice">{notice}</div>}
        {!busy && !error && <>
          <p><strong>Connected account:</strong> {accountName}</p>
          <label style={fieldLabel}>Netlify site
            <select value={projectId} onChange={(event) => setProjectId(event.target.value)} style={fieldStyle}>
              <option value="">Choose a Netlify site</option>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.name}{project.full_name && project.full_name !== project.name ? " · " + project.full_name : ""}</option>)}
            </select>
          </label>
          <label style={fieldLabel}>Misma website
            <select value={websiteId} onChange={(event) => setWebsiteId(event.target.value)} style={fieldStyle}>
              <option value="">Choose a connected Misma website</option>
              {websites.map((website) => <option key={website.id} value={website.id}>{website.name || website.domain} · {website.domain}</option>)}
            </select>
          </label>
          {!projects.length && <p style={helperText}>No sites were returned for this Netlify account. You can refresh the list or check the account's team/site access.</p>}
          {!websites.length && <p style={helperText}>This workspace has no active Misma websites yet. Add a website in Misma, then return to associate it.</p>}
          <div style={buttonRow}>
            <button type="button" onClick={() => void linkSite()} disabled={busy || !projectId || !websiteId} style={primaryButton}>{busy ? "Saving…" : "Associate site"}</button>
            <button type="button" onClick={() => void refreshSites()} disabled={busy} style={secondaryButton}>Refresh sites</button>
            <button type="button" onClick={() => window.location.assign("/dashboard/plugins")} disabled={busy || (!linked && projects.length > 0 && websites.length > 0)} style={secondaryButton}>Finish</button>
          </div>
        </>}
      </div>
    </main>
  );
}

const fieldLabel = { display: "grid", gap: 7, color: "#3d4a5d", fontSize: 13, fontWeight: 650, margin: "16px 0" } as const;
const fieldStyle = { width: "100%", boxSizing: "border-box" as const, border: "1px solid #d9e0e8", borderRadius: 10, padding: "11px 12px", background: "#fff", color: "#17202c", font: "inherit" };
const helperText = { color: "#667085", fontSize: 13 };
const buttonRow = { display: "flex", gap: 10, flexWrap: "wrap" as const };
const primaryButton = { background: "#152238", color: "#fff", border: 0, borderRadius: 10, padding: "12px 16px", fontWeight: 650, cursor: "pointer", marginTop: 12 } as const;
const secondaryButton = { background: "#f1f4f7", color: "#263448", border: "1px solid #dce2e9", borderRadius: 10, padding: "12px 16px", fontWeight: 600, cursor: "pointer" } as const;
