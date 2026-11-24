import { useEffect, useState, type ReactNode } from "react";
import { getSupabaseClient } from "../lib/supabase";
import { MismaIcon } from "./misma-icon";

type SidebarIconKind = "workspace" | "images" | "library" | "manage" | "build" | "connect" | "chevron-down" | "chevron-right";

function SidebarIcon({ kind }: { kind: SidebarIconKind }) {
  return (
    <svg className="aichat-nav-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {kind === "workspace" ? (
        <><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="8" rx="1.5" /><rect x="3" y="13" width="8" height="8" rx="1.5" /><rect x="13" y="13" width="8" height="8" rx="1.5" /></>
      ) : kind === "images" ? (
        <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9" r="1.5" /><path d="m21 15-5-5L5 20" /></>
      ) : kind === "library" ? (
        <><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4Z" /><path d="M5 17a3 3 0 0 1 3-3h11M9 8h6M9 11h6" /></>
      ) : kind === "manage" ? (
        <><circle cx="9" cy="8" r="3.25" /><path d="M3 20a6 6 0 0 1 12 0M16 5.5a3 3 0 0 1 0 5.8M18 14a5 5 0 0 1 3 4.5" /></>
      ) : kind === "build" ? (
        <><path d="m4 7 8-4 8 4-8 4-8-4Z" /><path d="m4 12 8 4 8-4M4 17l8 4 8-4" /></>
      ) : kind === "connect" ? (
        <><path d="M10 13a5 5 0 0 0 7.07 0l2.12-2.12a5 5 0 0 0-7.07-7.07L11 5" /><path d="M14 11a5 5 0 0 0-7.07 0l-2.12 2.12a5 5 0 0 0 7.07 7.07L13 19" /></>
      ) : kind === "chevron-down" ? (
        <path d="m6 9 6 6 6-6" />
      ) : (
        <path d="m9 6 6 6-6 6" />
      )}
    </svg>
  );
}

type RecentChat = { id: number; name: string; updated_at?: string | null };
type BootstrapSnapshot = {
  workspace?: { id?: string; name?: string } | null;
  conversations?: Array<{ id?: number | string; channel?: string; name?: string; text?: string; updated_at?: string; group_name?: string | null }>;
};

function readCollapsedPreference() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem("misma_sidebar_open") === "false";
  } catch {
    return false;
  }
}

function openDashboard(tab: string, conversationId: number | null = null) {
  try {
    window.localStorage.setItem("misma_dashboard_view_v1", JSON.stringify({ activeTab: tab, conversationId }));
  } catch {
    // The dashboard still opens when local storage is unavailable.
  }
  window.location.assign("/dashboard" + (tab === "workspace" ? "" : "?tab=" + encodeURIComponent(tab)));
}

function cleanRecentTitle(value: unknown): string {
  const cleaned = String(value || "")
    .replace(/^(?:(?:customer|visitor|user|human|contact|lead)\s*(?::|#|-)\s*)+/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || /^(?:customer|visitor|user|human|contact|lead)(?:\s*[:#-].*)?$/i.test(cleaned)) return "New chat";
  if (/^(?:customer|visitor|user|human)[-_ ]+[0-9a-f-]{6,}$/i.test(cleaned)) return "New chat";
  return cleaned.slice(0, 72);
}

export function PluginDashboardLayout({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState({ workspace: false, manage: false, build: false });
  const [recentsExpanded, setRecentsExpanded] = useState(true);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [profileName, setProfileName] = useState("Misma");
  const [profileEmail, setProfileEmail] = useState("");
  const [profileImage, setProfileImage] = useState("");
  const [workspaceName, setWorkspaceName] = useState("Your workspace");
  const [recentChats, setRecentChats] = useState<RecentChat[]>([]);

  useEffect(() => {
    setCollapsed(readCollapsedPreference());
  }, []);

  useEffect(() => {
    let active = true;
    const loadSidebarData = async () => {
      try {
        const supabase = getSupabaseClient();
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError || !authData.user) return;
        const user = authData.user;
        const metadata = user.user_metadata || {};
        const displayName = [metadata.full_name, metadata.name, metadata.display_name].find(
          (value): value is string => typeof value === "string" && value.trim().length > 0,
        );
        if (active) {
          setProfileName(displayName || user.email?.split("@")[0] || "Misma");
          setProfileEmail(user.email || "");
          setProfileImage(typeof metadata.avatar_url === "string" ? metadata.avatar_url : typeof metadata.picture === "string" ? metadata.picture : "");
        }

        let cached: BootstrapSnapshot | null = null;
        try {
          const raw = window.sessionStorage.getItem("misma_dashboard_bootstrap_v1_" + user.id);
          if (raw) {
            const parsed = JSON.parse(raw) as { version?: number; data?: BootstrapSnapshot };
            if (parsed.version === 1 && parsed.data) cached = parsed.data;
          }
        } catch {
          // A stale or unavailable dashboard cache is not fatal.
        }

        let workspaceId = typeof cached?.workspace?.id === "string" ? cached.workspace.id : "";
        if (!workspaceId) {
          // Avoid arbitrarily choosing a workspace when this account belongs to several.
          const { data: memberships } = await supabase.from("workspace_members")
            .select("workspace_id").eq("user_id", user.id).limit(2);
          if (memberships?.length === 1) workspaceId = String(memberships[0].workspace_id || "");
        }
        if (!workspaceId) return;

        const cachedName = typeof cached?.workspace?.name === "string" ? cached.workspace.name : "";
        const [workspaceResult, conversationsResult] = await Promise.all([
          supabase.from("workspaces").select("name").eq("id", workspaceId).maybeSingle(),
          supabase.from("conversations").select("id,channel,latest_text,updated_at,group_name")
            .eq("workspace_id", workspaceId).eq("channel", "Dashboard").order("updated_at", { ascending: false }).limit(5),
        ]);
        if (!active) return;
        setWorkspaceName(String(workspaceResult.data?.name || cachedName || "Your workspace"));
        const rows = conversationsResult.data || [];
        const chats = rows.length ? rows.map((row) => ({
          id: Number(row.id),
          name: cleanRecentTitle(row.latest_text),
          updated_at: row.updated_at || null,
        })) : (cached?.conversations || [])
          .filter((row) => String(row.channel || "").trim().toLowerCase() === "dashboard")
          .slice(0, 5)
          .map((row) => ({ id: Number(row.id), name: cleanRecentTitle(row.name || row.text), updated_at: row.updated_at || null }));
        setRecentChats(chats.filter((chat) => Number.isSafeInteger(chat.id) && chat.id > 0));
      } catch (cause) {
        console.warn("[misma] Could not load plugin sidebar details:", cause);
      }
    };
    void loadSidebarData();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const shell = document.querySelector<HTMLElement>(".misma-plugin-dashboard-layout");
    if (!shell) return;

    type SavedAppearance = {
      colorMode?: "dark" | "light" | "system";
      contrastLevel?: "system" | "medium" | "increased";
      uiFontSize?: number;
      codeFontSize?: number;
      reduceMotion?: boolean;
      backgroundColor?: string;
      foregroundColor?: string;
    };

    const systemAppearance = window.matchMedia("(prefers-color-scheme: light)");
    const applyAppearance = () => {
      let saved: SavedAppearance = {};
      try {
        const raw = window.localStorage.getItem("misma_appearance_preferences");
        if (raw) saved = JSON.parse(raw) as SavedAppearance;
      } catch {
        // Keep the same deep-blue default as the main dashboard.
      }

      const mode = saved.colorMode === "light" || saved.colorMode === "system" ? saved.colorMode : "dark";
      const resolvedMode = mode === "system" ? (systemAppearance.matches ? "light" : "dark") : mode;
      const isDark = resolvedMode === "dark";
      const validColor = (value: unknown): value is string => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
      const backgroundColor = isDark ? (validColor(saved.backgroundColor) ? saved.backgroundColor : "#0b1220") : "#f3f6fb";
      const foregroundColor = isDark ? (validColor(saved.foregroundColor) ? saved.foregroundColor : "#eef3fb") : "#172235";
      const uiFontSize = typeof saved.uiFontSize === "number" && Number.isFinite(saved.uiFontSize) ? Math.min(20, Math.max(14, Math.round(saved.uiFontSize))) : 16;
      const codeFontSize = typeof saved.codeFontSize === "number" && Number.isFinite(saved.codeFontSize) ? Math.min(18, Math.max(11, Math.round(saved.codeFontSize))) : 13;

      shell.dataset.mismaColorMode = resolvedMode;
      shell.dataset.mismaContrast = saved.contrastLevel === "system" || saved.contrastLevel === "increased" ? saved.contrastLevel : "medium";
      shell.style.setProperty("--misma-app-background", backgroundColor);
      shell.style.setProperty("--misma-app-foreground", foregroundColor);
      shell.style.setProperty("--misma-ui-font-size", uiFontSize + "px");
      shell.style.setProperty("--misma-code-font-size", codeFontSize + "px");
      document.documentElement.style.setProperty("--misma-plugin-page-background", backgroundColor);
      document.documentElement.style.setProperty("--misma-plugin-page-foreground", foregroundColor);
      document.documentElement.dataset.mismaReduceMotion = saved.reduceMotion === true ? "true" : "false";
    };

    applyAppearance();
    const handleStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === "misma_appearance_preferences") applyAppearance();
      if (event.key === "misma_sidebar_open") setCollapsed(readCollapsedPreference());
    };
    systemAppearance.addEventListener("change", applyAppearance);
    window.addEventListener("storage", handleStorage);
    return () => {
      systemAppearance.removeEventListener("change", applyAppearance);
      window.removeEventListener("storage", handleStorage);
      document.documentElement.style.removeProperty("--misma-plugin-page-background");
      document.documentElement.style.removeProperty("--misma-plugin-page-foreground");
    };
  }, []);

  useEffect(() => {
    if (!profileMenuOpen) return;
    const closeWhenOutside = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest('[data-misma-popover-root="profile"]')) setProfileMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeWhenOutside);
    return () => document.removeEventListener("pointerdown", closeWhenOutside);
  }, [profileMenuOpen]);

  useEffect(() => {
    if (!mobileOpen && !profileMenuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
        setProfileMenuOpen(false);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mobileOpen, profileMenuOpen]);

  function toggleSidebar() {
    setCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem("misma_sidebar_open", next ? "false" : "true");
      } catch {
        // Keep the current page usable when browser storage is unavailable.
      }
      return next;
    });
  }

  function chooseTab(tab: string) {
    setMobileOpen(false);
    setProfileMenuOpen(false);
    openDashboard(tab);
  }

  function openRecent(chatId: number) {
    setMobileOpen(false);
    setProfileMenuOpen(false);
    openDashboard("workspace", chatId);
  }

  function openHelpCenter() {
    setMobileOpen(false);
    setProfileMenuOpen(false);
    try {
      window.localStorage.setItem("misma_dashboard_view_v1", JSON.stringify({ activeTab: "settings", conversationId: null }));
    } catch {
      // The Help Center still opens if local storage is blocked.
    }
    window.location.assign("/dashboard?tab=settings&section=settings-help-center");
  }

  async function signOut() {
    try {
      await getSupabaseClient().auth.signOut({ scope: "local" });
    } finally {
      window.location.assign("/login");
    }
  }

  return (
    <div className={"aichat misma-plugin-dashboard-layout" + (collapsed ? " is-sidebar-collapsed" : "") + (mobileOpen ? " is-mobile-sidebar-open" : "")}>
      {mobileOpen && <button type="button" className="misma-plugin-mobile-backdrop" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
      <button type="button" className="misma-plugin-mobile-menu-trigger" aria-label="Open navigation" title="Open navigation" aria-expanded={mobileOpen} onClick={() => setMobileOpen((value) => !value)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
      </button>
      <aside className={"aichat-side misma-plugin-dashboard-sidebar" + (collapsed ? " is-collapsed" : "")} aria-label="Primary navigation">
        <div className="aichat-side-top">
          <a href="/dashboard" className="aichat-brand-link" aria-label="Misma dashboard">
            <span className="aichat-brand-icon"><MismaIcon size={28} /></span>
            <span className="aichat-side-brand">Misma</span>
          </a>
          <button type="button" className="aichat-collapse-btn" onClick={toggleSidebar} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="9" y1="3" x2="9" y2="21" />
            </svg>
          </button>
          <button type="button" className="aichat-mobile-newchat" title="New chat" aria-label="New chat" onClick={() => chooseTab("workspace")}>
            <span className="aichat-newchat-plus" aria-hidden="true">+</span><span>New chat</span>
          </button>
        </div>
        <div className="aichat-newchat-wrap">
          <button type="button" className="aichat-newchat" onClick={() => chooseTab("workspace")} title="New chat">
            <span className="aichat-newchat-plus" aria-hidden="true">+</span>
            <span className="aichat-newchat-text">New chat</span>
          </button>
        </div>
        <nav className="aichat-primary-nav misma-plugin-primary-nav" aria-label="Main menu">
          <button type="button" className="aichat-nav-btn" aria-expanded={expandedGroups.workspace} onClick={() => setExpandedGroups((value) => ({ ...value, workspace: !value.workspace }))}>
            <span className="aichat-nav-icon"><SidebarIcon kind="workspace" /></span><span className="aichat-nav-label">Workspace</span><span className="aichat-nav-caret"><SidebarIcon kind={expandedGroups.workspace ? "chevron-down" : "chevron-right"} /></span>
          </button>
          {expandedGroups.workspace && <div className="aichat-nav-submenu">
            <button type="button" className="aichat-nav-subbtn" onClick={() => chooseTab("website-statistics")}>Website statistics</button>
            <button type="button" className="aichat-nav-subbtn" onClick={() => chooseTab("websites")}>Websites</button>
          </div>}
          <button type="button" className="aichat-nav-btn" onClick={() => chooseTab("images")}><span className="aichat-nav-icon"><SidebarIcon kind="images" /></span><span className="aichat-nav-label">Images</span></button>
          <button type="button" className="aichat-nav-btn" onClick={() => chooseTab("library")}><span className="aichat-nav-icon"><SidebarIcon kind="library" /></span><span className="aichat-nav-label">Library</span></button>
          <button type="button" className="aichat-nav-btn" aria-expanded={expandedGroups.manage} onClick={() => setExpandedGroups((value) => ({ ...value, manage: !value.manage }))}>
            <span className="aichat-nav-icon"><SidebarIcon kind="manage" /></span><span className="aichat-nav-label">Manage</span><span className="aichat-nav-caret"><SidebarIcon kind={expandedGroups.manage ? "chevron-down" : "chevron-right"} /></span>
          </button>
          {expandedGroups.manage && <div className="aichat-nav-submenu">
            <button type="button" className="aichat-nav-subbtn" onClick={() => chooseTab("customers")}>Customers</button>
            <button type="button" className="aichat-nav-subbtn" onClick={() => chooseTab("notifications")}>Notifications</button>
          </div>}
          <button type="button" className="aichat-nav-btn" aria-expanded={expandedGroups.build} onClick={() => setExpandedGroups((value) => ({ ...value, build: !value.build }))}>
            <span className="aichat-nav-icon"><SidebarIcon kind="build" /></span><span className="aichat-nav-label">Build</span><span className="aichat-nav-caret"><SidebarIcon kind={expandedGroups.build ? "chevron-down" : "chevron-right"} /></span>
          </button>
          {expandedGroups.build && <div className="aichat-nav-submenu">
            <button type="button" className="aichat-nav-subbtn" onClick={() => chooseTab("products")}>Products &amp; services</button>
            <button type="button" className="aichat-nav-subbtn" onClick={() => chooseTab("knowledge")}>Business knowledge</button>
          </div>}
          <a className="aichat-nav-btn misma-plugin-sidebar-link active" href="/dashboard/plugins" aria-current="page">
            <span className="aichat-nav-icon"><SidebarIcon kind="connect" /></span><span className="aichat-nav-label">Plugins</span>
          </a>
        </nav>
        <section className="aichat-chats-widget misma-plugin-recents" aria-label="Recent chats">
          <div className="aichat-chats-widget-header">
            <button type="button" className="aichat-chats-widget-title-btn" aria-expanded={recentsExpanded} onClick={() => setRecentsExpanded((value) => !value)}>
              <span className="aichat-chats-widget-title">Recents</span>
              <svg className={"aichat-chats-widget-caret" + (recentsExpanded ? " open" : "")} width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 10l5 5 5-5z" /></svg>
            </button>
          </div>
          {recentsExpanded && <div className="aichat-chats-widget-list">
            {recentChats.length === 0 ? <div className="aichat-chats-widget-empty">No chats yet.</div> : recentChats.map((chat) => (
              <div className="aichat-chat-list-item" key={chat.id}>
                <button type="button" className="aichat-chats-widget-item" onClick={() => openRecent(chat.id)} title={chat.name}>
                  <span className="aichat-chats-widget-dot" aria-hidden="true" /><span className="aichat-chats-widget-item-text">{chat.name}</span>
                </button>
              </div>
            ))}
          </div>}
        </section>
        <div className="aichat-side-user misma-plugin-side-user" data-misma-popover-root="profile">
          {profileMenuOpen && <div className="aichat-profile-menu" data-misma-popover-root>
            <span>{profileEmail || "Signed in"}</span>
            <button type="button" onClick={() => chooseTab("settings")}>Settings</button>
            <button type="button" onClick={openHelpCenter}>Help Center</button>
            <button type="button" className="is-danger" onClick={() => void signOut()}>Sign out</button>
          </div>}
          <button type="button" className="aichat-user-profile" onClick={() => chooseTab("settings")} title="Settings" aria-label="Open settings">
            {profileImage ? <img className="aichat-user-avatar" src={profileImage} alt="" /> : <span className="aichat-user-avatar">{profileName[0]?.toUpperCase() || "M"}</span>}
            <span className="aichat-user-info"><b>{profileName}</b><small>{workspaceName}</small></span>
          </button>
          <button type="button" className="aichat-user-more" title="Account options" aria-label="Open account options" aria-haspopup="menu" aria-expanded={profileMenuOpen} onClick={() => setProfileMenuOpen((value) => !value)}>•••</button>
        </div>
      </aside>
      <div className="misma-plugin-dashboard-content">{children}</div>
    </div>
  );
}
