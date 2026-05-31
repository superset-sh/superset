import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/project/$projectId/",
)({
	component: LegacyProjectRedirect,
});

function LegacyProjectRedirect() {
	return <Navigate to="/v2-workspaces" replace />;
}
