export type SettingPresence = "present" | "missing" | "empty";

export const PROVIDER_SETTINGS = {
  github: ["GITHUB_APP_ID", "GITHUB_PRIVATE_KEY", "GITHUB_WEBHOOK_SECRET"],
  vercel: ["VERCEL_INTEGRATION_SLUG", "VERCEL_CLIENT_ID", "VERCEL_CLIENT_SECRET"],
} as const;

export type ProviderName = keyof typeof PROVIDER_SETTINGS;

export const EDGE_FUNCTION_SECRETS_LOCATION =
  "Supabase Dashboard → Project Settings → Edge Functions → Secrets";

export function settingPresence(name: string): SettingPresence {
  const value = Deno.env.get(name);
  if (value === undefined) return "missing";
  return value.trim().length === 0 ? "empty" : "present";
}

export function requiredIntegrationSetting(name: string): string {
  const value = Deno.env.get(name);
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`Server integration setting ${name} is not configured in Supabase Edge Function secrets.`);
  }
  return value.trim();
}

export function projectRefFromRuntime(): string | null {
  const url = Deno.env.get("SUPABASE_URL")?.trim();
  if (!url) return null;

  try {
    const hostname = new URL(url).hostname;
    const suffix = ".supabase.co";
    return hostname.endsWith(suffix) ? hostname.slice(0, -suffix.length) : hostname;
  } catch {
    return null;
  }
}

export function missingSettingNames(settings: Record<string, SettingPresence>): string[] {
  return Object.entries(settings)
    .filter(([, state]) => state !== "present")
    .map(([name]) => name);
}

export function missingSettingsMessage(
  provider: string,
  names: string[],
  projectRef: string | null,
): string {
  const project = projectRef ? ` (project ref: ${projectRef})` : "";
  return `${provider} settings are missing or empty in the Supabase Edge Function runtime${project}: ${names.join(", ")}. Set the names in ${EDGE_FUNCTION_SECRETS_LOCATION}. Values that contain only whitespace count as empty.`;
}
