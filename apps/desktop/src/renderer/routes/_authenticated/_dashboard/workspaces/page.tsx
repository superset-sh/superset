import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/_dashboard/workspaces/")({
	component: LegacyWorkspacesRedirect,
});

function LegacyWorkspacesRedirect() {
	return <Navigate to="/v2-workspaces" replace />;
}
