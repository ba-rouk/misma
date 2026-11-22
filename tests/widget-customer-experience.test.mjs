import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (file) => readFile(new URL(file, import.meta.url), "utf8");

test("customer widget history polling preserves the reader's position", async () => {
  const runtime = await read("../src/assets/misma-widget-runtime.js");
  const start = runtime.indexOf("function refreshHistory(){");
  const end = runtime.indexOf("function recognitionConstructor()", start);
  assert.ok(start >= 0 && end > start, "refreshHistory should exist");
  const refresh = runtime.slice(start, end);

  assert.doesNotMatch(refresh, /messages\.innerHTML\s*=/);
  assert.match(refresh, /querySelectorAll\("\.bubble\[data-message-id\]"\)/);
  assert.match(refresh, /messages\.appendChild\(node\)/);
  assert.match(refresh, /if\(changed&&follow\)scrollMessagesToBottom\(\)/);
  assert.match(runtime, /function isNearMessageBottom\(\)/);
  assert.match(runtime, /function createBubbleNode\(text,kind,messageId\)/);
  assert.match(runtime, /data\.userMessageId/);
  assert.match(runtime, /data\.aiMessageId/);
});

test("customer widget shows up to three compact image-backed product cards", async () => {
  const runtime = await read("../src/assets/misma-widget-runtime.js");
  const edge = await read("../supabase/functions/misma-widget/index.ts");

  assert.match(runtime, /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(runtime, /Recommended from this website/);
  assert.match(runtime, /Price on request/);
  assert.match(runtime, /items\.slice\(0,3\)/);
  assert.match(edge, /function isWebsiteProductIntent\(message: string\): boolean/);
  assert.match(finder, /preferredTypes\.has\(item\.type\)/);
  assert.match(edge, /item\.score>0\|\|browseIntent/);
  assert.match(edge, /\.slice\(0,3\)\.map\(\(item\)=>/);
  assert.match(edge, /PRODUCT DISCOVERY:/);
});

test("generic product discovery queries are not rejected for having only stop words", async () => {
  const edge = await read("../supabase/functions/misma-widget/index.ts");
  const start = edge.indexOf("async function findWebsiteRecommendations(");
  const end = edge.indexOf("\nfunction detectWebsitePlatform", start);
  assert.ok(start >= 0 && end > start, "findWebsiteRecommendations should exist");
  const finder = edge.slice(start, end);

  assert.match(finder, /if \(!terms\.length && !browseIntent\) return \[\]/);
  assert.match(finder, /preferredTypes\.has\(item\.type\)/);
  assert.match(finder, /item\.score>0\|\|browseIntent/);
  assert.match(finder, /\.eq\("source_verified",true\)/);
});
