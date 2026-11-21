import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "../lib/supabase";
import { openPluginInChat } from "../lib/plugin-connect";
import { pluginList, type PluginId, type PluginManifest } from "../lib/plugin-manifests";
import { PluginProviderLogo } from "../components/plugin-provider-logo";
import { PluginConnectConsent } from "../components/plugin-connect-consent";
import { PluginSettingsSheet, type PluginConnectionSummary } from "../components/plugin-settings-sheet";
import { Badge, GlassCard, Input, SectionHeader } from "../components/misma-glass";

export const Route = createFileRoute("/dashboard/plugins")({ component: PluginsPage });
type Workspace = { id: string; name: string };
type Website = { id: string; name: string | null; domain: string; website_url: string | null };
type PlatformProject = { id: string; provider: PluginId; name: string; full_name: string | null; platform_connection_id: string };

function PluginsPage() {
  const supabase = getSupabaseClient();
  const [userId, setUserId] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [connections, setConnections] = useState<PluginConnectionSummary[]>([]);
  const [projects, setProjects] = useState<PlatformProject[]>([]);
  const [websites, setWebsites] = useState<Website[]>([]);
  const [websiteId, setWebsiteId] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<PluginId | "">("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [menuOpen, setMenuOpen] = useState<PluginId | null>(null);
  const [consentProvider, setConsentProvider] = useState<PluginManifest | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsProvider, setSettingsProvider] = useState<PluginId | null>(null);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams(window.location.search);
    const requestedWebsite = params.get("websiteId") || window.sessionStorage.getItem("misma_plugins_website_id") || "";
    if (requestedWebsite) setWebsiteId(requestedWebsite);
    void (async () => {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
          window.location.assign("/login");
          return;
        }
        const { data: memberships, error: membershipError } = await supabase.from("workspace_members")
          .select("workspace_id,role").eq("user_id", user.id);
        if (membershipError) throw membershipError;
        const ids = [...new Set((memberships || [])
          .filter((row) => ["owner", "admin"].includes(String(row.role)))
          .map((row) => String(row.workspace_id)))];
        if (!ids.length) throw new Error("Ask a Misma workspace owner or admin to manage plugins.");
        const { data: workspaceRows, error: workspaceError } = await supabase.from("workspaces")
          .select("id,name").in("id", ids).order("created_at", { ascending: true });
        if (workspaceError) throw workspaceError;
        const options = (workspaceRows || []) as Workspace[];
        const saved = window.sessionStorage.getItem("misma_integrations_workspace") || "";
        const initial = options.find((item) => item.id === saved) || options[0];
        if (!initial) throw new Error("No Misma workspace is available for this account.");
        if (!active) return;
        setUserId(user.id);
        setWorkspaceId(initial.id);
        window.sessionStorage.setItem("misma_integrations_workspace", initial.id);
        await loadWorkspaceData(initial.id, active);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load your plugins.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [supabase]);

  async function loadWorkspaceData(id: string, stillActive = true) {
    const [connectionResult, projectResult, websiteResult] = await Promise.all([
      supabase.from("platform_connections").select("id,provider,external_account_name,status,updated_at")
        .eq("workspace_id", id).order("updated_at", { ascending: false }),
      supabase.from("platform_projects").select("id,provider,name,full_name,platform_connection_id")
        .eq("workspace_id", id).order("name", { ascending: true }),
      supabase.from("website_connections").select("id,name,domain,website_url")
        .eq("workspace_id", id).is("widget_deleted_at", null).order("created_at", { ascending: false }),
    ]);
    if (connectionResult.error) throw connectionResult.error;
    if (projectResult.error) throw projectResult.error;
    if (websiteResult.error) throw websiteResult.error;
    if (!stillActive) return;
    setConnections((connectionResult.data || []) as PluginConnectionSummary[]);
    setProjects((projectResult.data || []) as PlatformProject[]);
    setWebsites((websiteResult.data || []) as Website[]);
  }

  const installedByProvider = useMemo(() => {
    const map = new Map<PluginId, PluginConnectionSummary>();
    for (const connection of connections) {
      if (connection.status === "connected" && !map.has(connection.provider)) map.set(connection.provider, connection);
    }
    return map;
  }, [connections]);
  const filteredPlugins = useMemo(() => pluginList.filter((plugin) => {
    const text = [plugin.name, plugin.description, plugin.role, plugin.developer].join(" ").toLowerCase();
    return !query.trim() || text.includes(query.trim().toLowerCase());
  }), [query]);
  const installedPlugins = pluginList.filter((plugin) => installedByProvider.has(plugin.id));
  const selectedWebsite = websites.find((website) => website.id === websiteId) || null;
  const linkedProjects = useMemo(() => {
    const grouped: Record<string, string[]> = {};
    for (const plugin of pluginList) {
      grouped[plugin.id] = projects.filter((project) => project.provider === plugin.id)
        .map((project) => project.full_name || project.name).slice(0, 12);
    }
    return grouped;
  }, [projects]);

  function openDetails(provider: PluginId) {
    const suffix = websiteId ? "?websiteId=" + encodeURIComponent(websiteId) : "";
    window.location.assign("/dashboard/plugins/" + provider + suffix);
  }

  function openConsent(provider: PluginId) {
    const manifest = pluginList.find((item) => item.id === provider) || null;
    if (!manifest || manifest.status === "coming") return;
    setError("");
    setConsentProvider(manifest);
  }

  async function uninstall(provider: PluginId) {
    const connection = installedByProvider.get(provider);
    if (!connection || !workspaceId || busy) return;
    const manifest = pluginList.find((item) => item.id === provider);
    if (!window.confirm("Uninstall " + manifest?.name + " from this Misma workspace? This does not delete your repositories, projects, services, or deployments.")) return;
    setBusy(provider);
    setError("");
    setNotice("");
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("misma-platform-integrations", {
        body: { action: "platform-disconnect", workspaceId, provider, platformConnectionId: connection.id },
      });
      if (invokeError) throw new Error(invokeError.message || "Could not uninstall this plugin.");
      if (data?.error) throw new Error(String(data.error));
      setConnections((current) => current.map((item) => item.id === connection.id ? { ...item, status: "disconnected" } : item));
      setNotice(manifest?.name + " has been disconnected from this Misma workspace.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not uninstall this plugin.");
    } finally {
      setBusy("");
    }
  }

  const startSettings = (provider?: PluginId) => {
    setSettingsProvider(provider || null);
    setSettingsOpen(true);
    setMenuOpen(null);
  };

  return (
    <main className="misma-marketplace-page">
      <div className="misma-marketplace-shell misma-plugin-directory-shell">
        <header className="misma-marketplace-header misma-plugin-directory-header">
          <div className="misma-plugin-header-title">
            <button type="button" className="misma-marketplace-back-button" aria-label="Go to previous page" onClick={() => {
              if (window.history.length > 1) window.history.back();
              else window.location.assign("/dashboard");
            }}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18 9 12l6-6M9 12h12" /></svg>
            </button>
            <div><h1>Plugins</h1><p>Connect plugins to let Misma work across your tools.</p></div>
          </div>
          <button type="button" className="misma-plugin-header-settings" aria-label="Plugin settings" title="Plugin settings" onClick={() => startSettings()}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .4 1.9l.1.1-2.4 2.4-.1-.1a1.7 1.7 0 0 0-1.9-.4 1.7 1.7 0 0 0-1 1.6v.2h-3.4v-.2a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.4l-.1.1-2.4-2.4.1-.1a1.7 1.7 0 0 0 .4-1.9 1.7 1.7 0 0 0-1.6-1H4v-3.4h.2a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.4-1.9l-.1-.1 2.4-2.4.1.1a1.7 1.7 0 0 0 1.9.4 1.7 1.7 0 0 0 1-1.6V4h3.4v.2a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.4l.1-.1 2.4 2.4-.1.1a1.7 1.7 0 0 0-.4 1.9 1.7 1.7 0 0 0 1.6 1h.2v3.4H21a1.7 1.7 0 0 0-1.6 1Z"/></svg>
          </button>
        </header>

        <label className="misma-marketplace-search" htmlFor="misma-plugin-search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></svg>
          <Input id="misma-plugin-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search plugins" aria-label="Search plugins" />
          {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search">×</button>}
        </label>

        {selectedWebsite && <div className="misma-plugin-website-context"><span>Website selected</span><strong>{selectedWebsite.name || selectedWebsite.domain}</strong><button type="button" onClick={() => { setWebsiteId(""); window.sessionStorage.removeItem("misma_plugins_website_id"); window.history.replaceState(null, "", "/dashboard/plugins"); }}>Clear</button></div>}
        {notice && <p className="misma-plugin-feedback" role="status">{notice}</p>}
        {error && <p className="misma-plugin-feedback is-error" role="alert">{error}</p>}

        <section className="misma-plugin-installed-section" aria-labelledby="misma-installed-title">
          <SectionHeader title="Installed" description={installedPlugins.length ? installedPlugins.length + " connected plugins" : "Your connected plugins appear here."} />
          {loading ? <div className="misma-plugin-loading" aria-label="Loading plugins"><span/><span/><span/></div> : installedPlugins.length ? (
            <div className="misma-plugin-installed-strip">
              {installedPlugins.map((plugin) => (
                <button type="button" className="misma-plugin-installed-item" key={plugin.id} onClick={() => openDetails(plugin.id)} aria-label={"Open " + plugin.name + " details"}>
                  <PluginProviderLogo provider={plugin.id} size="lg" />
                  <span>{plugin.name}</span>
                </button>
              ))}
            </div>
          ) : <GlassCard className="misma-plugin-empty-installed">No plugins connected yet. Add one from the list below.</GlassCard>}
        </section>

        <section className="misma-plugin-available-section" aria-labelledby="misma-available-title">
          <SectionHeader title="Available" description="Choose a plugin to see its capabilities and permissions." />
          {loading ? <div className="misma-plugin-skeleton-list"><span/><span/><span/><span/></div> : filteredPlugins.length ? (
            <div className="misma-plugin-available-list">
              {filteredPlugins.map((plugin) => {
                const connection = installedByProvider.get(plugin.id);
                const connected = Boolean(connection);
                const coming = plugin.status === "coming";
                const menuIsOpen = menuOpen === plugin.id;
                return (
                  <article className="misma-plugin-available-row" key={plugin.id}>
                    <button type="button" className="misma-plugin-row-content" onClick={() => openDetails(plugin.id)} aria-label={"View " + plugin.name + " details"}>
                      <PluginProviderLogo provider={plugin.id} size="lg" />
                      <span className="misma-plugin-row-copy"><strong>{plugin.name}</strong><small>{plugin.tagline}</small></span>
                    </button>
                    <div className="misma-plugin-row-end">
                      <Badge tone={connected ? "success" : coming ? "warning" : "neutral"}>{connected ? "Connected" : coming ? "Coming later" : "Not connected"}</Badge>
                      {connected ? (
                        <div className="misma-plugin-overflow-wrap">
                          <button type="button" className="misma-plugin-overflow" aria-label={plugin.name + " options"} aria-haspopup="menu" aria-expanded={menuIsOpen} onClick={() => setMenuOpen(menuIsOpen ? null : plugin.id)}>
                            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>
                          </button>
                          {menuIsOpen && <div className="misma-plugin-overflow-menu" role="menu">
                            <button type="button" role="menuitem" onClick={() => { setMenuOpen(null); openPluginInChat(plugin.id, websiteId); }}>Try in chat</button>
                            <button type="button" role="menuitem" onClick={() => startSettings(plugin.id)}>Settings</button>
                            <div />
                            <button type="button" role="menuitem" className="is-danger" disabled={busy === plugin.id} onClick={() => { setMenuOpen(null); void uninstall(plugin.id); }}>Uninstall</button>
                          </div>}
                        </div>
                      ) : coming ? (
                        <button type="button" className="misma-plugin-info" aria-label={"More about " + plugin.name} title="More information" onClick={() => openDetails(plugin.id)}>
                          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7h.01"/></svg>
                        </button>
                      ) : (
                        <button type="button" className="misma-plugin-add" aria-label={"Connect " + plugin.name} title={"Connect " + plugin.name} disabled={busy === plugin.id} onClick={() => openConsent(plugin.id)}>
                          {busy === plugin.id ? "…" : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>}
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : <GlassCard className="misma-plugin-empty-installed">No plugins match “{query}”.</GlassCard>}
        </section>
      </div>

      <PluginConnectConsent manifest={consentProvider} workspaceId={workspaceId} open={Boolean(consentProvider)} onClose={() => setConsentProvider(null)} />
      <PluginSettingsSheet
        open={settingsOpen}
        manifests={pluginList}
        connections={connections}
        workspaceId={workspaceId}
        userId={userId}
        initialProvider={settingsProvider}
        linkedProjects={linkedProjects}
        onClose={() => { setSettingsOpen(false); setSettingsProvider(null); }}
        onReconnect={(provider) => { setSettingsOpen(false); openConsent(provider); }}
        onUninstall={(provider) => { setSettingsOpen(false); void uninstall(provider); }}
      />
    </main>
  );
}
