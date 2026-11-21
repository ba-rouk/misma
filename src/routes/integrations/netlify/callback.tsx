import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "../../../lib/supabase";

type NetlifySite = { id: string; name: string; dashboard_url: string | null; metadata: Record<string, unknown> | null };
type Website = { id: string; name: string | null; domain: string };

export const Route = createFileRoute("/integrations/netlify/callback")({ component: NetlifyOAuthCallback });

function NetlifyOAuthCallback() {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [workspaceId, setWorkspaceId] = useState("");
  const [sites, setSites] = useState<NetlifySite[]>([]);
  const [websites, setWebsites] = useState<Website[]>([]);
  const [siteId, setSiteId] = useState("");
  const [websiteId, setWebsiteId] = useState("");
  const [connectionId, setConnectionId] = useState("");
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [linked, setLinked] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("Completing secure Netlify authorization…");

  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const accessToken = fragment.get("access_token") || "";
    const state = fragment.get("state") || "";
    const providerError = fragment.get("error_description") || fragment.get("error") || "";
    // Netlify returns the implicit-grant token in the URL fragment; remove it immediately.
    window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
    const savedWorkspace = window.sessionStorage.getItem("misma_netlify_oauth_workspace_id") || "";
    window.sessionStorage.removeItem("misma_netlify_oauth_workspace_id");
    setWorkspaceId(savedWorkspace);
    if (providerError) { setError("Netlify authorization was declined or failed. Return to Plugins and try again."); setNotice(""); return; }
    if (!accessToken || !state || !savedWorkspace) { setError("The Netlify callback is incomplete or expired. Start the connection again from Plugins."); setNotice(""); return; }
    void (async () => {
      try {
        const { data, error: invokeError } = await supabase.functions.invoke("misma-platform-integrations", {
          body: { action: "netlify-complete-installation", workspaceId: savedWorkspace, accessToken, state },
        });
        if (invokeError) throw new Error(invokeError.message || "Could not complete Netlify authorization.");
        if (data?.error) throw new Error(String(data.error));
        const nextSites = Array.isArray(data?.sites) ? data.sites as NetlifySite[] : [];
        setSites(nextSites);
        setConnectionId(String(data?.platformConnectionId || ""));
        setConnected(true);
        const { data: authData } = await supabase.auth.getUser();
        if (authData.user) {
          const { error: installError } = await supabase.from("user_plugins").upsert({
            user_id: authData.user.id, provider: "netlify", is_installed: true, permission_mode: "low_risk", updated_at: new Date().toISOString(),
          }, { onConflict: "user_id,provider" });
          if (installError) throw new Error("Netlify is connected, but Misma could not enable it in your plugin list.");
        }
        const { data: websiteRows, error: websiteError } = await supabase.from("website_connections")
          .select("id,name,domain").eq("workspace_id", savedWorkspace).is("widget_deleted_at", null)
          .order("created_at", { ascending: false });
        if (websiteError) throw new Error("Netlify is connected, but Misma could not load your websites.");
        setWebsites((websiteRows || []) as Website[]);
        setNotice(nextSites.length ? "Netlify is connected. Choose one of its sites and a Misma website to associate them." : "Netlify is connected, but no sites were returned for this account.");
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not complete Netlify authorization."); setNotice(""); }
    })();
  }, [supabase]);

  async function refreshSites() {
    if (!connectionId || !workspaceId || busy) return;
    setBusy(true); setError(""); setNotice("Refreshing sites from Netlify…");
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("misma-platform-integrations", {
        body: { action: "netlify-refresh-sites", workspaceId, platformConnectionId: connectionId },
      });
      if (invokeError) throw new Error(invokeError.message || "Could not refresh Netlify sites.");
      if (data?.error) throw new Error(String(data.error));
      setSites(Array.isArray(data?.sites) ? data.sites as NetlifySite[] : []);
      setNotice("Netlify site list refreshed.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not refresh Netlify sites."); setNotice(""); }
    finally { setBusy(false); }
  }

  async function linkSite() {
    if (!siteId || !websiteId || !workspaceId || busy) return;
    setBusy(true); setError(""); setNotice("Associating the Netlify site with your Misma website…");
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("misma-platform-integrations", {
        body: { action: "netlify-link-site", workspaceId, platformProjectId: siteId, websiteConnectionId: websiteId },
      });
      if (invokeError) throw new Error(invokeError.message || "Could not link the Netlify site.");
      if (data?.error) throw new Error(String(data.error));
      setLinked(true);
      setNotice(data?.alreadyLinked ? "This Netlify site is already associated with that website." : "Netlify site linked to your Misma website.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not link the Netlify site."); setNotice(""); }
    finally { setBusy(false); }
  }

  return (
    <main className="misma-netlify-callback-page">
      <div className="misma-netlify-callback-card">
        <a href="/dashboard/plugins" className="misma-netlify-callback-back">← Back to plugins</a>
        <p className="misma-netlify-callback-eyebrow">Misma · Netlify</p>
        <h1>Connect Netlify to Misma</h1>
        <p className="misma-netlify-callback-intro">Your Netlify access token is stored encrypted. Misma returns site metadata to this page and does not expose the token.</p>
        {error && <div role="alert" className="misma-netlify-callback-message is-error">{error}</div>}
        {notice && <div role="status" className="misma-netlify-callback-message">{notice}</div>}
        {connected && <>
          <label className="misma-netlify-callback-field">Misma website
            <select value={websiteId} onChange={(event) => setWebsiteId(event.target.value)}>
              <option value="">Choose a website</option>
              {websites.map((website) => <option key={website.id} value={website.id}>{website.name || website.domain} · {website.domain}</option>)}
            </select>
          </label>
          <label className="misma-netlify-callback-field">Netlify site
            <select value={siteId} onChange={(event) => setSiteId(event.target.value)}>
              <option value="">Choose a Netlify site</option>
              {sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
            </select>
          </label>
          {!sites.length && <button type="button" className="misma-netlify-callback-secondary" onClick={() => void refreshSites()} disabled={busy}>{busy ? "Refreshing…" : "Refresh Netlify sites"}</button>}
          <div className="misma-netlify-callback-actions">
            <button type="button" onClick={() => void linkSite()} disabled={busy || !siteId || !websiteId}>Link site to website</button>
            <button type="button" className="misma-netlify-callback-secondary" onClick={() => window.location.assign("/dashboard/plugins")} disabled={busy || (!linked && sites.length > 0 && websites.length > 0)}>Finish</button>
          </div>
          {sites.length > 0 && <ul className="misma-netlify-callback-site-list">{sites.map((site) => <li key={site.id}><strong>{site.name}</strong>{site.dashboard_url && <a href={site.dashboard_url} target="_blank" rel="noreferrer">Open Netlify</a>}</li>)}</ul>}
        </>}
        {!connected && !error && <p>Verifying Netlify authorization…</p>}
        {(error || (connected && (!sites.length || !websites.length))) && <button type="button" className="misma-netlify-callback-secondary" onClick={() => window.location.assign("/dashboard/plugins")}>Return to plugins</button>}
      </div>
    </main>
  );
}