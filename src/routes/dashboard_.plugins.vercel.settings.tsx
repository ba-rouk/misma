import { createFileRoute } from "@tanstack/react-router";
import { PluginSettingsPage } from "./dashboard_.plugins.$pluginId.settings";

export const Route = createFileRoute("/dashboard/plugins/vercel/settings")({
  component: VercelPluginSettingsRoute,
});

function VercelPluginSettingsRoute() {
  return <PluginSettingsPage pluginId="vercel" />;
}
