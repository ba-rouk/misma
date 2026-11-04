import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (file) => readFile(new URL(file, import.meta.url), "utf8");

test("the project uses Bun and the Vite-exposed Misma Supabase variables", async () => {
  const pkg = JSON.parse(await read("../package.json"));
  const vite = await read("../vite.config.ts");
  const client = await read("../src/lib/supabase.ts");
  const env = await read("../.env.example");

  assert.equal(pkg.packageManager, "bun@1.4.4");
  assert.match(vite, /envPrefix:\s*\["VITE_",\s*"NEXT_PUBLIC_"\]/);
  assert.match(client, /NEXT_PUBLIC_SUPABASE_URL/);
  assert.match(client, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  assert.match(client, /flowType:\s*"pkce"/);
  assert.match(client, /detectSessionInUrl:\s*false/);
  assert.doesNotMatch(client, /VITE_BIZAI|SERVICE_ROLE|SECRET_KEY/);
  assert.match(env, /^NEXT_PUBLIC_SUPABASE_URL=/m);
  assert.match(env, /^NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=/m);
  assert.doesNotMatch(env, /GEMINI_API_KEY=|SERVICE_ROLE|VITE_BIZAI/);
});

test("auth and dashboard calls use Misma Supabase and the authenticated chat function", async () => {
  const login = await read("../src/routes/login.tsx");
  const dashboard = await read("../src/routes/dashboard.tsx");
  const server = await read("../src/server.ts");
  const edgeFunction = await read("../supabase/functions/misma-chat/index.ts");
  const callback = await read("../src/routes/auth/callback.tsx");

  assert.match(login, /signInWithPassword/);
  assert.match(login, /signUp/);
  assert.match(login, /resetPasswordForEmail/);
  assert.match(login, /signInWithOAuth/);
  assert.match(login, /redirectTo: `\$\{window\.location\.origin\}\/auth\/callback`/);
  assert.match(login, /emailRedirectTo: `\$\{window\.location\.origin\}\/dashboard`/);
  assert.match(login, /await navigate\(\{ to: "\/dashboard", replace: true \}\)/);
  assert.match(dashboard, /getMismaData/);
  assert.match(callback, /createFileRoute\("\/auth\/callback"\)/);
  assert.match(callback, /exchangeCodeForSession\(code\)/);
  assert.match(callback, /navigate\(\{ to: "\/dashboard", replace: true \}\)/);
  assert.match(dashboard, /functions\/v1\/misma-chat/);
  assert.match(dashboard, /Authorization:\s*`Bearer \$\{token\}`/);
  assert.match(dashboard, /auth\.onAuthStateChange/);
  assert.match(dashboard, /setTimeout\(expireSession,\s*60\s*\*\s*60\s*\*\s*1000\)/);
  assert.match(dashboard, /"pointerdown"[\s\S]*"keydown"[\s\S]*"mousemove"/);
  assert.match(dashboard, /\}, \[isAuthenticated, navigate\]\);/);
  assert.match(dashboard, /signOut\(\{ scope: "local" \}\)/);
  assert.match(dashboard, /finally \{[\s\S]*navigate\(\{ to: "\/login", replace: true \}\)/);
  assert.doesNotMatch(server, /handleMismaChatRequest|\/api\/ai\/chat/);
  assert.match(edgeFunction, /Deno\.env\.get\(secret\)/);
  assert.match(edgeFunction, /"GEMINI_API_KEY"/);
  assert.match(edgeFunction, /\.auth\.getUser\(accessToken\)/);
  assert.doesNotMatch(edgeFunction, /SERVICE_ROLE|service_role|NEXT_PUBLIC_/i);
});

test("the Misma migration provisions only the dashboard's required RLS schema", async () => {
  const migration = await read("../supabase/migrations/20261031000000_misma_core.sql");
  const edgeConfig = await read("../supabase/config.toml");
  const oldMigration = await read("../supabase/migrations/20261026000000_bizai_app_core.sql")
    .then(() => true, () => false);

  for (const table of [
    "workspaces",
    "workspace_members",
    "contacts",
    "conversations",
    "messages",
    "orders",
    "knowledge_entries",
    "audit_events",
  ]) {
    assert.match(migration, new RegExp(`CREATE TABLE public\\.${table}\\b`));
    assert.match(migration, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`));
  }
  assert.match(migration, /create_misma_workspace/);
  assert.match(migration, /is_workspace_member/);
  assert.doesNotMatch(migration, /businesses|business_members|website_sources|website_pages|agent_training_runs|storage\.buckets|DROP TABLE/i);
  assert.equal(oldMigration, false);
  assert.match(edgeConfig, /verify_jwt = true/);
});

test("Misma does not ship the legacy website widget", async () => {
  const index = await read("../src/routes/index.tsx");
  const dashboard = await read("../src/routes/dashboard.tsx");
  const { access } = await import("node:fs/promises");

  assert.doesNotMatch(index, /BizAIChatWidget|misma-chat-widget/);
  assert.doesNotMatch(dashboard, /bizai-webchat|ozonvttkzvbchhjhsvre|3ada0fcfa47afc5fd17462f9399f79b2cc92/);
  await assert.rejects(access(new URL("../public/bizai-widget.js", import.meta.url)));
});
