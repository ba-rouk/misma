import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("appearance typography settings drive UI and code font sizes", async () => {
  const dashboard = await read("../src/routes/dashboard.tsx");
  const design = await read("../src/misma-design-system.css");
  assert.match(dashboard, /--misma-code-font-size/);
  assert.match(design, /--misma-consistent-font-size:var\(--misma-ui-font-size,16px\)/);
  assert.match(design, /font-size: var\(--misma-code-font-size, 13px\) !important/);
});

test("plugin pages share dashboard navigation and mobile drawer behavior", async () => {
  const layout = await read("../src/components/plugin-dashboard-layout.tsx");
  const design = await read("../src/misma-design-system.css");
  assert.match(layout, /aichat-primary-nav/);
  assert.match(layout, /Manage/);
  assert.match(layout, /Build/);
  assert.match(layout, /misma-plugin-mobile-nav-toggle/);
  assert.match(design, /misma-plugin-dashboard-sidebar\.is-mobile-open/);
});

test("plugin and composer popups close on outside click and Escape", async () => {
  const dashboard = await read("../src/routes/dashboard.tsx");
  const plugins = await read("../src/routes/dashboard_.plugins.tsx");
  assert.match(dashboard, /target\.closest\("\.aichat-composer-plus-wrap, \.misma-chat-plugin-popup"\)/);
  assert.match(plugins, /target\.closest\("\.misma-plugin-provider-menu-trigger, \.misma-plugin-installed-popup"\)/);
  assert.match(dashboard, /event\.key === "Escape"/);
  assert.match(plugins, /event\.key === "Escape"/);
});

test("Help Center mail delivery is addressed to the configured support inbox", async () => {
  const feedback = await read("../supabase/functions/misma-feedback/index.ts");
  const dashboard = await read("../src/routes/dashboard.tsx");
  assert.match(feedback, /const OWNER_EMAIL = "rukundobarouk33@gmail\.com"/);
  assert.match(feedback, /"To: " \+ OWNER_EMAIL/);
  assert.match(feedback, /"Reply-To: " \+ email/);
  assert.match(dashboard, /functions\.invoke\("misma-feedback"/);
});

test("settings navigation width and profile card match dashboard shell", async () => {
  const styles = await read("../src/styles.css");
  assert.match(styles, /grid-template-columns: 260px minmax\(0, 1fr\)/);
  assert.match(styles, /\.aichat-side-user[\s\S]*?border-top: 1px solid rgba\(255,255,255/);
  assert.match(styles, /background: var\(--misma-app-background, #0f1724\)/);
});


test("saved appearance is applied before the app can paint", async () => {
  const root = await read("../src/routes/__root.tsx");
  const dashboard = await read("../src/routes/dashboard.tsx");
  assert.match(root, /const appearanceBootstrap/);
  assert.match(root, /localStorage\.getItem\("misma_appearance_preferences"\)/);
  assert.match(root, /mismaThemeReady/);
  assert.match(root, /#000000/);
  assert.match(dashboard, /useState\("#000000"\)/);
});

test("non-settings standalone pages render the shared app sidebar", async () => {
  const root = await read("../src/routes/__root.tsx");
  const layout = await read("../src/components/plugin-dashboard-layout.tsx");
  assert.match(root, /location\.pathname\.startsWith\("\/dashboard\/"\)/);
  assert.match(root, /<PluginDashboardLayout><Outlet \/><\/PluginDashboardLayout>/);
  assert.match(layout, /aichat-side misma-plugin-dashboard-sidebar/);
});

test("internal plugin navigation uses the client router", async () => {
  const dashboard = await read("../src/routes/dashboard.tsx");
  const plugins = await read("../src/routes/dashboard_.plugins.tsx");
  const sidebar = await read("../src/components/plugin-dashboard-layout.tsx");
  assert.match(dashboard, /navigate\(\{ to: "\/dashboard\/plugins"/);
  assert.match(plugins, /navigate\(\{ to: \(.*description/);
  assert.match(sidebar, /const navigateTo/);
  assert.doesNotMatch(sidebar, /window\.location\.assign\("\/dashboard/);
  assert.doesNotMatch(sidebar, /onClick=\{closeMobile\}.*onClick=/);
});

test("popup surfaces use the composer text-bar background", async () => {
  const design = await read("../src/misma-design-system.css");
  assert.match(design, /--misma-composer-surface: #14171d/);
  assert.match(design, /background: var\(--misma-composer-surface, #14171d\) !important/);
  assert.match(design, /\.aichat \.aichat-composer-plus-menu/);
  assert.match(design, /\.aichat \[role="menu"\][\s\S]*?background: var\(--misma-composer-surface/);
  assert.match(design, /\.aichat \[role="dialog"\]/);
});
