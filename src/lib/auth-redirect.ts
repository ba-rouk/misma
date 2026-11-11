/**
 * Captured while the route modules are evaluated, before an auth page creates
 * the lazy Supabase client. detectSessionInUrl is disabled, so the URL remains
 * intact until one of the public auth routes verifies it explicitly.
 */
const initialAuthRedirectHref =
  typeof window !== "undefined" ? window.location.href : null;

export type AuthRedirectParams = {
  code: string | null;
  tokenHash: string | null;
  type: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  error: string | null;
  errorCode: string | null;
  errorDescription: string | null;
};

export function readInitialAuthRedirectParams(): AuthRedirectParams {
  if (typeof window === "undefined") {
    return {
      code: null,
      tokenHash: null,
      type: null,
      accessToken: null,
      refreshToken: null,
      error: null,
      errorCode: null,
      errorDescription: null,
    };
  }

  let url: URL;
  try {
    url = new URL(initialAuthRedirectHref || window.location.href);
  } catch {
    url = new URL(window.location.href);
  }

  const query = new URLSearchParams(url.search);
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  const get = (key: string) => query.get(key) ?? hash.get(key);

  return {
    code: get("code"),
    tokenHash: get("token_hash"),
    type: get("type"),
    accessToken: get("access_token"),
    refreshToken: get("refresh_token"),
    error: get("error"),
    errorCode: get("error_code"),
    errorDescription: get("error_description"),
  };
}

export function hasAuthRedirectMaterial(params: AuthRedirectParams): boolean {
  return Boolean(
    params.code ||
      params.tokenHash ||
      params.accessToken ||
      params.error ||
      params.errorCode,
  );
}

export function authRedirectErrorMessage(params: AuthRedirectParams): string {
  const code = (params.errorCode || "").toLowerCase();
  const raw = [
    params.error || "",
    params.errorDescription || "",
    code,
  ].join(" ").toLowerCase();

  if (code.includes("otp_expired") || raw.includes("expired")) {
    return "This email link has expired. Request a new email and open the newest link.";
  }
  if (
    code.includes("already_used") ||
    raw.includes("already been used") ||
    raw.includes("already used") ||
    raw.includes("consumed")
  ) {
    return "This email link has already been used. Request a new email if you still need to continue.";
  }
  if (raw.includes("code verifier") || raw.includes("pkce")) {
    return "This link could not be verified in this browser. Open it in the same browser where you requested it, or request a new email. The token-hash email template also supports opening links on another device.";
  }
  return "This email link could not be verified. It may have expired or already been used. Request a new email and try again.";
}

export function clearAuthRedirectUrl(): void {
  if (typeof window === "undefined") return;
  window.history.replaceState(
    window.history.state,
    document.title,
    window.location.pathname,
  );
}

export function setSessionStorageFlag(key: string): void {
  try {
    window.sessionStorage.setItem(key, "1");
  } catch {
    // The verified Supabase session still works when storage is unavailable.
  }
}

export function hasSessionStorageFlag(key: string): boolean {
  try {
    return window.sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function clearSessionStorageFlag(key: string): void {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Ignore storage restrictions.
  }
}
