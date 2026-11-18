export type CredentialProvider = "vercel" | "netlify" | "render";

export interface EncryptedCredential {
  ciphertext: string;
  iv: string;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const decoded = atob(value);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export function decodeCredentialKey(value: string): Uint8Array {
  let bytes: Uint8Array;
  try {
    bytes = fromBase64(value.trim());
  } catch {
    throw new Error("The platform credential encryption key must be valid base64.");
  }
  if (bytes.byteLength !== 32) {
    throw new Error("The platform credential encryption key must decode to exactly 32 bytes.");
  }
  return bytes;
}

export function activeCredentialKeyVersion(): number {
  const configured = Deno.env.get("PLATFORM_CREDENTIAL_ACTIVE_KEY_VERSION")?.trim() || "1";
  const version = Number(configured);
  if (!Number.isSafeInteger(version) || version < 1 || version > 32767) {
    throw new Error("PLATFORM_CREDENTIAL_ACTIVE_KEY_VERSION must be a positive integer.");
  }
  return version;
}

export function credentialKeyForVersion(version: number): Uint8Array {
  if (!Number.isSafeInteger(version) || version < 1 || version > 32767) {
    throw new Error("Unsupported platform credential key version.");
  }
  const encoded = Deno.env.get(`PLATFORM_CREDENTIAL_ENCRYPTION_KEY_V${version}`)?.trim();
  if (!encoded) {
    throw new Error(`Server integration setting PLATFORM_CREDENTIAL_ENCRYPTION_KEY_V${version} is not configured.`);
  }
  return decodeCredentialKey(encoded);
}

export function credentialAad(
  workspaceId: string,
  provider: CredentialProvider,
  connectionId: string,
  keyVersion: number,
): string {
  return `misma:platform-credential:v1:${workspaceId}:${provider}:${connectionId}:key-${keyVersion}`;
}

export async function encryptCredentialPayload(
  payload: Record<string, string>,
  additionalData: string,
  keyBytes: Uint8Array,
): Promise<EncryptedCredential> {
  if (keyBytes.byteLength !== 32) throw new Error("AES-256-GCM requires a 32-byte key.");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey("raw", asArrayBuffer(keyBytes), { name: "AES-GCM" }, false, ["encrypt"]);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: asArrayBuffer(iv), additionalData: asArrayBuffer(encoder.encode(additionalData)), tagLength: 128 },
    key,
    asArrayBuffer(encoder.encode(JSON.stringify(payload))),
  );
  return { ciphertext: toBase64(new Uint8Array(encrypted)), iv: toBase64(iv) };
}

export async function decryptCredentialPayload(
  encrypted: EncryptedCredential,
  additionalData: string,
  keyBytes: Uint8Array,
): Promise<Record<string, string>> {
  if (keyBytes.byteLength !== 32) throw new Error("AES-256-GCM requires a 32-byte key.");
  const iv = fromBase64(encrypted.iv);
  if (iv.byteLength !== 12) throw new Error("Invalid platform credential nonce.");
  const key = await crypto.subtle.importKey("raw", asArrayBuffer(keyBytes), { name: "AES-GCM" }, false, ["decrypt"]);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: asArrayBuffer(iv), additionalData: asArrayBuffer(encoder.encode(additionalData)), tagLength: 128 },
    key,
    asArrayBuffer(fromBase64(encrypted.ciphertext)),
  );
  const value: unknown = JSON.parse(decoder.decode(plaintext));
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Stored platform credential has an invalid payload.");
  }
  return value as Record<string, string>;
}

function requiredSecret(value: unknown, field: string): string {
  if (typeof value !== "string") throw new Error(`Enter a valid ${field}.`);
  const secret = value.trim();
  if (!secret || secret.length > 16_384) throw new Error(`Enter a valid ${field}.`);
  return secret;
}

export function normalizeCredentialPayload(
  provider: CredentialProvider,
  input: unknown,
): { kind: "oauth_tokens" | "api_key"; payload: Record<string, string> } {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Platform credentials are missing or invalid.");
  }
  const source = input as Record<string, unknown>;
  const payload: Record<string, string> = {};

  if (provider === "render") {
    payload.apiKey = requiredSecret(source.apiKey, "Render API key");
    return { kind: "api_key", payload };
  }

  payload.accessToken = requiredSecret(source.accessToken, `${provider} access token`);
  if (source.refreshToken !== undefined && source.refreshToken !== null && source.refreshToken !== "") {
    payload.refreshToken = requiredSecret(source.refreshToken, `${provider} refresh token`);
  }
  if (source.expiresAt !== undefined && source.expiresAt !== null && source.expiresAt !== "") {
    const expiresAt = requiredSecret(source.expiresAt, "token expiry");
    if (!Number.isFinite(Date.parse(expiresAt))) throw new Error("Enter a valid token expiry date.");
    payload.expiresAt = new Date(expiresAt).toISOString();
  }
  return { kind: "oauth_tokens", payload };
}
