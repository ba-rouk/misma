import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(resolve(root.pathname, path), "utf8");

test("platform integration migration is workspace-scoped and service-write-only", async () => {
  const sql = await read("supabase/migrations/20261117120000_website_platform_integrations.sql");
  for (const table of ["platform_connections", "platform_projects", "website_installations", "platform_installation_logs", "platform_oauth_states"]) {
    assert.match(sql, new RegExp("create table if not exists public\\." + table));
    assert.match(sql, new RegExp("alter table public\\." + table + " enable row level security"));
  }
  assert.match(sql, /revoke all on public\.platform_oauth_states from anon, authenticated/i);
  assert.match(sql, /revoke insert, update, delete on public\.website_installations from anon, authenticated/i);
});

test("GitHub installer uses one-time state, signed webhooks, and pull requests", async () => {
  const fn = await read("supabase/functions/misma-platform-integrations/index.ts");
  assert.match(fn, /state_hash/);
  assert.match(fn, /x-hub-signature-256/i);
  assert.match(fn, /enablePullRequestAutoMerge/);
  assert.match(fn, /pulls/);
  assert.ok(fn.includes("public/index.html"));
  assert.ok(!fn.includes("console.log(SUPABASE_SERVICE_ROLE_KEY"));
});

test("integration dashboard exposes the selected deployment mode and provider set", async () => {
  const route = await read("src/routes/dashboard_.integrations.tsx");
  for (const provider of ["github", "vercel", "netlify", "render"]) assert.ok(route.includes(provider));
  assert.match(route, /Automatic deployment/);
  assert.match(route, /Let me review and publish manually/);
  assert.match(route, /workspace_members/);
  assert.match(route, /workspaceOptions|workspaces/);
  assert.match(route, /Choose a workspace/);
  assert.doesNotMatch(route, /workspace_members[\s\S]{0,350}\.maybeSingle\(\)/);
  const dashboard = await read("src/routes/dashboard.tsx");
  assert.match(dashboard, /window\.location\.assign\("\/dashboard\/plugins"\)/);
  assert.match(route, /beforeLoad:[\s\S]*redirect\(\{ to: "\/dashboard\/plugins" \}\)/);
  assert.doesNotMatch(route, /Back to Misma dashboard/);
  const vercelCallback = await read("src/routes/integrations/vercel/callback.tsx");
  assert.match(vercelCallback, /window\.location\.assign\("\/dashboard\/plugins"\)/);
});


test("platform credential vault encrypts secrets and denies browser table access", async () => {
  const migration = await read("supabase/migrations/20261118110000_platform_credentials_encryption.sql");
  assert.match(migration, /create table if not exists public\.platform_credentials/i);
  assert.match(migration, /platform_credentials_connection_scope_fk/);
  assert.match(migration, /foreign key \(platform_connection_id, workspace_id, provider\)/i);
  assert.match(migration, /alter table public\.platform_credentials enable row level security/i);
  assert.match(migration, /revoke all on public\.platform_credentials from public, anon, authenticated/i);
  assert.match(migration, /grant all on public\.platform_credentials to service_role/i);

  const helper = await read("supabase/functions/misma-platform-integrations/credentials.ts");
  assert.match(helper, /AES-GCM/);
  assert.match(helper, /crypto\.getRandomValues/);
  assert.match(helper, /additionalData/);
  assert.match(helper, /PLATFORM_CREDENTIAL_ENCRYPTION_KEY_V/);

  const edgeFunction = await read("supabase/functions/misma-platform-integrations/index.ts");
  assert.match(edgeFunction, /platform-credential-save/);
  assert.match(edgeFunction, /platform-credential-status/);
  assert.match(edgeFunction, /platform-credential-remove/);
  assert.match(edgeFunction, /Only workspace owners and admins/);
});


test("Render services are fetched through the encrypted customer credential vault and cursor pagination", async () => {
  const edge = await read("supabase/functions/misma-platform-integrations/index.ts");
  const dashboard = await read("src/routes/dashboard_.integrations.tsx");
  assert.match(edge, /action === "render-connect"/);
  assert.match(edge, /action === "render-refresh-projects"/);
  assert.match(edge, /action === "render-link-project"/);
  assert.match(edge, /listRenderServices/);
  assert.match(edge, /\/v1\/services\?/);
  assert.match(edge, /params\.set\("cursor", cursor\)/);
  assert.match(edge, /encryptCredentialPayload/);
  assert.match(edge, /decryptCredentialPayload/);
  assert.match(edge, /credentialAad\(workspaceId, "render"/);
  assert.match(edge, /Render rejected this API key/);
  assert.match(dashboard, /render-connect/);
  assert.match(dashboard, /render-refresh-projects/);
  assert.match(dashboard, /render-link-project/);
  assert.match(dashboard, /exactWebsiteProjectMatch/);
  assert.match(dashboard, /complete accessible service list is shown instead/);
});

test("Vercel project picker lists all pages and never silently picks the first project", async () => {
  const edge = await read("supabase/functions/misma-platform-integrations/index.ts");
  const callback = await read("src/routes/integrations/vercel/callback.tsx");
  assert.match(edge, /async function listVercelProjects/);
  assert.match(edge, /result\.pagination\?\.next/);
  assert.match(edge, /params\.set\("from", from\)/);
  assert.doesNotMatch(callback, /setProjectId\(data\?\.projects\?\.\[0\]\?\.id/);
  assert.match(callback, /setProjectId\(""/);
  assert.match(callback, /No Vercel project is associated with this website/);
  assert.match(callback, /The full project list is shown instead/);
});
