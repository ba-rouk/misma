import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "../lib/supabase";
import { getPluginAuthorizationUrl, getPluginWorkspaceContext, openPluginInChat } from "../lib/plugin-connect";
import { pluginList, type PluginId } from "../lib/plugin-manifests";
import { PluginProviderLogo } from "../components/plugin-provider-logo";
import type { PluginConnectionSummary } from "../components/plugin-settings-sheet";
import { Input, SectionHeader } from "../components/misma-glass";

export const Route = createFileRoute("/dashboard/plugins")({ component: PluginsPage });
type Website = { id: string; name: string | null; domain: string; website_url: string | null; workspace_id: string };
type UserPlugin = { provider: PluginId; is_installed: boolean; permission_mode: string; account_label: string | null };

function PluginsPage() {
  const supabase = getSupabaseClient();
  const [userId, setUserId] = useState("");
  const [connections, setConnections] = useState<PluginConnectionSummary[]>([]);
  const [userPlugins, setUserPlugins] = useState<UserPlugin[]>([]);
  const [websites, setWebsites] = useState<Website[]>([]);
  const [websiteId, setWebsiteId] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<PluginId | "">("");
  const [openPluginMenu, setOpenPluginMenu] = useState<{ provider: PluginId; top: number; left: number } | null>(null);
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
  const selectedWebsite = websites.find((website) => website.id === websiteId) || null;
  function openDetails(provider: PluginId) {
    setOpenPluginMenu(null);
    const suffix = websiteId ? "?websiteId=" + encodeURIComponent(websiteId) : "";
    window.location.assign("/dashboard/plugins/" + provider + "/description" + suffix);
  }

  async function openConsent(provider: PluginId) {
    if (!pluginList.some((item) => item.id === provider) || !userId || busy) return;
    setBusy(provider);
    setError("");
    try {
      if (provider === "netlify") {
        // Start Netlify OAuth from the plus button. Keep the selected website
        // in this tab because Netlify returns its access token in the URL fragment.
        if (websiteId) window.sessionStorage.setItem("misma_plugins_website_id", websiteId);
        else window.sessionStorage.removeItem("misma_plugins_website_id");
        const context = await getPluginWorkspaceContext(websiteId);
        const authorizationUrl = await getPluginAuthorizationUrl(context.workspaceId, provider);
        window.location.assign(authorizationUrl);
        return;
      }
      const suffix = websiteId ? "?websiteId=" + encodeURIComponent(websiteId) : "";
      window.location.assign("/dashboard/plugins/" + provider + "/connect" + suffix);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start the provider connection.");
    } finally {
      setBusy("");
    }
  }

  function navigateBack() {
    window.location.assign("/dashboard");
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



  const openPluginOptions = (provider: PluginId, element: HTMLButtonElement) => {
    const rect = element.getBoundingClientRect();
    const menuWidth = 184;
    const menuHeight = 126;
    const top = rect.bottom + menuHeight + 8 > window.innerHeight
      ? Math.max(8, rect.top - menuHeight - 6)
      : rect.bottom + 6;
    const left = Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8));
    setOpenPluginMenu((current) => current?.provider === provider ? null : { provider, top, left });
  };

  const renderProviderCard = (plugin: (typeof pluginList)[number]) => {
    const connection = installedByProvider.get(plugin.id);
    const connected = Boolean(connection);
    const unavailable = plugin.status === "coming" || plugin.authType === "oauth_pending";
    const menuOpen = openPluginMenu?.provider === plugin.id;
    const accountName = userPlugins.find((item) => item.provider === plugin.id)?.account_label
      || connection?.external_account_name;
    return (
      <article className={"misma-plugin-provider-card" + (connected ? " is-connected" : "")} key={plugin.id}>
        <button
          type="button"
          className="misma-plugin-provider-open"
          onClick={() => openDetails(plugin.id)}
          aria-label={"Open " + plugin.name + " description"}
        >
          <PluginProviderLogo provider={plugin.id} size="lg" />
          <span className="misma-plugin-provider-copy">
            <strong>{plugin.name}</strong>
            <small>{connected ? accountName || "Connected account" : plugin.tagline}</small>
          </span>
        </button>
        {connected ? (
          <button
            type="button"
            className="misma-plugin-provider-menu-trigger"
            aria-label={"More options for " + plugin.name}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            disabled={busy === plugin.id}
            onClick={(event) => {
              event.stopPropagation();
              openPluginOptions(plugin.id, event.currentTarget);
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="19" r="1.7"/></svg>
          </button>
        ) : (
          <button
            type="button"
            className="misma-plugin-provider-add"
            aria-label={"Add " + plugin.name}
            title={unavailable ? plugin.name + " is not available yet" : "Connect " + plugin.name}
            disabled={busy === plugin.id || unavailable || !userId}
            onClick={() => openConsent(plugin.id)}
          >
            {busy === plugin.id ? "…" : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>}
          </button>
        )}
      </article>
    );
  };

  return (
    <main className="misma-marketplace-page misma-plugin-directory-page" onClick={() => setOpenPluginMenu(null)}>
      <div className="misma-marketplace-shell misma-plugin-directory-shell">
        <header className="misma-marketplace-header misma-plugin-directory-header">
          <button type="button" className="misma-page-back-button misma-plugin-directory-back" aria-label="Go to previous page" onClick={navigateBack}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18 9 12l6-6M9 12h12" /></svg>
          </button>
          <div className="misma-plugin-directory-heading"><h1>Plugins</h1></div>
        </header>
        <div className="misma-plugin-search-dock">
          <label className="misma-marketplace-search" htmlFor="misma-plugin-search">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></svg>
            <Input id="misma-plugin-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search plugins" aria-label="Search plugins" />
            {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search">×</button>}
          </label>
        </div>

        {selectedWebsite && <div className="misma-plugin-website-context"><span>Website context</span><strong>{selectedWebsite.name || selectedWebsite.domain}</strong><button type="button" onClick={() => { setWebsiteId(""); window.sessionStorage.removeItem("misma_plugins_website_id"); window.history.replaceState(null, "", "/dashboard/plugins"); }}>Clear</button></div>}
        {notice && <p className="misma-plugin-feedback" role="status">{notice}</p>}
        {error && <p className="misma-plugin-feedback is-error" role="alert">{error}</p>}

        <section className="misma-plugin-provider-section" aria-label="Plugin connections">
          <SectionHeader title="Connect apps" description="GitHub, Vercel and Netlify work together with Misma." />
          {loading ? (
            <div className="misma-plugin-provider-grid" aria-label="Loading plugins">
              <div className="misma-plugin-provider-skeleton"/><div className="misma-plugin-provider-skeleton"/><div className="misma-plugin-provider-skeleton"/>
            </div>
          ) : filteredPlugins.length ? (
            <div className="misma-plugin-provider-grid">{filteredPlugins.map(renderProviderCard)}</div>
          ) : (
            <p className="misma-plugin-empty-search">No plugins match “{query}”.</p>
          )}
        </section>
      </div>

      {openPluginMenu && (
        <div
          className="misma-plugin-installed-popup"
          role="menu"
          aria-label={(pluginList.find((item) => item.id === openPluginMenu.provider)?.name || "Plugin") + " options"}
          style={{ top: openPluginMenu.top, left: openPluginMenu.left }}
          onClick={(event) => event.stopPropagation()}
        >
          <Link
            role="menuitem"
            to="/dashboard/plugins/$pluginId/settings"
            params={{ pluginId: openPluginMenu.provider }}
            onClick={() => {
              if (websiteId) window.sessionStorage.setItem("misma_plugins_website_id", websiteId);
              setOpenPluginMenu(null);
            }}
          >
            Settings
          </Link>
          <button type="button" role="menuitem" onClick={() => {
            const provider = openPluginMenu.provider;
            setOpenPluginMenu(null);
            openPluginInChat(provider, websiteId, "@" + provider + " ");
          }}>
            Try in chat
          </button>
          <button type="button" role="menuitem" className="is-danger" disabled={busy === openPluginMenu.provider} onClick={() => {
            const provider = openPluginMenu.provider;
            setOpenPluginMenu(null);
            void uninstall(provider);
          }}>
            Uninstall
          </button>
        </div>
      )}
    </main>
  );
}
