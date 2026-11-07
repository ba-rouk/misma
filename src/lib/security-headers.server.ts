/** Apply basic browser security headers to each app response. */
export function applySecurityHeaders(response: Response, request?: Request): Response {
  const headers = new Headers(response.headers);
  headers.set(
    "Content-Security-Policy",
    "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline'; " +
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "font-src 'self' https://fonts.gstatic.com data:; " +
      "img-src 'self' data: https:; media-src 'self' https:; " +
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://fonts.googleapis.com; " +
      "frame-src 'self'; base-uri 'self'; form-action 'self'",
  );
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(self), geolocation=()");
  headers.set("X-XSS-Protection", "0");
  if (request && new URL(request.url).pathname === "/assets/misma-widget.js") {
    headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0");
    headers.set("CDN-Cache-Control", "no-store");
    headers.set("Surrogate-Control", "no-store");
    headers.set("Pragma", "no-cache");
    headers.set("Expires", "0");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
