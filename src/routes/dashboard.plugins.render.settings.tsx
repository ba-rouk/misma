import { createFileRoute } from "@tanstack/react-router";
import { PluginSettingsPage } from "./dashboard_.plugins.$pluginId.settings";

export const Route = createFileRoute("/dashboard/plugins/render/settings")({
  component: RenderPluginSettingsRoute,
});

function RenderPluginSettingsRoute() {
  return <PluginSettingsPage pluginId="render" />;
}
