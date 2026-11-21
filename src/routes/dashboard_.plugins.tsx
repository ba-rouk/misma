import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "../lib/supabase";
import { getPluginWorkspaceContext } from "../lib/plugin-connect";
import { pluginList, type PluginId } from "../lib/plugin-manifests";
import { PluginProviderLogo } from "../components/plugin-provider-logo";
import type { PluginConnectionSummary } from "../components/plugin-settings-sheet";
import { Badge, GlassCard, Input, SectionHeader } from "../components/misma-glass";

export const Route = createFileRoute("/dashboard/plugins")({ component: PluginsPage });
type Website = { id: string; name: string | null; domain: string; website_url: string | null; workspace_id: string };
type UserPlugin = { provider: PluginId; is_installed: boolean; permission_mode: string; account_label: string | null };

function PluginsPage() {
  const supabase = getSupabaseClient();
  const [userId, setUserId] = useState("");
  const [filter, setFilter] = useState<"All" | "Installed" | "Developer tools" | "Hosting">("All");
  const [connections, setConnections] = useState<PluginConnectionSummary[]>([]);
  const [userPlugins, setUserPlugins] = useState<UserPlugin[]>([]);
  const [websites, setWebsites] = useState<Website[]>([]);
  const [websiteId, setWebsiteId] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<PluginId | "">("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams(window.location.search);
    const requestedWebsite = params.get("websiteId") || window.sessionStorage.getItem("misma_plugins_website_id") || "";
    if (requestedWebsite) setWebsiteId(requestedWebsite);
    void (async () => {
      try {
        const context = await getPluginWorkspaceContext(requestedWebsite);
        if (!active) return;
        setUserId(context.user.id);
        await loadWorkspaceData(context.workspaceIds, active, context.user.id);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load your plugins.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [supabase]);

  async function loadWorkspaceData(ids: string[], stillActive = true, currentUserId = userId) {
    const [connectionResult, websiteResult, pluginResult] = await Promise.all([
      supabase.from("platform_connections").select("id,provider,external_account_name,status,updated_at,created_at,workspace_id")
        .in("workspace_id", ids).order("updated_at", { ascending: false }),
      supabase.from("website_connections").select("id,name,domain,website_url,workspace_id")
        .in("workspace_id", ids).is("widget_deleted_at", null).order("created_at", { ascending: false }),
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
  const visiblePlugins = pluginList;
  const filteredPlugins = useMemo(() => visiblePlugins.filter((plugin) => {
    const text = [plugin.name, plugin.description, plugin.tagline, plugin.role, plugin.developer].join(" ").toLowerCase();
    return !query.trim() || text.includes(query.trim().toLowerCase());
  }), [query]);
  const filteredByCategory = filteredPlugins.filter((plugin) =>
    filter === "All" ||
    (filter === "Installed" && installedByProvider.has(plugin.id)) ||
    (filter === "Developer tools" && plugin.category === "Code host") ||
    (filter === "Hosting" && plugin.category === "Hosting")
  );
  const installedPlugins = visiblePlugins.filter((plugin) => {
    if (!installedByProvider.has(plugin.id)) return false;
    if (filter === "Developer tools" && plugin.category !== "Code host") return false;
    if (filter === "Hosting" && plugin.category !== "Hosting") return false;
    const searchText = [plugin.name, plugin.description, plugin.tagline, plugin.developer].join(" ").toLowerCase();
    return !query.trim() || searchText.includes(query.trim().toLowerCase());
  });
  const popularPlugins = filteredByCategory.filter((plugin) => ["github", "vercel"].includes(plugin.id) && !installedByProvider.has(plugin.id));
  const newPlugins = filteredByCategory.filter((plugin) => ["render", "netlify"].includes(plugin.id) && !installedByProvider.has(plugin.id));
  const selectedWebsite = websites.find((website) => website.id === websiteId) || null;
  function openDetails(provider: PluginId) {
    const suffix = websiteId ? "?websiteId=" + encodeURIComponent(websiteId) : "";
    window.location.assign("/dashboard/plugins/" + provider + suffix);
  }

  function openConsent(provider: PluginId) {
    if (!pluginList.some((item) => item.id === provider) || !userId) return;
    const suffix = websiteId ? "?websiteId=" + encodeURIComponent(websiteId) : "";
    window.location.assign("/dashboard/plugins/" + provider + "/connect" + suffix);
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



  const renderPluginRow = (plugin: (typeof pluginList)[number]) => {
    const connected = installedByProvider.has(plugin.id);
    const unavailable = plugin.status === "coming" || plugin.authType === "oauth_pending";
    return (
      <article className="misma-plugin-available-row" key={plugin.id}>
        <button type="button" className="misma-plugin-row-content" onClick={() => openDetails(plugin.id)} aria-label={"View " + plugin.name + " details"}>
          <PluginProviderLogo provider={plugin.id} size="lg" />
          <span className="misma-plugin-row-copy"><strong>{plugin.name}</strong><small>{plugin.tagline}</small></span>
        </button>
        <div className="misma-plugin-row-end">
          <Badge tone={connected ? "success" : unavailable ? "warning" : "neutral"}>{connected ? "Connected" : unavailable ? "Unavailable" : "Available"}</Badge>
          {connected ? (
            <button type="button" className="misma-plugin-add" aria-label={"Open " + plugin.name} onClick={() => openDetails(plugin.id)}>›</button>
          ) : (
            <button type="button" className="misma-plugin-add" aria-label={"Add " + plugin.name} title={"Add " + plugin.name} disabled={busy === plugin.id} onClick={() => openConsent(plugin.id)}>
              {busy === plugin.id ? "…" : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>}
            </button>
          )}
        </div>
      </article>
    );
  };

  return (
    <main className="misma-marketplace-page misma-plugin-directory-page">
      <div className="misma-marketplace-shell misma-plugin-directory-shell">
        <header className="misma-marketplace-header misma-plugin-directory-header">
          <div className="misma-plugin-header-title">
            <button type="button" className="misma-page-back-button" aria-label="Go to dashboard" onClick={() => window.location.assign("/dashboard")}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18 9 12l6-6M9 12h12" /></svg>
            </button>
            <div><h1>Plugins</h1><p>Business AI, connected.</p></div>
          </div>
          <label className="misma-plugin-directory-filter-label">
            <span className="misma-sr-only">Filter plugins</span>
            <select className="misma-plugin-directory-filter" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}>
              <option>All</option><option>Installed</option><option>Developer tools</option><option>Hosting</option>
            </select>
          </label>
        </header>

        {selectedWebsite && <div className="misma-plugin-website-context"><span>Website context</span><strong>{selectedWebsite.name || selectedWebsite.domain}</strong><button type="button" onClick={() => { setWebsiteId(""); window.sessionStorage.removeItem("misma_plugins_website_id"); window.history.replaceState(null, "", "/dashboard/plugins"); }}>Clear</button></div>}
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
          ) : <GlassCard className="misma-plugin-empty-installed">No plugins connected yet. Add one from the directory below.</GlassCard>}
        </section>

        {filter !== "Installed" && (
          <>
            {(filter === "All" || filter === "Developer tools") && <section className="misma-plugin-available-section" aria-labelledby="misma-popular-title">
              <SectionHeader title="Popular" description="Connect the tools that power your development workflow." />
              {loading ? <div className="misma-plugin-skeleton-list"><span/><span/></div> : popularPlugins.length ? (
                <div className="misma-plugin-available-list">{popularPlugins.map(renderPluginRow)}</div>
              ) : <GlassCard className="misma-plugin-empty-installed">{query ? "No matching popular plugins." : "All popular plugins are installed."}</GlassCard>}
            </section>}
            {(filter === "All" || filter === "Hosting") && <section className="misma-plugin-available-section" aria-labelledby="misma-new-title">
              <SectionHeader title="New & noteworthy" description="More integrations are being prepared for Misma." />
              {loading ? <div className="misma-plugin-skeleton-list"><span/><span/></div> : newPlugins.length ? (
                <div className="misma-plugin-available-list">{newPlugins.map(renderPluginRow)}</div>
              ) : <GlassCard className="misma-plugin-empty-installed">No matching new integrations.</GlassCard>}
            </section>}
          </>
        )}
      </div>

      <div className="misma-plugin-search-dock">
        <label className="misma-marketplace-search" htmlFor="misma-plugin-search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></svg>
          <Input id="misma-plugin-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search plugins" aria-label="Search plugins" />
          {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search">×</button>}
        </label>
      </div>
    </main>
  );
}
