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
  const microphone = await read("../src/lib/microphone.ts");
  const styles = await read("../src/styles.css");
  const edgeFunction = await read("../supabase/functions/misma-chat/index.ts");

  assert.match(edgeFunction, /async function isMismaMediaSafe/);
  assert.match(edgeFunction, /MEDIA_SAFETY_UNAVAILABLE/);
  assert.match(edgeFunction, /IMAGE_GENERATION_TIMEOUT/);
  assert.doesNotMatch(edgeFunction, /async function isAgnesMediaSafe/);
  assert.match(dashboard, /function ComposerAttachmentPreview/);
  assert.match(dashboard, /setUploadingAttachments\(true\)/);
  assert.match(dashboard, /aichat-composer-input-row/);
  assert.match(dashboard, /toolbarStart=/);
  assert.match(dashboard, /sendDisabled=\{selectedFiles\.some/);
  assert.match(dashboard, /hasAttachment=\{\(\) => selectedFiles\.length > 0\}/);
  assert.match(dashboard, /composerUploadProgress\.get\(file\)/);
  assert.match(dashboard, /getLoginGreeting/);
  assert.equal(dashboard.includes("How many orders came in today?"), false);
  assert.equal(dashboard.includes("Show me recent conversations"), false);
  assert.equal(dashboard.includes("How can I help you today?"), false);
  assert.match(dashboard, /chatGroupFilter === "__ungrouped__"/);
  assert.match(dashboard, /aichat-chat-group-filter-menu/);
  assert.match(dashboard, /import \{ VoiceInputBar \}/);
  assert.match(dashboard, /<VoiceInputBar/);
  assert.match(dashboard, /onSend=\{\(transcript, signal, options\) =>/);
  assert.match(dashboard, /voice: options\?\.voice === true/);
  assert.match(microphone, /navigator\.mediaDevices\.getUserMedia/);
  assert.match(microphone, /window\.isSecureContext/);
  assert.match(microphone, /getMicPermission/);
  assert.doesNotMatch(dashboard, /microphonePermissionOpen|requestMicrophoneAccess/);
  assert.match(dashboard, /aichat-notification-trigger/);
  assert.match(dashboard, /activeTab === "notifications"/);
  assert.match(dashboard, /markVisitorMessagesRead/);
  assert.doesNotMatch(dashboard, /Misma can make mistakes|aichat-disclaimer-text/);
  assert.match(styles, /html \{\s*scrollbar-gutter: auto;/);
  assert.doesNotMatch(styles, /scrollbar-gutter: stable/);
  assert.match(styles, /html:has\(\.aichat-main\)/);
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
  assert.match(dashboard, /<VoiceInputBar/);
  assert.match(dashboard, /onSend=\{\(transcript, signal, options\) =>/);
  assert.match(dashboard, /voice: options\?\.voice === true/);
  assert.match(styles, /\.aichat-composer-sendrow \.aichat-composer-textarea/);
  assert.match(styles, /overflow-x: clip/);
});


test("user message tools are desktop-hover and mobile-long-press only, with a stacked keyboard-aware composer", async () => {
  const dashboard = await read("../src/routes/dashboard.tsx");
  const styles = await read("../src/styles.css");
  const voiceComponent = await read("../src/components/voice-input-bar.tsx");

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
  const toolbarRow = dashboard.indexOf("toolbarStart=", inputRow);
  assert.ok(inputRow >= 0 && toolbarRow > inputRow, "message input must sit above the icon toolbar");

  assert.match(dashboard, /hasAttachment=\{\(\) => selectedFiles\.length > 0\}/);
  assert.match(voiceComponent, /Start voice dictation/);
  assert.match(voiceComponent, /misma-voice-toolbar/);
  assert.match(voiceComponent, /sendDisabled/);
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


test("collapsing the desktop sidebar closes nav groups and hides submenu content and carets", async () => {
  const dashboard = await read("../src/routes/dashboard.tsx");
  const styles = await read("../src/styles.css");

  assert.match(dashboard, /if \(!next\) \{\s*setExpandedNavGroups\(\{\s*workspace: false,\s*manage: false,\s*build: false,\s*connect: false/);
  assert.match(styles, /@media \(min-width: 768px\)\s*\{[\s\S]*?\.aichat-side\.is-collapsed \.aichat-nav-submenu,[\s\S]*?\.aichat-side\.is-collapsed \.aichat-nav-caret\s*\{\s*display: none !important;/);
});


test("Library navigation has no file-count badge", async () => {
  const dashboard = await read("../src/routes/dashboard.tsx");

  assert.doesNotMatch(dashboard, /workspaceAssets\.length > 0 && <span className="aichat-nav-badge">/);
  assert.ok(dashboard.includes('data-tooltip="Library"'));
  assert.ok(dashboard.includes('<span className="aichat-nav-label">Library</span>'));
});

test("Ask Misma launcher uses the Misma mark, sits at the bottom-left, and is icon-only on mobile", async () => {
  const landingWidget = await read("../src/components/landing-chat-widget.tsx");
  const styles = await read("../src/styles.css");
  const embed = await read("../src/assets/misma-widget-runtime.js");

  assert.match(landingWidget, /<MismaIcon size=\{28\} className="misma-guest-launcher-logo" \/>/);
  assert.match(landingWidget, /<span className="misma-guest-launcher-label">Ask Misma<\/span>/);
  assert.match(styles, /\.misma-guest-widget\s*\{[^}]*left:\s*24px !important/);
  assert.match(styles, /@media \(max-width: 600px\)\s*\{[\s\S]*?\.misma-guest-widget\s*\{[^}]*left:\s*14px !important/);
  assert.match(styles, /\.misma-guest-launcher-label\s*\{\s*display:\s*none/);
  assert.match(embed, /position:fixed;left:20px;bottom:20px/);
  assert.match(embed, /class='launch-logo'/);
  assert.doesNotThrow(() => new Function(embed), "the hosted widget must be valid JavaScript");
  assert.match(embed, /Ask Misma/);
  assert.match(embed, /@media\(max-width:520px\)\{\.launch\{/);
  assert.match(embed, /\.launch-label\{display:none\}/);
});

test("website connections can be created before publication with a general script for preview hosts", async () => {
  const dashboard = await read("../src/routes/dashboard.tsx");
  const api = await read("../src/lib/api/misma.functions.ts");

  assert.match(dashboard, /unpublished draft, staging, or preview URL before launch/);
  assert.match(dashboard, /Connect a published website or register an unpublished preview/);
  assert.match(dashboard, /Install the general Misma script/);
  assert.match(dashboard, /Website or preview URL/);
  assert.match(dashboard, /You do not need to publish the website first/);
  assert.match(dashboard, /General website installation script/);
  assert.match(dashboard, /data-site-key=/);
  assert.match(dashboard, /registered live, preview, or staging hostname/);
  assert.match(api, /status:\s*"pending"/);
  assert.match(api, /website_url:\s*websiteUrl/);
});


test("microphone access is user initiated, permission aware, accessible, and never records or uploads audio", async () => {
  const hook = await read("../src/lib/use-microphone.ts");
  const panel = await read("../src/components/microphone-access-panel.tsx");
  const dashboard = await read("../src/routes/dashboard.tsx");
  const docs = await read("../docs/microphone-access.md");
  const securityHeaders = await read("../src/lib/security-headers.server.ts");

  assert.match(hook, /navigator\.permissions\.query/);
  assert.match(hook, /name:\s*"microphone"/);
  assert.match(hook, /permissionStatus\.addEventListener\("change"/);
  assert.match(hook, /currentPermission === "granted"/);
  assert.match(hook, /setSoftPromptOpen\(true\)/);
  assert.match(hook, /getUserMedia\(\{ audio, video: false \}\)/);
  assert.match(hook, /echoCancellation:\s*true/);
  assert.match(hook, /noiseSuppression:\s*true/);
  assert.match(hook, /autoGainControl:\s*true/);
  assert.match(hook, /name === "NotAllowedError"/);
  assert.match(hook, /name === "NotFoundError"/);
  assert.match(hook, /name === "NotReadableError"/);
  assert.match(hook, /name === "OverconstrainedError"/);
  assert.match(hook, /name === "SecurityError"/);
  assert.match(hook, /name === "TypeError"/);
  assert.match(hook, /window\.isSecureContext/);
  assert.match(hook, /navigator\.mediaDevices/);
  assert.match(hook, /getTracks\(\)\.forEach\(\(track\) => track\.stop\(\)\)/);
  assert.match(hook, /addEventListener\("ended"/);
  assert.match(hook, /visibilitychange/);
  assert.match(hook, /const handleVisibilityChange = \(\) => \{\s*if \(document\.visibilityState !== "hidden"\) return;\s*stopResources\(\);/);
  assert.match(hook, /pagehide/);
  assert.match(hook, /devicechange/);
  assert.match(hook, /createMediaStreamSource/);
  assert.match(hook, /createAnalyser/);
  assert.doesNotMatch(hook, /MediaRecorder|fetch\s*\(/);

  assert.match(panel, /role="dialog"/);
  assert.match(panel, /aria-modal="true"/);
  assert.match(panel, /aria-live="polite"/);
  assert.match(panel, /Continue/);
  assert.match(panel, /Cancel/);
  assert.match(panel, /not recorded, transcribed, or uploaded/i);
  assert.match(dashboard, /import \{ MicrophoneAccessPanel \}/);
  assert.match(dashboard, /<MicrophoneAccessPanel \/>/);
  assert.match(securityHeaders, /Permissions-Policy.*microphone=\(self\)/);
  assert.doesNotMatch(securityHeaders, /microphone=\(\)/);
  assert.match(docs, /Permissions-Policy: microphone=\(self\)/);
  assert.match(docs, /allow="microphone"/);
});

test("browser-native dictation and hands-free voice mode send text only", async () => {
  const dashboard = await read("../src/routes/dashboard.tsx");
  const voice = await read("../src/lib/misma-voice.ts");
  const component = await read("../src/components/voice-input-bar.tsx");
  const styles = await read("../src/components/voice-input.css");

  assert.match(dashboard, /import \{ VoiceInputBar \}/);
  assert.match(dashboard, /<VoiceInputBar/);
  assert.match(dashboard, /onSend=\{\(transcript, signal, options\) =>/);
  assert.match(dashboard, /voice: options\?\.voice === true/);
  assert.match(dashboard, /if \(options\.voice\) \{[\s\S]*?res\.voiceReply/);
  assert.match(dashboard, /if \(!options\.voice && !editId && !isRetry\)/);
  assert.match(dashboard, /misma_active_chat_messages_v2_/);
  assert.match(voice, /export function primeSpeechVoices/);
  assert.match(component, /useEffect\(\(\) => \{[\s\S]*?primeSpeechVoices\(\)/);
  assert.ok(component.includes('synth.speak(new SpeechSynthesisUtterance(""))'));
  assert.match(voice, /SpeechRecognition\?: SpeechRecognitionConstructor/);
  assert.match(voice, /webkitSpeechRecognition\?: SpeechRecognitionConstructor/);
  assert.match(voice, /current\.interimResults = true/);
  assert.match(voice, /current\.continuous = false/);
  assert.match(voice, /restartTimer = window\.setTimeout/);
  assert.match(voice, /navigator\.mediaDevices\.getUserMedia\(\{ audio: true \}\)/);
  assert.match(voice, /function stopTracks\(stream: MediaStream \| null\)/);
  assert.match(voice, /stopTracks\(stream\)/);
  assert.match(voice, /createVoiceMode/);
  assert.match(component, /onSend\(text, signal, \{ voice: true \}\)/);
  assert.match(voice, /new SpeechSynthesisUtterance/);
  assert.match(voice, /cleanForSpeech\(rawText\)\.slice\(0, 1600\)/);
  assert.match(voice, /navigator\.wakeLock\?\.request\("screen"\)/);
  assert.doesNotMatch(voice, /MediaRecorder|FormData|fetch\(|createAnalyser|AudioContext|MediaStreamSource/);
  assert.doesNotMatch(component, /misma-voice-overlay-transcript/);
  assert.match(component, /Stop dictation and send transcript/);
  assert.match(component, /finishDictation\(true\)/);
  assert.match(component, /aria-label=\{isDictating \? "Finish voice dictation" : "Start voice dictation"\}/);
  assert.match(component, /Start voice mode/);
  assert.match(component, /AUTO_SEND_ON_DICTATION = false/);
  assert.match(component, /misma-voice-dictation-btn is-cancel/);
  assert.match(component, /misma-voice-dictation-btn is-finish/);
  assert.match(component, /The speech service could not connect/);
  assert.match(component, /Interrupt Misma and listen/);
  assert.match(component, /Push to talk/);
  assert.match(component, /Hands-free/);
  assert.match(component, /"Mute"/);
  assert.match(component, />\s*End\s*</);
  assert.match(styles, /\.misma-voice-overlay/);
  assert.match(styles, /\.misma-voice-orb\[data-state="speaking"\]/);
});

test("dashboard restores the last visited section and selected conversation after refresh", async () => {
  const dashboard = await read("../src/routes/dashboard.tsx");

  assert.match(dashboard, /misma_dashboard_view_v1/);
  assert.match(dashboard, /validTabs\.includes\(parsed\.activeTab as TabId\)/);
  assert.match(dashboard, /setCurrentConversationId\(conversationId\)/);
  assert.match(dashboard, /setPendingRestoreConversationId\(conversationId\)/);
  assert.match(dashboard, /conversationId:\s*currentConversationId/);
  assert.match(dashboard, /setDashboardDataLoaded\(true\)/);
  assert.match(dashboard, /options\.activateWorkspace !== false/);
  assert.match(dashboard, /selectConversation\(pendingRestoreConversationId,\s*\{\s*activateWorkspace:\s*false,\s*isRestore:\s*true/);
});

test("dashboard paints cached recents and notification counts before live auth refresh", async () => {
  const dashboard = await read("../src/routes/dashboard.tsx");
  const api = await read("../src/lib/api/misma.functions.ts");
  assert.match(dashboard, /useIsomorphicLayoutEffect\(\(\) => \{[\s\S]*?sessionStorage\.getItem\("misma_id_token"\)/);
  assert.match(dashboard, /dashboard_bootstrap_v1_\" \+ userId/);
  assert.match(dashboard, /applyDashboardData\(cached\.data, false\)/);
  assert.match(dashboard, /claims\.exp \* 1000 <= Date\.now\(\)/);
  const bootstrapStart = api.indexOf("export const getMismaData");
  const assetsStart = api.indexOf("export const getWorkspaceAssets", bootstrapStart);
  const bootstrap = api.slice(bootstrapStart, assetsStart);
  assert.doesNotMatch(bootstrap, /promptRowsResult|limit\(10000\)/);
  assert.match(bootstrap, /select\("id,conversation_id,text,created_at", \{ count: "exact" \}\)/);
});

test("WhatsApp Add channels has only a country-code phone row and a default message field", async () => {
  const dashboard = await read("../src/routes/dashboard.tsx");
  const settingsStart = dashboard.indexOf("function WebsiteSocialSettings");
  const settingsEnd = dashboard.indexOf("\ntype Message =", settingsStart);
  const settings = dashboard.slice(settingsStart, settingsEnd);
  assert.doesNotMatch(settings, /countrySearch|Search country or dial code|type="search"/);
  assert.match(settings, /Country code[\s\S]*?<select/);
  assert.match(settings, /Phone number[\s\S]*?type="tel"/);
  assert.match(settings, /Default message[\s\S]*?<textarea/);
});

test("dashboard chat scrolls in a full-width pane with the scrollbar at the far right edge", async () => {
  const dashboard = await read("../src/routes/dashboard.tsx");
  const styles = await read("../src/styles.css");

  const scrollAreaStart = dashboard.indexOf('className="aichat-scroll-area"');
  const scrollAreaTag = dashboard.slice(scrollAreaStart, dashboard.indexOf(">", scrollAreaStart));
  assert.ok(scrollAreaStart >= 0);
  assert.ok(scrollAreaTag.includes("ref={scrollRef}"));
  assert.ok(scrollAreaTag.includes("onScroll={handleScroll}"));

  const conversationStart = dashboard.indexOf('className="aichat-conversation-wrap"');
  const conversationTag = dashboard.slice(conversationStart, dashboard.indexOf(">", conversationStart));
  assert.ok(!conversationTag.includes("ref={scrollRef}"));

  const mainStart = styles.indexOf(".aichat-main {");
  const mainBlock = styles.slice(mainStart, styles.indexOf("}", mainStart));
  assert.ok(mainBlock.includes("min-height: 0;"));
  assert.ok(mainBlock.includes("overflow: hidden;"));

  const scrollStart = styles.indexOf("flex: 1 1 auto;");
  const scrollBlock = styles.slice(scrollStart, styles.indexOf("}", scrollStart));
  for (const declaration of [
    "width: 100%;",
    "min-width: 0;",
    "min-height: 0;",
    "align-self: stretch;",
    "overflow-y: auto;",
  ]) {
    assert.ok(scrollBlock.includes(declaration), "missing chat scroll declaration: " + declaration);
  }
  assert.ok(styles.includes(".aichat-scroll-area::-webkit-scrollbar"));
});



test("human request notification details toggle closed when the same customer is clicked again", async () => {
  const dashboard = await read("../src/routes/dashboard.tsx");
  assert.match(dashboard, /setSelectedHumanRequestNotificationId\(\(current\) => current === notificationId \? null : notificationId\)/);
});

test("dictation cancel button is placed to the left of the waveform", async () => {
  const component = await read("../src/components/voice-input-bar.tsx");
  const styles = await read("../src/components/voice-input.css");
  assert.match(component, /className="misma-voice-recording-row"[\s\S]*?className="misma-voice-dictation-btn is-cancel"[\s\S]*?className="misma-voice-waveform"/);
  assert.match(styles, /\.misma-voice-recording-row\s*\{[\s\S]*?display: flex/);
  assert.match(styles, /\.misma-voice-recording-row \.misma-voice-waveform\s*\{[\s\S]*?flex: 1 1 auto/);
});

test("dashboard and widget Speech Talk starts without duplicate microphone preflight or transcript bubbles", async () => {
  const voice = await read("../src/lib/misma-voice.ts");
  const component = await read("../src/components/voice-input-bar.tsx");
  const permission = await read("../src/lib/use-mic-permission.ts");
  const dashboard = await read("../src/routes/dashboard.tsx");
  const widget = await read("../src/assets/misma-widget-runtime.js");

  assert.match(voice, /export function primeSpeechVoices/);
  assert.match(component, /useEffect\(\(\) => \{[\s\S]*?primeSpeechVoices\(\)/);
  assert.ok(component.includes('synth.speak(new SpeechSynthesisUtterance(""))'));
  const dictationStart = voice.slice(voice.indexOf("export function createDictation"), voice.indexOf("type VoiceModeOptions"));
  const voiceModeStart = voice.slice(voice.indexOf("export function createVoiceMode"));
  assert.doesNotMatch(dictationStart, /await ensureMicPermission\(\)/);
  assert.doesNotMatch(voiceModeStart, /await ensureMicPermission\(\)/);
  assert.doesNotMatch(permission, /current === "checking"/);
  assert.doesNotMatch(permission, /setDialogView\("permission"\)/);
  assert.match(dashboard, /if \(options\.voice\) sendConversationId = null/);
  assert.match(dashboard, /if \(!options\.voice && currentConversationId && selectedConversation\?\.status === "Needs you"/);
  assert.match(dashboard, /if \(options\.voice\) \{[\s\S]*?res\.voiceReply/);
  assert.match(dashboard, /if \(!options\.voice && !editId && !isRetry\)/);
  assert.match(dashboard, /misma_active_chat_messages_v2_/);
  assert.match(widget, /var widgetInstance=initWidget\(\{\}\)/);
  assert.ok(widget.includes('window.speechSynthesis.speak(new SpeechSynthesisUtterance(""))'));
  assert.match(widget, /if\(!speakReply\)\{bubble\(text,"user"\);showTyping\(\);\}/);
  assert.match(widget, /if\(!speakReply\)bubble\(answer,"ai"\)/);
});

test("speech turns are retained for AI context but excluded from visible chat history and Core.01 learning", async () => {
  const migration = await read("../supabase/migrations/20261108095954_voice_messages_hidden_from_chat.sql");
  const dashboardApi = await read("../src/lib/api/misma.functions.ts");
  const chatEdge = await read("../supabase/functions/misma-chat/index.ts");
  const widgetEdge = await read("../supabase/functions/misma-widget/index.ts");
  const widget = await read("../src/assets/misma-widget-runtime.js");

  assert.match(migration, /ADD COLUMN IF NOT EXISTS is_voice boolean NOT NULL DEFAULT false/);
  assert.match(dashboardApi, /\.eq\("is_voice", false\)/);
  assert.match(chatEdge, /is_voice: voice/);
  assert.match(chatEdge, /if \(!voice\) \{[\s\S]*?core_01_experiences/);
  assert.match(chatEdge, /voiceReply: answer/);
  assert.match(chatEdge, /latest_text: voice \? "Voice conversation"/);
  assert.match(widgetEdge, /\.eq\("is_voice", false\)/);
  assert.match(widgetEdge, /is_voice: voice/);
  assert.match(widgetEdge, /latest_text: voice \? "Voice conversation"/);
  assert.match(widget, /visibleMessages=data\.messages\.filter\(function\(item\)\{return item\.is_voice!==true;\}\)/);
});

test("voice integration has no audio recording or transcription endpoint", async () => {
  const voice = await read("../src/lib/misma-voice.ts");
  const component = await read("../src/components/voice-input-bar.tsx");
  assert.ok(voice.includes("createDictation"));
  assert.ok(voice.includes("createVoiceMode"));
  assert.ok(component.includes("VoiceInputBar"));
  await assert.rejects(read("../src/routes/api.transcribe.ts"));
  await assert.rejects(read("../supabase/functions/misma-transcribe/index.ts"));
});


test("voice-assisted human replies are hidden from customer chat transcript", async () => {
  const dashboard = await read("../src/routes/dashboard.tsx");
  const edge = await read("../supabase/functions/misma-widget/index.ts");
  assert.ok(dashboard.includes('action: "send-human-reply"'));
  assert.ok(dashboard.includes("voice: options.voice === true"));
  assert.ok(edge.includes("const voice = input.voice === true;"));
  assert.ok(edge.includes("is_voice: voice"));
  assert.ok(edge.includes('latest_text: voice ? "Voice conversation"'));
});

test("voice chat requests receive concise spoken replies and never upload recorded audio", async () => {
  const edgeFunction = await read("../supabase/functions/misma-chat/index.ts");
  const dashboard = await read("../src/routes/dashboard.tsx");
  const voice = await read("../src/lib/misma-voice.ts");
  assert.match(dashboard, /voice: options\?\.voice === true/);
  assert.match(edgeFunction, /const voice = input\.voice === true/);
  assert.match(edgeFunction, /voiceReply: answer/);
  assert.match(edgeFunction, /is_voice: voice/);
  assert.match(edgeFunction, /if \(!voice\) \{/);
  assert.match(edgeFunction, /one or two natural spoken sentences, ideally under 25 words/i);
  assert.match(edgeFunction, /audio\/transcriptions/);
  assert.match(edgeFunction, /VOICE CONVERSATION/);
  assert.doesNotMatch(voice, /MediaRecorder|FormData|fetch\(/, "live speech chat stays on the browser speech pipeline, while uploaded audio is transcribed separately");
});

test("attachments stay private, show per-file progress, and are separate from user text", async () => {
  const dashboard = await read("../src/routes/dashboard.tsx");
  const styles = await read("../src/styles.css");
  const edgeFunction = await read("../supabase/functions/misma-chat/index.ts");
  const api = await read("../src/lib/api/misma.functions.ts");

  assert.match(dashboard, /MAX_COMPOSER_FILES|next\.length > 5/);
  assert.match(dashboard, /file\.size > 10 \* 1024 \* 1024/);
  assert.match(dashboard, /uploadStorageObjectWithProgress/);
  assert.match(dashboard, /xhr\.upload\.onprogress/);
  assert.match(dashboard, /uploadAbortControllersRef\.current\.get\(removed\)\?\.abort\(\)/);
  assert.match(dashboard, /URL\.createObjectURL\(file\)/);
  assert.match(dashboard, /role="progressbar"/);
  assert.match(dashboard, /aria-valuenow=\{Math\.max/);
  assert.match(dashboard, /variant="user"/);
  assert.match(dashboard, /lightboxAttachment && <AttachmentImageLightbox/);
  assert.match(styles, /--misma-control-green:\s*#22c55e/);
  assert.match(styles, /\.aichat-message-attachments\.is-user-attachments/);
  assert.match(styles, /\.aichat-message-attachments\.is-user-attachments\s*\{[^}]*flex-wrap:\s*wrap/);
  assert.match(edgeFunction, /userVisibleMessage/);
  assert.match(edgeFunction, /extractDocxText/);
  assert.match(edgeFunction, /word\/document\.xml/);
  assert.match(edgeFunction, /ask what they would like you to do with it/i);
  assert.match(api, /createSignedUrl\(item\.path, 3600\)/);
});

test("privacy and voice preferences are persisted and used by dashboard voice/chat", async () => {
  const dashboard = await read("../src/routes/dashboard.tsx");
  const edgeFunction = await read("../supabase/functions/misma-chat/index.ts");
  const voice = await read("../src/lib/misma-voice.ts");

  assert.match(dashboard, /misma_privacy_preferences/);
  assert.match(dashboard, /selectedVoicePreset/);
  assert.match(dashboard, /<option value="girl">Girl/);
  assert.match(dashboard, /<option value="woman">Woman/);
  assert.match(dashboard, /<option value="boy">Boy/);
  assert.match(dashboard, /<option value="man">Man/);
  assert.match(dashboard, /privacySettings: privacyPreferences/);
  assert.match(edgeFunction, /useConversationHistory = privacySettings\.useConversationHistory !== false/);
  assert.match(edgeFunction, /if \(useConversationHistory\)/);
  assert.match(edgeFunction, /DASHBOARD ASSISTANT PREFERENCES/);
  assert.match(voice, /WIDGET_SPEECH_PITCH = 1\.16/);
  assert.match(voice, /WIDGET_SPEECH_RATE = 0\.98/);
});


test("current and recent questions trigger web search with a freshness window", async () => {
  const edgeFunction = await read("../supabase/functions/misma-chat/index.ts");

  assert.match(edgeFunction, /what\(\?:'s\| is\) new/);
  assert.match(edgeFunction, /latest\|newest\|most recent/);
  assert.match(edgeFunction, /search_depth:\s*"fast"/);
  assert.match(edgeFunction, /time_range:\s*currentTimeRange/);
  assert.match(edgeFunction, /CURRENT DATE:/);
});

test("attachment preparation is concurrent and skipped for attachment-only clarification prompts", async () => {
  const edgeFunction = await read("../supabase/functions/misma-chat/index.ts");

  assert.match(edgeFunction, /Promise\.all\(attachments\.slice\(index,\s*index \+ 2\)\.map\(prepareOne\)\)/);
  assert.match(edgeFunction, /shouldAnalyzeAttachments = Boolean\(message\.trim\(\)\)/);
  assert.match(edgeFunction, /historyWindow = voice \|\| requestedAttachments\.length \? 4 : 10/);
  assert.match(edgeFunction, /historyTextLimit = voice \? 1_200 : requestedAttachments\.length \? 1_800 : 4_000/);
});


test("composer image previews decode selected files and show a centered upload indicator", async () => {
  const dashboard = await read("../src/routes/dashboard.tsx");
  const styles = await read("../src/styles.css");

  assert.match(dashboard, /createComposerImageThumbnail/);
  assert.match(dashboard, /createImageBitmap\(file\)/);
  assert.match(dashboard, /readComposerFileAsDataUrl\(file\)/);
  assert.match(dashboard, /aichat-composer-attachment-content-image/);
  assert.match(dashboard, /imagePreview && !imagePreviewError/);
  assert.match(dashboard, /onError=\{\(\) => setImagePreviewError\(true\)\}/);
  assert.match(styles, /\.aichat-composer-upload-state\.is-uploading\s*\{[^}]*place-items:\s*center/);
  assert.match(styles, /\.aichat-composer-upload-ring\s*\{[^}]*width:\s*30px/);
});

test("composer previews align left while sent attachments stay compact and right-aligned", async () => {
  const styles = await read("../src/styles.css");

  assert.match(styles, /\.aichat-composer-attachments\s*\{[^}]*justify-content:\s*flex-start !important/);
  assert.match(styles, /\.aichat-composer-attachment-square,\s*\.aichat-composer-attachment-square\.is-file\s*\{[^}]*width:\s*88px/);
  assert.match(styles, /\.aichat-message-row\.is-user \.aichat-message-attachments\.is-user-attachments\s*\{[\s\S]*?justify-content:\s*flex-end[\s\S]*?max-width:\s*352px/);
  assert.match(styles, /\.aichat-message-attachments\.is-user-attachments \.aichat-attachment-image-link\s*\{[^}]*width:\s*112px[^}]*height:\s*112px/);
});


test("composer re-selection retries the existing file card rather than appending a duplicate", async () => {
  const dashboard = await read("../src/routes/dashboard.tsx");
  assert.match(dashboard, /const fingerprint = \(file: File\)/);
  assert.match(dashboard, /const existing = current\.find\(\(item\) => fingerprint\(item\) === key\)/);
  assert.match(dashboard, /composerUploadStatuses\.get\(existing\) === "error"/);
  assert.match(dashboard, /retryFiles\.push\(existing\)/);
});

test("attachment send retries reuse the same conversation and existing saved message", async () => {
  const dashboard = await read("../src/routes/dashboard.tsx");
  const edgeFunction = await read("../supabase/functions/misma-chat/index.ts");
  assert.match(dashboard, /let sendConversationId = currentConversationId/);
  assert.match(dashboard, /if \(!editId && filesToSend\.length && !sendConversationId\)/);
  assert.match(dashboard, /retryExistingMessage:\s*true/);
  assert.match(dashboard, /item\.id === tempUserId \? \{ \.\.\.item, attachments: \[\] \}/);
  assert.match(edgeFunction, /const retryExistingMessage = input\.retryExistingMessage === true/);
  assert.match(edgeFunction, /sameAttachmentPaths\(lastUserMessage\.attachments\)/);
  assert.match(edgeFunction, /provider: "retry-existing"/);
  assert.match(edgeFunction, /let userMessage: JsonRecord \| null = retryExistingUserMessage/);
});

test("profile photos are decoded and normalized before preview and stored avatars load from private Storage", async () => {
  const dashboard = await read("../src/routes/dashboard.tsx");
  assert.match(dashboard, /prepareProfileAvatarForUpload/);
  assert.match(dashboard, /canvas\.toBlob/);
  assert.match(dashboard, /setProfileAvatarFile\(preparedFile\)/);
  assert.match(dashboard, /readStoredProfileImage\(avatarBlob, path\)/);
  assert.match(dashboard, /storage\.from\("misma-media"\)\.download\(path\)/);
  assert.match(dashboard, /profileAvatarSelectionRef/);
});

test("composer attachment tray aligns left and sent user attachments align to the message right edge", async () => {
  const styles = await read("../src/styles.css");
  assert.match(styles, /\.aichat-composer-attachments\s*\{[^}]*justify-content:\s*flex-start !important/);
  assert.match(styles, /\.aichat-message-row\.is-user \.aichat-message-content\s*\{[\s\S]*?width:\s*100% !important[\s\S]*?align-items:\s*flex-end/);
  assert.match(styles, /\.aichat-message-attachments\.is-user-attachments\s*\{[^}]*justify-content:\s*flex-end/);
});


test("sent user attachments align to the right edge while composer files remain left", async () => {
  const styles = await read("../src/styles.css");
  assert.match(styles, /\.aichat-composer-attachments\s*\{[^}]*justify-content:\s*flex-start !important/);
  assert.match(styles, /\.aichat-message-row\.is-user \.aichat-message-content\s*\{[\s\S]*?width:\s*100% !important[\s\S]*?align-items:\s*flex-end/);
  assert.match(styles, /\.aichat-message-row\.is-user \.aichat-message-content > \.aichat-message-attachments\.is-user-attachments\s*\{[\s\S]*?align-self:\s*flex-end[\s\S]*?justify-content:\s*flex-end/);
});

test("profile avatar downloads happen outside the Supabase auth callback and render as typed data URLs", async () => {
  const dashboard = await read("../src/routes/dashboard.tsx");
  const authCallback = dashboard.slice(
    dashboard.indexOf("onAuthStateChange("),
    dashboard.indexOf("}, [navigate]);")
  );
  assert.doesNotMatch(authCallback, /storage\.download/);
  assert.match(dashboard, /useEffect\(\(\) => \{[\s\S]*?profileAvatarStoragePath[\s\S]*?storage\.from\("misma-media"\)\.download\(path\)/);
  assert.match(dashboard, /function readStoredProfileImage\(blob: Blob, storagePath: string\)/);
  assert.match(dashboard, /setProfileImage\(dataUrl\)/);
});

test("profile photo save waits for image preparation and persists the selected storage path", async () => {
  const dashboard = await read("../src/routes/dashboard.tsx");
  assert.match(dashboard, /profileAvatarPreparing/);
  assert.match(dashboard, /disabled=\{profileSaving \|\| profileAvatarPreparing\}/);
  assert.match(dashboard, /setProfileAvatarStoragePath\(avatarPath\)/);
  assert.match(dashboard, /contentType: profileAvatarFile\.type \|\| "image\/jpeg"/);
});


test("multiple sent attachments remain horizontal in the user message", async () => {
  const styles = await read("../src/styles.css");
  assert.match(styles, /\.aichat-message-row\.is-user \.aichat-message-content > \.aichat-message-attachments\.is-user-attachments\s*\{[^}]*flex-wrap:\s*nowrap !important/);
  assert.match(styles, /overflow-x:\s*auto/);
});

test("voice presets prefer matching English voices and fall back to system English when gender labels are hidden", async () => {
  const voice = await read("../src/lib/misma-voice.ts");
  const dashboard = await read("../src/routes/dashboard.tsx");
  assert.match(voice, /export function getSpeechVoiceForPreset/);
  assert.match(voice, /const englishVoices = voices\.filter/);
  assert.match(voice, /const fallbackPool =/);
  assert.match(voice, /language === "en-gb"/);
  assert.match(voice, /lang = "en-GB"/);
  assert.match(voice, /voicePreset = "woman"/);
  assert.match(voice, /speech-playback/);
  assert.match(dashboard, /getSpeechVoiceForPreset/);
  assert.match(dashboard, /voicePreset="woman"/);
  assert.match(dashboard, /getVoiceForPreset\(availableVoices, selectedVoicePreset\)/);
});

test("website widget connections support shared keys and safe removal", async () => {
  const api = await read("../src/lib/api/misma.functions.ts");
  const edge = await read("../supabase/functions/misma-widget/index.ts");
  const dashboard = await read("../src/routes/dashboard.tsx");
  const widget = await read("../src/assets/misma-widget-runtime.js");
  assert.match(api, /shareWebsiteWidgetAcrossWorkspace/);
  assert.match(api, /sharedWidgetKey/);
  assert.match(api, /deleteWebsiteConnection/);
  assert.match(api, /widget_deleted_at: new Date\(\)\.toISOString\(\),\s*widget_public_key: crypto\.randomUUID\(\)/);
  assert.match(edge, /\.eq\("widget_public_key", key\)/);
  assert.match(edge, /\.is\("widget_deleted_at", null\)/);
  assert.match(dashboard, /Use one widget for all connected websites/);
  assert.match(dashboard, /Delete connection/);
  assert.match(dashboard, /minimizedWebsiteIds/);
  assert.match(dashboard, /aichat-website-expand/);
  assert.match(dashboard, /aichat-website-card-details/);
  assert.match(widget, /function initWidget\(initialConfig\)/);
  assert.match(widget, /action:"heartbeat"/);
  assert.match(widget, /\.then\(function\(data\)\{/);
});


test("embedded chat widget has in-field green send, microphone dictation and female speech chat", async () => {
  const widget = await read("../src/assets/misma-widget-runtime.js");
  assert.match(widget, /class='icon-btn mic'/);
  assert.match(widget, /class='send-btn primary is-voice'/);
  assert.match(widget, /background:#22c55e/);
  assert.match(widget, /function speakAsWoman/);
  assert.match(widget, /femalePattern/);
  assert.match(widget, /showTyping/);
  assert.match(widget, /Misma is typing/);
  assert.doesNotThrow(() => new Function(widget), "the hosted widget must parse before deployment");
});

test("embedded chat widget header has no minimize or expand/resize controls", async () => {
  const widget = await read("../src/assets/misma-widget-runtime.js");
  assert.doesNotMatch(widget, /class='minimize'/);
  assert.doesNotMatch(widget, /minimizeButton\.addEventListener/);
  assert.doesNotMatch(widget, /minimized/);
  assert.doesNotMatch(widget, /resize-handle|sizeStore|Resize widget|saveSize|resizeState/);
  assert.match(widget, /class='human'/);
  assert.match(widget, /class='close'/);
});

test("shared installation script uses the same widget key while the server checks each registered host", async () => {
  const dashboard = await read("../src/routes/dashboard.tsx");
  const edge = await read("../supabase/functions/misma-widget/index.ts");
  const widget = await read("../src/assets/misma-widget-runtime.js");
  const migration = await read("../supabase/migrations/20261107110000_website_widget_groups.sql");
  assert.match(dashboard, /General shared website script/);
  assert.match(dashboard, /data-site-key="\$\{sharedWidgetPublicKey\}"/);
  assert.match(edge, /candidate\.domain/);
  assert.match(widget, /siteSessionKey=key\+"_"\+location\.hostname\.toLowerCase\(\)/);
  assert.match(migration, /widget_public_key/);
  assert.match(migration, /widget_deleted_at/);
});


test("website widget header uses social controls instead of expand and resize actions", async () => {
  const widget = await read("../src/assets/misma-widget-runtime.js");
  const whatsapp = widget.indexOf("class='social-link whatsapp-link'");
  const instagram = widget.indexOf("class='social-link instagram-link'");
  const person = widget.indexOf("class='human'");
  const close = widget.indexOf("class='close'");
  const headerEnd = widget.indexOf("</header>", close);
  assert.ok(whatsapp >= 0 && instagram > whatsapp && person > instagram && close > person && headerEnd > close);
  assert.doesNotMatch(widget, /resizeState|sizeStore|resize-handle/);
});

test("website widget dictation shows a recording waveform and waits for Send to submit", async () => {
  const widget = await read("../src/assets/misma-widget-runtime.js");
  assert.match(widget, /class='recording-waveform'/);
  assert.match(widget, /composer\.classList\.add\("recording"\)/);
  assert.match(widget, /function finishDictationAndSend\(\)/);
  assert.match(widget, /dictationSendAfterStop=true/);
  assert.match(widget, /if\(dictationSendAfterStop\)[\s\S]*?sendMessage\(transcript,false\)/);
  assert.match(widget, /if\(dictating\)\{finishDictationAndSend\(\);return;\}/);
});

test("website widget speech talk provides the dashboard voice controls and spoken-reply context", async () => {
  const widget = await read("../src/assets/misma-widget-runtime.js");
  const edge = await read("../supabase/functions/misma-widget/index.ts");
  assert.match(widget, /class='voice-view'/);
  assert.match(widget, /data-mode='hands-free'/);
  assert.match(widget, /data-mode='push-to-talk'/);
  assert.match(widget, /class='voice-control voice-mute'/);
  assert.match(widget, /class='voice-control voice-stop/);
  assert.match(widget, /class='voice-control voice-end/);
  assert.match(widget, /voice:speakReply===true/);
  assert.match(edge, /async function answerCustomer\(db: Db, workspaceId: string, message: string, voice = false\)/);
  assert.match(edge, /input\.voice === true/);
  assert.match(edge, /VOICE CONVERSATION/);
});


test("website human handoff always creates an owner notification with the visitor message", async () => {
  const edge = await read("../supabase/functions/misma-widget/index.ts");
  const widget = await read("../src/assets/misma-widget-runtime.js");
  const dashboard = await read("../src/routes/dashboard.tsx");

  const handoff = edge.slice(edge.indexOf("async function saveHumanRequest"), edge.indexOf("\nfunction isSafeWebsiteUrl"));
  assert.match(handoff, /workspace_id: site\.workspace_id/);
  assert.match(handoff, /notification_type: "human_request"/);
  assert.match(handoff, /title: name/);
  assert.match(handoff, /human_request_id: requestId/);
  assert.match(handoff, /Message: " \+ reason/);
  assert.match(handoff, /Email: " \+ email/);
  assert.match(handoff, /Phone: " \+ phone/);
  assert.match(handoff, /existingNotification\.data/);
  assert.match(handoff, /createdNotification\.error/);
  assert.doesNotMatch(handoff, /notification\.error\) console\.warn/);
  assert.match(edge, /Action failed:", action, message/);
  assert.match(edge, /action === "human-request" \? 500/);
  assert.match(widget, /call\(Object\.assign\(\{action:"human-request"\},data\)\)/);
  assert.match(edge, /confirmationText = "Your request to speak with a person has been sent/);
  assert.match(edge, /role: "ai"/);
  assert.match(widget, /Human request sent/);
  assert.match(dashboard, /refreshVisitorNotifications\(\); setActiveTab\("notifications"\)/);
  assert.ok(dashboard.includes("https://misma.onrender.com/assets/misma-widget.js"));
});


test("website widget uses a permanent URL backed by a live, non-cacheable server route", async () => {
  const dashboard = await read("../src/routes/dashboard.tsx");
  const widget = await read("../src/assets/misma-widget-runtime.js");
  const widgetRoute = await read("../src/routes/assets/misma-widget[.]js.ts");
  const security = await read("../src/lib/security-headers.server.ts");
  const server = await read("../src/server.ts");
  const vite = await read("../vite.config.ts");

  assert.ok(dashboard.includes("https://misma.onrender.com/assets/misma-widget.js"));
  assert.ok(dashboard.includes("misma-widget.js?v=20261107-widget-channels-1"));
  assert.ok(dashboard.includes("data-site-key="));
  assert.ok(widgetRoute.includes('createFileRoute("/assets/misma-widget.js")'));
  assert.ok(widgetRoute.includes('import widgetRuntime from "../../assets/misma-widget-runtime.js?raw"'));
  assert.ok(widgetRoute.includes('"Content-Type": "application/javascript; charset=utf-8"'));
  assert.ok(widgetRoute.includes('"Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0"'));
  assert.ok(widgetRoute.includes('"CDN-Cache-Control": "no-store"'));
  assert.ok(security.includes("CDN-Cache-Control"));
  assert.ok(security.includes("/assets/misma-widget.js"));
  assert.ok(vite.includes('"/assets/misma-widget.js"'));
  assert.ok(server.includes("applySecurityHeaders(await normalizeCatastrophicSsrResponse(response), request)"));
  await assert.rejects(read("../public/assets/misma-widget.js"), "the widget must not be shadowed by a static public file");
  assert.doesNotThrow(() => new Function(widget), "the dynamically served widget source must parse");
});

test("dashboard notification feed shows named human requests and counts unread notifications", async () => {
  const api = await read("../src/lib/api/misma.functions.ts");
  const dashboard = await read("../src/routes/dashboard.tsx");
  assert.equal(api.split('eq("notification_type", "human_request")').length - 1, 3);
  assert.ok(api.includes("export const markHumanRequestNotificationRead"));
  assert.ok(dashboard.includes('const unreadHumanRequestNotificationCount = allNotifications.filter((notification) => notification.is_read !== true).length;'));
  assert.ok(dashboard.includes("markHumanRequestNotificationRead({ data: { token, notificationId } })"));
  assert.ok(dashboard.includes("selectedHumanRequestNotificationId"));
  assert.ok(dashboard.includes("<strong>{visitorName}</strong>"));
  assert.ok(dashboard.includes("request?.visitor_email"));
  assert.ok(dashboard.includes("request?.visitor_phone"));
  assert.ok(dashboard.includes("request?.reason"));
  assert.ok(dashboard.includes("Open conversation"));
  const viewStart = dashboard.indexOf('{activeTab === "notifications" && (');
  const viewEnd = dashboard.indexOf("\n\n        {deleteChatTarget && (", viewStart);
  assert.ok(viewStart >= 0 && viewEnd > viewStart);
  assert.ok(!dashboard.slice(viewStart, viewEnd).includes("unreadVisitorMessages.map"));
});


test("widget microphone and speech talk use female-first English voice selection with playback fallback", async () => {
  const widget = await read("../src/assets/misma-widget-runtime.js");
  assert.ok(widget.includes("class='mic-permission-backdrop'"));
  assert.ok(widget.includes("<strong>misma.onrender.com</strong> wants to use your microphone"));
  assert.ok(widget.includes('micPermissionWhile.addEventListener("click",requestMicPermissionAndStart)'));
  assert.ok(widget.includes('micPermissionOnce.addEventListener("click",requestMicPermissionAndStart)'));
  assert.ok(widget.includes('micPermissionNever.addEventListener("click"'));
  assert.ok(widget.includes("navigator.mediaDevices.getUserMedia({audio:true})"));
  const widgetPermissionFlow = widget.slice(widget.indexOf("function requestMicForAction(action)"), widget.indexOf("function refreshMicPermission()"));
  assert.doesNotMatch(widgetPermissionFlow, /showMicPermissionPrompt\(action\)/);
  assert.ok(widgetPermissionFlow.includes("requestMicPermissionAndStart();"));
  assert.ok(widget.includes('requestMicForAction("dictation")'));
  assert.ok(widget.includes('requestMicForAction("speech")'));
  assert.ok(widget.includes("function beginVoiceSessionAfterPermission()"));
  assert.ok(widget.includes("function getFemaleVoice()"));
  assert.ok(widget.includes("var british=female.filter(isBritishEnglish)"));
  assert.ok(widget.includes("var englishPool=voices.filter(isEnglish)"));
  assert.ok(widget.includes("return englishNonMale[0]||englishFallback[0]||nonMale[0]||voices[0]"));
  assert.ok(widget.includes("utterance.pitch=1.16"));
  assert.ok(widget.includes('utterance.lang=(girlVoice&&girlVoice.lang)||"en-US"'));
  assert.ok(widget.includes("synth.resume()"));
  assert.ok(widget.includes("Microphone is blocked. Tap the lock icon next to the address bar"));
  assert.ok(widget.includes('setVoiceState("idle",errorMessage)'));
  assert.ok(widget.includes('error==="audio-capture"'));
  assert.doesNotMatch(widget, /minimized/);
  assert.doesNotThrow(() => new Function(widget), "widget microphone code must parse");
});

test("embedded speech talk hides transcripts and uses female-first English speech fallback", async () => {
  const widget = await read("../src/assets/misma-widget-runtime.js");
  const edge = await read("../supabase/functions/misma-widget/index.ts");
  assert.ok(!widget.includes("voiceTranscript"));
  assert.ok(!widget.includes("voice-transcript"));
  assert.ok(widget.includes('instance.lang=isVoiceChat?"en-GB"'));
  assert.ok(widget.includes("function isBritishEnglish(voice)"));
  assert.ok(widget.includes("var british=female.filter(isBritishEnglish)"));
  assert.ok(widget.includes("var englishPool=voices.filter(isEnglish)"));
  assert.ok(widget.includes("return englishNonMale[0]||englishFallback[0]||nonMale[0]||voices[0]"));
  assert.ok(widget.includes('utterance.lang=(girlVoice&&girlVoice.lang)||"en-US"'));
  assert.ok(widget.includes("utterance.pitch=1.16"));
  assert.ok(widget.includes("google.*female"));
  assert.ok(edge.includes("Always understand and respond in English"));
});


test("website social links are owner-scoped and WhatsApp links are composed from stored parts", async () => {
  const api = await read("../src/lib/api/misma.functions.ts");
  const edge = await read("../supabase/functions/misma-widget/index.ts");
  const migration = await read("../supabase/migrations/20261108100000_website_social_links.sql");
  const dashboard = await read("../src/routes/dashboard.tsx");
  assert.match(api, /saveWebsiteSocialLinks/);
  assert.match(api, /Only the workspace owner can edit website social links/);
  assert.match(api, /whatsappCountryCode: z\.string\(\)\.regex\(\/\^\\d\{1,4\}\$\/\)/);
  assert.match(edge, /input\.action === "widget-config"/);
  assert.match(edge, /"https:\/\/wa\.me\/" \+ fullNumber \+ "\?text=" \+ encodeURIComponent\(message\)/);
  assert.match(dashboard, /Only instagram\.com profile URLs are accepted/);
  assert.match(dashboard, /totalDigits < 7 \|\| totalDigits > 15/);
  assert.match(migration, /website_connections_update_owner/);
  assert.match(migration, /workspace\.owner_id = \(select auth\.uid\(\)\)/);
});

test("connected website settings and social widget controls stay accessible on mobile", async () => {
  const dashboard = await read("../src/routes/dashboard.tsx");
  const runtime = await read("../src/assets/misma-widget-runtime.js");
  const css = await read("../src/styles.css");
  assert.match(dashboard, /className="aichat-website-expand"/);
  assert.match(dashboard, /aria-expanded=\{!minimizedWebsiteIds\.includes\(site\.id\)\}/);
  assert.match(dashboard, /Add channels/);
  assert.match(dashboard, /Last activity:/);
  assert.match(runtime, /class='social-link whatsapp-link'/);
  assert.match(runtime, /class='social-link instagram-link'/);
  assert.match(runtime, /target='_blank' rel='noopener noreferrer'/);
  assert.doesNotMatch(runtime, /resize-handle|sizeStore|Resize widget|saveSize|resizeState/);
  assert.match(css, /\.aichat-website-expand[\s\S]*?width: 40px/);
  assert.match(css, /@media \(max-width: 560px\)[\s\S]*?aichat-website-row-heading/);
  assert.doesNotThrow(() => new Function(runtime), "widget runtime must parse");
});


test("widget heartbeat returns website social links and the header reveals only validated destinations", async () => {
  const edge = await read("../supabase/functions/misma-widget/index.ts");
  const widget = await read("../src/assets/misma-widget-runtime.js");
  assert.match(edge, /input\.action === "heartbeat"\) return respond\(200, \{ ok: true, connected: true, \.\.\.getWebsiteWidgetSocialLinks\(site\) \}\)/);
  assert.match(edge, /"https:\/\/wa\.me\/" \+ fullNumber \+ "\?text=" \+ encodeURIComponent\(message\)/);
  assert.match(widget, /function initWidget\(initialConfig\)/);
  assert.match(widget, /applyWebsiteSocialLinks\(initialConfig\)/);
  assert.match(widget, /link\.removeAttribute\("hidden"\)/);
  assert.match(widget, /link\.classList\.add\("is-visible"\)/);
  assert.doesNotThrow(() => new Function(widget), "widget runtime must parse");
});

test("website visitor history reuses the existing conversation by site and visitor session", async () => {
  const edge = await read("../supabase/functions/misma-widget/index.ts");
  const start = edge.indexOf("async function ensureWebsiteConversation");
  const end = edge.indexOf("\nasync function ", start + 1);
  const resolver = edge.slice(start, end);
  assert.match(resolver, /\.eq\("website_connection_id", site\.id\)[\s\S]*?\.eq\("visitor_session_id", sessionId\)/);
  assert.match(resolver, /byVisitorSession\.data\) return \{ conversation: byVisitorSession\.data, visitorId: sessionId \}/);
  assert.match(resolver, /Could not look up the visitor's existing conversation/);
});

test("closing a website widget deletes only visitor sessions with no human handoff", async () => {
  const edge = await read("../supabase/functions/misma-widget/index.ts");
  const runtime = await read("../src/assets/misma-widget-runtime.js");
  const migration = await read("../supabase/migrations/20261107170000_widget_close_ephemeral_retention.sql");
  assert.match(runtime, /call\(\{action:"close",conversationId:closingConversation,visitorId:closingVisitor\}\)/);
  assert.match(edge, /input\.action === "close"/);
  assert.match(edge, /delete_website_visitor_conversation_if_ephemeral/);
  assert.match(migration, /public\.human_requests/);
  assert.match(migration, /public\.human_handoff_requests/);
  assert.match(migration, /conversation\.channel = 'Website'/);
  assert.match(migration, /grant execute[\s\S]*to service_role/i);
});

test("website scanning requests structured JSON, validates extraction and retries once", async () => {
  const edge = await read("../supabase/functions/misma-widget/index.ts");
  const dashboard = await read("../src/routes/dashboard.tsx");
  assert.match(edge, /responseMimeType: "application\/json"/);
  assert.match(edge, /response_format:[\s\S]*json_schema/);
  assert.match(edge, /WEBSITE_EXTRACTION_SCHEMA\.safeParse/);
  assert.match(edge, /for \(let attempt = 0; attempt < 2; attempt \+= 1\)/);
  assert.match(edge, /rawPreview: answer\.slice\(0, 1600\)/);
  assert.match(edge, /AbortSignal\.timeout\(100_000\)/);
  assert.match(dashboard, /window\.setTimeout\(\(\) => controller\.abort\(\), 112_000\)/);
  assert.match(dashboard, /websiteScanFeedback\[site\.id\]/);
});

test("voice-note webm files are audio and use Groq transcription instead of video keyframes", async () => {
  const dashboard = await read("../src/routes/dashboard.tsx");
  const edge = await read("../supabase/functions/misma-chat/index.ts");
  assert.ok(dashboard.includes('webm: /(?:misma-)?voice-note-/i.test(file.name) ? "audio/webm" : "video/webm"'));
  assert.match(dashboard, /isLegacyVoiceNoteWebm/);
  assert.match(dashboard, /uploadOne\(normalizedAudio, "audio"\)/);
  assert.match(dashboard, /isAudio && previewUrl/);
  assert.match(edge, /"audio", "file"/);
  assert.match(edge, /api\.groq\.com\/openai\/v1\/audio\/transcriptions/);
  assert.match(edge, /whisper-large-v3-turbo/);
  assert.match(edge, /transcribedAudio/);
});


test("dashboard and website widget share the Chrome-style microphone permission flow", async () => {
  const hook = await read("../src/lib/use-mic-permission.ts");
  const dialog = await read("../src/components/mic-permission-dialog.tsx");
  const dialogCss = await read("../src/components/mic-permission-dialog.css");
  const voiceInput = await read("../src/components/voice-input-bar.tsx");
  const widget = await read("../src/assets/misma-widget-runtime.js");
  const checklist = await read("../docs/mic-permission-dialog.md");

  assert.match(hook, /MISMA_ORIGIN_LABEL = "misma\.onrender\.com"/);
  assert.match(hook, /navigator\.permissions\.query/);
  assert.match(hook, /getUserMedia\(\{ audio: true \}\)/);
  assert.match(hook, /MISMA_MIC_PREFERENCE_KEY/);
  assert.match(dialog, /role="alertdialog"/);
  assert.match(dialog, /Allow while visiting the site/);
  assert.match(dialog, /Allow this time/);
  assert.match(dialog, /Never allow/);
  assert.match(dialogCss, /rgba\(0, 0, 0, 0\.55\)/);
  assert.match(dialogCss, /prefers-reduced-motion/);
  assert.match(voiceInput, /useMicPermission/);
  assert.match(voiceInput, /MicPermissionDialog/);
  assert.match(widget, /MISMA_ORIGIN_LABEL="misma\.onrender\.com"/);
  assert.match(widget, /role='alertdialog'/);
  assert.match(widget, /mic-permission-while/);
  assert.match(widget, /mic-permission-once/);
  assert.match(widget, /mic-permission-never/);
  assert.match(widget, /attachShadow/);
  assert.match(widget, /z-index:2147483647/);
  assert.match(checklist, /Chrome Android/);
  assert.match(checklist, /Safari iOS/);
  assert.match(checklist, /schoolsize\.netlify\.app/);
});


test("website widget speech replies prefer a Siri US English voice and then a US female system voice", async () => {
  const widget = await read("../src/assets/misma-widget-runtime.js");
  assert.ok(widget.includes("var siriPattern=/siri|susan\\s+bennett/i;"));
  assert.ok(widget.includes("function isAmericanEnglish(voice)"));
  assert.ok(widget.includes("var siri=voices.filter"));
  assert.ok(widget.includes("var american=female.filter(isAmericanEnglish)"));
  assert.ok(widget.includes("var americanFallback=englishPool.filter(isAmericanEnglish)"));
  assert.ok(widget.includes("utterance.pitch=1.16"));
  assert.ok(widget.includes("utterance.rate=0.98"));
  assert.ok(widget.includes('utterance.lang=(girlVoice&&girlVoice.lang)||"en-US"'));
  assert.ok(widget.includes("speakChunk(textChunk,true)"));
  assert.doesNotThrow(() => new Function(widget));
});


test("dashboard and website speech talk retry playback through the device default voice", async () => {
  const voice = await read("../src/lib/misma-voice.ts");
  const component = await read("../src/components/voice-input-bar.tsx");
  const widget = await read("../src/assets/misma-widget-runtime.js");
  assert.match(voice, /primeSpeechVoices\(800\)/);
  assert.match(voice, /speakChunk\(chunk, true\)/);
  assert.match(voice, /synth\.resume\(\)/);
  assert.match(component, /Misma could not play the spoken reply/);
  assert.ok(widget.includes("var englishPool=voices.filter(isEnglish)"));
  assert.match(widget, /speakChunk\(textChunk,true\)/);
  assert.match(widget, /window\.setTimeout\(next,80\)/);
  assert.doesNotThrow(() => new Function(widget), "widget speech playback code must parse");
});


test("mobile dashboard microphone and Speech Talk controls are not disabled by navigator.onLine", async () => {
  const component = await read("../src/components/voice-input-bar.tsx");
  assert.ok(!component.includes("navigator.onLine"));
  assert.ok(!component.includes("disabled={disabled || !online}"));
  assert.ok(component.includes("disabled={disabled}"));
  assert.ok(component.includes("micPermission.runWithPermission"));
});

test("Misma says it was created by Misma Corporation and widget channel icons use platform colors", async () => {
  const chat = await read("../supabase/functions/misma-chat/index.ts");
  const widgetEdge = await read("../supabase/functions/misma-widget/index.ts");
  const widget = await read("../src/assets/misma-widget-runtime.js");
  assert.ok(chat.includes("Misma was created by Misma Corporation"));
  assert.ok(widgetEdge.includes("Misma was created by Misma Corporation"));
  assert.ok(widget.includes("whatsapp-link{background:#25D366"));
  assert.ok(widget.includes("instagram-link{background:linear-gradient"));
  assert.doesNotThrow(() => new Function(widget), "widget runtime must parse");
});

test("dashboard bootstrap returns chat and notification data before media signing", async () => {
  const api = await read("../src/lib/api/misma.functions.ts");
  const dashboard = await read("../src/routes/dashboard.tsx");
  const start = api.indexOf("export const getMismaData");
  const end = api.indexOf("export const getWorkspaceAssets");
  assert.ok(start >= 0 && end > start);
  const bootstrap = api.slice(start, end);
  assert.match(bootstrap, /Promise\.all\(\[/);
  assert.match(bootstrap, /unreadVisitorCount/);
  assert.match(bootstrap, /count: "exact"/);
  assert.doesNotMatch(bootstrap, /createSignedUrl|workspace_library_files|attachments/);
  assert.match(dashboard, /misma_dashboard_bootstrap_v1_/);
  assert.match(dashboard, /sessionStorage\.setItem\(cacheKey/);
  assert.match(dashboard, /getWorkspaceAssets\(\{ data: \{ token \} \}\)/);
  assert.match(dashboard, /activeTab !== "images" && activeTab !== "library"/);
});

test("website Add channels has a country selector, WhatsApp number, and default message without country search", async () => {
  const dashboard = await read("../src/routes/dashboard.tsx");
  assert.doesNotMatch(dashboard, /countrySearch|Search country or dial code|Search country or \+250/);
  assert.match(dashboard, /Country code/);
  assert.match(dashboard, /Phone number/);
  assert.match(dashboard, /Default message/);
  assert.match(dashboard, /WEBSITE_PHONE_COUNTRY_CODES\.map\(\(country\) =>/);
});


test("dashboard restores the selected chat from a user-scoped session cache while refreshing it", async () => {
  const dashboard = await read("../src/routes/dashboard.tsx");
  assert.match(dashboard, /misma_active_chat_messages_v2_/);
  assert.match(dashboard, /sessionStorage\.getItem\(conversationCacheKey/);
  assert.match(dashboard, /setMessages\(cached\.messages\)/);
  assert.match(dashboard, /getConversationMessages\(\{/);
  assert.match(dashboard, /conversationLoadVersion !== chatViewVersionRef\.current/);
  assert.match(dashboard, /messages\.slice\(-120\)/);
});


test("web push is workspace-scoped, opt-in, and connected to website human handoff", async () => {
  const migration = await read("../supabase/migrations/20261109091625_web_push_subscriptions.sql");
  const worker = await read("../public/misma-push-sw.js");
  const dashboard = await read("../src/routes/dashboard.tsx");
  const edge = await read("../supabase/functions/misma-widget/index.ts");

  assert.match(migration, /CREATE TABLE public\.push_subscriptions/);
  assert.match(migration, /FOREIGN KEY \(workspace_id, user_id\) REFERENCES public\.workspace_members/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /auth\.uid\(\)/);
  assert.match(migration, /CREATE SCHEMA IF NOT EXISTS private/);
  assert.match(migration, /get_or_create_push_vapid_key_pair/);
  assert.match(migration, /TO service_role/);
  assert.match(worker, /addEventListener\(["']push["']/);
  assert.match(worker, /showNotification/);
  assert.match(worker, /notificationclick/);
  assert.match(worker, /sameOriginDashboard/);
  assert.ok(worker.includes('icon: "/misma-logo.svg"'));
  assert.ok(worker.includes('badge: "/misma-logo.svg"'));
  assert.ok(worker.includes('searchParams.set("redirect", notificationPath)'));
  assert.match(dashboard, /toggleHumanRequestPushNotifications/);
  assert.match(dashboard, /pushManager\.subscribe/);
  assert.match(dashboard, /requestPermission\(\)/);
  assert.match(dashboard, /save-push-subscription/);
  assert.match(dashboard, /delete-push-subscription/);
  assert.match(dashboard, /Human assistance requests/);
  assert.match(edge, /push-public-key/);
  assert.match(edge, /save-push-subscription/);
  assert.match(edge, /delete-push-subscription/);
  assert.match(edge, /async function sendHumanRequestPush/);
  assert.match(edge, /function scheduleHumanRequestPush/);
  assert.match(edge, /scheduleHumanRequestPush\(db, site\.workspace_id/);
  assert.match(edge, /scheduleHumanRequestPush\(db, workspaceId, Number\(request\.data\.id\), Number\(conversation\.id\).*"phone"/);
  assert.match(edge, /scheduleHumanRequestPush\(db, workspaceId, Number\(request\.data\.id\), Number\(conversation\.data\.id\).*"WhatsApp"/);
  assert.match(edge, /runtime\.waitUntil\(pushTask\)/);
  assert.match(dashboard, /In Chrome, allow notifications when prompted/i);
  assert.match(edge, /statusCode === 404 \|\| statusCode === 410/);
  assert.ok(edge.includes('.select("visitor_name,reason")'));
  assert.ok(edge.includes('"Website: " + sourceLabel'));
  const login = await read("../src/routes/login.tsx");
  const callback = await read("../src/routes/auth/callback.tsx");
  assert.ok(login.includes("misma_post_login_redirect"));
  assert.ok(login.includes("window.location.replace(consumePostLoginDestination())"));
  assert.ok(callback.includes("misma_post_login_redirect"));
  assert.ok(callback.includes("window.location.replace(destination)"));
});

test("dashboard Speech Talk shares the widget's woman English voice profile", async () => {
  const voice = await read("../src/lib/misma-voice.ts");
  const dashboard = await read("../src/routes/dashboard.tsx");
  const widget = await read("../src/assets/misma-widget-runtime.js");

  assert.match(voice, /const WIDGET_SPEECH_PITCH = 1\.16/);
  assert.match(voice, /const WIDGET_SPEECH_RATE = 0\.98/);
  assert.match(voice, /getWidgetSpeechVoice\(voices\)/);
  assert.match(voice, /utterance\.pitch = WIDGET_SPEECH_PITCH/);
  assert.match(voice, /utterance\.rate = WIDGET_SPEECH_RATE/);
  assert.match(voice, /const siri = voices\.filter/);
  assert.match(voice, /const american = female\.filter\(isWidgetAmericanEnglishVoice\)/);
  assert.match(voice, /const british = female\.filter\(isWidgetBritishEnglishVoice\)/);
  assert.match(voice, /const englishPool = voices\.filter\(isWidgetEnglishVoice\)/);
  assert.match(voice, /return englishNonMale\[0\] \|\| englishFallback\[0\] \|\| nonMale\[0\] \|\| voices\[0\]/);
  assert.match(voice, /preferredVoice\?\.lang \|\| "en-US"/);
  assert.match(voice, /cleanForSpeech\(rawText\)\.slice\(0, 1600\)/);
  assert.match(dashboard, /<VoiceInputBar[\s\S]*?voicePreset="woman"/);
  assert.match(widget, /utterance\.pitch=1\.16;utterance\.rate=0\.98/);
  assert.ok(widget.includes('utterance.lang=(girlVoice&&girlVoice.lang)||"en-US"'));
  assert.match(dashboard, /getVoiceForPreset\(availableVoices, selectedVoicePreset\)/);
});

test("human-request conversations show only customer and staff messages with opposite alignment and internal back navigation", async () => {
  const dashboard = await read("../src/routes/dashboard.tsx");
  const styles = await read("../src/styles.css");

  assert.match(dashboard, /humanHandoffs\.some\(\(request: any\) =>[\s\S]*?Number\(request\.conversation_id\) === Number\(currentConversationId\)/);
  assert.match(dashboard, /messages\.filter\(\(message\) => message\.role === "customer" \|\| message\.role === "human"\)/);
  assert.match(dashboard, /const isCustomerMessage = isHumanHandoffConversation && msg\.role === "customer"/);
  assert.match(dashboard, /const isUserMessage = isHumanHandoffConversation[\s\S]*?msg\.role === "human"/);
  assert.match(dashboard, /messageSide = isCustomerMessage \? "is-customer" : isUserMessage \? "is-user" : "is-ai"/);
  assert.match(dashboard, /className="aichat-header-back"/);
  assert.match(dashboard, /Go back to previous page/);
  assert.match(dashboard, /dashboardTabHistory/);
  assert.match(styles, /\.aichat-message-row\.is-customer\s*\{\s*justify-content:\s*flex-start/);
  assert.match(styles, /\.aichat-message-row\.is-customer \.aichat-bubble/);
});

test("website human handoff sends customer typing and new replies to the open business conversation quickly", async () => {
  const migration = await read("../supabase/migrations/20261109110000_website_visitor_typing_presence.sql");
  const api = await read("../src/lib/api/misma.functions.ts");
  const dashboard = await read("../src/routes/dashboard.tsx");
  const styles = await read("../src/styles.css");
  const widget = await read("../src/assets/misma-widget-runtime.js");
  const edge = await read("../supabase/functions/misma-widget/index.ts");

  assert.match(migration, /visitor_typing_until timestamptz/);
  const workspaceContext = await read("../src/lib/api/workspace-context.server.ts");

  assert.match(api, /export const getConversationActivity = createServerFn/);
  assert.match(api, /workspaceId: z\.string\(\)\.uuid\(\)/);
  assert.match(api, /ensureWorkspace\(data\.token, data\.workspaceId\)/);
  assert.match(workspaceContext, /requestedWorkspaceId\?: string/);
  assert.match(workspaceContext, /membershipQuery = membershipQuery\.eq\("workspace_id", requestedWorkspaceId\)/);
  assert.match(dashboard, /workspaceId: workspace\.id, conversationId: currentConversationId/);
  assert.match(api, /visitor_typing_until/);
  assert.match(api, /afterMessageId/);
  assert.match(api, /\.gt\("id", data\.afterMessageId\)/);
  assert.match(dashboard, /getConversationActivity\(\{/);
  assert.match(dashboard, /window\.setTimeout\(poll, 1200\)/);
  assert.match(dashboard, /visitorIsTyping/);
  assert.match(dashboard, /Customer is typing/);
  assert.match(styles, /\.aichat-visitor-typing-bubble/);
  assert.match(widget, /function reportVisitorTyping\(\)/);
  assert.match(widget, /call\(\{action:"typing",isTyping:next\}\)/);
  assert.match(widget, /conversationStatus==="Needs you"\?1400:5000/);
  assert.match(widget, /item\.role==="human"\?"Assistant: "\+item\.text/);
  assert.doesNotMatch(widget, /"Business team: "\+item\.text/);
  assert.doesNotMatch(widget, /business team will follow up/i);
  assert.match(edge, /An assistant will follow up here/);
  assert.match(edge, /Your message has reached the assistant/);
  assert.match(edge, /input\.action === "typing"/);
  assert.match(edge, /visitor_typing_until: typingUntil/);
  assert.match(edge, /visitor_typing_until: null/);
});

test("website and dashboard Speech Talk use short replies with bounded fast provider attempts", async () => {
  const widgetVoice = await read("../supabase/functions/misma-widget/index.ts");
  const dashboardVoice = await read("../supabase/functions/misma-chat/index.ts");
  const voice = await read("../src/lib/misma-voice.ts");
  const widgetRuntime = await read("../src/assets/misma-widget-runtime.js");

  assert.match(widgetVoice, /voice \? \(voiceAttempt === 0 \? 6500 : 4500\) : 18000/);
  assert.match(widgetVoice, /max_tokens: voice \? 180 : 6000/);
  assert.match(widgetVoice, /providerAttempt >= 2/);
  assert.match(widgetVoice, /ideally under 25 words/);
  assert.match(dashboardVoice, /voice \? \(providerIndex === 0 \? 6_500 : 4_500\) : undefined/);
  assert.match(dashboardVoice, /if \(voice && providerIndex >= 2\) break/);
  assert.match(dashboardVoice, /voiceMode \? 180 : thinkHarder \? 4096 : 2048/);
  assert.match(dashboardVoice, /thinkHarder: thinkHarder && !voice/);
  assert.match(dashboardVoice, /searchLiveWeb\(message, voice\)/);
  assert.match(dashboardVoice, /AbortSignal\.timeout\(voiceFastMode \? 3_000 : 7_500\)/);
  assert.match(dashboardVoice, /historyWindow = voice \|\| requestedAttachments\.length \? 4 : 10/);
  assert.match(voice, /primeSpeechVoices\(800\)/);
  assert.match(widgetRuntime, /window\.setTimeout\(done,650\)/);
});
