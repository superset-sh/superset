import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/_dashboard/workspace/")({
	component: LegacyWorkspaceIndexRedirect,
});

function LegacyWorkspaceIndexRedirect() {
	return <Navigate to="/v2-workspaces" replace />;
}
