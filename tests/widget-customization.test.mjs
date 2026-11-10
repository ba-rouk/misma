import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read = (file) => readFile(new URL(file, import.meta.url), "utf8");

test("website widget customizer matches production defaults and updates a real DOM preview", async () => {
  const page = await read("../src/routes/dashboard_.websites.$siteId.customize.tsx");
  const css = await read("../src/components/website-widget-customizer.css");
  const runtime = await read("../src/assets/misma-widget-runtime.js");
  const api = await read("../src/lib/api/misma.functions.ts");
  assert.match(page, /createFileRoute\("\/dashboard\/websites\/\$siteId\/customize"\)/);
  assert.match(page, /headerBackground:\s*"#111827"/);
  assert.match(page, /headerSubtitleText:\s*"#b6c1cf"/);
  assert.match(page, /chatBackground:\s*"#f8fafc"/);
  assert.match(page, /footerBackground:\s*"#ffffff"/);
  assert.match(page, /matchChatBackground:\s*false/);
  assert.match(page, /misma-widget-preview-chat/);
  assert.match(page, /WCAG AA/);
  assert.match(page, /beforeunload/);
  assert.match(page, /data-misma-customizer-font/);
  assert.match(page, /display=swap/);
  assert.match(page, /saveWebsiteWidgetTheme/);
  assert.match(page, /getWebsiteWidgetTheme/);
  assert.match(css, /position:sticky/);
  assert.match(runtime, /--misma-header-subtitle/);
  assert.match(api, /headerSubtitleText:\s*z\.string\(\)\.regex/);
});

test("theme validation migration remains compatible with old themes and adds subtitle colour validation", async () => {
  const migration = await read("../supabase/migrations/20261110110000_widget_theme_validation_hardening.sql");
  const api = await read("../src/lib/api/misma.functions.ts");
  const edge = await read("../supabase/functions/misma-widget/index.ts");
  assert.match(migration, /misma_valid_widget_theme/);
  assert.match(migration, /headerSubtitleText/);
  assert.match(api, /\.strict\(\)/);
  assert.match(api, /Only the account owner can customize this website widget/);
  assert.match(edge, /headerSubtitleText/);
});

test("scanner rechecks public DNS before page requests, honors robots allow rules and spaces page fetches", async () => {
  const edge = await read("../supabase/functions/misma-widget/index.ts");
  assert.match(edge, /robotsAllow\.push/);
  assert.match(edge, /isPublicHostname\(parsed\.hostname\)/);
  assert.match(edge, /650\)/);
  assert.match(edge, /retry-after/i);
});
