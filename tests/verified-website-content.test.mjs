import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
const read = (path) => readFile(resolve(import.meta.dirname, "..", path), "utf8");

test("verified website content is parsed from JSON-LD and returned as recommendations", async () => {
  const widget = await read("supabase/functions/misma-widget/index.ts");
  const migration = await read("supabase/migrations/20261121100000_verified_website_content_items.sql");
  const runtime = await read("src/assets/misma-widget-runtime.js");
  assert.match(widget, /extractStructuredContent/);
  assert.match(widget, /source_verified:\s*true/);
  assert.match(widget, /findWebsiteRecommendations/);
  assert.match(widget, /eq\("source_verified",true\)/);
  assert.match(widget, /recommendations,/);
  assert.match(migration, /create table if not exists public\.website_content_items/);
  assert.match(migration, /enable row level security/i);
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

test("automatic account memory remains per-user and skips obvious sensitive disclosures", async () => {
  const chat = await read("supabase/functions/misma-chat/index.ts");
  assert.match(chat, /user_memories/);
  assert.match(chat, /automatic_chat_extraction/);
  assert.match(chat, /my medical|my health|my religion|my political/i);
  assert.match(chat, /project\.current/);
});
