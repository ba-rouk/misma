import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  envPrefix: ["VITE_", "NEXT_PUBLIC_"],
  plugins: [
    tanstackStart({ server: { entry: "server" } }),
    nitro({
      routeRules: {
        "/assets/misma-widget.js": {
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
            "CDN-Cache-Control": "no-store",
            "Surrogate-Control": "no-store",
            "Pragma": "no-cache",
            "Expires": "0",
          },
        },
      },
    }),
    react(),
  ],
  server: { host: "0.0.0.0" },
});
