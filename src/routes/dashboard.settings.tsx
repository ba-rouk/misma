import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/settings")({
  component: SettingsRoute,
});

function SettingsRoute() {
  return <Outlet />;
}
