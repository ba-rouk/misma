import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Misma uses compact ChatGPT-like typography and consistent icon sizing", async () => {
  const css = await read("../src/misma-design-system.css");

  assert.match(css, /--misma-consistent-font-size:\s*14px !important/);
  assert.match(css, /--misma-consistent-helper-size:\s*12px !important/);
  assert.match(css, /font-size:\s*14px !important;\s*line-height:\s*1\.45 !important;\s*font-weight:\s*400 !important/);
  assert.match(css, /width:\s*16px !important;\s*height:\s*16px !important/);
});

test("Misma popups are compact, lighter, and use the page background without shadows", async () => {
  const css = await read("../src/misma-design-system.css");

  assert.match(css, /--misma-popup-surface:\s*var\(--misma-app-background/);
  assert.match(css, /--misma-popup-surface:\s*var\(--misma-bg/);
  assert.match(css, /background:\s*var\(--misma-popup-surface, #0f1724\) !important/);
  assert.match(css, /font-size:\s*13px !important;\s*font-weight:\s*400 !important/);
  assert.match(css, /width:\s*min\(244px, calc\(100vw - 28px\)\) !important/);
  assert.match(css, /padding:\s*16px !important;\s*border-radius:\s*14px !important/);
  assert.match(css, /box-shadow:\s*none !important/);
});

test("Chat composer bottom vignette and drop shadows are removed", async () => {
  const css = await read("../src/misma-design-system.css");

  assert.match(css, /\.aichat-composer-container\s*\{\s*background:\s*transparent !important;\s*box-shadow:\s*none !important/);
  assert.match(css, /\.aichat-composer-card-tools:focus-within\s*\{\s*box-shadow:\s*none !important/);
});
