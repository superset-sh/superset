import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/_dashboard/automations")({
	component: AutomationsLayout,
});

function AutomationsLayout() {
	return <Outlet />;
}
