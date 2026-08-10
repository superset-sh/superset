import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { createFileRoute, Outlet, useMatchRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef } from "react";
import { useV2UserPreferences } from "renderer/hooks/useV2UserPreferences";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useWorkspaceTransactionsStore } from "renderer/stores/workspace-creates";
import { StateScreenShell } from "./components/StateScreenShell";
import { WorkspaceCreateErrorState } from "./components/WorkspaceCreateErrorState";
import { WorkspaceCreatingState } from "./components/WorkspaceCreatingState";
import { WorkspaceHostIncompatibleState } from "./components/WorkspaceHostIncompatibleState";
import { WorkspaceNotFoundState } from "./components/WorkspaceNotFoundState";
import { useRemoteHostStatus } from "./hooks/useRemoteHostStatus";
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
	const pendingTransaction = useWorkspaceTransactionsStore((state) =>
		workspaceId ? (state.byWorkspaceId[workspaceId] ?? null) : null,
	);
	// The create transaction clears when the workspaces.create mutation
	// settles — not when the host-served row first arrives, which happens
	// mid-create before agent/terminal panes are seeded.
	const isCreatePending = pendingTransaction?.type === "insert";

	const { toggleShowPresetsBar } = useV2UserPreferences();
	electronTrpc.menu.subscribe.useSubscription(undefined, {
		onData: (event) => {
			if (event.type === "toggle-presets-bar") {
				toggleShowPresetsBar();
			}
		},
	});

	const { workspaces: hostWorkspaces, isReady } = useHostWorkspaces();
	const workspace = useMemo(
		() =>
			workspaceId != null
				? (hostWorkspaces.find((candidate) => candidate.id === workspaceId) ??
					null)
				: null,
		[hostWorkspaces, workspaceId],
	);
	const { data: failedEntries } = useLiveQuery(
		(q) =>
			q
				.from({ failed: collections.failedWorkspaceCreates })
				.where(({ failed }) => eq(failed.id, workspaceId ?? "")),
		[collections, workspaceId],
	);
	const failedEntry = failedEntries?.[0] ?? null;

	const lastEnsuredWorkspaceIdRef = useRef<string | null>(null);
	useEffect(() => {
		if (!workspace || lastEnsuredWorkspaceIdRef.current === workspace.id)
			return;
		lastEnsuredWorkspaceIdRef.current = workspace.id;
		ensureWorkspaceInSidebar(workspace.id, workspace.projectId);
	}, [ensureWorkspaceInSidebar, workspace]);

	const hostStatus = useRemoteHostStatus(workspace);

	if (!workspaceId || (!workspace && !isReady)) {
		return <StateScreenShell>{null}</StateScreenShell>;
	}

	if (!workspace) {
		if (failedEntry) {
			return (
				<StateScreenShell>
					<WorkspaceCreateErrorState entry={failedEntry} />
				</StateScreenShell>
			);
		}
		return (
			<StateScreenShell>
				<WorkspaceNotFoundState workspaceId={workspaceId} />
			</StateScreenShell>
		);
	}

	if (isCreatePending) {
		return (
			<StateScreenShell>
				<WorkspaceCreatingState
					name={workspace.name}
					branch={workspace.branch}
					startedAt={new Date(workspace.createdAt).getTime()}
				/>
			</StateScreenShell>
		);
	}

	if (hostStatus.status === "incompatible") {
		return (
			<StateScreenShell>
				<WorkspaceHostIncompatibleState
					hostName={hostStatus.hostName}
					hostVersion={hostStatus.hostVersion}
					minVersion={hostStatus.minVersion}
				/>
			</StateScreenShell>
		);
	}
	if (hostStatus.status === "loading") {
		return <StateScreenShell>{null}</StateScreenShell>;
	}

	return (
		<WorkspaceProvider workspace={workspace}>
			<Outlet />
		</WorkspaceProvider>
	);
}
