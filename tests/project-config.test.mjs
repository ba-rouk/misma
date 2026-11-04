import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (file) => readFile(new URL(file, import.meta.url), "utf8");

test("the project uses Bun and the Vite-exposed Misma Supabase variables", async () => {
  const pkg = JSON.parse(await read("../package.json"));
  const vite = await read("../vite.config.ts");
  const client = await read("../src/lib/supabase.ts");
  const env = await read("../.env.example");

  assert.equal(pkg.packageManager, "bun@1.4.4");
  assert.match(vite, /envPrefix:\s*\["VITE_",\s*"NEXT_PUBLIC_"\]/);
  assert.match(client, /NEXT_PUBLIC_SUPABASE_URL/);
  assert.match(client, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  assert.match(client, /flowType:\s*"pkce"/);
  assert.match(client, /detectSessionInUrl:\s*false/);
  assert.doesNotMatch(client, /VITE_BIZAI|SERVICE_ROLE|SECRET_KEY/);
  assert.match(env, /^NEXT_PUBLIC_SUPABASE_URL=/m);
  assert.match(env, /^NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=/m);
  assert.doesNotMatch(env, /GEMINI_API_KEY=|SERVICE_ROLE|VITE_BIZAI/);
});

test("auth and dashboard calls use Misma Supabase and the authenticated chat function", async () => {
  const login = await read("../src/routes/login.tsx");
  const dashboard = await read("../src/routes/dashboard.tsx");
  const server = await read("../src/server.ts");
  const edgeFunction = await read("../supabase/functions/misma-chat/index.ts");
  const callback = await read("../src/routes/auth/callback.tsx");

  assert.match(login, /signInWithPassword/);
  assert.match(login, /signUp/);
  assert.match(login, /resetPasswordForEmail/);
  assert.match(login, /signInWithOAuth/);
  assert.match(login, /redirectTo: `\$\{window\.location\.origin\}\/auth\/callback`/);
  assert.match(login, /emailRedirectTo: `\$\{window\.location\.origin\}\/dashboard`/);
  assert.match(login, /await navigate\(\{ to: "\/dashboard", replace: true \}\)/);
  assert.match(dashboard, /getMismaData/);
  assert.match(callback, /createFileRoute\("\/auth\/callback"\)/);
  assert.match(callback, /exchangeCodeForSession\(code\)/);
  assert.match(callback, /navigate\(\{ to: "\/dashboard", replace: true \}\)/);
  assert.match(dashboard, /functions\/v1\/misma-chat/);
  assert.match(dashboard, /Authorization:\s*`Bearer \$\{token\}`/);
  assert.match(dashboard, /auth\.onAuthStateChange/);
  assert.match(dashboard, /setTimeout\(expireSession,\s*60\s*\*\s*60\s*\*\s*1000\)/);
  assert.match(dashboard, /"pointerdown"[\s\S]*"keydown"[\s\S]*"mousemove"/);
  assert.match(dashboard, /\}, \[isAuthenticated, navigate\]\);/);
  assert.match(dashboard, /signOut\(\{ scope: "local" \}\)/);
  assert.match(dashboard, /finally \{[\s\S]*navigate\(\{ to: "\/login", replace: true \}\)/);
  assert.doesNotMatch(server, /handleMismaChatRequest|\/api\/ai\/chat/);
  assert.match(edgeFunction, /Deno\.env\.get\(secret\)/);
  assert.match(edgeFunction, /"GEMINI_API_KEY"/);
  assert.match(edgeFunction, /\.auth\.getUser\(accessToken\)/);
  assert.doesNotMatch(edgeFunction, /SERVICE_ROLE|service_role|NEXT_PUBLIC_/i);
});

test("the Misma migration provisions only the dashboard's required RLS schema", async () => {
  const migration = await read("../supabase/migrations/20261031000000_misma_core.sql");
  const edgeConfig = await read("../supabase/config.toml");
  const oldMigration = await read("../supabase/migrations/20261026000000_bizai_app_core.sql")
    .then(() => true, () => false);

  for (const table of [
    "workspaces",
    "workspace_members",
    "contacts",
    "conversations",
    "messages",
    "orders",
    "knowledge_entries",
    "audit_events",
  ]) {
    assert.match(migration, new RegExp(`CREATE TABLE public\\.${table}\\b`));
    assert.match(migration, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`));
  }
  assert.match(migration, /create_misma_workspace/);
  assert.match(migration, /is_workspace_member/);
  assert.doesNotMatch(migration, /businesses|business_members|website_sources|website_pages|agent_training_runs|storage\.buckets|DROP TABLE/i);
  assert.equal(oldMigration, false);
  assert.match(edgeConfig, /verify_jwt = true/);
});

test("Misma does not ship the legacy website widget", async () => {
  const index = await read("../src/routes/index.tsx");
  const dashboard = await read("../src/routes/dashboard.tsx");
  const { access } = await import("node:fs/promises");

  assert.doesNotMatch(index, /BizAIChatWidget|misma-chat-widget/);
  assert.doesNotMatch(dashboard, /bizai-webchat|ozonvttkzvbchhjhsvre|3ada0fcfa47afc5fd17462f9399f79b2cc92/);
  await assert.rejects(access(new URL("../public/bizai-widget.js", import.meta.url)));
});

test("media generation has provider fallback and the composer shows ready attachment previews", async () => {
  const dashboard = await read("../src/routes/dashboard.tsx");
  const styles = await read("../src/styles.css");
  const edgeFunction = await read("../supabase/functions/misma-chat/index.ts");

  assert.match(edgeFunction, /async function isMismaMediaSafe/);
  assert.match(edgeFunction, /MEDIA_SAFETY_UNAVAILABLE/);
  assert.match(edgeFunction, /IMAGE_GENERATION_TIMEOUT/);
  assert.doesNotMatch(edgeFunction, /async function isAgnesMediaSafe/);
  assert.match(dashboard, /function ComposerAttachmentPreview/);
  assert.match(dashboard, /setUploadingAttachments\(true\)/);
  assert.match(dashboard, /aichat-composer-sendrow/);
  assert.match(dashboard, /aichat-composer-input-row/);
  assert.match(dashboard, /aichat-composer-send-btn.*is-thinking/);
  assert.match(dashboard, /getLoginGreeting/);
  assert.equal(dashboard.includes("How many orders came in today?"), false);
  assert.equal(dashboard.includes("Show me recent conversations"), false);
  assert.equal(dashboard.includes("How can I help you today?"), false);
  assert.match(dashboard, /chatGroupFilter === "__ungrouped__"/);
  assert.match(dashboard, /aichat-chat-group-filter-menu/);
  assert.match(dashboard, /recognition\.start\(\)/);
  assert.match(dashboard, /webkitSpeechRecognition/);
  assert.match(dashboard, /onstart = \(\) => setVoiceInputActive\(true\)/);
  assert.match(dashboard, /audio-capture/);
  assert.doesNotMatch(dashboard, /getUserMedia\(\{ audio: true \}\)/);
  assert.doesNotMatch(dashboard, /microphonePermissionOpen|requestMicrophoneAccess/);
  assert.match(dashboard, /aichat-notification-trigger/);
  assert.match(dashboard, /activeTab === "notifications"/);
  assert.match(dashboard, /markVisitorMessagesRead/);
  assert.doesNotMatch(dashboard, /Misma can make mistakes|aichat-disclaimer-text/);
  assert.match(styles, /\.aichat-composer-attachment-square/);
  assert.match(styles, /\.aichat-composer-upload-state\.is-ready/);
});


test("dashboard groups, dynamic greetings, visitor notifications and voice permissions are wired", async () => {
  const dashboard = await read("../src/routes/dashboard.tsx");
  const api = await read("../src/lib/api/misma.functions.ts");
  const migration = await read("../supabase/migrations/20261104000000_message_read_tracking.sql");
  const styles = await read("../src/styles.css");

  assert.match(dashboard, /const choices = hour < 12/);
  assert.match(dashboard, /misma_last_login_greeting/);
  assert.match(dashboard, /onClick=\{\(\) => setChatGroupMenuOpen/);
  assert.match(dashboard, /filteredRecentChats\.slice/);
  assert.match(api, /unreadVisitorCount/);
  assert.match(api, /markVisitorMessagesRead/);
  assert.match(api, /getVisitorNotifications/);
  assert.match(api, /\.is\("read_at", null\)/);
  assert.match(dashboard, /getVisitorNotifications\(\{ data: \{ token \} \}\)/);
  assert.doesNotMatch(dashboard, /setInterval\(\(\) => loadData\(\)/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS read_at timestamptz/);
  assert.match(migration, /messages_unread_visitor_idx/);
  assert.match(styles, /\.aichat-notification-trigger\s*\{[\s\S]*?margin-left:\s*auto/);
  assert.match(styles, /\.aichat-notification-trigger\.has-unread/);
  assert.match(styles, /\.aichat-message-row\.is-ai > \.aichat-msg-avatar\.ai/);
  assert.match(styles, /transition:\s*height\s*\.16s ease/);
  assert.match(dashboard, /aichat-composer-voice-btn/);
  assert.match(dashboard, /Start voice chat/);
  assert.match(styles, /\.aichat-composer-sendrow \.aichat-composer-textarea/);
  assert.match(styles, /overflow-x: clip/);
});


test("user message tools are desktop-hover and mobile-long-press only, with a stacked keyboard-aware composer", async () => {
  const dashboard = await read("../src/routes/dashboard.tsx");
  const styles = await read("../src/styles.css");

  assert.match(dashboard, /startMobileMessageLongPress/);
  assert.match(dashboard, /onTouchStart=\{isUserMessage \? \(\) => startMobileMessageLongPress/);
  assert.match(dashboard, /onContextMenu=\{isUserMessage \? \(event\) => openMobileMessageActionsFromContextMenu/);
  assert.match(dashboard, /is-mobile-open/);
  assert.match(dashboard, /setMobileActionMessageId\(null\)/);
  assert.match(styles, /@media \(hover: hover\) and \(min-width: 768px\)/);
  assert.match(styles, /\.aichat-message-row\.is-user \.aichat-message-actions\.is-mobile-open/);
  assert.match(styles, /\.aichat-message-row\.is-user \.aichat-message-actions \{/);
  assert.match(dashboard, /window\.visualViewport/);
  assert.match(dashboard, /--misma-mobile-viewport-height/);
  assert.match(styles, /height: var\(--misma-mobile-viewport-height, 100dvh\)/);
  assert.match(styles, /scrollbar-width: none/);
  assert.match(styles, /\.aichat-composer-input-row \.aichat-composer-textarea::-webkit-scrollbar/);

  const inputRow = dashboard.indexOf('className="aichat-composer-input-row"');
  const toolbarRow = dashboard.indexOf('className="aichat-composer-sendrow"', inputRow);
  assert.ok(inputRow >= 0 && toolbarRow > inputRow, "message input must sit above the icon toolbar");

  assert.match(dashboard, /: draft\.trim\(\) \|\| selectedFiles\.length \|\| createMode \?/);
  assert.match(dashboard, /Start voice input/);
});


test("landing Get started opens the complete account creation form", async () => {
  const landing = await read("../src/routes/index.tsx");
  const login = await read("../src/routes/login.tsx");

  assert.match(landing, /href="\/login\?mode=signup"/);
  assert.match(login, /name="username"|autoComplete="username"/);
  assert.match(login, /fullName/);
  assert.match(login, /confirmPassword/);
  assert.match(login, /password !== confirmPassword/);
  assert.match(login, /full_name: normalizedName/);
  assert.match(login, /username: normalizedUsername/);
});

test("image attachments receive visual analysis and show estimated generation progress", async () => {
  const dashboard = await read("../src/routes/dashboard.tsx");
  const edgeFunction = await read("../supabase/functions/misma-chat/index.ts");

  assert.match(dashboard, /aichat-image-generation-loading/);
  assert.match(dashboard, /aichat-image-progress-badge/);
  assert.match(dashboard, /mediaProgressPercent/);
  assert.doesNotMatch(dashboard, /Estimate only|aichat-image-progress-track/);
  assert.match(edgeFunction, /IMAGE INPUT:/);
  assert.match(edgeFunction, /IMAGE UNDERSTANDING:/);
  assert.match(edgeFunction, /prepared\.images\.length === 0 \|\| provider\.supportsImages/);
});


test("image creation uses a screenshot-style dot-grid skeleton with a compact progress badge and menu actions", async () => {
  const dashboard = await read("../src/routes/dashboard.tsx");
  const styles = await read("../src/styles.css");

  assert.match(dashboard, /aichat-image-generation-loading/);
  assert.match(dashboard, /aichat-image-generation-grid/);
  assert.match(dashboard, /Sketching it out/);
  assert.match(dashboard, /aichat-image-progress-badge/);
  assert.match(dashboard, /function GeneratedImageActions/);
  assert.match(dashboard, /aichat-image-options-menu/);
  assert.doesNotMatch(dashboard, /aichat-image-action-bar/);
  assert.match(dashboard, /Download image/);
  assert.match(dashboard, /Share image/);
  assert.match(dashboard, /Crop image/);
  assert.match(dashboard, /Copy image/);
  assert.match(styles, /\.aichat-image-progress-badge/);
  assert.match(styles, /\.aichat-image-options-menu/);
  assert.match(styles, /radial-gradient\(circle/);
  assert.match(styles, /\.aichat-generated-media-wrap\.is-image/);
});

test("generated-image safety review has multiple provider fallbacks and reads the returned image bytes", async () => {
  const edgeFunction = await read("../supabase/functions/misma-chat/index.ts");

  assert.match(edgeFunction, /prepareGeneratedImageForReview/);
  assert.match(edgeFunction, /dataUrl:\s*`data:\$\{mimeType\};base64,/);
  assert.match(edgeFunction, /\.slice\(0, 5\)/);
  assert.match(edgeFunction, /dataUrl\?\.match/);
  assert.match(edgeFunction, /retryable:\s*true/);
});

test("saved media retries reuse the original prompt message instead of inserting a duplicate", async () => {
  const dashboard = await read("../src/routes/dashboard.tsx");
  const edgeFunction = await read("../supabase/functions/misma-chat/index.ts");

  assert.match(dashboard, /failedMediaRetry/);
  assert.match(dashboard, /retryMedia:\s*true/);
  assert.match(dashboard, /activeSavedRetry\.sourceUserMessageId/);
  assert.match(edgeFunction, /if \(retryMedia && retrySourceMessage\)/);
  assert.match(edgeFunction, /const savedAttachments = Array\.isArray\(sourcePrompt\.attachments\)/);
  assert.match(edgeFunction, /userMessage: null/);
});

test("composer media and reasoning modes are visible as distinct inline tokens", async () => {
  const dashboard = await read("../src/routes/dashboard.tsx");
  const styles = await read("../src/styles.css");

  assert.match(dashboard, /className="aichat-mode-token is-create"/);
  assert.match(dashboard, /@create \{createMode\}/);
  assert.match(dashboard, /className="aichat-mode-token is-thinking"/);
  assert.match(dashboard, /@thinking/);
  assert.match(dashboard, /Create image/);
  assert.match(styles, /\.aichat-mode-token\.is-create/);
  assert.match(styles, /\.aichat-mode-token\.is-thinking/);
});

test("mobile sidebar uses a hamburger, has a top-row new-chat control, and no Chat shortcut", async () => {
  const dashboard = await read("../src/routes/dashboard.tsx");
  const styles = await read("../src/styles.css");

  assert.match(dashboard, /className="aichat-mobile-newchat"/);
  assert.doesNotMatch(dashboard, /aichat-mobile-recents-label/);
  assert.doesNotMatch(dashboard, /data-tooltip="Chat"/);
  assert.match(styles, /\.aichat-header-toggle svg\s*\{\s*display:\s*block/);
  assert.match(styles, /\.aichat-mobile-newchat/);
  assert.match(styles, /\.aichat-newchat-wrap\s*\{\s*display:\s*none/);
});


test("chat and media safety provider fallbacks enforce explicit latency budgets and safe timing diagnostics", async () => {
  const edgeFunction = await read("../supabase/functions/misma-chat/index.ts");

  assert.match(edgeFunction, /providerDeadline/);
  assert.match(edgeFunction, /providerTimeoutMs/);
  assert.match(edgeFunction, /elapsedMs/);
  assert.match(edgeFunction, /\.slice\(0, 3\)/);
  assert.match(edgeFunction, /requestProvider\([\s\S]*?6_000/);
  assert.match(edgeFunction, /MEDIA_SAFETY_UNAVAILABLE/);
  assert.match(edgeFunction, /AbortSignal\.timeout\(6_000\)/);
});

test("generated images and videos can be saved into Library and Library media opens in a preview viewer", async () => {
  const dashboard = await read("../src/routes/dashboard.tsx");
  const styles = await read("../src/styles.css");

  assert.match(dashboard, /handleSaveGeneratedMediaToLibrary/);
  assert.match(dashboard, /createWorkspaceLibraryFile/);
  assert.match(dashboard, /Save to Library/);
  assert.match(dashboard, /setLibraryPreviewAsset/);
  assert.match(dashboard, /aichat-library-media-preview/);
  assert.match(dashboard, /aichat-library-media-viewer/);
  assert.match(dashboard, /<video[^>]*controls/);
  assert.match(dashboard, /Download image|Download video/);
  assert.match(styles, /\.aichat-library-media-viewer/);
});
