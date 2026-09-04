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
 * Places deliberately-created worktrees and sessions into the sidebar exactly
 * once — from this device and from every online host in the org.
 *
 * A `worktree` or `session` is always an explicit creation (renderer, CLI, or
 * automation), so it should surface even when created outside the renderer —
 * the CLI and automations go through the host service and can't write
 * renderer-local sidebar state. That includes work started on another machine
 * (a headless box running `superset start`, driven by an automation or the
 * CLI): `useHostWorkspaces` already fans out to every known host, so the rows
 * are here; what was missing was the placement (#7100). Offline hosts and
 * other people's workspaces are not placed — see `selectWorktreesToPlace` for
 * the host and creator gates.
 *
 * An ambient `main` workspace is excluded: the host creates one for every
 * project on the device, so placing those would drag every locally-known
 * project into the sidebar. Main workspaces surface only under a project
 * already in the sidebar (`isAutoIncludedLocalMainWorkspace`).
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
			ensureWorkspaceInSidebar(worktree.id, worktree.projectId);
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
