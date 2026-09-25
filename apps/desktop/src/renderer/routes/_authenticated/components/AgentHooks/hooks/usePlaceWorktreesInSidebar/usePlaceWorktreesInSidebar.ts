import { useLiveQuery } from "@tanstack/react-db";
import { useEffect, useMemo } from "react";
import { useKnownHosts } from "renderer/hooks/known-hosts/useKnownHosts";
import { authClient } from "renderer/lib/auth-client";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import {
	selectWorktreesToPlace,
	type WorkspaceForPlacement,
} from "./selectWorktreesToPlace";

/**
 * Places deliberately-created workspaces into the sidebar exactly once — from
 * this device and from every online host in the org.
 *
 * Every workspace is an explicit creation (renderer, CLI, automation, or
 * project setup), so it should surface even when created outside the renderer —
 * the CLI and automations go through the host service and can't write
 * renderer-local sidebar state. That includes work started on another machine
 * (a headless box running `superset start`, driven by an automation or the
 * CLI): `useHostWorkspaces` already fans out to every known host, so the rows
 * are here; what was missing was the placement (#7100). Offline hosts and
 * other people's workspaces are not placed — see `selectWorktreesToPlace` for
 * the host and creator gates.
 *
 * "Placed once, then respected": a present `v2WorkspaceLocalState` row means
 * "already seen". Hiding a worktree keeps a hidden tombstone row, and removing
 * its project keeps the row while dropping the project record — so neither is
 * ever re-placed. Only a genuinely new (row-less) worktree is added.
 */
export function usePlaceWorktreesInSidebar(): void {
	const collections = useCollections();
	const { machineId } = useLocalHostService();
	const { ensureWorkspaceInSidebar } = useDashboardSidebarState();

	const { workspaces, isReady: workspacesReady } = useHostWorkspaces();
	const { hosts } = useKnownHosts();
	const { data: session } = authClient.useSession();
	const currentUserId = session?.user.id ?? null;
	const onlineHostIds = useMemo(
		() =>
			new Set(
				hosts.filter((host) => host.isOnline).map((host) => host.machineId),
			),
		[hosts],
	);
	const candidates = useMemo<WorkspaceForPlacement[]>(
		() =>
			workspaces.map((workspace) => ({
				id: workspace.id,
				projectId: workspace.projectId,
				type: workspace.type,
				hostId: workspace.hostId,
				hostReachable: workspace.hostReachable,
				createdByUserId: workspace.createdByUserId ?? null,
			})),
		[workspaces],
	);

	const { data: localStateRows = [], isReady: localStateReady } = useLiveQuery(
		(query) =>
			query
				.from({ state: collections.v2WorkspaceLocalState })
				.select(({ state }) => ({ workspaceId: state.workspaceId })),
		[collections],
	);

	useEffect(() => {
		if (!workspacesReady || !localStateReady) return;

		const placedWorkspaceIds = new Set(
			localStateRows.map((row) => row.workspaceId),
		);

		for (const worktree of selectWorktreesToPlace(
			candidates,
			placedWorkspaceIds,
			{ machineId, onlineHostIds, currentUserId },
		)) {
			// A hidden project stays hidden; the row is placed for when it is
			// shown again.
			ensureWorkspaceInSidebar(worktree.id, worktree.projectId, {
				revealProject: false,
			});
		}
	}, [
		candidates,
		currentUserId,
		ensureWorkspaceInSidebar,
		localStateReady,
		localStateRows,
		machineId,
		onlineHostIds,
		workspacesReady,
	]);
}
