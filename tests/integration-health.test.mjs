import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("platform integration diagnostics only expose presence states and expected setting names", async () => {
  const config = await read("../supabase/functions/misma-platform-integrations/config.ts");
  const health = await read("../supabase/functions/misma-platform-integrations/health.ts");
  const edge = await read("../supabase/functions/misma-platform-integrations/index.ts");

  for (const name of [
    "GITHUB_APP_ID",
    "GITHUB_PRIVATE_KEY",
    "GITHUB_WEBHOOK_SECRET",
    "VERCEL_INTEGRATION_SLUG",
    "VERCEL_CLIENT_ID",
    "VERCEL_CLIENT_SECRET",
  ]) {
    assert.ok(config.includes(name), `expected ${name} to be classified`);
    assert.ok(health.includes(name) || config.includes(name));
  }

  assert.match(config, /value\.trim\(\)\.length === 0 \? "empty" : "present"/);
  assert.match(config, /Deno\.env\.get\(name\)/);
  assert.doesNotMatch(health, /return\s+\{[^}]*value\s*:/);
  assert.match(health, /runtime: "Supabase Edge Function"/);
  assert.match(health, /projectRef: projectRefFromRuntime\(\)/);
  assert.match(edge, /action === "integration-health"/);
  assert.match(edge, /await authorize\(request, workspaceId\)/);
  assert.match(edge, /role !== "owner"/);
  assert.match(edge, /action === "integration-config-check"/);
  assert.match(edge, /missingSettingsMessage/);
  assert.doesNotMatch(edge, /return json\(\{ checks, health \}/);
  assert.doesNotMatch(edge, /settings: githubHealth\.settings|settings: vercelHealth\.settings/);
});

test("integration dashboard displays the owner-only setup checklist and runtime metadata", async () => {
  const page = await read("../src/routes/dashboard_.integrations.tsx");
  assert.match(page, /invoke\("integration-health"\)/);
  assert.match(page, /Setup checklist/);
  assert.match(page, /Supabase Edge Function/);
  assert.match(page, /present/);
  assert.match(page, /missing/);
  assert.match(page, /empty/);
});
