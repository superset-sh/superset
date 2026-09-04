export type WorkspaceForPlacement = {
	id: string;
	/** Null for project-less "session" workspaces. */
	projectId: string | null;
	type: "main" | "worktree" | "session";
	hostId: string;
	/**
	 * True when the owning host answered `workspace.list` this session. False
	 * for rows served from a last-seen IndexedDB snapshot, or retained by
	 * react-query across a failed refetch (see `mergeHostWorkspaces`).
	 */
	hostReachable: boolean;
	/**
	 * Who created it (`x-superset-user-id` stamped by the host). Null for rows
	 * from a host that predates the header, and for adopted/ambient rows.
	 */
	createdByUserId: string | null;
};

export type PlacementContext = {
	/** This device's host; null until the local host service reports it. */
	machineId: string | null;
	/** Org hosts currently online per cloud + relay presence (`useKnownHosts`). */
	onlineHostIds: ReadonlySet<string>;
	/** The signed-in user; null until the session resolves. */
	currentUserId: string | null;
};

/**
 * Chooses which host-served workspaces the sidebar reconciler should place.
 * Kept free of React so it can be unit-tested directly.
 *
 * `worktree` and `session` workspaces are eligible: both are always explicit
 * creations (renderer, CLI, or automation), so they surface even when created
 * outside the renderer. `main` workspaces are not — the host creates one for
 * every project on the device, so placing those would drag locally-known
 * projects the user never added into the sidebar; they surface instead via the
 * gated `isAutoIncludedLocalMainWorkspace` path. A workspace that already has a
 * local-state row is "already placed" and skipped, so nothing the user has
 * moved, hidden, or removed is re-added.
 *
 * Host gate: this device's workspaces always qualify (the local host serves
 * from its snapshot at boot, was never gated on reachability, and a machine
 * someone runs is theirs). A remote host's workspaces qualify only while that
 * host is online AND has actually answered this session — placement writes a
 * durable per-device row, so it must not run off a stale snapshot of a host
 * that is offline or whose relay query failed. Offline hosts are skipped on
 * purpose: a row nobody can open is sidebar noise (#7100).
 *
 * Creator gate: a remote workspace is placed only when the signed-in user
 * created it. Hosts are shared (`v2Host.list` is "hosts you can access", not
 * "hosts you own"), so anything wider pins teammates' work — and a placed row
 * is sticky, so interim clutter would outlive a later fix. A null creator
 * (host predating the `x-superset-user-id` stamp) is not placed; those rows
 * stay opt-in via Workspaces → Pin.
 */
export function selectWorktreesToPlace(
	workspaces: readonly WorkspaceForPlacement[],
	placedWorkspaceIds: ReadonlySet<string>,
	{ machineId, onlineHostIds, currentUserId }: PlacementContext,
): Array<{ id: string; projectId: string | null }> {
	return workspaces.flatMap(
		(workspace): Array<{ id: string; projectId: string | null }> => {
			if (placedWorkspaceIds.has(workspace.id)) return [];
			const isLocal = machineId !== null && workspace.hostId === machineId;
			if (!isLocal) {
				const hostAnswering =
					onlineHostIds.has(workspace.hostId) && workspace.hostReachable;
				const mine =
					currentUserId !== null && workspace.createdByUserId === currentUserId;
				if (!hostAnswering || !mine) return [];
			}
			if (workspace.type === "worktree" && workspace.projectId !== null) {
				return [{ id: workspace.id, projectId: workspace.projectId }];
			}
			// Sessions are project-less; they land in the top-level Sessions
			// section, so placement carries no project.
			if (workspace.type === "session") {
				return [{ id: workspace.id, projectId: null }];
			}
			return [];
		},
	);
}
