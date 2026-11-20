import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("plugin marketplace has a workspace-scoped searchable directory and separate provider scopes", async () => {
  const page = await read("../src/routes/dashboard_.plugins.tsx");
  assert.match(page, /createFileRoute\("\/dashboard_?\/plugins"\)/);
  assert.match(page, /Search plugins/);
  assert.match(page, /Installed/);
  assert.match(page, /Developer & Hosting/);
  assert.match(page, /github.*vercel.*render.*netlify/s);
  assert.match(page, /platform_connections/);
  assert.match(page, /platform-disconnect/);
  assert.match(page, /Permissions and scope/);
  assert.match(page, /workspace_id/);
  assert.match(page, /Coming soon/);
  assert.match(page, /async function connectPlugin/);
  assert.match(page, /github-install-url/);
  assert.match(page, /vercel-install-url/);
  assert.match(page, /render-connect/);
  assert.match(page, /render-refresh-projects/);
  assert.match(page, /render-link-project/);
  assert.match(page, /misma-plugin-credential-field/);
  assert.match(page, /misma-plugin-render-config/);
  assert.match(page, /misma-marketplace-back-button/);
  assert.match(page, /window\.history\.back\(\)/);
  assert.match(page, /function ProviderLogo/);
  assert.match(page, /aria-label=\{labels\[provider\] \+ " logo"\}/);
  assert.match(page, /github: "M12/);
  assert.match(page, /vercel: "m12/);
  assert.match(page, /netlify: "m9\.793/);
  assert.match(page, /render: "M18\.263/);
  assert.doesNotMatch(page, /Misma ecosystem/);
  assert.doesNotMatch(page, /\/dashboard\/integrations\?provider=/);
  assert.doesNotMatch(page, /Back to Misma/);
});

test("Misma Brain is an account-level RLS table with owner-only CRUD policies", async () => {
  const migration = await read("../supabase/migrations/20261120142721_account_level_user_memories.sql");
  const page = await read("../src/routes/dashboard_.memory.tsx");
  assert.match(migration, /create table if not exists public\.user_memories/);
  assert.match(migration, /user_id uuid not null references auth\.users/);
  assert.match(migration, /enable row level security/i);
  for (const operation of ["select", "insert", "update", "delete"]) {
    assert.match(migration, new RegExp("for " + operation + " to authenticated", "i"));
  }
  assert.match(migration, /auth\.uid\(\).*user_id|auth\.uid\(\)\) = user_id/);
  assert.match(page, /from\("user_memories"\)/);
  assert.match(page, /\.update\(/);
  assert.match(page, /\.delete\(/);
  assert.match(page, /\.insert\(/);
});

test("Misma chat injects cross-chat memories and whitelists connected plugins", async () => {
  const edge = await read("../supabase/functions/misma-chat/index.ts");
  assert.match(edge, /from\("user_memories"\)/);
  assert.match(edge, /MISMA BRAIN/);
  assert.match(edge, /extractAccountMemoryFacts/);
  assert.match(edge, /upsert\(extractedMemories/);
  assert.match(edge, /platform_connections/);
  assert.match(edge, /PLUGINS EXPLICITLY ENABLED FOR THIS CHAT/);
  assert.match(edge, /WEBSITE CODE AND WIDGET-INSTALLATION WORKFLOW/);
  assert.match(edge, /Never claim to have inspected code/);
});

test("dashboard exposes Plugins and Memory and passes explicit chat plugin selection", async () => {
  const dashboard = await read("../src/routes/dashboard.tsx");
  assert.match(dashboard, /window\.location\.assign\("\/dashboard\/plugins"\)/);
  assert.match(dashboard, /window\.location\.assign\("\/dashboard\/memory"\)/);
  assert.doesNotMatch(dashboard, />Connect<\/span>/);
  assert.match(dashboard, /chatEnabledPlugins/);
  assert.match(dashboard, /activePlugins: chatEnabledPlugins/);
  assert.match(dashboard, /misma-chat-plugin-picker/);
});

test("plugin disconnect removes encrypted credentials and is workspace-authorized", async () => {
  const edge = await read("../supabase/functions/misma-platform-integrations/index.ts");
  assert.match(edge, /action === "platform-disconnect"/);
  assert.match(edge, /await authorize\(request, workspaceId\)/);
  assert.match(edge, /from\("platform_credentials"\)[\s\S]{0,180}\.delete\(\)/);
  assert.match(edge, /status: "disconnected"/);
  assert.match(edge, /provider === "github"/);
});

test("global Misma design tokens and typography are applied after the base stylesheet", async () => {
  const root = await read("../src/routes/__root.tsx");
  const css = await read("../src/plugins-system.css");
  assert.match(root, /plugins-system\.css\?url/);
  assert.match(root, /href: pluginSystemCss/);
  assert.match(css, /#0D0E11/);
  assert.match(css, /#141519/);
  assert.match(css, /rgba\(255, 255, 255, \.08\)/);
  assert.match(css, /#10B981/);
  assert.match(css, /backdrop-filter:\s*var\(--misma-glass-blur\)/);
  assert.match(css, /body \{ font-size: 18px/);
  assert.match(css, /\.aichat-chats-widget-item[\s\S]*min-height:42px/);
  assert.match(css, /\.misma-marketplace-page[\s\S]*#07111d/);
  assert.match(css, /\.misma-plugin-primary[\s\S]*#326fe6/);
  assert.match(css, /\.misma-marketplace-back-button/);
  assert.match(css, /\.misma-plugin-mark svg/);
  assert.match(css, /\.misma-plugin-modal \{[\s\S]*background: #07111d/);
});
