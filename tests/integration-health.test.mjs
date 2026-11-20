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

test("integration dashboard hides server setup diagnostics from workspace users", async () => {
  const page = await read("../src/routes/dashboard_.integrations.tsx");
  assert.doesNotMatch(page, /Setup checklist/);
  assert.doesNotMatch(page, /Verify settings/);
  assert.doesNotMatch(page, /integration-health/);
  assert.doesNotMatch(page, /integration-config-check/);
  assert.match(page, /Connect Render/);
  assert.match(page, /No Render service matched this website/);
});

test("GitHub App JWT failures identify a missing or mismatched registered public key without exposing PEM", async () => {
  const edge = await read("../supabase/functions/misma-platform-integrations/index.ts");
  assert.match(edge, /Integration must generate a public key/);
  assert.match(edge, /same GitHub App/);
  assert.match(edge, /GITHUB_PRIVATE_KEY/);
  assert.doesNotMatch(edge, /console\\.log\\([^)]*pem/i);
});
