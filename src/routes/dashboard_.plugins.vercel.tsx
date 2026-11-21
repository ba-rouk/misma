import { createFileRoute } from "@tanstack/react-router";
import { PluginDetailPage } from "./dashboard_.plugins.$pluginId";

export const Route = createFileRoute("/dashboard/plugins/vercel")({ component: VercelPluginDetailRoute });

function VercelPluginDetailRoute() {
  return <PluginDetailPage pluginIdOverride="vercel" />;
}
