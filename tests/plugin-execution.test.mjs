import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(resolve(root.pathname, path), "utf8");

test("Misma execution schema keeps source plans and approvals server-only", async () => {
  const sql = await read("supabase/migrations/20261120160000_plugin_execution_engine.sql");
  const tables = [
    "plugin_execution_jobs", "plugin_execution_steps", "plugin_execution_approvals",
    "plugin_execution_logs", "repository_installations", "hosting_project_connections", "deployment_records",
  ];
  for (const table of tables) assert.ok(sql.includes("'" + table + "'"), "missing execution table policy for " + table);
  assert.match(sql, /execute format\('alter table public\.%I enable row level security'/);
  assert.match(sql, /execute format\('revoke all on public\.%I from public, anon, authenticated'/);
});

test("execution Edge Function validates workspace membership and GitHub App scope", async () => {
  const fn = await read("supabase/functions/misma-execution/index.ts");
  assert.match(fn, /auth\.getUser\(token\)/);
  assert.match(fn, /workspace_members/);
  assert.match(fn, /\["owner", "admin"\]/);
  assert.match(fn, /platform_connections/);
  assert.match(fn, /installationToken\(installationId, repoId\)/);
  assert.match(fn, /repository_id: repoId/);
});

test("execution workflow previews framework-aware patches and requires explicit approval", async () => {
  const fn = await read("supabase/functions/misma-execution/index.ts");
  for (const framework of ["Next.js App Router", "Next.js Pages Router", "Angular", "Astro", "SvelteKit", "Laravel", "Django", "PHP"]) {
    assert.ok(fn.includes(framework), "missing framework detector for " + framework);
  }
  assert.match(fn, /buildWidgetPatch/);
  assert.match(fn, /status: "awaiting_approval"/);
  assert.match(fn, /Reply \*\*APPROVE\*\*/);
  assert.match(fn, /decision: "approved"/);
  assert.match(fn, /No GitHub branch, commit, or pull request was created/);
  assert.match(fn, /currentFile\.sha !== plan\.originalSha/);
});

test("execution workflow uses a dedicated GitHub branch and pull request, never writes to the default branch", async () => {
  const fn = await read("supabase/functions/misma-execution/index.ts");
  assert.match(fn, /refs\/heads\/" \+ branchName/);
  assert.match(fn, /contents\/" \+ safePath/);
  assert.match(fn, /branch: branchName/);
  assert.match(fn, /\/pulls/);
  assert.match(fn, /awaiting_merge/);
  assert.doesNotMatch(fn, /force:\s*true/);
});
