import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("mobile Settings routes reuse the existing dashboard settings panels", async () => {
  const dashboard = await read("../src/routes/dashboard.tsx");
  const homeRoute = await read("../src/routes/dashboard.settings.tsx");
  const sectionRoute = await read("../src/routes/dashboard.settings.$section.tsx");
  assert.match(homeRoute, /createFileRoute\("\/dashboard\/settings"\)/);
  assert.match(sectionRoute, /createFileRoute\("\/dashboard\/settings\/\$section"\)/);
  assert.match(dashboard, /<SettingsHome[\s\S]*?onOpenSection=\{openMobileSettingsSection\}/);
  assert.match(dashboard, /<SettingsDetail[\s\S]*?Back to Settings/);
  for (const id of ["settings-profile", "settings-business", "settings-account", "settings-data-controls", "settings-memory", "settings-accent", "settings-notifications", "settings-voice", "settings-about", "settings-help-center"]) {
    assert.match(dashboard, new RegExp('id="' + id + '"'));
  }
  assert.match(dashboard, /<Outlet \/>/);
});

test("one settings configuration powers desktop navigation, mobile rows and search metadata", async () => {
  const config = await read("../src/lib/settings-config.ts");
  const dashboard = await read("../src/routes/dashboard.tsx");
  const mobile = await read("../src/components/settings-mobile.tsx");
  assert.match(dashboard, /const settingsGroups = SETTINGS_GROUPS/);
  assert.match(dashboard, /const settingsNavItems = SETTINGS_ITEMS/);
  assert.match(config, /searchKeywords:/);
  assert.match(mobile, /SETTINGS_GROUPS\.filter/);
  assert.match(mobile, /No settings found/);
  assert.match(mobile, /onActivate=\{onOpenPlugins\}/);
  const expectedOrder = ["settings-business", "settings-account", "settings-data-controls", "settings-memory", "settings-accent", "settings-notifications", "settings-voice", "settings-about"];
  let previous = -1;
  for (const id of expectedOrder) {
    const index = config.indexOf('id: "' + id + '"');
    assert.ok(index > previous, id + " must stay in the requested order");
    previous = index;
  }
});

test("mobile Settings uses safe-area and keyboard-aware search, with reduced-motion support", async () => {
  const mobile = await read("../src/components/settings-mobile.tsx");
  const styles = await read("../src/settings-mobile.css");
  assert.match(mobile, /window\.visualViewport/);
  assert.match(styles, /env\(safe-area-inset-bottom/);
  assert.match(styles, /@media \(max-width: 767px\)/);
  assert.match(styles, /@media \(min-width: 768px\)/);
  assert.match(styles, /prefers-reduced-motion: reduce/);
  assert.match(styles, /grid-template-columns: 260px minmax\(0,1fr\)/);
});

test("mobile Settings route is excluded from plugin wrapper and desktop routes redirect to Profile", async () => {
  const root = await read("../src/routes/__root.tsx");
  const dashboard = await read("../src/routes/dashboard.tsx");
  assert.match(root, /location\.pathname\.startsWith\("\/dashboard\/"\) && !location\.pathname\.startsWith\("\/dashboard\/settings"\)/);
  assert.match(dashboard, /matchMedia\("\(min-width: 768px\)"\)/);
  assert.match(dashboard, /settings-profile/);
  assert.match(dashboard, /replace: true/);
});

test("nested pages share the same back button and dashboard root has no back affordance", async () => {
  const back = await read("../src/components/misma-page-header.tsx");
  const dashboard = await read("../src/routes/dashboard.tsx");
  const pluginList = await read("../src/routes/dashboard_.plugins.tsx");
  const pluginDetail = await read("../src/routes/dashboard_.plugins.$pluginId.tsx");
  const pluginSettings = await read("../src/routes/dashboard.plugins.$pluginId.settings.tsx");
  const pluginLayout = await read("../src/components/plugin-dashboard-layout.tsx");
  assert.match(back, /className=\{\["misma-page-back-button"/);
  assert.match(pluginList, /<BackButton onClick=\{navigateBack\}/);
  assert.match(pluginDetail, /<BackButton onClick=\{backToPlugins\}/);
  assert.match(pluginSettings, /<BackButton onClick=\{backToDetail\}/);
  assert.match(dashboard, /const canGoBack = !staffMode && activeTab !== "workspace"/);
  assert.doesNotMatch(pluginLayout, /misma-plugin-mobile-nav-toggle/);
});

test("SettingsRow is part of the documented Misma design system", async () => {
  const system = await read("../DESIGN_SYSTEM.md");
  const component = await read("../src/components/settings-mobile.tsx");
  assert.match(system, /SettingsRow/);
  assert.match(component, /export function SettingsRow/);
});
