import { useEffect, useMemo, useState, type ReactNode } from "react";
import { SETTINGS_ITEMS, SETTINGS_GROUPS, type SettingsItem } from "../lib/settings-config";
import { BackButton, PageHeader } from "./misma-page-header";

export function SettingsCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={["misma-settings-card", className].filter(Boolean).join(" ")}>{children}</section>;
}

export function SettingsRow({
  label,
  icon,
  onActivate,
  description,
  destructive = false,
  avatar,
  chevron = true,
  className = "",
}: {
  label: string;
  icon?: ReactNode;
  onActivate: () => void;
  description?: string;
  destructive?: boolean;
  avatar?: ReactNode;
  chevron?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={["misma-settings-row", destructive ? "is-destructive" : "", className].filter(Boolean).join(" ")}
      onClick={onActivate}
    >
      {avatar ? <span className="misma-settings-row-avatar">{avatar}</span> : icon ? <span className="misma-settings-row-icon" aria-hidden="true">{icon}</span> : null}
      <span className="misma-settings-row-copy">
        <strong>{label}</strong>
        {description && <small>{description}</small>}
      </span>
      {chevron && <svg className="misma-settings-row-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>}
    </button>
  );
}

function useVisualViewportInset() {
  const [bottomInset, setBottomInset] = useState(0);
  useEffect(() => {
    const viewport = window.visualViewport;
    const update = () => {
      if (!viewport) {
        setBottomInset(0);
        return;
      }
      const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      setBottomInset(Math.round(inset));
    };
    update();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  return bottomInset;
}

export function SettingsSearch({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const keyboardInset = useVisualViewportInset();
  return (
    <div className="misma-settings-search-dock" style={{ bottom: `calc(env(safe-area-inset-bottom, 0px) + ${keyboardInset}px)` }}>
      <label className="misma-settings-search">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 5 5" /></svg>
        <input
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Search settings"
          aria-label="Search settings"
          autoComplete="off"
        />
        {value && <button type="button" aria-label="Clear settings search" onClick={() => onChange("")}>×</button>}
      </label>
    </div>
  );
}

export function SettingsLayout({
  view,
  children,
}: {
  view: "home" | "detail";
  children: ReactNode;
}) {
  return <div className="misma-mobile-settings-layout" data-settings-view={view}>{children}</div>;
}

export function SettingsDetail({
  title,
  onBack,
}: {
  title: string;
  onBack: () => void;
}) {
  return <PageHeader title={title} onBack={onBack} backLabel="Back to Settings" className="misma-settings-detail-header" />;
}

export function SettingsHome({
  profileName,
  profileEmail,
  profileImage,
  query,
  onQueryChange,
  onOpenSection,
  onOpenPlugins,
  onAbout,
  onBackToApp,
  onSignOut,
  iconFor,
}: {
  profileName: string;
  profileEmail: string;
  profileImage: string;
  query: string;
  onQueryChange: (value: string) => void;
  onOpenSection: (id: string) => void;
  onOpenPlugins: () => void;
  onAbout: () => void;
  onBackToApp: () => void;
  onSignOut: () => void;
  iconFor: (kind: string) => ReactNode;
}) {
  const [customizeExpanded, setCustomizeExpanded] = useState(true);
  const searchRows = useMemo(() => {
    const rows = SETTINGS_ITEMS.map((item) => ({ ...item, keywords: [item.label, item.group, ...item.searchKeywords].join(" ").toLowerCase(), action: () => onOpenSection(item.id) }));
    rows.push({
      id: "settings-plugins", slug: "plugins", label: "Plugins", icon: "manage", group: "Customize Misma",
      searchKeywords: ["plugins", "integrations", "connected apps", "providers", "github", "vercel", "netlify"],
      keywords: "plugins integrations connected apps providers github vercel netlify",
      action: onOpenPlugins,
    });
    return rows;
  }, [onOpenPlugins, onOpenSection]);
  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? searchRows.filter((item) => item.keywords.includes(needle)) : [];
  }, [query, searchRows]);

  return (
    <SettingsLayout view="home">
      <div className="misma-settings-mobile-scroll">
        <header className="misma-page-header misma-settings-home-header">
          <BackButton onClick={onBackToApp} ariaLabel="Back to Misma dashboard" />
          <h1>Settings</h1>
          <button type="button" className="misma-settings-info-button" onClick={onAbout} aria-label="About Misma">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7h.01" /></svg>
          </button>
        </header>

        {query.trim() ? (
          <SettingsCard className="misma-settings-search-results">
            {results.length ? results.map((item) => (
              <div className="misma-settings-result" key={item.id}>
                <SettingsRow label={item.label} icon={iconFor(item.icon)} onActivate={item.action} />
                <small>{item.group}</small>
              </div>
            )) : <p className="misma-settings-empty">No settings found</p>}
          </SettingsCard>
        ) : (
          <>
            <SettingsCard className="misma-settings-profile-card">
              <SettingsRow
                label={profileName || "Your account"}
                description={profileEmail || "Your Misma account"}
                avatar={profileImage ? <img src={profileImage} alt="" /> : <span>{profileName[0]?.toUpperCase() || "M"}</span>}
                onActivate={() => onOpenSection("settings-profile")}
              />
            </SettingsCard>

            <SettingsCard className="misma-settings-customize-card">
              <button type="button" className="misma-settings-card-heading" aria-expanded={customizeExpanded} onClick={() => setCustomizeExpanded((value) => !value)}>
                <span><strong>Customize Misma</strong><small>Memory, plugins and more</small></span>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d={customizeExpanded ? "m6 9 6 6 6-6" : "m9 5 7 7-7 7"} /></svg>
              </button>
              {customizeExpanded && (
                <div className="misma-settings-card-rows">
                  <SettingsRow label="Misma Memory" icon={iconFor("history")} onActivate={() => onOpenSection("settings-memory")} />
                  <SettingsRow label="Plugins" icon={iconFor("manage")} onActivate={onOpenPlugins} />
                </div>
              )}
            </SettingsCard>

            <SettingsCard className="misma-settings-grouped-card">
              <nav aria-label="Settings sections">
                <ul>
                  {SETTINGS_GROUPS.filter((group) => group.label !== "Profile" && group.label !== "Support").flatMap((group) => group.items).map((item) => (
                    <li key={item.id}>
                      <SettingsRow label={item.label} icon={iconFor(item.icon)} onActivate={() => onOpenSection(item.id)} />
                    </li>
                  ))}
                </ul>
              </nav>
            </SettingsCard>

            <SettingsCard className="misma-settings-support-card">
              <nav aria-label="Support and account">
                <ul>
                  <li><SettingsRow label="Help Center" icon={iconFor("help")} onActivate={() => onOpenSection("settings-help-center")} /></li>
                  <li><SettingsRow label="Sign out" icon={iconFor("logout")} onActivate={onSignOut} destructive /></li>
                </ul>
              </nav>
            </SettingsCard>
          </>
        )}
      </div>
      <SettingsSearch value={query} onChange={onQueryChange} />
    </SettingsLayout>
  );
}
