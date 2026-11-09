/* Misma Web Push service worker. Only displays opt-in human-request notifications. */
"use strict";

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = typeof payload.title === "string" && payload.title.trim()
    ? payload.title.slice(0, 120)
    : "A customer needs a human";
  const options = {
    body: typeof payload.body === "string" ? payload.body.slice(0, 180) : "A customer requested help from your business.",
    tag: typeof payload.tag === "string" ? payload.tag.slice(0, 120) : "misma-human-request",
    renotify: false,
    data: {
      url: typeof payload.url === "string" ? payload.url : "/dashboard?tab=notifications",
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const requestedUrl = event.notification && event.notification.data && event.notification.data.url;
  let target;
  try {
    target = new URL(typeof requestedUrl === "string" ? requestedUrl : "/dashboard?tab=notifications", self.location.origin);
  } catch {
    target = new URL("/dashboard?tab=notifications", self.location.origin);
  }

  const sameOrigin = target.origin === self.location.origin;
  const safeUrl = sameOrigin ? target.href : new URL("/dashboard?tab=notifications", self.location.origin).href;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find((client) => "focus" in client);
    if (existing) {
      if ("navigate" in existing) await existing.navigate(safeUrl);
      await existing.focus();
      return;
    }
    await self.clients.openWindow(safeUrl);
  })());
});
