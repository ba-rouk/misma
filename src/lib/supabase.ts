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
