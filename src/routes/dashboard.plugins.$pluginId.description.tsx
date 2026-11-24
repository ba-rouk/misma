import { createFileRoute } from "@tanstack/react-router";
import { PluginDetailContent } from "./dashboard.plugins.$pluginId";

export const Route = createFileRoute("/dashboard/plugins/$pluginId/description")({
  component: PluginDescriptionRoute,
});

function PluginDescriptionRoute() {
  const { pluginId } = Route.useParams();
  return <PluginDetailContent pluginId={pluginId} />;
}
