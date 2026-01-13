import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { trpc } from "renderer/lib/trpc";
import { StartView } from "renderer/screens/main/components/StartView";

export const Route = createFileRoute("/_authenticated/_dashboard/workspace/")({
	component: WorkspaceIndexPage,
});

function LoadingSpinner() {
	return (
		<div className="flex h-full w-full items-center justify-center">
			<div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
		</div>
	);
}

function WorkspaceIndexPage() {
	const navigate = useNavigate();
	const { data: workspaces, isLoading } =
		trpc.workspaces.getAllGrouped.useQuery();

	const allWorkspaces = workspaces?.flatMap((group) => group.workspaces) ?? [];
	const hasNoWorkspaces = !isLoading && allWorkspaces.length === 0;

	useEffect(() => {
		if (isLoading || !workspaces) return;
		if (allWorkspaces.length === 0) return; // Show StartView instead

		// Try to restore last viewed workspace
		const lastViewedId = localStorage.getItem("lastViewedWorkspaceId");
		const targetWorkspace =
			allWorkspaces.find((w) => w.id === lastViewedId) ?? allWorkspaces[0];

		if (targetWorkspace) {
			navigate({
				to: "/workspace/$workspaceId",
				params: { workspaceId: targetWorkspace.id },
				replace: true,
			});
		}
	}, [workspaces, isLoading, navigate, allWorkspaces]);

	if (hasNoWorkspaces) {
		return <StartView />;
	}

	return <LoadingSpinner />;
}
