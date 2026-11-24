import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import "@fontsource-variable/inter/wght.css";
import "@fontsource-variable/source-serif-4/wght.css";
import interLatinFont from "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url";
import sourceSerifLatinFont from "@fontsource-variable/source-serif-4/files/source-serif-4-latin-wght-normal.woff2?url";
import appCss from "../styles.css?url";
import pluginSystemCss from "../plugins-system.css?url";
import mismaDesignSystemCss from "../misma-design-system.css?url";

const appearanceBootstrapScript = `(function () {
  var root = document.documentElement;
  var preferences = {};
  try {
    var stored = localStorage.getItem("misma_appearance_preferences");
    if (stored) {
      var parsed = JSON.parse(stored);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) preferences = parsed;
    }
  } catch (_) {}
  var isHex = function (value) { return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value); };
  var mode = preferences.colorMode === "light" || preferences.colorMode === "system" ? preferences.colorMode : "dark";
  var systemIsLight = typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: light)").matches;
  var resolvedMode = mode === "system" ? (systemIsLight ? "light" : "dark") : mode;
  var isDark = resolvedMode === "dark";
  var background = isDark ? (isHex(preferences.backgroundColor) ? preferences.backgroundColor : "#000000") : "#f3f6fb";
  var foreground = isDark ? (isHex(preferences.foregroundColor) ? preferences.foregroundColor : "#eef3fb") : "#172235";
  var bounded = function (value, min, max, fallback) {
    var number = Number(value);
    return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback;
  };
  root.dataset.mismaColorMode = resolvedMode;
  root.dataset.mismaContrast = preferences.contrastLevel === "increased" || preferences.contrastLevel === "system" ? preferences.contrastLevel : "medium";
  root.dataset.mismaReduceMotion = preferences.reduceMotion === true ? "true" : "false";
  root.style.setProperty("--misma-initial-background", background);
  root.style.setProperty("--misma-initial-foreground", foreground);
  root.style.setProperty("--misma-app-background", background);
  root.style.setProperty("--misma-app-foreground", foreground);
  root.style.setProperty("--misma-ui-font-size", bounded(preferences.uiFontSize, 14, 20, 16) + "px");
  root.style.setProperty("--misma-code-font-size", bounded(preferences.codeFontSize, 11, 18, 13) + "px");
})();`;
export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Misma | Business AI, connected" },
      { name: "application-name", content: "Misma" },
      { property: "og:site_name", content: "Misma" },
      { property: "og:title", content: "Misma | Business AI, connected" },
      { property: "og:type", content: "website" },
      {
        name: "description",
        content:
          "Misma connects your business channels to an AI agent trained on your business.",
      },
    ],
    links: [
      { rel: "preload", href: interLatinFont, as: "font", type: "font/woff2", crossOrigin: "anonymous" },
      { rel: "preload", href: sourceSerifLatinFont, as: "font", type: "font/woff2", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: appCss },
      { rel: "stylesheet", href: pluginSystemCss },
      { rel: "stylesheet", href: mismaDesignSystemCss },
      { rel: "icon", href: "/misma-logo.svg", type: "image/svg+xml", sizes: "any" },
      { rel: "icon", href: "/misma-favicon.png", type: "image/png", sizes: "48x48" },
      { rel: "shortcut icon", href: "/misma-favicon.png", type: "image/png" },
      { rel: "apple-touch-icon", href: "/misma-favicon.png", sizes: "180x180" },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: appearanceBootstrapScript }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
