import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/plugins/github/settings")({
  component: GitHubPluginSettingsRoute,
});

function GitHubPluginSettingsRoute() {
  return (
    <main className="misma-github-settings-empty-page">
      <h1>GitHub plugin settings</h1>
    </main>
  );
}
