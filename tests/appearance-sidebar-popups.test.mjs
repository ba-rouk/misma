import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("appearance typography settings drive UI and code font sizes", async () => {
  const dashboard = await read("../src/routes/dashboard.tsx");
  const design = await read("../src/misma-design-system.css");
  assert.ok(dashboard.includes("--misma-code-font-size"));
  assert.ok(design.includes("--misma-consistent-font-size"));
  assert.ok(design.includes("font-size: var(--misma-code-font-size, 13px) !important"));
});

test("plugin pages stay inside the dashboard shell and use its sidebar", async () => {
  const dashboard = await read("../src/routes/dashboard.tsx");
  const directory = await read("../src/routes/dashboard.plugins.tsx");
  const detail = await read("../src/routes/dashboard.plugins.$pluginId.tsx");
  assert.ok(dashboard.includes("{isPluginRoute ? <Outlet /> : <>"));
  assert.ok(dashboard.includes('navigate({ to: "/dashboard/plugins" })'));
  assert.ok(directory.includes("return isDirectory ? <PluginsPage /> : <Outlet />;"));
  assert.ok(detail.includes("return isProviderDetail ? <PluginDetailContent pluginId={pluginId} /> : <Outlet />;"));
  assert.ok(!directory.includes("PluginDashboardLayout"));
  assert.ok(!detail.includes("PluginDashboardLayout"));
});

test("plugin and composer popups close on outside click and Escape", async () => {
  const dashboard = await read("../src/routes/dashboard.tsx");
  const plugins = await read("../src/routes/dashboard.plugins.tsx");
  assert.ok(dashboard.includes('target.closest(".aichat-composer-plus-wrap, .misma-chat-plugin-popup")'));
  assert.ok(plugins.includes('target.closest(".misma-plugin-provider-menu-trigger, .misma-plugin-installed-popup")'));
  assert.ok(dashboard.includes('event.key === "Escape"'));
  assert.ok(plugins.includes('event.key === "Escape"'));
});

test("all popup surfaces match the composer background", async () => {
  const design = await read("../src/misma-design-system.css");
  assert.ok(design.includes("--misma-popover-bg: var(--misma-app-background, #000000)"));
  assert.ok(design.includes(".aichat-composer-plus-menu,"));
  assert.ok(design.includes(".misma-plugin-installed-popup,"));
  assert.ok(design.includes(".misma-glass-modal,"));
  assert.ok(design.includes("background: var(--misma-app-background, #000000) !important;"));
});

test("Help Center mail delivery is addressed to the configured support inbox", async () => {
  const feedback = await read("../supabase/functions/misma-feedback/index.ts");
  const dashboard = await read("../src/routes/dashboard.tsx");
  assert.ok(feedback.includes('const OWNER_EMAIL = "rukundobarouk33@gmail.com"'));
  assert.ok(feedback.includes('"To: " + OWNER_EMAIL'));
  assert.ok(feedback.includes('"Reply-To: " + email'));
  assert.ok(dashboard.includes('functions.invoke("misma-feedback"'));
});

test("settings navigation width and profile card match dashboard shell", async () => {
  const styles = await read("../src/styles.css");
  assert.ok(styles.includes("grid-template-columns: 260px minmax(0, 1fr)"));
  assert.ok(styles.includes("background: var(--misma-app-background, #000000)"));
});
