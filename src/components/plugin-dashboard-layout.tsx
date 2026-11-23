import { useEffect, useState, type ReactNode } from "react";
import { MismaIcon } from "./misma-icon";

type SidebarIconKind = "workspace" | "images" | "library" | "manage" | "build" | "connect";

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
      ) : (
        <><path d="M10 13a5 5 0 0 0 7.07 0l2.12-2.12a5 5 0 0 0-7.07-7.07L11 5" /><path d="M14 11a5 5 0 0 0-7.07 0l-2.12 2.12a5 5 0 0 0 7.07 7.07L13 19" /></>
      )}
    </svg>
  );
}

const sidebarItems: Array<{ label: string; href: string; icon: SidebarIconKind; key: string }> = [
  { label: "Workspace", href: "/dashboard", icon: "workspace", key: "workspace" },
  { label: "Images", href: "/dashboard?tab=images", icon: "images", key: "images" },
  { label: "Library", href: "/dashboard?tab=library", icon: "library", key: "library" },
  { label: "Customers", href: "/dashboard?tab=customers", icon: "manage", key: "customers" },
  { label: "Products & services", href: "/dashboard?tab=products", icon: "build", key: "products" },
  { label: "Plugins", href: "/dashboard/plugins", icon: "connect", key: "plugins" },
  { label: "Memory", href: "/dashboard/memory", icon: "library", key: "memory" },
];

function readCollapsedPreference() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem("misma_sidebar_open") === "false";
  } catch {
    return false;
  }
}

export function PluginDashboardLayout({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(readCollapsedPreference());
  }, []);

  // Plugin routes have their own dashboard shell, so rehydrate the same Settings
  // appearance preference that the main dashboard applies to its own shell.
  useEffect(() => {
    const shell = document.querySelector<HTMLElement>(".misma-plugin-dashboard-layout");
    if (!shell) return;

    type SavedAppearance = {
      colorMode?: "dark" | "light" | "system";
      contrastLevel?: "system" | "medium" | "increased";
      uiFontSize?: number;
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
        // Keep the same dark defaults as the dashboard if preferences cannot be read.
      }

      const colorMode = saved.colorMode === "light" || saved.colorMode === "system" ? saved.colorMode : "dark";
      const resolvedColorMode = colorMode === "system" ? (systemAppearance.matches ? "light" : "dark") : colorMode;
      const isDark = resolvedColorMode === "dark";
      const backgroundColor = isDark
        ? (typeof saved.backgroundColor === "string" && /^#[0-9a-f]{6}$/i.test(saved.backgroundColor) ? saved.backgroundColor : "#0f1724")
        : "#f3f6fb";
      const foregroundColor = isDark
        ? (typeof saved.foregroundColor === "string" && /^#[0-9a-f]{6}$/i.test(saved.foregroundColor) ? saved.foregroundColor : "#eef3fb")
        : "#172235";

      shell.dataset.mismaColorMode = resolvedColorMode;
      shell.dataset.mismaContrast = saved.contrastLevel === "system" || saved.contrastLevel === "increased" ? saved.contrastLevel : "medium";
      shell.style.setProperty("--misma-app-background", backgroundColor);
      shell.style.setProperty("--misma-app-foreground", foregroundColor);
      document.documentElement.style.setProperty("--misma-plugin-page-background", backgroundColor);
      document.documentElement.style.setProperty("--misma-plugin-page-foreground", foregroundColor);

      if (typeof saved.uiFontSize === "number" && Number.isFinite(saved.uiFontSize)) {
        shell.style.setProperty("--misma-ui-font-size", Math.min(20, Math.max(14, Math.round(saved.uiFontSize))) + "px");
      }
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

  return (
    <div className={"aichat misma-plugin-dashboard-layout" + (collapsed ? " is-sidebar-collapsed" : "")}>
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
        </div>
        <div className="aichat-newchat-wrap">
          <button type="button" className="aichat-newchat" onClick={() => { window.location.assign("/dashboard?tab=workspace"); }} title="New chat">
            <span className="aichat-newchat-plus" aria-hidden="true">+</span>
            <span className="aichat-newchat-text">New chat</span>
          </button>
        </div>
        <nav className="aichat-primary-nav" aria-label="Main menu">
          {sidebarItems.map((item) => (
            <a
              key={item.key}
              className={"aichat-nav-btn misma-plugin-sidebar-link" + (item.key === "plugins" ? " active" : "")}
              href={item.href}
              data-tooltip={item.label}
              aria-current={item.key === "plugins" ? "page" : undefined}
            >
              <span className="aichat-nav-icon"><SidebarIcon kind={item.icon} /></span>
              <span className="aichat-nav-label">{item.label}</span>
            </a>
          ))}
        </nav>
      </aside>
      <div className="misma-plugin-dashboard-content">{children}</div>
    </div>
  );
}
