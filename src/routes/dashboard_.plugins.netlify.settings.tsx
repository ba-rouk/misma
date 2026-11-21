import { createFileRoute } from "@tanstack/react-router";
import { PluginSettingsPage } from "./dashboard_.plugins.$pluginId.settings";

export const Route = createFileRoute("/dashboard/plugins/netlify/settings")({
  component: NetlifyPluginSettingsRoute,
});

function NetlifyPluginSettingsRoute() {
  return <PluginSettingsPage pluginId="netlify" />;
}
