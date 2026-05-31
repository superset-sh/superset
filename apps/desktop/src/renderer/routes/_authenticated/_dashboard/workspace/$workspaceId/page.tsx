import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/workspace/$workspaceId/",
)({
	component: LegacyWorkspaceRedirect,
});

function LegacyWorkspaceRedirect() {
	return <Navigate to="/v2-workspaces" replace />;
}
