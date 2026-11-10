import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read = (file) => readFile(new URL(file, import.meta.url), "utf8");

test("website widget customizer matches production defaults and updates a real DOM preview", async () => {
  const page = await read("../src/routes/dashboard_.websites.$siteId.customize.tsx");
  const css = await read("../src/components/website-widget-customizer.css");
  const runtime = await read("../src/assets/misma-widget-runtime.js");
  const api = await read("../src/lib/api/misma.functions.ts");
  assert.match(page, /createFileRoute\("[^"]*\/websites\/\$siteId\/customize"\)/);
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
  const workerMigration = await read("../supabase/migrations/20261110120000_misma_scan_worker_cron.sql");
  assert.match(workerMigration, /misma_validate_scan_worker_token/);
  assert.match(workerMigration, /vault\.create_secret/);
  assert.match(workerMigration, /cron\.schedule/);
});

test("scanner rechecks public DNS before page requests, honors robots allow rules and spaces page fetches", async () => {
  const edge = await read("../supabase/functions/misma-widget/index.ts");
  assert.match(edge, /rules\.allow\.push/);
  assert.match(edge, /isPublicHostname\(parsed\.hostname\)/);
  assert.match(edge, /650\)/);
  assert.match(edge, /retry-after/i);
  assert.match(edge, /sameRegistrableDomain/);
  assert.match(edge, /Redirect limit exceeded \(5 hops\)/);
  assert.match(edge, /readWebsiteResponseBytes/);
  assert.match(edge, /processQueuedWebsiteScan/);
  assert.match(edge, /misma_validate_scan_worker_token/);
});


test("dashboard typography is tokenized, self-hosted, and isolated from the live site widget", async () => {
  const root = await read("../src/routes/__root.tsx");
  const styles = await read("../src/styles.css");
  const customizer = await read("../src/components/website-widget-customizer.css");
  const page = await read("../src/routes/dashboard_.websites.$siteId.customize.tsx");
  const runtime = await read("../src/assets/misma-widget-runtime.js");

  assert.ok(root.includes("@fontsource-variable/inter/wght.css"));
  assert.ok(root.includes("@fontsource-variable/source-serif-4/wght.css"));
  assert.ok(root.includes('rel: "preload"'));
  assert.ok(root.includes("font/woff2"));
  assert.match(styles, /--font-serif: "Source Serif 4 Variable"/);
  assert.match(styles, /--font-sans: "Inter Variable"/);
  assert.match(styles, /--text-title: 18px/);
  assert.match(styles, /--text-body: 14px/);
  assert.match(styles, /--text-input: 16px/);
  assert.match(styles, /--text-link-color: #d97757/);
  assert.ok(styles.includes(".aichat :where(h1, h2)"));
  assert.ok(styles.includes(".aichat :where(code, pre"));
  assert.match(styles, /--text-muted-color-light/);
  assert.match(customizer, /background: linear-gradient\(135deg, #f4f8fd, #eef4fb\)/);
  assert.ok(customizer.includes("font-family:var(--font-serif)"));
  assert.ok(page.includes("misma-widget-preview-close"));
  assert.match(page, /aria-label="Close customization"/);
  assert.match(page, /className="misma-theme-close" onClick={back}/);
  assert.ok(page.includes("Header icon buttons (including close)"));
  assert.ok(page.includes('label:"Chat background"'));
  assert.match(runtime, /--misma-chat-bg/);
  assert.doesNotMatch(runtime, /--font-serif|--text-title-color/);
});

test("widget customizer matches website dashboard canvas and numbers sections in order", async () => {
  const page = await read("../src/routes/dashboard_.websites.$siteId.customize.tsx");
  const css = await read("../src/components/website-widget-customizer.css");
  const expected = [
    'title:"Header"',
    'title:"Chat background"',
    '<h2>Message bubbles</h2>',
    '<h2>Buttons</h2>',
    '<h2>Typography</h2>',
    '<h2>Footer</h2>',
    '<h2>Accessibility and website colours</h2>',
  ];
  const positions = expected.map((label) => page.indexOf(label));
  assert.ok(positions.every((position) => position >= 0));
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
  assert.ok(page.indexOf('className="misma-theme-save"') < page.indexOf('className="misma-theme-close"'));
  assert.match(css, /background: linear-gradient\(135deg, #f4f8fd, #eef4fb\)/);
  assert.match(css, /\.misma-theme-section \{[\s\S]*?border: 0;[\s\S]*?box-shadow: none;/);
  assert.match(css, /\.misma-theme-preview-sticky,[\s\S]*?border: 0;/);
});
