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
  const toolbarStart = page.indexOf('<header className="misma-theme-toolbar">');
  const toolbarEnd = page.indexOf("</header>", toolbarStart);
  const toolbar = page.slice(toolbarStart, toolbarEnd);
  assert.ok(toolbarStart >= 0 && toolbarEnd > toolbarStart);
  assert.doesNotMatch(toolbar, /WIDGET CUSTOMIZATION|misma-theme-save|misma-theme-close|Close customization/);
  assert.ok(page.includes('className="misma-theme-save"'));
  assert.match(page, /void save\(\)/);
  assert.doesNotMatch(page, /Misma reads public rendered HTTP output/);
  assert.ok(page.includes('label:"Chat background"'));
  assert.match(runtime, /--misma-chat-bg/);
  assert.doesNotMatch(runtime, /--font-serif|--text-title-color/);
});

test("widget customizer matches website dashboard canvas and numbers sections in order", async () => {
  const page = await read("../src/routes/dashboard_.websites.$siteId.customize.tsx");
  const css = await read("../src/components/website-widget-customizer.css");
  const expected = [
    'title="Header"',
    'title="Chat background"',
    'title="Message bubbles"',
    'title="Buttons"',
    'title="Typography"',
    'title="Footer"',
    'title="Accessibility and website colours"',
  ];
  const positions = expected.map((label) => page.indexOf(label));
  assert.ok(positions.every((position) => position >= 0));
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
  assert.match(css, /background: #090a0c/);
  assert.match(css, /background: #11141a/);
  assert.match(css, /\.misma-theme-section \{[\s\S]*?background: #11141a;[\s\S]*?border: 0;/);
  assert.match(css, /\.misma-theme-section \{[\s\S]*?border: 0;[\s\S]*?box-shadow: none;/);
  assert.match(css, /\.misma-theme-preview-sticky,[\s\S]*?border: 0;/);
  assert.match(css, /\.misma-theme-contrast-warning,[\s\S]*?border: 0;/);
});


test("customizer uses an animated skeleton instead of the old textual loading page", async () => {
  const page = await read("../src/routes/dashboard_.websites.$siteId.customize.tsx");
  const css = await read("../src/components/website-widget-customizer.css");
  assert.match(page, /misma-theme-skeleton/);
  assert.match(page, /aria-label="Loading widget settings"/);
  assert.doesNotMatch(page, /Loading website widget settings/);
  assert.match(css, /@keyframes misma-theme-shimmer/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test("customizer uses a Figma-style popup color picker without the old wheel or swatch row", async () => {
  const page = await read("../src/routes/dashboard_.websites.$siteId.customize.tsx");
  const css = await read("../src/components/website-widget-customizer.css");

  assert.match(page, /function hexToHsv/);
  assert.match(page, /function hsvToHex/);
  assert.match(page, /misma-theme-color-row/);
  assert.match(page, /misma-theme-color-preview/);
  assert.match(page, /misma-theme-saturation-plane/);
  assert.match(page, /misma-theme-hue-control/);
  assert.match(page, /misma-theme-picker-fields/);
  assert.match(page, /misma-theme-document-palette/);
  assert.match(page, /Document colors/);
  assert.doesNotMatch(page, /misma-theme-color-wheel|misma-theme-presets|type="color"/);
  assert.match(css, /\.misma-theme-color-popover/);
  assert.match(css, /linear-gradient\(to top, #000, transparent\)/);
  assert.match(css, /grid-template-columns: repeat\(7, minmax\(0, 1fr\)\)/);
  assert.doesNotMatch(css, /misma-theme-color-wheel|misma-theme-presets/);
});

test("widget customizer sections behave as a single-open accessible accordion", async () => {
  const page = await read("../src/routes/dashboard_.websites.$siteId.customize.tsx");
  const css = await read("../src/components/website-widget-customizer.css");

  assert.match(page, /useState<string \| null>\("01"\)/);
  assert.match(page, /current\) => current === id \? null : id/);
  assert.equal((page.match(/<ThemeAccordionSection/g) || []).length, 7);
  assert.match(page, /aria-expanded=\{expanded\}/);
  assert.match(page, /aria-controls=\{panelId\}/);
  assert.match(page, /aria-hidden=\{!expanded\}/);
  assert.match(page, /inert=\{!expanded \? true : undefined\}/);
  assert.match(css, /grid-template-rows: 0fr/);
  assert.match(css, /grid-template-rows: 1fr/);
  assert.match(css, /transition: grid-template-rows/);
  assert.match(css, /prefers-reduced-motion:reduce/);
});


test("saved-channel remove and save controls use the same charcoal surface as Scan website", async () => {
  const styles = await read("../src/styles.css");
  assert.match(
    styles,
    /\.aichat-websites-tab \.aichat-social-remove,[\s\S]*?\.aichat-websites-tab \.aichat-social-save \{[\s\S]*?background: #21262d !important;[\s\S]*?border: 1px solid #303743 !important/,
  );
  assert.match(styles, /\.aichat-websites-tab \.aichat-social-remove:hover,[\s\S]*?\.aichat-websites-tab \.aichat-social-save:hover[\s\S]*?background: #303743 !important/);
});

test("embedded widget positions higher on mobile and displays the connected business identity", async () => {
  const runtime = await read("../src/assets/misma-widget-runtime.js");
  assert.match(runtime, /mobileWidgetViewport=window\.matchMedia\("\(max-width:520px\)"\)/);
  assert.match(runtime, /calc\(34px \+ env\(safe-area-inset-bottom/);
  assert.match(runtime, /config\.business_name/);
  assert.match(runtime, /config\.website_url/);
});

test("website widget answers can use saved scanned pages and connected-site identity without AI extraction", async () => {
  const edge = await read("../supabase/functions/misma-widget/index.ts");
  assert.match(edge, /from\("website_scan_pages"\)/);
  assert.match(edge, /scannedWebsitePages/);
  assert.match(edge, /website\.businessName/);
  assert.match(edge, /website\.websiteUrl/);
  assert.match(edge, /structured AI extraction was unavailable/);
  assert.match(edge, /business_name: safeString\(businessResult\.data\?\.name/);
});

test("website customization resolves the selected website workspace and does not report audit-only failures as save failures", async () => {
  const context = await read("../src/lib/api/workspace-context.server.ts");
  const api = await read("../src/lib/api/misma.functions.ts");
  assert.match(context, /ensureWebsiteWorkspace/);
  assert.match(context, /\.eq\("id", websiteConnectionId\)/);
  assert.match(api, /ensureWebsiteWorkspace\(data\.token, data\.websiteId\)/);
  assert.match(api, /Widget theme saved, but its audit event could not be recorded/);
});
