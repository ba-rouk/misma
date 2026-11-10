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

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Misma | Business AI, connected" },
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
      { rel: "icon", href: "/misma-favicon.png", type: "image/png", sizes: "48x48" },
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
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
