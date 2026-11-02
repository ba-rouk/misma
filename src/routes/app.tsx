import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/app")({
  component: WorkspaceRedirectPage,
});
function WorkspaceRedirectPage() {
  return (
    <main className="simple-error">
      <span className="simple-brand">M</span>
      <h1>Your misma workspace</h1>
      <p>
        Manage your business profile, knowledge, orders, and customer
        conversations in your Misma workspace and give it its own AI.
      </p>
      <a className="simple-link-button" href="/dashboard">
        Open dashboard
      </a>
    </main>
  );
}
