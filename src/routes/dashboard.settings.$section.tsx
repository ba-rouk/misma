import { createFileRoute } from "@tanstack/react-router";

// The dashboard owns settings state and section content. This route adds a
// durable URL segment so browser history, deep links and refreshes stay in sync.
export const Route = createFileRoute("/dashboard/settings/$section")({
  component: SettingsSectionRoute,
});

function SettingsSectionRoute() {
  return null;
}
