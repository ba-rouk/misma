import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "../lib/supabase";
import { openPluginInChat } from "../lib/plugin-connect";
import { pluginList, type PluginId, type PluginManifest } from "../lib/plugin-manifests";
import { PluginProviderLogo } from "../components/plugin-provider-logo";
import { PluginConnectConsent } from "../components/plugin-connect-consent";
import type { PluginConnectionSummary } from "../components/plugin-settings-sheet";
import { Badge, GlassCard, Input, SectionHeader } from "../components/misma-glass";

export const Route = createFileRoute("/dashboard/plugins")({ component: PluginsPage });
type Workspace = { id: string; name: string };
type Website = { id: string; name: string | null; domain: string; website_url: string | null };
type UserPlugin = { provider: PluginId; is_installed: boolean; permission_mode: string; account_label: string | null };

function PluginsPage() {
  const supabase = getSupabaseClient();
  const [userId, setUserId] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [connections, setConnections] = useState<PluginConnectionSummary[]>([]);
  const [userPlugins, setUserPlugins] = useState<UserPlugin[]>([]);
  const [websites, setWebsites] = useState<Website[]>([]);
  const [websiteId, setWebsiteId] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<PluginId | "">("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [menuOpen, setMenuOpen] = useState<PluginId | null>(null);
  const [consentProvider, setConsentProvider] = useState<PluginManifest | null>(null);

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
        if (!ids.length) throw new Error("Ask a Misma account owner or admin to manage plugins.");
        const { data: workspaceRows, error: workspaceError } = await supabase.from("workspaces")
          .select("id,name").in("id", ids).order("created_at", { ascending: true });
        if (workspaceError) throw workspaceError;
        const options = (workspaceRows || []) as Workspace[];
        const initial = options[0];
        if (!initial) throw new Error("No provider connection is available for this Misma account.");
        if (!active) return;
        setUserId(user.id);
        setWorkspaceId(initial.id);
        await loadWorkspaceData(initial.id, active, user.id);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load your plugins.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [supabase]);

  async function loadWorkspaceData(id: string, stillActive = true, currentUserId = userId) {
    const [connectionResult, websiteResult, pluginResult] = await Promise.all([
      supabase.from("platform_connections").select("id,provider,external_account_name,status,updated_at,created_at")
        .eq("workspace_id", id).order("updated_at", { ascending: false }),
      supabase.from("website_connections").select("id,name,domain,website_url")
        .eq("workspace_id", id).is("widget_deleted_at", null).order("created_at", { ascending: false }),
      supabase.from("user_plugins").select("provider,is_installed,permission_mode,account_label").eq("user_id", currentUserId),
    ]);
    if (connectionResult.error) throw connectionResult.error;
    if (websiteResult.error) throw websiteResult.error;
    if (pluginResult.error) throw pluginResult.error;
    if (!stillActive) return;
    const connectedRows = (connectionResult.data || []) as PluginConnectionSummary[];
    const pluginRows = (pluginResult.data || []) as UserPlugin[];
    // When OAuth first returns, create the per-user install record once. An explicit uninstall stays uninstalled.
    const known = new Set(pluginRows.map((item) => item.provider));
    const newlyConnected = [...new Set(connectedRows.filter((item) => item.status === "connected").map((item) => item.provider))]
      .filter((provider) => !known.has(provider));
    if (newlyConnected.length) {
      const { error: insertError } = await supabase.from("user_plugins").upsert(
        newlyConnected.map((provider) => ({ user_id: currentUserId, provider, is_installed: true, permission_mode: "low_risk" })),
        { onConflict: "user_id,provider" },
      );
      if (!insertError) {
        newlyConnected.forEach((provider) => pluginRows.push({ provider, is_installed: true, permission_mode: "low_risk", account_label: null }));
      }
    }
    setConnections(connectedRows);
    setUserPlugins(pluginRows);
    setWebsites((websiteResult.data || []) as Website[]);
  }

  const installedByProvider = useMemo(() => {
    const map = new Map<PluginId, PluginConnectionSummary>();
    for (const connection of connections) {
      const installed = userPlugins.some((item) => item.provider === connection.provider && item.is_installed);
      if (connection.status === "connected" && installed && !map.has(connection.provider)) map.set(connection.provider, connection);
    }
    return map;
  }, [connections, userPlugins]);
  const filteredPlugins = useMemo(() => pluginList.filter((plugin) => {
    const text = [plugin.name, plugin.description, plugin.role, plugin.developer].join(" ").toLowerCase();
    return !query.trim() || text.includes(query.trim().toLowerCase());
  }), [query]);
  const installedPlugins = pluginList.filter((plugin) => installedByProvider.has(plugin.id));
  const selectedWebsite = websites.find((website) => website.id === websiteId) || null;
  function openDetails(provider: PluginId) {
    const suffix = websiteId ? "?websiteId=" + encodeURIComponent(websiteId) : "";
    window.location.assign("/dashboard/plugins/" + provider + suffix);
  }

  async function openConsent(provider: PluginId) {
    const manifest = pluginList.find((item) => item.id === provider) || null;
    if (!manifest || manifest.status === "coming" || !userId) return;
    setError("");
    const existingConnection = installedByProvider.get(provider) ||
      connections.find((item) => item.provider === provider && item.status === "connected");
    const existingPreference = userPlugins.find((item) => item.provider === provider);
    if (existingConnection && existingPreference?.is_installed === false) {
      setBusy(provider);
      try {
        const { error: restoreError } = await supabase.from("user_plugins").upsert({
          user_id: userId,
          provider,
          permission_mode: existingPreference.permission_mode || "low_risk",
          account_label: existingPreference.account_label || null,
          is_installed: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id,provider" });
        if (restoreError) throw restoreError;
        setUserPlugins((rows) => rows.map((item) => item.provider === provider ? { ...item, is_installed: true } : item));
        setNotice(manifest.name + " has been added back to your installed plugins.");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not reinstall this plugin.");
      } finally {
        setBusy("");
      }
      return;
    }
    setConsentProvider(manifest);
  }

  async function uninstall(provider: PluginId) {
    if (!userId || busy) return;
    const manifest = pluginList.find((item) => item.id === provider);
    if (!window.confirm("Uninstall " + manifest?.name + " from your Misma account? This does not disconnect or delete the provider account or its resources.")) return;
    setBusy(provider);
    setError("");
    setNotice("");
    try {
      const existing = userPlugins.find((item) => item.provider === provider);
      const { error: saveError } = await supabase.from("user_plugins").upsert({
        user_id: userId, provider, is_installed: false,
        permission_mode: existing?.permission_mode || "low_risk",
        account_label: existing?.account_label || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,provider" });
      if (saveError) throw saveError;
      setUserPlugins((rows) => rows.some((item) => item.provider === provider)
        ? rows.map((item) => item.provider === provider ? { ...item, is_installed: false } : item)
        : [...rows, { provider, is_installed: false, permission_mode: "low_risk", account_label: null }]);
      setNotice((manifest?.name || "Plugin") + " was uninstalled. Its provider account remains connected.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not uninstall this plugin.");
    } finally {
      setBusy("");
    }
  }



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
          <button type="button" className="misma-plugin-header-settings" aria-label="Plugin settings" title="Plugin settings" onClick={() => window.location.assign("/dashboard/plugins/" + (installedPlugins[0]?.id || pluginList[0]?.id || "github") + "/settings")}>
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
                            <button type="button" role="menuitem" onClick={() => { setMenuOpen(null); window.location.assign("/dashboard/plugins/" + plugin.id + "/settings"); }}>Settings</button>
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

    </main>
  );
}
