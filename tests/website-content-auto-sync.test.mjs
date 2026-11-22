import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const read = (path) => readFile(resolve(import.meta.dirname, "..", path), "utf8");

test("customer widget syncs newly rendered products and media after hydration and page refresh", async () => {
  const runtime = await read("src/assets/misma-widget-runtime.js");
  const edge = await read("supabase/functions/misma-widget/index.ts");

  assert.match(runtime, /function extractWebsiteContentFromDom\(\)/);
  assert.match(runtime, /application\/ld\+json/);
  assert.match(runtime, /product-card/i);
  assert.match(runtime, /movie-card/i);
  assert.match(runtime, /gallery-item/i);
  assert.match(runtime, /document\.querySelectorAll\("video"\)/);
  assert.match(runtime, /function startRenderedWebsiteContentSync\(\)/);
  assert.match(runtime, /new MutationObserver\(/);
  assert.match(runtime, /call\(\{action:"content-sync"/);
  assert.match(runtime, /localStorage\.getItem\(storageKey\)===fingerprint/);
  assert.match(runtime, /startRenderedWebsiteContentSync\(\);/);
  assert.match(runtime, /data-misma-widget-root/);

  assert.match(edge, /input\.action === "content-sync"/);
  assert.match(edge, /input\.action !== "typing" && input\.action !== "content-sync"/);
  assert.match(edge, /request\.headers\.get\("origin"\)/);
  assert.match(edge, /pageUrl\.origin !== origin\.origin/);
  assert.match(edge, /supportedTypes = new Set\(\["product","service","movie","video","music","post","article","event","book","recipe","course"\]\)/);
  assert.match(edge, /website_content_items"\)\.upsert\(rows/);
});

test("customer chat can recommend newly synced movie, video and gallery images", async () => {
  const edge = await read("supabase/functions/misma-widget/index.ts");
  const runtime = await read("src/assets/misma-widget-runtime.js");

  assert.match(edge, /function isWebsiteMediaIntent\(message: string\): boolean/);
  assert.match(edge, /new Set\(\["movie","video","music","post","article","event","book","recipe","course"\]\)/);
  assert.match(edge, /MEDIA DISCOVERY:/);
  assert.match(edge, /live rendered content of the connected first-party website/);
  assert.match(runtime, /labels=\{product:"Product",service:"Service",movie:"Movie",video:"Video"/);
  assert.match(runtime, /type==="product"\|\|type==="service"\?"Price on request"/);
});

test("live content snapshots only store secure images and same-origin detail links", async () => {
  const edge = await read("supabase/functions/misma-widget/index.ts");
  assert.match(edge, /imageUrl\.protocol !== "https:"/);
  assert.match(edge, /target\.origin === pageUrl\.origin/);
  assert.match(edge, /source_verified: true/);
  assert.match(edge, /source_page_url: pageUrl\.href/);
});
