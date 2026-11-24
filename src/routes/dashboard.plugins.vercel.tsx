import { createFileRoute } from "@tanstack/react-router";
import { VercelPluginDetailPage } from "./dashboard.plugins.$pluginId";

export const Route = createFileRoute("/dashboard/plugins/vercel")({ component: VercelPluginDetailRoute });

function VercelPluginDetailRoute() {
  return <VercelPluginDetailPage />;
}
