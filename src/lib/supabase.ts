import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type MismaSupabaseConfig = {
  url: string;
  publishableKey: string;
};

export function getSupabaseConfig(): MismaSupabaseConfig | null {
  const url = import.meta.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey || /replace_me|your_.*_key/i.test(publishableKey)) return null;
  return { url, publishableKey };
}

// Snapshot the landing URL before the singleton client is created. The public
// confirmation/reset routes consume PKCE codes, implicit-flow tokens, or
// token_hash values explicitly after reading this immutable first URL.
const initialAuthRedirectHref =
  typeof window !== "undefined" ? window.location.href : null;

export function getInitialAuthRedirectUrl(): URL | null {
  if (typeof window === "undefined") return null;
  try {
    return new URL(initialAuthRedirectHref || window.location.href);
  } catch {
    return new URL(window.location.href);
  }
}

let client: SupabaseClient | null = null;
export function getSupabaseClient(): SupabaseClient {
  const config = getSupabaseConfig();
  if (!config) {
    throw new Error(
      "Supabase is not configured. Copy .env.example to .env and add your Supabase publishable key.",
    );
  }
  if (!client) {
    client = createClient(config.url, config.publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Email landing routes snapshot the URL before this client is created,
        // then call exchangeCodeForSession / setSession / verifyOtp explicitly.
        // Keeping URL detection off prevents the SDK consuming the code/hash
        // before the route can distinguish signup confirmation from recovery.
        detectSessionInUrl: false,
        flowType: "pkce",
      },
    });
  }
  return client;
}

export function getSupabaseClientForToken(token: string): SupabaseClient {
  const config = getSupabaseConfig();
  if (!config) {
    throw new Error("Supabase is not configured. Add your Supabase URL and publishable key to .env.");
  }
  return createClient(config.url, config.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}
