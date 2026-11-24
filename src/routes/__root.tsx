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

const appearanceBootstrap = `(() => {
  try {
    const raw = window.localStorage.getItem("misma_appearance_preferences");
    const saved = raw ? JSON.parse(raw) : {};
    const mode = saved.colorMode === "light" || saved.colorMode === "system" || saved.colorMode === "dark" ? saved.colorMode : "dark";
    const resolvedMode = mode === "system"
      ? (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark")
      : mode;
    const dark = resolvedMode === "dark";
    const validColor = (value) => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
    const background = dark ? (validColor(saved.backgroundColor) ? saved.backgroundColor : "#000000") : "#f3f6fb";
    const foreground = dark ? (validColor(saved.foregroundColor) ? saved.foregroundColor : "#eef3fb") : "#172235";
    const root = document.documentElement;
    root.dataset.mismaColorMode = resolvedMode;
    root.dataset.mismaThemeReady = "true";
    root.dataset.mismaContrast = saved.contrastLevel === "increased" || saved.contrastLevel === "system" ? saved.contrastLevel : "medium";
    root.style.setProperty("--misma-app-background", background);
    root.style.setProperty("--misma-app-foreground", foreground);
    root.style.setProperty("--misma-bg", background);
    root.style.setProperty("--misma-ui-font-size", Math.min(20, Math.max(14, Math.round(Number(saved.uiFontSize) || 16))) + "px");
    root.style.setProperty("--misma-code-font-size", Math.min(18, Math.max(11, Math.round(Number(saved.codeFontSize) || 13))) + "px");
    root.style.setProperty("--misma-composer-surface", "#14171d");
    root.dataset.mismaReduceMotion = saved.reduceMotion === true ? "true" : "false";
  } catch (_) {
    const root = document.documentElement;
    root.dataset.mismaColorMode = "dark";
    root.dataset.mismaThemeReady = "true";
    root.style.setProperty("--misma-app-background", "#000000");
    root.style.setProperty("--misma-app-foreground", "#eef3fb");
    root.style.setProperty("--misma-bg", "#000000");
    root.style.setProperty("--misma-composer-surface", "#14171d");
  }
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
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: appearanceBootstrap }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
