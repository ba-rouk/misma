import { useEffect, useState } from "react";
import { getSupabaseClient } from "../lib/supabase";
import type { PluginManifest } from "../lib/plugin-manifests";
import { getPluginAuthorizationUrl } from "../lib/plugin-connect";
import { Badge, Button, GlassCard, GlassModal } from "./misma-glass";
import { PluginProviderLogo } from "./plugin-provider-logo";

type AccountIdentity = { name: string; email: string; avatar: string | null };
export function PluginConnectConsent({ manifest, workspaceId, open, onClose, onConnected }: {
  manifest: PluginManifest | null; workspaceId: string; open: boolean; onClose: () => void; onConnected?: (provider: PluginManifest["id"]) => void;
}) {
  const [identity, setIdentity] = useState<AccountIdentity>({ name: "Misma account", email: "", avatar: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    if (!open) return () => { active = false; };
    void getSupabaseClient().auth.getUser().then(({ data }) => {
      if (!active || !data.user) return;
      const meta = data.user.user_metadata || {};
      setIdentity({
        name: String(meta.full_name || meta.name || meta.user_name || data.user.email?.split("@")[0] || "Misma account"),
        email: String(data.user.email || ""),
        avatar: typeof meta.avatar_url === "string" ? meta.avatar_url : typeof meta.picture === "string" ? meta.picture : null,
      });
    }).catch(() => { if (active) setError("Could not load your Misma account details."); });
    return () => { active = false; };
  }, [open]);
  if (!manifest) return null;
  const activeManifest = manifest;

  const canAuthorize = activeManifest.authType === "github_app" || activeManifest.authType === "vercel_marketplace_oauth";
  async function connect() {
    if (!canAuthorize || !workspaceId) return;
    setLoading(true);
    setError("");
    try {
      const url = await getPluginAuthorizationUrl(workspaceId, activeManifest.id);
      onConnected?.(activeManifest.id);
      window.location.assign(url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not begin the provider connection.");
    } finally {
      setLoading(false);
    }
  }
  async function continueToProvider() {
    if (!canAuthorize || !workspaceId) return;
    const popup = window.open("about:blank", "_blank");
    if (!popup) {
      setError("Your browser blocked the provider tab. Allow popups and try again.");
      return;
    }
    popup.opener = null;
    setLoading(true);
    setError("");
    try {
      const url = await getPluginAuthorizationUrl(workspaceId, activeManifest.id);
      popup.location.href = url;
    } catch (cause) {
      popup.close();
      setError(cause instanceof Error ? cause.message : "Could not open the provider authorization page.");
    } finally {
      setLoading(false);
    }
  }
  const initials = identity.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "M";
  return (
    <GlassModal open={open} title={"Use Misma to connect " + manifest.name} description="Review the account and access requested before leaving Misma." onClose={onClose} size="md" position="bottom">
      <div className="misma-consent-provider"><PluginProviderLogo provider={manifest.id} size="lg" /><div><strong>{manifest.name}</strong><span>Verified provider · {manifest.category}</span></div><Badge tone={canAuthorize ? "success" : manifest.status === "coming" ? "warning" : "neutral"}>{canAuthorize ? "Ready to connect" : manifest.status === "coming" ? "Coming later" : "Authorization pending"}</Badge></div>
      <GlassCard className="misma-consent-account">
        <span className="misma-consent-section-label">Connected Misma account</span>
        {identity.avatar ? <img src={identity.avatar} alt="" /> : <span className="misma-consent-avatar">{initials}</span>}
        <div><strong>{identity.name}</strong><small>{identity.email || "Signed-in Misma account"}</small></div>
      </GlassCard>
      <section className="misma-consent-section"><h3>What Misma will access</h3><ul>{manifest.permissions.map((permission) => <li key={permission}>{permission}</li>)}</ul></section>
      <p className="misma-consent-note">Misma shares your account authorization with the selected provider only to complete this connection. Your password is never shared with Misma.</p>
      {!canAuthorize && <p className="misma-consent-pending" role="status">{manifest.authType === "oauth_pending" ? "Render must register Misma as an OAuth client before account sign-in can be offered. No API key is requested." : "This provider connection is not available yet."}</p>}
      {error && <p className="misma-inline-error" role="alert">{error}</p>}
      <div className="misma-consent-actions">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="secondary" onClick={() => void continueToProvider()} disabled={!canAuthorize || loading}>Continue to {manifest.name} ↗</Button>
        <Button onClick={() => void connect()} disabled={!canAuthorize || loading || !workspaceId}>{loading ? "Connecting…" : "Continue with Misma"}</Button>
      </div>
    </GlassModal>
  );
}
