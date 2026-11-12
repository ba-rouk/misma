import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const OWNER_EMAIL = "rukundobarouk33@gmail.com";
const ALLOWED_ORIGINS = new Set([
  "https://misma.onrender.com",
  "http://localhost:5173",
  "http://localhost:3000",
]);
const RATE_LIMIT = new Map<string, { startedAt: number; count: number }>();

function headersFor(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function jsonResponse(body: Record<string, unknown>, status: number, origin: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...headersFor(origin),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function base64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64Url(value: string): string {
  return base64(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function allowedEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

function isAllowedWebsite(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.hostname === "localhost";
  } catch {
    return false;
  }
}

function rateLimited(request: Request): boolean {
  const ip = (request.headers.get("x-forwarded-for") || request.headers.get("cf-connecting-ip") || "unknown")
    .split(",")[0]
    .trim()
    .slice(0, 80);
  const now = Date.now();
  const current = RATE_LIMIT.get(ip);
  if (!current || now - current.startedAt > 10 * 60 * 1000) {
    RATE_LIMIT.set(ip, { startedAt: now, count: 1 });
    return false;
  }
  current.count += 1;
  return current.count > 5;
}

async function getGmailAccessToken(): Promise<string> {
  const clientId = Deno.env.get("GOOGLE_GMAIL_CLIENT_ID") || "";
  const clientSecret = Deno.env.get("GOOGLE_GMAIL_CLIENT_SECRET") || "";
  const refreshToken = Deno.env.get("GOOGLE_GMAIL_REFRESH_TOKEN") || "";
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Feedback email is not configured yet. Please try again later.");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || typeof result.access_token !== "string") {
    console.error("Gmail OAuth token refresh failed:", response.status, result.error || "unknown error");
    throw new Error("Feedback email could not be authorized. Please try again later.");
  }
  return result.access_token;
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin") || "";
  if (!ALLOWED_ORIGINS.has(origin)) {
    return new Response("Origin not allowed", { status: 403 });
  }
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: headersFor(origin) });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405, origin);
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 12_000) {
    return jsonResponse({ error: "Feedback is too large." }, 413, origin);
  }
  if (rateLimited(request)) {
    return jsonResponse({ error: "Too many feedback messages. Please try again later." }, 429, origin);
  }

  try {
    const body = await request.json();
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const comment = typeof body.comment === "string" ? body.comment.trim() : "";
    const website = typeof body.website === "string" ? body.website.trim() : "";
    const websiteTrap = typeof body.websiteTrap === "string" ? body.websiteTrap.trim() : "";

    // Quietly accept filled honeypot submissions without sending an email.
    if (websiteTrap) return jsonResponse({ sent: true }, 200, origin);
    if (!allowedEmail(email)) {
      return jsonResponse({ error: "Enter a valid email address." }, 400, origin);
    }
    if (comment.length < 5 || comment.length > 4000) {
      return jsonResponse({ error: "Feedback must be between 5 and 4,000 characters." }, 400, origin);
    }
    if (website && !isAllowedWebsite(website)) {
      return jsonResponse({ error: "Website address is invalid." }, 400, origin);
    }

    const fromEmail = (Deno.env.get("GOOGLE_GMAIL_FROM_EMAIL") || "").trim().toLowerCase();
    if (!allowedEmail(fromEmail)) {
      return jsonResponse({ error: "Feedback email is not configured yet. Please try again later." }, 503, origin);
    }

    const accessToken = await getGmailAccessToken();
    const plainText = [
      "New feedback from the Misma website",
      "",
      "From: " + email,
      "Website: " + (website || "Misma landing page"),
      "",
      "Feedback:",
      comment,
    ].join("\n");
    const rawMessage = [
      "From: Misma Website <" + fromEmail + ">",
      "To: " + OWNER_EMAIL,
      "Reply-To: " + email,
      "Subject: New Misma website feedback",
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      base64(plainText),
    ].join("\r\n");

    const sendResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: base64Url(rawMessage) }),
    });
    if (!sendResponse.ok) {
      const details = await sendResponse.json().catch(() => ({}));
      console.error("Gmail feedback send failed:", sendResponse.status, details.error?.status || "unknown error");
      return jsonResponse({ error: "Feedback could not be sent. Please try again later." }, 502, origin);
    }

    return jsonResponse({ sent: true }, 200, origin);
  } catch (cause) {
    console.error("Misma feedback request failed:", cause instanceof Error ? cause.message : "unknown error");
    const message = cause instanceof Error && cause.message.startsWith("Feedback email")
      ? cause.message
      : "Feedback could not be sent. Please try again later.";
    return jsonResponse({ error: message }, 503, origin);
  }
});
