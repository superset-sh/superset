import { Spinner } from "@superset/ui/spinner";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { electronTrpc } from "renderer/lib/electron-trpc";

export const Route = createFileRoute("/_authenticated/_dashboard/workspace/")({
	component: WorkspaceIndexPage,
});

function LoadingSpinner() {
	return (
		<div className="flex h-full w-full items-center justify-center">
			<Spinner className="size-5" />
		</div>
	);
}

function WorkspaceIndexPage() {
	const navigate = useNavigate();
	const isV2CloudEnabled = useIsV2CloudEnabled();
	const { data: workspaces, isLoading } =
		electronTrpc.workspaces.getAllGrouped.useQuery(undefined, {
			enabled: !isV2CloudEnabled,
		});

	// Memoized so the v1 restore effect below doesn't re-run on every render
	// (a fresh array identity would re-fire it during a pending navigation).
	const allWorkspaces = useMemo(
		() => workspaces?.flatMap((group) => group.workspaces) ?? [],
		[workspaces],
	);
	const hasNoWorkspaces = !isLoading && allWorkspaces.length === 0;

	// v2 users must never be routed by the v1 restore logic below — a stale
	// lastViewedWorkspaceId lands them on a v1 workspace route the dashboard
	// immediately redirects away from (SUPER-1814). Isolated in its own effect
	// keyed only on isV2CloudEnabled so v1 query churn can't re-trigger it.
	useEffect(() => {
		if (isV2CloudEnabled) {
			navigate({ to: "/new-workspace", replace: true });
		}
	}, [isV2CloudEnabled, navigate]);

	useEffect(() => {
		if (isV2CloudEnabled) return;
		if (isLoading || !workspaces) return;

		if (allWorkspaces.length === 0) {
			// No workspaces yet: land on the projects list, which has the sidebar
			// "Add repository" entry points.
			navigate({ to: "/workspaces", replace: true });
			return;
		}

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
	}, [workspaces, isLoading, navigate, allWorkspaces, isV2CloudEnabled]);

	if (hasNoWorkspaces) {
		return <LoadingSpinner />;
	}

	return <LoadingSpinner />;
}
