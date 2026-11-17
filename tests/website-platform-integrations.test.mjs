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
  const dashboard = await read("src/routes/dashboard.tsx");
  assert.match(dashboard, /window\.location\.assign\("\/dashboard\/integrations"\)/);
});
