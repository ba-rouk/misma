import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decodeCredentialKey,
  decryptCredentialPayload,
  encryptCredentialPayload,
  normalizeCredentialPayload,
} from "../supabase/functions/misma-platform-integrations/credentials.ts";

const key = new Uint8Array(32).fill(23);

test("platform credential vault encrypts and decrypts payloads with AES-256-GCM", async () => {
  const payload = { accessToken: "example-access-token", refreshToken: "example-refresh-token" };
  const encrypted = await encryptCredentialPayload(payload, "workspace-a:vercel:connection-a:key-1", key);
  assert.notEqual(encrypted.ciphertext, JSON.stringify(payload));
  assert.equal(encrypted.iv.length > 0, true);
  assert.deepEqual(
    await decryptCredentialPayload(encrypted, "workspace-a:vercel:connection-a:key-1", key),
    payload,
  );
});

test("platform credential vault binds ciphertext to the workspace and provider connection", async () => {
  const encrypted = await encryptCredentialPayload(
    { apiKey: "example-render-key" },
    "workspace-a:render:connection-a:key-1",
    key,
  );
  await assert.rejects(
    decryptCredentialPayload(encrypted, "workspace-b:render:connection-a:key-1", key),
  );
  await assert.rejects(
    decryptCredentialPayload(encrypted, "workspace-a:render:connection-b:key-1", key),
  );
  await assert.rejects(
    decryptCredentialPayload(encrypted, "workspace-a:render:connection-a:key-1", new Uint8Array(32).fill(24)),
  );
});

test("platform credential vault creates a fresh nonce for every encryption", async () => {
  const payload = { accessToken: "same-token" };
  const first = await encryptCredentialPayload(payload, "same-context", key);
  const second = await encryptCredentialPayload(payload, "same-context", key);
  assert.notEqual(first.iv, second.iv);
  assert.notEqual(first.ciphertext, second.ciphertext);
});

test("platform credential key decoder requires exactly 32 bytes", () => {
  const validKey = btoa(String.fromCharCode(...new Uint8Array(32).fill(9)));
  assert.equal(decodeCredentialKey(validKey).byteLength, 32);
  assert.throws(() => decodeCredentialKey(btoa("short")));
  assert.throws(() => decodeCredentialKey("not base64!"));
});

test("provider credential normalization accepts only required provider secrets", () => {
  assert.deepEqual(
    normalizeCredentialPayload("render", { apiKey: "render-secret", ignored: "not-persisted" }),
    { kind: "api_key", payload: { apiKey: "render-secret" } },
  );
  assert.deepEqual(
    normalizeCredentialPayload("vercel", { accessToken: "vercel-token", ignored: "not-persisted" }),
    { kind: "oauth_tokens", payload: { accessToken: "vercel-token" } },
  );
  assert.deepEqual(
    normalizeCredentialPayload("netlify", { accessToken: "netlify-oauth-token", ignored: "not-persisted" }),
    { kind: "oauth_tokens", payload: { accessToken: "netlify-oauth-token" } },
  );
  assert.throws(() => normalizeCredentialPayload("netlify", { accessToken: "" }));
  assert.throws(() => normalizeCredentialPayload("render", { token: "wrong-field-name" }));
});
