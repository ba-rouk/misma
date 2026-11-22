import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { deduplicateWebsiteContentRows, deduplicateWebsiteRecommendationRows } from "../supabase/functions/misma-widget/website-content-sync.ts";

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


test("live website content sync removes duplicate database conflict keys before upsert", () => {
  const rows = [
    {
      workspace_id: "workspace-1",
      website_id: "site-1",
      item_type: "product",
      name: "Vanilla Cake",
      description: "",
      image_url: "https://cdn.example.com/vanilla-1.webp",
      item_url: "https://shop.example.com/cakes",
      price_text: null,
      source_page_url: "https://shop.example.com/cakes",
      source_verified: true,
      updated_at: "2026-11-22T07:00:00.000Z",
    },
    {
      workspace_id: "workspace-1",
      website_id: "site-1",
      item_type: "product",
      name: "  vanilla   cake ",
      description: "Vanilla sponge cake",
      image_url: "https://cdn.example.com/vanilla-2.webp",
      item_url: "https://shop.example.com/cakes/vanilla",
      price_text: "RWF 30,000 per unit",
      source_page_url: "https://shop.example.com/cakes",
      source_verified: true,
      updated_at: "2026-11-22T07:01:00.000Z",
    },
    {
      workspace_id: "workspace-1",
      website_id: "site-1",
      item_type: "product",
      name: "Vanilla Cake",
      description: "",
      image_url: "https://cdn.example.com/vanilla-detail.webp",
      item_url: "https://shop.example.com/cakes/vanilla",
      price_text: null,
      source_page_url: "https://shop.example.com/seasonal-cakes",
      source_verified: true,
      updated_at: "2026-11-22T07:02:00.000Z",
    },
  ];

  const unique = deduplicateWebsiteContentRows(rows);
  assert.equal(unique.length, 2);
  assert.equal(unique[0].description, "Vanilla sponge cake");
  assert.equal(unique[0].price_text, "RWF 30,000 per unit");
  assert.equal(unique[0].image_url, "https://cdn.example.com/vanilla-1.webp");
});


test("customer product recommendations show one card per product across multiple pages", () => {
  const rows = [
    {
      item_type: "product",
      name: "Vanilla cake",
      description: "Vanilla cream cake",
      image_url: "https://cdn.example.com/vanilla.webp",
      item_url: "https://shop.example.com/order?product=vanilla-cake-a1",
      price_text: "RWF 25,000 per unit",
      source_page_url: "https://shop.example.com/",
    },
    {
      item_type: "product",
      name: "Vanilla cake",
      description: "Vanilla cream cake",
      image_url: "https://cdn.example.com/vanilla.webp",
      item_url: "https://shop.example.com/order?product=vanilla-cake-a1",
      price_text: "RWF 25,000 per unit",
      source_page_url: "https://shop.example.com/categories",
    },
    {
      item_type: "product",
      name: "Vanilla cake photo",
      description: "Vanilla cake photo",
      image_url: "https://cdn.example.com/vanilla.webp",
      item_url: "https://shop.example.com/order?product=vanilla-cake-a1",
      price_text: null,
      source_page_url: "https://shop.example.com/",
    },
    {
      item_type: "product",
      name: "Chocolate cake",
      description: "Chocolate cake",
      image_url: "https://cdn.example.com/chocolate.webp",
      item_url: "https://shop.example.com/order?product=chocolate-cake-b2",
      price_text: "RWF 25,000 per unit",
      source_page_url: "https://shop.example.com/categories",
    },
  ];

  const unique = deduplicateWebsiteRecommendationRows(rows);
  assert.equal(unique.length, 2);
  assert.equal(unique[0].name, "Vanilla cake");
  assert.equal(unique[0].price_text, "RWF 25,000 per unit");
  assert.equal(unique[0].image_url, "https://cdn.example.com/vanilla.webp");
  assert.equal(unique[0].item_url, "https://shop.example.com/order?product=vanilla-cake-a1");
  assert.equal(unique[1].name, "Chocolate cake");
});
