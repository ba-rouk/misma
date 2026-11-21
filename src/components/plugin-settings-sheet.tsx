import { useEffect, useMemo, useState } from "react";
import type { PluginId, PluginManifest } from "../lib/plugin-manifests";
import { Badge, Button, GlassCard, GlassModal } from "./misma-glass";
import { PluginProviderLogo } from "./plugin-provider-logo";

export interface PluginConnectionSummary {
  id: string;
  provider: PluginId;
  external_account_name: string | null;
  status: string;
}

type PermissionMode = "always_ask" | "read" | "low_risk" | "all";
const permissionOptions: Array<{ id: PermissionMode; title: string; description: string; elevated?: boolean; recommended?: boolean }> = [
  { id: "always_ask", title: "Always ask", description: "Misma asks before reading information or making changes." },
  { id: "read", title: "Allow read actions", description: "Misma can read within the provider access you granted, but asks before making changes." },
  { id: "low_risk", title: "Allow low-risk actions", description: "Misma can perform routine, reversible actions. Sensitive changes still require their own approval.", recommended: true },
  { id: "all", title: "Allow all actions", description: "Use the broadest permission preference. Provider scopes and Misma's required safety confirmations still apply.", elevated: true },
];
function preferenceKey(userId: string, workspaceId: string, provider: PluginId) {
  return ["misma_plugin_permission_v1", userId, workspaceId, provider].join(":");
}

export function PluginSettingsSheet({
  open, manifests, connections, workspaceId, userId, initialProvider, linkedProjects = {}, onClose, onReconnect, onUninstall,
}: {
  open: boolean;
  manifests: PluginManifest[];
  connections: PluginConnectionSummary[];
  workspaceId: string;
  userId: string;
  initialProvider?: PluginId | null;
  linkedProjects?: Record<string, string[]>;
  onClose: () => void;
  onReconnect: (provider: PluginId) => void;
  onUninstall: (provider: PluginId) => void;
}) {
  const [activeProvider, setActiveProvider] = useState<PluginId | null>(initialProvider || null);
  const [permission, setPermission] = useState<PermissionMode>("low_risk");
  const activeManifest = manifests.find((item) => item.id === activeProvider) || null;
  const activeConnection = connections.find((item) => item.provider === activeProvider && item.status === "connected");
  const availableConnections = useMemo(() => connections.filter((item) => item.status === "connected"), [connections]);

  useEffect(() => {
    if (!open) return;
    setActiveProvider(initialProvider || null);
  }, [open, initialProvider]);

  useEffect(() => {
    if (!open || !activeProvider || !workspaceId || !userId) return;
    try {
      const saved = window.localStorage.getItem(preferenceKey(userId, workspaceId, activeProvider));
      setPermission(permissionOptions.some((item) => item.id === saved) ? saved as PermissionMode : "low_risk");
    } catch {
      setPermission("low_risk");
    }
  }, [open, activeProvider, workspaceId, userId]);

  function savePermission(value: PermissionMode) {
    setPermission(value);
    if (!activeProvider) return;
    try {
      window.localStorage.setItem(preferenceKey(userId, workspaceId, activeProvider), value);
    } catch {
      // The selected setting still applies to this open sheet if storage is unavailable.
    }
  }

  function resetPermission() {
    if (activeProvider) {
      try {
        window.localStorage.removeItem(preferenceKey(userId, workspaceId, activeProvider));
      } catch {
        // The current browser session still falls back to the default permission level.
      }
    }
    setPermission("low_risk");
  }

  return (
    <GlassModal open={open} title={activeManifest ? activeManifest.name : "Plugin settings"} description={activeManifest ? "Choose how Misma should ask before using this plugin." : "Choose a connected plugin to manage its permission preference."} onClose={onClose} size="md" position="bottom">
      {!activeManifest ? (
        <div className="misma-plugin-settings-list">
          {availableConnections.length ? availableConnections.map((connection) => {
            const manifest = manifests.find((item) => item.id === connection.provider);
            if (!manifest) return null;
            return <button type="button" className="misma-plugin-settings-list-row" key={connection.id} onClick={() => setActiveProvider(connection.provider)}>
              <PluginProviderLogo provider={manifest.id} size="md" />
              <span><strong>{manifest.name}</strong><small>{connection.external_account_name || "Connected account"}</small></span>
              <span aria-hidden="true">›</span>
            </button>;
          }) : <p className="misma-plugin-settings-empty">No connected plugins yet. Connect a plugin to configure its permission preference.</p>}
        </div>
      ) : (
        <>
          <div className="misma-plugin-settings-account-heading">
            <strong>Connected accounts</strong>
            <Badge tone="success">Connected</Badge>
          </div>
          <GlassCard className="misma-plugin-settings-account">
            <PluginProviderLogo provider={activeManifest.id} size="md" />
            <div><strong>{activeConnection?.external_account_name || activeManifest.name + " account"}</strong><small>{activeManifest.name} · Connected to this Misma workspace</small></div>
          </GlassCard>
          {(linkedProjects[activeManifest.id] || []).length > 0 && (
            <div className="misma-plugin-settings-linked">
              <strong>Linked repositories / projects</strong>
              <ul>{(linkedProjects[activeManifest.id] || []).map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
          )}
          <Button variant="secondary" className="misma-plugin-settings-reconnect" onClick={() => onReconnect(activeManifest.id)}>＋ Connect another account</Button>
          <div className="misma-plugin-settings-permissions">
            <h3>Permissions</h3>
            <fieldset>
              <legend className="misma-sr-only">Permission preference for {activeManifest.name}</legend>
              {permissionOptions.map((option) => (
                <label className={"misma-plugin-permission-option" + (permission === option.id ? " is-selected" : "")} key={option.id}>
                  <span className="misma-plugin-permission-copy">
                    <strong>{option.title}</strong>
                    {option.recommended && <Badge tone="neutral">DEFAULT</Badge>}
                    {option.elevated && <Badge tone="warning">ELEVATED RISK</Badge>}
                    <small>{option.description}</small>
                  </span>
                  <input type="radio" name={"plugin-permission-" + activeManifest.id} value={option.id} checked={permission === option.id} onChange={() => savePermission(option.id)} />
                </label>
              ))}
            </fieldset>
            <p className="misma-plugin-permission-note">This preference is saved in this browser for this Misma account and workspace. It does not expand the provider's granted scopes or bypass approval required for sensitive actions.</p>
            <Button variant="secondary" className="misma-plugin-reset-default" onClick={resetPermission}>Reset to default</Button>
          </div>
          <div className="misma-plugin-settings-footer">
            <Button variant="destructive" onClick={() => onUninstall(activeManifest.id)}>Uninstall plugin</Button>
            <Button variant="ghost" onClick={() => setActiveProvider(null)}>All plugins</Button>
          </div>
        </>
      )}
    </GlassModal>
  );
}
