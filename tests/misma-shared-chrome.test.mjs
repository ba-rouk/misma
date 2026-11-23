import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Misma pages share page-colored headers, a compact collapsed rail, and consistent typography", async () => {
  const styles = await read("../src/styles.css");
  const design = await read("../src/misma-design-system.css");

  assert.match(design, /\.aichat-side\.is-collapsed\s*\{\s*width:\s*56px !important/);
  assert.match(design, /\.aichat-main\.sidebar-closed\s*\{\s*margin-left:\s*56px !important/);
  assert.match(design, /\.misma-plugin-dashboard-layout\.is-sidebar-collapsed\s*\{\s*--misma-plugin-sidebar-width:\s*56px !important/);
  assert.match(design, /\.aichat \.aichat-topbar[\s\S]*?background:\s*var\(--misma-app-background/);
  const sharedHeaderOverrides = design.slice(design.lastIndexOf("/* Page title bars inherit"));
  assert.match(sharedHeaderOverrides, /\.misma-plugin-detail-page \.misma-plugin-detail-header/);
  assert.match(sharedHeaderOverrides, /\.misma-plugin-settings-page \.misma-plugin-settings-topbar/);
  assert.match(sharedHeaderOverrides, /background:\s*transparent !important/);
  assert.match(design, /body :not\(svg\):not\(svg \*\)[\s\S]*?font-family:\s*var\(--font-sans/);
  assert.match(design, /--misma-consistent-font-size:\s*var\(--misma-ui-font-size, 16px\)/);
  assert.match(design, /\.misma-site \.nav\s*\{\s*background:\s*transparent !important/);

  // Keep the separate website widget preview's user-selected styling isolated.
  assert.match(design, /:not\(\.misma-widget-preview \*\)/);
  assert.match(styles, /\.aichat\[data-misma-color-mode="light"\]/);

  const pluginLayout = await read("../src/components/plugin-dashboard-layout.tsx");
  const dashboard = await read("../src/routes/dashboard.tsx");
  assert.match(pluginLayout, /localStorage\.getItem\("misma_appearance_preferences"\)/);
  assert.match(pluginLayout, /shell\.dataset\.mismaColorMode = resolvedColorMode/);
  assert.match(pluginLayout, /--misma-app-background", backgroundColor/);
  assert.match(design, /\.aichat\.misma-plugin-dashboard-layout[\s\S]*?background: var\(--misma-app-background/);
  assert.match(design, /\.misma-plugin-dashboard-sidebar[\s\S]*?background: var\(--misma-app-background/);
  assert.match(dashboard, /Set the shared background used by the dashboard, plugin pages and their sidebars\./);
});
