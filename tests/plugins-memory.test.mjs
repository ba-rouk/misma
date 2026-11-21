import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("plugin directory reuses workspace connections with installed and available sections", async () => {
  const page = await read("../src/routes/dashboard_.plugins.tsx");
  const manifests = await read("../src/lib/plugin-manifests.ts");
  const connect = await read("../src/lib/plugin-connect.ts");
  const consent = await read("../src/components/plugin-connect-consent.tsx");
  const settings = await read("../src/components/plugin-settings-sheet.tsx");
  assert.match(page, /createFileRoute\("\/dashboard_?\/plugins"\)/);
  assert.match(page, /Connect plugins to let Misma work across your tools/);
  assert.match(page, /Search plugins/);
  assert.match(page, /Installed/);
  assert.match(page, /Available/);
  assert.match(page, /misma-plugin-installed-strip/);
  assert.match(page, /misma-plugin-available-list/);
  assert.match(page, /misma-plugin-add/);
  assert.match(page, /misma-plugin-overflow-menu/);
  assert.match(page, /Try in chat/);
  assert.match(page, /Settings/);
  assert.match(page, /Uninstall/);
  assert.match(page, /PluginConnectConsent/);
  assert.match(page, /PluginSettingsSheet/);
  assert.match(page, /platform_connections/);
  assert.match(page, /platform-disconnect/);
  assert.match(page, /workspace_id/);
  assert.match(page, /openPluginInChat/);
  assert.match(page, /websiteId/);
  assert.match(manifests, /export interface PluginManifest/);
  for (const provider of ["github", "vercel", "render", "netlify"]) {
    assert.match(manifests, new RegExp(provider + ": \\{"));
  }
  assert.match(manifests, /oauth_pending/);
  assert.match(manifests, /status: "coming"/);
  assert.doesNotMatch(page, /Render API key/);
  assert.doesNotMatch(consent, /Paste your Render API key/);
  assert.doesNotMatch(connect, /RENDER_API_KEY/);
  assert.match(connect, /github-install-url/);
  assert.match(connect, /vercel-install-url/);
  assert.match(connect, /Render account sign-in is not enabled yet/);
  assert.match(consent, /Use Misma to connect/);
  assert.match(consent, /getUser\(\)/);
  assert.match(consent, /avatar/);
  assert.match(consent, /permissions/);
  assert.match(settings, /Always ask/);
  assert.match(settings, /Allow read actions/);
  assert.match(settings, /Allow low-risk actions/);
  assert.match(settings, /Allow all actions/);
  assert.match(settings, /ELEVATED RISK/);
  assert.match(settings, /removeItem/);
  assert.doesNotMatch(page, /Misma ecosystem/);
  assert.doesNotMatch(page, /Plugin directory/);
  assert.doesNotMatch(page, /Code & Repository Management/);
  assert.doesNotMatch(page, />Manage</);
  assert.doesNotMatch(page, /Back to Misma/);
});

test("plugin details are manifest-driven, honest about capabilities, and mobile-first", async () => {
  const page = await read("../src/routes/dashboard_.plugins.$pluginId.tsx");
  const manifests = await read("../src/lib/plugin-manifests.ts");
  const css = await read("../src/misma-design-system.css");
  assert.match(page, /createFileRoute\("\/dashboard_?\/plugins\/\$pluginId"\)/);
  assert.match(page, /getPluginManifest/);
  assert.match(page, /previewCards\.map/);
  assert.match(page, /ExamplePreview/);
  assert.match(page, /misma-plugin-description-section/);
  assert.match(page, /Skill/);
  assert.match(page, /PluginConnectConsent/);
  assert.match(page, /Information/);
  assert.match(page, /Privacy Policy/);
  assert.match(page, /Terms of Service/);
  assert.match(page, /StickyActionBar/);
  assert.match(page, /Try in chat/);
  assert.match(page, /Connect \{manifest\.name\}/);
  assert.match(page, /misma-plugin-skills-grid/);
  assert.match(page, /misma-plugin-detail-actionbar/);
  assert.match(page, /misma-plugin-hero-gallery/);
  assert.match(page, /misma-plugin-example-slide/);
  assert.match(page, /SectionHeader title="App"/);
  assert.match(page, /SectionHeader title="Skill"/);
  assert.match(page, /SectionHeader title="Information"/);
  assert.match(page, /misma-plugin-skill-chip/);
  assert.match(page, /misma-plugin-information/);
  assert.doesNotMatch(page, /SectionHeader title="Permissions"/);
  assert.match(css, /scroll-snap-type:\s*x mandatory/);
  assert.match(css, /\.misma-plugin-hero-gallery/);
  assert.match(css, /\.misma-plugin-information>div/);
  assert.ok(css.includes(".misma-plugin-detail-primary {"));
  assert.ok(css.includes("background:#f7f7f8;"));
  assert.match(manifests, /authType: "oauth_pending"/);
  assert.match(manifests, /Coming later/);
  assert.doesNotMatch(manifests, /Trigger redeploy/);
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
  assert.match(edge, /allowedActions = new Set\(\["chat", "create-image", "download-generated-media", "core01-feedback"\]\)/);
  assert.doesNotMatch(edge, /"create-video", "poll-video"/);
});

test("dashboard exposes Plugins and Memory and passes explicit chat plugin selection", async () => {
  const dashboard = await read("../src/routes/dashboard.tsx");
  assert.match(dashboard, /window\.location\.assign\("\/dashboard\/plugins"\)/);
  assert.match(dashboard, /window\.location\.assign\("\/dashboard\/memory"\)/);
  assert.doesNotMatch(dashboard, />Connect<\/span>/);
  assert.match(dashboard, /chatEnabledPlugins/);
  assert.match(dashboard, /activePlugins: chatEnabledPlugins/);
  assert.match(dashboard, /misma-chat-plugin-popup/);
  assert.match(dashboard, /aichat-composer-plus-menu/);
  assert.match(dashboard, /Upload files/);
  assert.match(dashboard, /Think harder/);
  assert.match(dashboard, /Create image/);
  assert.match(dashboard, /misma-chat-plugins-open/);
  assert.match(dashboard, /ChatPluginIcon/);
  assert.match(dashboard, /misma_try_plugin_provider/);
  assert.match(dashboard, /misma_chat_plugins_v1_/);
  assert.match(dashboard, /pluginPreferencesLoadedKey/);
  assert.match(dashboard, /migrateNewChatPluginPreferences/);
  assert.match(dashboard, /misma-chat-plugin-chips/);
  assert.match(dashboard, /Manage plugins/);
  assert.match(dashboard, /Connect your first plugin/);
  assert.match(dashboard, /aichat-website-plugins/);
  assert.match(dashboard, /\/dashboard\/plugins\?websiteId=/);
  assert.doesNotMatch(dashboard, /Create video/);
  assert.doesNotMatch(dashboard, /setCreateMode\("video"\)/);
  assert.doesNotMatch(dashboard, /@create\\s\+\(image\|video\)/);
});

test("plugin disconnect removes encrypted credentials and is workspace-authorized", async () => {
  const edge = await read("../supabase/functions/misma-platform-integrations/index.ts");
  assert.match(edge, /action === "platform-disconnect"/);
  assert.match(edge, /await authorize\(request, workspaceId\)/);
  assert.match(edge, /from\("platform_credentials"\)[\s\S]{0,180}\.delete\(\)/);
  assert.match(edge, /status: "disconnected"/);
  assert.match(edge, /provider === "github"/);
});

test("central Misma glass tokens, primitives and typography are loaded globally", async () => {
  const root = await read("../src/routes/__root.tsx");
  const css = await read("../src/misma-design-system.css");
  const primitives = await read("../src/components/misma-glass.tsx");
  const guide = await read("../DESIGN_SYSTEM.md");
  assert.match(root, /misma-design-system\.css\?url/);
  assert.match(root, /href: mismaDesignSystemCss/);
  assert.match(css, /--misma-glass-surface:\s*rgba\(255, 255, 255, \.05\)/);
  assert.ok(css.includes("backdrop-filter:blur(22px) saturate(140%) !important;"));
  assert.match(css, /--misma-glass-border:\s*rgba\(255, 255, 255, \.10\)/);
  assert.match(css, /--misma-green:\s*#10b981/i);
  assert.match(css, /rgba\(5,7,10,\.60\)/);
  assert.match(css, /@supports not/);
  assert.match(css, /--font-body-size: 16px/);
  assert.match(css, /--font-sidebar-size: 16px/);
  assert.match(css, /--font-recent-size: 15px/);
  assert.match(css, /--font-helper-size: 14px/);
  for (const primitive of ["GlassCard", "GlassModal", "GlassRow", "Button", "Badge", "Chip", "Input", "Toggle", "SectionHeader", "StickyActionBar"]) {
    assert.match(primitives, new RegExp("export function " + primitive + "\\b"));
    assert.match(guide, new RegExp(primitive));
  }
  assert.match(css, /\.aichat-side \.aichat-nav-btn/);
  assert.match(css, /\.aichat-side \.aichat-recent-item/);
  assert.match(css, /@media \(max-width: 767px\)/);
  assert.match(css, /\.misma-plugin-settings-permissions fieldset/);
  assert.ok(css.includes(".aichat-composer-plus-menu,\n.misma-chat-plugin-popup {"));
  assert.match(css, /--misma-popover-bg/);
  assert.match(css, /\.aichat-plus-menu-icon/);
  assert.ok(css.includes("backdrop-filter:blur(22px) saturate(140%) !important;"));
});

