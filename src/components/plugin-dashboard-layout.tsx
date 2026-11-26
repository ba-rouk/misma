import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { getSupabaseClient } from "../lib/supabase";
import { MismaIcon } from "./misma-icon";

type SidebarIconKind = "workspace" | "images" | "library" | "manage" | "build" | "connect" | "settings" | "help";

function SidebarIcon({ kind }: { kind: SidebarIconKind }) {
  return (
    <svg className="aichat-nav-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
      ) : kind === "settings" ? (
        <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .4 1.9l.1.1-2.4 2.4-.1-.1a1.7 1.7 0 0 0-1.9-.4 1.7 1.7 0 0 0-1 1.6v.2h-3.4v-.2a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.4l-.1.1-2.4-2.4.1-.1a1.7 1.7 0 0 0 .4-1.9 1.7 1.7 0 0 0-1.6-1H4v-3.4h.2a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.4-1.9l-.1-.1 2.4-2.4.1.1a1.7 1.7 0 0 0 1.9.4 1.7 1.7 0 0 0 1-1.6V4h3.4v.2a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.4l.1-.1 2.4 2.4-.1.1a1.7 1.7 0 0 0-.4 1.9 1.7 1.7 0 0 0 1.6 1h.2v3.4h-.2a1.7 1.7 0 0 0-1.6 1Z" /></>
      ) : (
        <><circle cx="12" cy="12" r="9" /><path d="M9.6 9a2.5 2.5 0 1 1 4.5 1.5c-1.2 1.2-2.1 1.5-2.1 3M12 17.5h.01" /></>
      )}
    </svg>
  );
}

function SidebarCaret({ expanded }: { expanded: boolean }) {
  return (
    <span className="aichat-nav-caret" aria-hidden="true">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d={expanded ? "m6 9 6 6 6-6" : "m9 6 6 6-6 6"} />
      </svg>
    </span>
  );
}

function readCollapsedPreference() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem("misma_sidebar_open") === "false";
  } catch {
    return false;
  }
}


export function PluginDashboardLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [workspaceExpanded, setWorkspaceExpanded] = useState(true);
  const [manageExpanded, setManageExpanded] = useState(false);
  const [buildExpanded, setBuildExpanded] = useState(false);
  const [profileEmail, setProfileEmail] = useState("");
  const [profileActionError, setProfileActionError] = useState("");

  useEffect(() => {
    setCollapsed(readCollapsedPreference());
    let active = true;
    void getSupabaseClient().auth.getUser().then(({ data, error }) => {
      if (active && !error) setProfileEmail(data.user?.email || "");
    }).catch(() => {
      // The navigation remains available if account metadata is temporarily unavailable.
    });
    return () => { active = false; };
  }, []);

  // Apply the same saved appearance values that the dashboard uses.
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
        // Use the same dark defaults as the dashboard if saved preferences cannot be read.
      }

      const colorMode = saved.colorMode === "light" || saved.colorMode === "system" ? saved.colorMode : "dark";
      const resolvedColorMode = colorMode === "system" ? (systemAppearance.matches ? "light" : "dark") : colorMode;
      const isDark = resolvedColorMode === "dark";
      const backgroundColor = isDark
        ? (typeof saved.backgroundColor === "string" && /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(saved.backgroundColor) ? saved.backgroundColor : "#000000")
        : "#ffffff";
      const foregroundColor = isDark
        ? (typeof saved.foregroundColor === "string" && /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(saved.foregroundColor) ? saved.foregroundColor : "#eef3fb")
        : "#111827";

      shell.dataset.mismaColorMode = resolvedColorMode;
      shell.dataset.mismaContrast = saved.contrastLevel === "system" || saved.contrastLevel === "increased" ? saved.contrastLevel : "medium";
      shell.style.setProperty("--misma-app-background", backgroundColor);
      shell.style.setProperty("--misma-bg", backgroundColor);
      shell.style.setProperty("--misma-composer-surface", isDark ? "#14171d" : "#ffffff");
      shell.style.setProperty("--misma-app-foreground", foregroundColor);
      shell.style.setProperty("--misma-surface", isDark ? "#141519" : "#ffffff");
      shell.style.setProperty("--misma-surface-raised", isDark ? "#1b2026" : "#ffffff");
      shell.style.setProperty("--misma-border", isDark ? "rgba(255,255,255,.10)" : "#e5e7eb");
      shell.style.setProperty("--misma-muted", isDark ? "#9699a3" : "#4b5563");
      shell.style.setProperty("--misma-text", foregroundColor);
      shell.style.setProperty("--misma-ui-font-size", Math.min(20, Math.max(14, Math.round(Number(saved.uiFontSize) || 16))) + "px");
      shell.style.setProperty("--misma-code-font-size", Math.min(18, Math.max(11, Math.round(Number(saved.codeFontSize) || 13))) + "px");
      document.documentElement.style.setProperty("--misma-app-background", backgroundColor);
      document.documentElement.style.setProperty("--misma-app-foreground", foregroundColor);
      document.documentElement.style.setProperty("--misma-surface", isDark ? "#141519" : "#ffffff");
      document.documentElement.style.setProperty("--misma-surface-raised", isDark ? "#1b2026" : "#ffffff");
      document.documentElement.style.setProperty("--misma-border", isDark ? "rgba(255,255,255,.10)" : "#e5e7eb");
      document.documentElement.style.setProperty("--misma-muted", isDark ? "#9699a3" : "#4b5563");
      document.documentElement.style.setProperty("--misma-text", foregroundColor);
      document.documentElement.style.setProperty("--misma-bg", backgroundColor);
      document.documentElement.style.setProperty("--misma-composer-surface", isDark ? "#14171d" : "#ffffff");
      document.documentElement.style.setProperty("--misma-plugin-page-background", backgroundColor);
      document.documentElement.style.setProperty("--misma-plugin-page-foreground", foregroundColor);
      document.documentElement.dataset.mismaReduceMotion = saved.reduceMotion === true ? "true" : "false";
    };

    applyAppearance();
    const handleStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === "misma_appearance_preferences") applyAppearance();
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
    if (!mobileOpen) return;
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [mobileOpen]);

  function toggleSidebar() {
    setCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem("misma_sidebar_open", next ? "false" : "true");
      } catch {
        // Keep the current page usable if browser storage is blocked.
      }
      return next;
    });
  }

  async function signOut() {
    try {
      const { error } = await getSupabaseClient().auth.signOut();
      if (error) throw error;
      window.location.assign("/login");
    } catch {
      setProfileActionError("Could not sign out. Please try again.");
    }
  }

  const closeMobile = () => setMobileOpen(false);
  const navigateTo = (path: string) => { closeMobile(); void navigate({ to: path as never }); };
  return (
    <div className={"aichat misma-plugin-dashboard-layout" + (collapsed ? " is-sidebar-collapsed" : "")}>
      <button type="button" className={"aichat-backdrop misma-plugin-sidebar-backdrop" + (mobileOpen ? " is-mobile-open" : "")} aria-label="Close sidebar" onClick={closeMobile} />
      <aside className={`aichat-side misma-plugin-dashboard-sidebar${collapsed && !mobileOpen ? " is-collapsed" : ""}${mobileOpen ? " is-mobile-open" : ""}`} aria-label="Primary navigation">
        <div className="aichat-side-top">
          <a href="/dashboard" className="aichat-brand-link" aria-label="Misma dashboard" onClick={(event) => { event.preventDefault(); navigateTo("/dashboard"); }}>
            <span className="aichat-brand-icon"><MismaIcon size={28} /></span>
            <span className="aichat-side-brand">Misma</span>
          </a>
          <button type="button" className="aichat-collapse-btn" onClick={toggleSidebar} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="9" y1="3" x2="9" y2="21" />
            </svg>
          </button>
        </div>
        <div className="aichat-newchat-wrap">
          <button type="button" className="aichat-newchat" onClick={() => navigateTo("/dashboard?tab=workspace")} title="New chat">
            <span className="aichat-newchat-plus" aria-hidden="true">+</span>
            <span className="aichat-newchat-text">New chat</span>
          </button>
        </div>
        <nav className="aichat-primary-nav" aria-label="Main menu">
          <button type="button" className="aichat-nav-btn" onClick={() => setWorkspaceExpanded((value) => !value)} aria-expanded={workspaceExpanded} data-tooltip="Workspace">
            <span className="aichat-nav-icon"><SidebarIcon kind="workspace" /></span><span className="aichat-nav-label">Workspace</span>
            <SidebarCaret expanded={workspaceExpanded} />
          </button>
          {workspaceExpanded && <div className="aichat-nav-submenu">
            <a href="/dashboard?tab=website-statistics" onClick={(event) => { event.preventDefault(); navigateTo("/dashboard?tab=website-statistics"); }} className="aichat-nav-subbtn">Website statistics</a>
            <a href="/dashboard?tab=websites" onClick={(event) => { event.preventDefault(); navigateTo("/dashboard?tab=websites"); }} className="aichat-nav-subbtn">Websites</a>
          </div>}
          <a className="aichat-nav-btn" href="/dashboard?tab=images" onClick={(event) => { event.preventDefault(); navigateTo("/dashboard?tab=images"); }} data-tooltip="Images">
            <span className="aichat-nav-icon"><SidebarIcon kind="images" /></span><span className="aichat-nav-label">Images</span>
          </a>
          <a className="aichat-nav-btn" href="/dashboard?tab=library" onClick={(event) => { event.preventDefault(); navigateTo("/dashboard?tab=library"); }} data-tooltip="Library">
            <span className="aichat-nav-icon"><SidebarIcon kind="library" /></span><span className="aichat-nav-label">Library</span>
          </a>
          <button type="button" className="aichat-nav-btn" onClick={() => setManageExpanded((value) => !value)} aria-expanded={manageExpanded} data-tooltip="Manage">
            <span className="aichat-nav-icon"><SidebarIcon kind="manage" /></span><span className="aichat-nav-label">Manage</span>
            <SidebarCaret expanded={manageExpanded} />
          </button>
          {manageExpanded && <div className="aichat-nav-submenu">
            <a href="/dashboard?tab=customers" onClick={(event) => { event.preventDefault(); navigateTo("/dashboard?tab=customers"); }} className="aichat-nav-subbtn">Customers</a>
            <a href="/dashboard?tab=notifications" onClick={(event) => { event.preventDefault(); navigateTo("/dashboard?tab=notifications"); }} className="aichat-nav-subbtn">Notifications</a>
          </div>}
          <button type="button" className="aichat-nav-btn" onClick={() => setBuildExpanded((value) => !value)} aria-expanded={buildExpanded} data-tooltip="Build">
            <span className="aichat-nav-icon"><SidebarIcon kind="build" /></span><span className="aichat-nav-label">Build</span>
            <SidebarCaret expanded={buildExpanded} />
          </button>
          {buildExpanded && <div className="aichat-nav-submenu">
            <a href="/dashboard?tab=products" onClick={(event) => { event.preventDefault(); navigateTo("/dashboard?tab=products"); }} className="aichat-nav-subbtn">Products &amp; services</a>
            <a href="/dashboard?tab=knowledge" onClick={(event) => { event.preventDefault(); navigateTo("/dashboard?tab=knowledge"); }} className="aichat-nav-subbtn">Business knowledge</a>
          </div>}
          <a className="aichat-nav-btn misma-plugin-sidebar-link active" href="/dashboard/plugins" onClick={(event) => { event.preventDefault(); navigateTo("/dashboard/plugins"); }} aria-current="page" data-tooltip="Plugins">
            <span className="aichat-nav-icon"><SidebarIcon kind="connect" /></span><span className="aichat-nav-label">Plugins</span>
          </a>
          <a className="aichat-nav-btn" href="/dashboard/memory" onClick={(event) => { event.preventDefault(); navigateTo("/dashboard/memory"); }} data-tooltip="Memory">
            <span className="aichat-nav-icon"><SidebarIcon kind="library" /></span><span className="aichat-nav-label">Memory</span>
          </a>
        </nav>
        <div className="aichat-side-user misma-plugin-sidebar-profile">
          <div className="aichat-user-profile">
            <span className="aichat-user-avatar">{profileEmail[0]?.toUpperCase() || "M"}</span>
            <span className="aichat-user-info"><b>{profileEmail ? profileEmail.split("@")[0] : "Your account"}</b><small>{profileEmail || "Misma account"}</small></span>
          </div>
          <div className="misma-plugin-sidebar-profile-actions">
            <a href="/dashboard/settings" onClick={(event) => { event.preventDefault(); navigateTo("/dashboard/settings"); }}><SidebarIcon kind="settings" />Settings</a>
            <a href="/dashboard/settings/help-center" onClick={(event) => { event.preventDefault(); navigateTo("/dashboard/settings/help-center"); }}><SidebarIcon kind="help" />Help Center</a>
            <button type="button" onClick={() => void signOut()}><span aria-hidden="true">↗</span>Sign out</button>
          </div>
          {profileActionError && <small className="misma-plugin-profile-error" role="alert">{profileActionError}</small>}
        </div>
      </aside>
      <div className="misma-plugin-dashboard-content">{children}</div>
    </div>
  );
}
