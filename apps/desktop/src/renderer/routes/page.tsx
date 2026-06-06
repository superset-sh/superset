import { createFileRoute, Navigate } from "@tanstack/react-router";

interface RootSearchParams {
	/** Set by the main process when a window is opened for a specific workspace. */
	workspaceId?: string;
}

export const Route = createFileRoute("/")({
	validateSearch: (search: Record<string, unknown>): RootSearchParams => ({
		workspaceId:
			typeof search.workspaceId === "string" ? search.workspaceId : undefined,
	}),
	component: RootIndexPage,
});

function RootIndexPage() {
	const { workspaceId } = Route.useSearch();

	// Window opened for a specific workspace (multi-window): go straight there.
	// Deliberately skips the lastViewedWorkspaceId localStorage write so a
	// secondary window doesn't hijack what the primary window restores.
	if (workspaceId) {
		return (
			<Navigate to="/workspace/$workspaceId" params={{ workspaceId }} replace />
		);
	}

	return <Navigate to="/workspace" replace />;
}
