import {
  EDGE_FUNCTION_SECRETS_LOCATION,
  PROVIDER_SETTINGS,
  missingSettingNames,
  projectRefFromRuntime,
  settingPresence,
  type ProviderName,
  type SettingPresence,
} from "./config.ts";

type ProviderHealth = {
  settings: Record<string, SettingPresence>;
  missingSettings: string[];
  emptySettings: string[];
};

function providerHealth(provider: ProviderName): ProviderHealth {
  const settings = Object.fromEntries(
    PROVIDER_SETTINGS[provider].map((name) => [name, settingPresence(name)]),
  ) as Record<string, SettingPresence>;

  return {
    settings,
    missingSettings: missingSettingNames(settings),
    emptySettings: Object.entries(settings)
      .filter(([, state]) => state === "empty")
      .map(([name]) => name),
  };
}

/**
 * Read-only environment diagnostics. Only setting names and presence states
 * are returned; no credential value, prefix, suffix, or content is exposed.
 * This function is called only after the request's workspace owner/admin check.
 */
export function getIntegrationSettingsHealth() {
  const github = providerHealth("github");
  const vercel = providerHealth("vercel");
  const vaultSettings = {
    PLATFORM_CREDENTIAL_ENCRYPTION_KEY_V1: settingPresence("PLATFORM_CREDENTIAL_ENCRYPTION_KEY_V1"),
  };

  return {
    runtime: "Supabase Edge Function",
    functionName: "misma-platform-integrations",
    projectRef: projectRefFromRuntime(),
    secretsLocation: EDGE_FUNCTION_SECRETS_LOCATION,
    providers: {
      github,
      vercel,
    },
    sharedCredentialVault: {
      settings: vaultSettings,
      missingSettings: missingSettingNames(vaultSettings),
      note: "The vault key is used when saving encrypted customer platform credentials; it is separate from GitHub App and Vercel Marketplace verification.",
    },
  };
}
