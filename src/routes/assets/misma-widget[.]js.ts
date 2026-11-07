import { createFileRoute } from "@tanstack/react-router";
import widgetRuntime from "../../assets/misma-widget-runtime.js?raw";

const widgetHeaders = {
  "Content-Type": "application/javascript; charset=utf-8",
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
  "CDN-Cache-Control": "no-store",
  "Surrogate-Control": "no-store",
  "Pragma": "no-cache",
  "Expires": "0",
};

export const Route = createFileRoute("/assets/misma-widget.js")({
  server: {
    handlers: {
      GET: async () =>
        new Response(widgetRuntime, {
          status: 200,
          headers: widgetHeaders,
        }),
      HEAD: async () =>
        new Response(null, {
          status: 200,
          headers: widgetHeaders,
        }),
    },
  },
});
