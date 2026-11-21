import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("plugin directory uses account-owned install state and available provider connections", async () => {
  const page = await read("../src/routes/dashboard_.plugins.tsx");
  const manifests = await read("../src/lib/plugin-manifests.ts");
  const connect = await read("../src/lib/plugin-connect.ts");
  const consent = await read("../src/components/plugin-connect-consent.tsx");
  const settings = await read("../src/routes/dashboard_.plugins.$pluginId.settings.tsx");
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
  assert.match(page, /from\("user_plugins"\)/);
  assert.match(page, /is_installed: false/);
  assert.doesNotMatch(page, /misma_integrations_workspace/);
  assert.match(page, /platform_connections/);
  assert.doesNotMatch(page, /platform-disconnect/);
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
  assert.match(settings, /permission_mode/);
  assert.match(settings, /Disconnect account/);
  assert.match(settings, /Rename account/);
  assert.match(settings, /View plugin detail/);
  assert.match(settings, /Reset to default/);
  assert.match(settings, /is_installed: false/);
  assert.doesNotMatch(settings, /misma_integrations_workspace/);
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
  assert.match(page, /misma-plugin-prompt-showcase/);
  assert.match(page, /examplePrompts/);
  assert.match(page, /\/settings/);
  assert.match(page, /misma-plugin-connected-accounts/);
  assert.match(page, /misma-plugin-skill-chip/);
  assert.match(page, /misma-plugin-information/);
  assert.doesNotMatch(page, /SectionHeader title="Permissions"/);
  assert.match(css, /scroll-snap-type:\s*x mandatory/);
  assert.match(css, /\.misma-plugin-hero-gallery/);
  assert.match(css, /\.misma-plugin-information>div/);
  assert.ok(css.includes(".misma-plugin-detail-page .misma-plugin-detail-primary {"));
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

test("dashboard inserts inline plugin mentions at the caret and scopes tools to installed plugins", async () => {
  const dashboard = await read("../src/routes/dashboard.tsx");
  const css = await read("../src/misma-design-system.css");
  assert.ok(dashboard.includes('window.location.assign("/dashboard/plugins")'));
  assert.ok(dashboard.includes('window.location.assign("/dashboard/memory")'));
  assert.ok(dashboard.includes("extractActivePlugins"));
  assert.ok(dashboard.includes("activePlugins: extractActivePlugins(textToSend)"));
  assert.ok(dashboard.includes("insertPluginMention"));
  assert.ok(dashboard.includes("selectionStart"));
  assert.ok(dashboard.includes("selectionEnd"));
  assert.ok(dashboard.includes("misma-chat-plugin-option-logo"));
  assert.ok(dashboard.includes("misma-chat-plugin-option-select"));
  assert.ok(dashboard.includes("misma_try_plugin_prompt"));
  assert.ok(dashboard.includes("setCurrentConversationId(null)"));
  assert.ok(dashboard.includes("misma-chat-plugin-popup"));
  assert.ok(dashboard.includes('from("user_plugins")'));
  assert.doesNotMatch(dashboard, /chatEnabledPlugins/);
  assert.doesNotMatch(dashboard, /misma_chat_plugins_v1_/);
  assert.doesNotMatch(dashboard, /misma-chat-plugin-chips/);
  assert.doesNotMatch(dashboard, /migrateNewChatPluginPreferences/);
  assert.match(dashboard, /Upload files/);
  assert.match(dashboard, /Think harder/);
  assert.match(dashboard, /Create image/);
  assert.match(dashboard, /Connect your first plugin/);
  assert.doesNotMatch(dashboard, /Create video/);
  assert.doesNotMatch(dashboard, /setCreateMode\("video"\)/);
  assert.ok(css.includes("misma-composer-inline-mention"));
  assert.ok(css.includes("color:#a9c9ff"));
  assert.ok(css.includes("width:min(258px,calc(100vw - 30px))"));
  assert.ok(css.includes("width:38px !important"));
  assert.ok(css.includes('.aichat-nav-btn[data-tooltip="Plugins"]'));
});

test("plugin settings and permission tiers are persisted per Misma account", async () => {
  const page = await read("../src/routes/dashboard_.plugins.$pluginId.settings.tsx");
  const migration = await read("../supabase/migrations/20261121064158_user_plugins_permissions.sql");
  assert.ok(page.includes("createFileRoute("));
  assert.ok(page.includes("/settings"));
  for (const mode of ["always_ask", "read", "low_risk", "all"]) assert.ok(page.includes(mode));
  assert.ok(page.includes('from("user_plugins")'));
  assert.ok(page.includes("permission_mode"));
  assert.ok(page.includes("Rename account"));
  assert.ok(page.includes("Disconnect account"));
  assert.ok(page.includes("Uninstall"));
  assert.ok(page.includes("View plugin detail"));
  assert.ok(migration.includes("create table if not exists public.user_plugins"));
  assert.match(migration, /enable row level security/i);
  for (const operation of ["select", "insert", "update", "delete"]) {
    assert.ok(migration.includes("for " + operation + " to authenticated"));
  }
  assert.ok(migration.includes("using ((select auth.uid()) = user_id)"));
  assert.ok(migration.includes("permission_mode text not null default 'low_risk'"));
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

