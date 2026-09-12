import { useCallback } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import {
	useWorkspaceHostTarget,
	type WorkspaceHostTarget,
} from "../useWorkspaceHostUrl";

export interface UseShelveWorkspace {
	/** Archive the workspace: it leaves every active surface at its host. */
	shelve: () => Promise<{ shelvedAt: number | null }>;
	/** Restore it — always explicit, never a side effect of opening it. */
	unshelve: () => Promise<{ shelvedAt: number | null }>;
}

/**
 * Calls `workspace.{shelve,unshelve}` on the workspace's owning host-service.
 * "Shelved" is the internal name for the UI's "Archive"; it is unrelated to
 * `archivedAt`, the tombstone left by a delete.
 *
 * Shelf state rides the shared workspace list, and the host's
 * `workspace:changed` payload does not carry it, so each mutation refetches
 * that host's list rather than waiting up to 30s for the fallback poll.
 */
export function useShelveWorkspace(workspaceId: string): UseShelveWorkspace {
	const hostTarget = useWorkspaceHostTarget(workspaceId);
	return useShelveWorkspaceWithTarget(workspaceId, hostTarget);
}

/**
 * Same as `useShelveWorkspace` for a caller that already resolved the host
 * target (the sidebar row does, once per row) — avoids resolving it twice.
 */
export function useShelveWorkspaceWithTarget(
	workspaceId: string,
	hostTarget: WorkspaceHostTarget,
): UseShelveWorkspace {
	const { cache } = useHostWorkspaces();

	// Reduced to scalars so the callbacks don't churn on every collection
	// notification (hostTarget is a fresh object each tick).
	const hostUrl = hostTarget.status === "ready" ? hostTarget.url : null;
	const hostId = hostTarget.status === "ready" ? hostTarget.hostId : null;
	const hostStatus = hostTarget.status;

	const shelve = useCallback(async () => {
		const client = getReadyClient(hostUrl, hostStatus);
		const result = await client.workspace.shelve.mutate({ workspaceId });
		if (hostId) cache.invalidateHost(hostId);
		return result;
	}, [cache, hostId, hostStatus, hostUrl, workspaceId]);

	const unshelve = useCallback(async () => {
		const client = getReadyClient(hostUrl, hostStatus);
		const result = await client.workspace.unshelve.mutate({ workspaceId });
		if (hostId) cache.invalidateHost(hostId);
		return result;
	}, [cache, hostId, hostStatus, hostUrl, workspaceId]);

	return { shelve, unshelve };
}

function getReadyClient(
	hostUrl: string | null,
	hostStatus: WorkspaceHostTarget["status"],
) {
	if (hostUrl == null) {
		throw new Error(`workspace host unavailable: ${hostStatus}`);
	}
	return getHostServiceClientByUrl(hostUrl);
}
