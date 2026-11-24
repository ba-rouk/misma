import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Build Knowledge tables use a refined compact table design", async () => {
  const dashboard = await read("../src/routes/dashboard.tsx");
  const css = await read("../src/misma-design-system.css");
  assert.match(dashboard, /aichat-knowledge-card is-pending/);
  assert.match(dashboard, /aichat-knowledge-card is-approved/);
  assert.equal((dashboard.match(/aichat-table aichat-knowledge-table/g) || []).length, 2);
  assert.match(css, /\.aichat-knowledge-table thead th[\s\S]*?font-size:11px !important/);
  assert.match(css, /\.aichat-knowledge-table tbody td[\s\S]*?font-size:13px !important/);
});

test("Plugin pages use a floating action and omit the redundant GitHub continuation button", async () => {
  const detail = await read("../src/routes/dashboard.plugins.$pluginId.tsx");
  const css = await read("../src/misma-design-system.css");
  assert.match(detail, /misma-plugin-detail-floating-actions/);
  assert.match(detail, /manifest\.id !== "github"/);
  assert.doesNotMatch(detail, /StickyActionBar|misma-plugin-detail-actionbar/);
  assert.match(css, /misma-plugin-detail-floating-actions\s*\{[\s\S]*?position:fixed/);
  assert.match(css, /background:transparent !important;box-shadow:none !important/);
});

test("Plugin arrows sit beside the sidebar and headers use only a fine bottom separator", async () => {
  const css = await read("../src/misma-design-system.css");
  assert.match(css, /@media \(min-width:768px\)[\s\S]*?misma-plugin-settings-topbar \{padding-left:14px !important;padding-right:14px !important/);
  assert.match(css, /border-bottom:1px solid color-mix\(in srgb,var\(--misma-app-foreground/);
  assert.match(css, /box-shadow:none !important;-webkit-backdrop-filter:none !important;backdrop-filter:none !important/);
});

test("Plugin sidebar matches the compact dashboard navigation, and app text uses one compact scale", async () => {
  const css = await read("../src/misma-design-system.css");
  assert.match(css, /--misma-consistent-font-size:14px !important/);
  assert.match(css, /--misma-consistent-helper-size:12px !important/);
  assert.match(css, /font-size:14px !important/);
  assert.match(css, /font-size:12px !important/);
  assert.match(css, /\.misma-plugin-dashboard-sidebar \.aichat-primary-nav \{display:flex;flex:1;flex-direction:column;gap:3px;padding:6px 10px/);
  assert.match(css, /\.misma-plugin-dashboard-sidebar \.aichat-nav-btn\.active/);
});

test("Chat dashboard bottom composer uses the page surface without gradient or shadow", async () => {
  const css = await read("../src/misma-design-system.css");
  assert.match(css, /\.aichat-composer-container \{background:var\(--misma-app-background,[^}]*background-image:none !important;box-shadow:none !important/);
  assert.match(css, /\.aichat-composer-card-tools:focus-within[^}]*box-shadow:none !important/);
});
