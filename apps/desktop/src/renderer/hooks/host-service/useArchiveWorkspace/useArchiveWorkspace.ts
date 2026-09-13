import { useLingui } from "@lingui/react/macro";
import { useCallback } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { isMissingProcedureError } from "renderer/lib/isMissingProcedureError";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import {
	type DestroyWorkspaceError,
	type DestroyWorkspaceSuccess,
	normalizeDestroyWorkspaceError,
} from "../useDestroyWorkspace";
import {
	useWorkspaceHostTarget,
	type WorkspaceHostTarget,
} from "../useWorkspaceHostUrl";

export interface UseArchiveWorkspace {
	/**
	 * Archive: the same destroy as Delete, minus the branch. Throws the
	 * typed `DestroyWorkspaceError` union.
	 */
	archive: () => Promise<DestroyWorkspaceSuccess>;
	/**
	 * Restore: the host checks the branch out again at the workspace's own
	 * path and the row comes back live — with the agent chats, which are
	 * keyed by that path.
	 */
	restore: () => Promise<{ warnings: string[] }>;
}

export function useArchiveWorkspace(
	workspaceId: string,
	hostId?: string | null,
): UseArchiveWorkspace {
	// An archived row is out of the live list, so its host is named, not found.
	const hostTarget = useWorkspaceHostTarget(workspaceId, hostId);
	return useArchiveWorkspaceWithTarget(workspaceId, hostTarget);
}

/**
 * Same as `useArchiveWorkspace` for a caller that already resolved the host
 * target (the sidebar row does, once per row) — avoids resolving it twice.
 */
export function useArchiveWorkspaceWithTarget(
	workspaceId: string,
	hostTarget: WorkspaceHostTarget,
): UseArchiveWorkspace {
	const { t } = useLingui();
	const { cache } = useHostWorkspaces();

	// Reduced to scalars so the callbacks don't churn on every collection
	// notification (hostTarget is a fresh object each tick).
	const hostUrl = hostTarget.status === "ready" ? hostTarget.url : null;
	const hostId = hostTarget.status === "ready" ? hostTarget.hostId : null;
	const hostStatus = hostTarget.status;

	const archive = useCallback(async () => {
		if (hostUrl == null) {
			throw {
				kind: "host-unavailable",
				reason: hostStatus,
			} satisfies DestroyWorkspaceError;
		}
		const client = getHostServiceClientByUrl(hostUrl);
		try {
			return await client.workspaceCleanup.archive.mutate({ workspaceId });
		} catch (error) {
			if (isMissingProcedureError(error)) {
				throw {
					kind: "unknown",
					message: t({ message: "This host needs an update" }),
				} satisfies DestroyWorkspaceError;
			}
			throw normalizeDestroyWorkspaceError(error);
		}
	}, [hostStatus, hostUrl, t, workspaceId]);

	const restore = useCallback(async () => {
		if (hostUrl == null) {
			throw new Error(`workspace host unavailable: ${hostStatus}`);
		}
		const result = await getHostServiceClientByUrl(
			hostUrl,
		).workspaceCleanup.revive.mutate({ workspaceId });
		// The host's `created` broadcast normally beats this, but the row must
		// not depend on the socket to reappear.
		if (hostId) cache.invalidateHost(hostId);
		return { warnings: result.warnings };
	}, [cache, hostId, hostStatus, hostUrl, workspaceId]);

	return { archive, restore };
}
