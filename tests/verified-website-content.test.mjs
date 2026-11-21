import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
const read = (path) => readFile(resolve(import.meta.dirname, "..", path), "utf8");

test("verified website content is parsed from JSON-LD and returned as recommendations", async () => {
  const widget = await read("supabase/functions/misma-widget/index.ts");
  const migration = await read("supabase/migrations/20261121073006_verified_website_content_items.sql");
  const scanStateMigration = await read("supabase/migrations/20261121073340_website_content_structured_scan_state.sql");
  const runtime = await read("src/assets/misma-widget-runtime.js");
  assert.match(widget, /extractStructuredContent/);
  assert.match(widget, /source_verified:\s*true/);
  assert.match(widget, /findWebsiteRecommendations/);
  assert.match(widget, /structured_data_scanned === true/);
  assert.match(widget, /previous\?\.structured_data_scanned === true/);
  assert.match(widget, /eq\("source_verified",true\)/);
  assert.match(widget, /recommendations,/);
  assert.match(migration, /create table if not exists public\.website_content_items/);
  assert.match(migration, /enable row level security/i);
  assert.match(scanStateMigration, /structured_data_scanned boolean not null default false/);
  assert.match(runtime, /renderRecommendations\(data\.recommendations\)/);
  assert.match(runtime, /parsedImage\.protocol==="https:"/);
});

test("plugin directory hides Render and routes plugin details/settings", async () => {
  const plugins = await read("src/routes/dashboard_.plugins.tsx");
  const tree = await read("src/routeTree.gen.ts");
  assert.match(plugins, /plugin\.id !== "render"/);
  assert.match(plugins, /openDetails\(plugin\.id\)/);
  assert.match(plugins, /\/dashboard\/plugins\/.*\/settings/);
  assert.match(tree, /dashboard_\.plugins\.\$pluginId\.settings/);
});

test("cross-chat account memory filters secrets and is isolated by owner", async () => {
  const chat = await read("supabase/functions/misma-chat/index.ts");
  const memory = await read("supabase/functions/_shared/memory.ts");
  const migration = await read("supabase/migrations/20261121100000_cross_chat_memory.sql");
  assert.match(chat, /retrieveMemory/);
  assert.match(chat, /scheduleMemoryWrite/);
  assert.match(memory, /containsSensitiveSecret/);
  assert.match(memory, /PRIVATE KEY/);
  assert.match(memory, /isTrivialExchange/);
  assert.match(memory, /safeParse/);
  assert.match(memory, /gemini-embedding-001/);
  assert.match(migration, /auth\.uid\(\)\) = user_id/);
  assert.match(migration, /match_memory/);
});
