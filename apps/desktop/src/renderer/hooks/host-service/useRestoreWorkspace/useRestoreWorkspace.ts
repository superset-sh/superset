import { TRPCClientError } from "@trpc/client";
import { useCallback } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import {
	useWorkspaceHostTarget,
	type WorkspaceHostTarget,
} from "../useWorkspaceHostUrl";

export interface RestoreWorkspaceSuccess {
	workspaceId: string;
	worktreePath: string;
	restoredFrom: "local-branch" | "remote" | "already-on-disk";
}

export type RestoreWorkspaceError =
	| { kind: "conflict"; message: string }
	| { kind: "branch-gone"; message: string }
	| { kind: "unsupported-host"; message: string }
	| { kind: "host-unavailable"; reason: WorkspaceHostTarget["status"] }
	| { kind: "unknown"; message: string };

/**
 * Calls `workspaceCleanup.restore` on the workspace's owning host-service.
 * Archived rows are absent from the default live-only workspace list, so the
 * host target is resolved with `includeArchived: true` — the archived source
 * fetches tombstones under a separate query key and the existing host
 * resolution path finds the row and builds the correct URL. Without a hostId
 * (older callers) the local fallback remains for backwards compat.
 */
export function useRestoreWorkspace(
	workspaceId: string,
	_hostId?: string | null,
): {
	hostTarget: WorkspaceHostTarget;
	restore: () => Promise<RestoreWorkspaceSuccess>;
} {
	const hostTarget = useWorkspaceHostTarget(workspaceId, {
		includeArchived: true,
	});
	const { activeHostUrl } = useLocalHostService();

	const shouldTryLocalCleanup =
		hostTarget.status === "not-found" && activeHostUrl !== null;
	const hostUrl =
		hostTarget.status === "ready"
			? hostTarget.url
			: shouldTryLocalCleanup
				? activeHostUrl
				: null;
	const hostStatus: WorkspaceHostTarget["status"] = shouldTryLocalCleanup
		? "ready"
		: hostTarget.status;

	const restore = useCallback(async (): Promise<RestoreWorkspaceSuccess> => {
		if (hostUrl == null) {
			throw {
				kind: "host-unavailable",
				reason: hostStatus,
			} satisfies RestoreWorkspaceError;
		}
		const client = getHostServiceClientByUrl(hostUrl);
		try {
			return await client.workspaceCleanup.restore.mutate({ workspaceId });
		} catch (error) {
			throw normalizeRestoreWorkspaceError(error);
		}
	}, [hostUrl, hostStatus, workspaceId]);

	return { hostTarget, restore };
}

export function normalizeRestoreWorkspaceError(
	err: unknown,
): RestoreWorkspaceError {
	if (isRestoreWorkspaceError(err)) return err;
	if (err instanceof TRPCClientError) {
		// Old hosts predate the restore procedure entirely.
		if (
			(err.data as { code?: string } | undefined)?.code === "NOT_FOUND" &&
			/no procedure/i.test(err.message)
		) {
			return { kind: "unsupported-host", message: err.message };
		}
		if (
			(err.data as { code?: string } | undefined)?.code === "CONFLICT" ||
			/already own/i.test(err.message)
		) {
			return { kind: "conflict", message: err.message };
		}
		if (
			(err.data as { restoreBranchGone?: unknown } | undefined)
				?.restoreBranchGone
		) {
			return { kind: "branch-gone", message: err.message };
		}
		return { kind: "unknown", message: err.message };
	}
	if (err instanceof Error) return { kind: "unknown", message: err.message };
	return { kind: "unknown", message: "Unknown error" };
}

function isRestoreWorkspaceError(err: unknown): err is RestoreWorkspaceError {
	return (
		typeof err === "object" &&
		err !== null &&
		"kind" in err &&
		(err as { kind: string }).kind !== undefined &&
		[
			"conflict",
			"branch-gone",
			"unsupported-host",
			"host-unavailable",
			"unknown",
		].includes((err as { kind: string }).kind)
	);
}
