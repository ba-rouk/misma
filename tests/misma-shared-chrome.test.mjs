import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Misma pages share page-colored headers, a compact collapsed rail, and consistent typography", async () => {
  const styles = await read("../src/styles.css");
  const design = await read("../src/misma-design-system.css");

  assert.ok(design.includes(".aichat-side.is-collapsed"));
  assert.ok(design.includes(".aichat-main.sidebar-closed"));
  assert.ok(design.includes(".misma-plugin-dashboard-layout.is-sidebar-collapsed"));
  assert.ok(design.includes(".aichat .aichat-topbar"));
  assert.ok(design.includes("background: var(--misma-app-background"));
  assert.ok(design.includes(".misma-plugin-detail-page .misma-plugin-detail-header"));
  assert.ok(design.includes(".misma-plugin-settings-page .misma-plugin-settings-topbar"));
  assert.ok(design.includes("--misma-consistent-font-size"));
  assert.ok(design.includes('.aichat[data-misma-color-mode="light"]'));

  // The pre-paint bootstrap must apply saved preferences before stylesheet rendering.
  const root = await read("../src/routes/__root.tsx");
  const dashboard = await read("../src/routes/dashboard.tsx");
  assert.ok(root.includes("appearanceBootstrapScript"));
  assert.ok(root.includes("misma_appearance_preferences"));
  assert.ok(root.includes("#000000"));
  assert.ok(root.indexOf('<script dangerouslySetInnerHTML={{ __html: appearanceBootstrapScript }} />') < root.indexOf("<HeadContent />"));
  assert.ok(dashboard.includes("const isPluginRoute ="));
  assert.ok(dashboard.includes('document.documentElement.style.setProperty("--misma-app-background"'));
  assert.ok(styles.includes("--misma-app-background: var(--misma-initial-background, #000000)"));
});

test("plugin popups and composer menus use the same app surface", async () => {
  const design = await read("../src/misma-design-system.css");
  assert.ok(design.includes("--misma-popover-bg: var(--misma-app-background, #000000)"));
  assert.ok(design.includes(".aichat-composer-plus-menu,"));
  assert.ok(design.includes(".misma-plugin-installed-popup,"));
  assert.ok(design.includes(".misma-glass-modal,"));
  assert.ok(design.includes("background: var(--misma-app-background, #000000) !important;"));
  assert.ok(design.includes("background-image: none !important;"));
});
