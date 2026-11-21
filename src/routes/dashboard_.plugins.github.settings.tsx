import { createFileRoute } from "@tanstack/react-router";
import { PluginSettingsPage } from "./dashboard_.plugins.$pluginId.settings";

export const Route = createFileRoute("/dashboard/plugins/github/settings")({
  component: GitHubPluginSettingsRoute,
});

function GitHubPluginSettingsRoute() {
  return <PluginSettingsPage pluginId="github" />;
}
