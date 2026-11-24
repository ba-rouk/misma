import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFile(resolve(root, path), "utf8");

test("plugin routes share the dashboard navigation layout and responsive mobile drawer", async () => {
  const layout = await read("src/components/plugin-dashboard-layout.tsx");
  const design = await read("src/misma-design-system.css");

  for (const label of ["Workspace", "Images", "Library", "Manage", "Build", "Plugins", "Recents"]) {
    assert.ok(layout.includes(label), "plugin sidebar should include " + label);
  }
  assert.match(layout, /misma_dashboard_bootstrap_v1_/);
  assert.match(layout, /aichat-side-user/);
  assert.match(layout, /misma-plugin-mobile-menu-trigger/);
  assert.match(design, /width: min\(280px, 84vw\)/);
  assert.match(design, /is-mobile-sidebar-open > \.misma-plugin-dashboard-sidebar/);
  assert.match(design, /display: flex !important/);
});

test("appearance preferences are applied on plugin pages and new accounts default to deep blue", async () => {
  const dashboard = await read("src/routes/dashboard.tsx");
  const layout = await read("src/components/plugin-dashboard-layout.tsx");
  const design = await read("src/misma-design-system.css");
  const styles = await read("src/styles.css");

  assert.match(dashboard, /setBackgroundColor\\("#0b1220"\\)/);
  assert.match(dashboard, /setCodeFontSize\\(parsed\\.codeFontSize/);
  assert.match(layout, /#0b1220/);
  assert.match(layout, /--misma-ui-font-size/);
  assert.match(layout, /--misma-code-font-size/);
  assert.match(design, /var\\(--misma-ui-font-size, 16px\\)/);
  assert.match(design, /var\\(--misma-code-font-size, 13px\\)/);
  assert.match(styles, /grid-template-columns: 260px minmax\\(0, 1fr\\)/);
  assert.match(styles, /height: 58px !important/);
  assert.match(design, /data-misma-color-mode="light"/);
});

test("Help Center feedback is addressed to Misma support with a direct reply path", async () => {
  const feedback = await read("supabase/functions/misma-feedback/index.ts");
  const dashboard = await read("src/routes/dashboard.tsx");

  assert.match(feedback, /const OWNER_EMAIL = "rukundobarouk33@gmail\\.com"/);
  assert.match(feedback, /"To: " \\+ OWNER_EMAIL/);
  assert.match(feedback, /"Reply-To: " \\+ email/);
  assert.match(dashboard, /functions\\.invoke\\("misma-feedback"/);
  assert.match(dashboard, /Support requests are sent to rukundobarouk33@gmail\\.com/);
});

test("dashboard dropdowns close on outside pointer and compact their menu geometry", async () => {
  const dashboard = await read("src/routes/dashboard.tsx");
  const styles = await read("src/styles.css");

  assert.match(dashboard, /handlePopoverOutsidePointer/);
  assert.match(dashboard, /document\\.addEventListener\\("pointerdown", handlePopoverOutsidePointer\\)/);
  assert.match(dashboard, /data-misma-popover-root="plus"/);
  assert.match(dashboard, /data-misma-popover-root="profile"/);
  assert.match(dashboard, /data-misma-popover-root="recents"/);
  assert.match(dashboard, /data-misma-popover-root="plugins"/);
  assert.match(dashboard, /closeWhenOutside/);
  assert.match(styles, /width: min\\(252px, calc\\(100vw - 32px\\)\\)/);
  assert.match(styles, /\\.aichat \\.aichat-plus-menu-icon\\s*\\{\\s*width: 22px/);
});

test("visitor activity polling is single-flight, visibility-aware, and preserves independent results", async () => {
  const dashboard = await read("src/routes/dashboard.tsx");

  assert.match(dashboard, /visitorRefreshInFlightRef/);
  assert.match(dashboard, /document\\.visibilityState !== "visible"/);
  assert.match(dashboard, /const visitorData = await getVisitorNotifications/);
  assert.match(dashboard, /const liveData = await getWorkspaceLiveUpdates/);
  assert.match(dashboard, /Could not refresh unread visitor messages:/);
  assert.match(dashboard, /Could not refresh workspace visitor activity:/);
  assert.match(dashboard, /setInterval\\(refreshVisitorNotifications, 30000\\)/);
});
