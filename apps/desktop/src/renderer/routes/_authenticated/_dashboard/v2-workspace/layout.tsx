import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { createFileRoute, Outlet, useMatchRoute } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useWorkspaceCreatesStore } from "renderer/stores/workspace-creates";
import { WorkspaceCreateErrorState } from "./components/WorkspaceCreateErrorState";
import { WorkspaceCreatingState } from "./components/WorkspaceCreatingState";
import { WorkspaceNotFoundState } from "./components/WorkspaceNotFoundState";
import { WorkspaceProvider } from "./providers/WorkspaceProvider";

export const Route = createFileRoute("/_authenticated/_dashboard/v2-workspace")(
	{
		component: V2WorkspaceLayout,
	},
);

function V2WorkspaceLayout() {
	const matchRoute = useMatchRoute();
	const workspaceMatch = matchRoute({
		to: "/v2-workspace/$workspaceId",
	});
	const workspaceId =
		workspaceMatch !== false ? workspaceMatch.workspaceId : null;
	const collections = useCollections();
	const { ensureWorkspaceInSidebar } = useDashboardSidebarState();

	const { data: workspaces, isReady } = useLiveQuery(
		(q) =>
			q
				.from({ v2Workspaces: collections.v2Workspaces })
				.where(({ v2Workspaces }) => eq(v2Workspaces.id, workspaceId ?? "")),
		[collections, workspaceId],
	);
	const syncedWorkspace = workspaces?.[0] ?? null;
	const inFlight = useWorkspaceCreatesStore((store) =>
		workspaceId
			? store.entries.find((entry) => entry.snapshot.id === workspaceId)
			: undefined,
	);
	// Fall back to the cloud row cached on the in-flight entry while
	// Electric hasn't yet delivered the synced row. The cloud has already
	// confirmed the workspace at this point — no need to block on sync.
	const workspace = syncedWorkspace ?? inFlight?.cloudRow ?? null;

	const lastEnsuredWorkspaceIdRef = useRef<string | null>(null);
	useEffect(() => {
		if (!workspace || lastEnsuredWorkspaceIdRef.current === workspace.id)
			return;
		lastEnsuredWorkspaceIdRef.current = workspace.id;
		ensureWorkspaceInSidebar(workspace.id, workspace.projectId);
	}, [ensureWorkspaceInSidebar, workspace]);

	if (!workspaceId || !isReady || !workspaces) {
		return <div className="flex h-full w-full" />;
	}

	if (!workspace) {
		if (inFlight?.state === "creating") {
			return (
				<WorkspaceCreatingState
					name={inFlight.snapshot.name}
					branch={inFlight.snapshot.branch}
					startedAt={inFlight.startedAt}
				/>
			);
		}
		if (inFlight?.state === "error") {
			return (
				<WorkspaceCreateErrorState
					workspaceId={workspaceId}
					name={inFlight.snapshot.name}
					branch={inFlight.snapshot.branch}
					error={inFlight.error ?? "Unknown error"}
				/>
			);
		}
		return <WorkspaceNotFoundState workspaceId={workspaceId} />;
	}

	return (
		<WorkspaceProvider workspace={workspace}>
			<Outlet />
		</WorkspaceProvider>
	);
}
