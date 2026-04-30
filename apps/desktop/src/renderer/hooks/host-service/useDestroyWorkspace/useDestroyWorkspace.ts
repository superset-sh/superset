import type {
	DeleteInProgressCause,
	TeardownFailureCause,
} from "@superset/host-service";
import { TRPCClientError } from "@trpc/client";
import { useCallback } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import {
	useWorkspaceHostTarget,
	type WorkspaceHostTarget,
} from "../useWorkspaceHostUrl";

export interface DestroyWorkspaceInput {
	deleteBranch?: boolean;
	force?: boolean;
}

export interface DestroyWorkspaceSuccess {
	success: boolean;
	worktreeRemoved: boolean;
	branchDeleted: boolean;
	cloudDeleted: boolean;
	warnings: string[];
}

/**
 * Mirrors the server's `InspectResult` discriminated union so the renderer
 * can't accidentally treat `{ canDelete: false, reason: null }` as a no-op
 * — that combination is unrepresentable.
 */
export type DestroyWorkspacePreview =
	| {
			canDelete: true;
			reason: null;
			hasChanges: boolean;
			hasUnpushedCommits: boolean;
	  }
	| {
			canDelete: false;
			reason: string;
			hasChanges: false;
			hasUnpushedCommits: false;
	  };

export type DestroyWorkspaceError =
	| { kind: "conflict"; message: string }
	| { kind: "in-progress"; message: string }
	| { kind: "teardown-failed"; cause: TeardownFailureCause }
	| { kind: "host-unavailable"; reason: WorkspaceHostTarget["status"] }
	| { kind: "unknown"; message: string };

export interface UseDestroyWorkspace {
	hostTarget: WorkspaceHostTarget;
	destroy: (input?: DestroyWorkspaceInput) => Promise<DestroyWorkspaceSuccess>;
	inspect: () => Promise<DestroyWorkspacePreview>;
}

/**
 * Calls `workspaceCleanup.{inspect,destroy}` on the workspace's owning
 * host-service. Translates TRPC errors into a typed discriminated union
 * so callers can:
 *   - silently retry with `force: true` on `conflict` (dirty-worktree race)
 *   - surface a toast on `in-progress` (concurrent destroy) — must NOT retry
 *   - prompt force-retry on `teardown-failed`
 *   - render `host-unavailable` as a checking-status spinner, not an error
 */
export function useDestroyWorkspace(workspaceId: string): UseDestroyWorkspace {
	const hostTarget = useWorkspaceHostTarget(workspaceId);

	// Reduce the (object-identity-unstable) hostTarget down to two scalars so
	// memoized callbacks below don't churn on every collection notification.
	// useLiveQuery returns a new array each tick, which would otherwise rebuild
	// `inspect`/`destroy` and re-fire effects that depend on them.
	const hostUrl = hostTarget.status === "ready" ? hostTarget.url : null;
	const hostStatus = hostTarget.status;

	const destroy = useCallback(
		async (
			input: DestroyWorkspaceInput = {},
		): Promise<DestroyWorkspaceSuccess> => {
			const client = getReadyClient(hostUrl, hostStatus);
			try {
				return await client.workspaceCleanup.destroy.mutate({
					workspaceId,
					deleteBranch: input.deleteBranch ?? false,
					force: input.force ?? false,
				});
			} catch (err) {
				throw normalizeError(err);
			}
		},
		[hostUrl, hostStatus, workspaceId],
	);

	const inspect = useCallback(async (): Promise<DestroyWorkspacePreview> => {
		const client = getReadyClient(hostUrl, hostStatus);
		try {
			return await client.workspaceCleanup.inspect.query({ workspaceId });
		} catch (err) {
			throw normalizeError(err);
		}
	}, [hostUrl, hostStatus, workspaceId]);

	return { hostTarget, destroy, inspect };
}

function getReadyClient(
	hostUrl: string | null,
	hostStatus: WorkspaceHostTarget["status"],
) {
	if (hostUrl == null) {
		throw {
			kind: "host-unavailable",
			reason: hostStatus,
		} satisfies DestroyWorkspaceError;
	}
	return getHostServiceClientByUrl(hostUrl);
}

function normalizeError(err: unknown): DestroyWorkspaceError {
	if (isDestroyWorkspaceError(err)) return err;
	if (err instanceof TRPCClientError) {
		const data = err.data as
			| {
					code?: string;
					teardownFailure?: TeardownFailureCause;
					deleteInProgress?: DeleteInProgressCause;
			  }
			| undefined;

		if (data?.teardownFailure) {
			return { kind: "teardown-failed", cause: data.teardownFailure };
		}
		if (data?.deleteInProgress) {
			return { kind: "in-progress", message: err.message };
		}
		if (data?.code === "CONFLICT") {
			return { kind: "conflict", message: err.message };
		}
		return { kind: "unknown", message: err.message };
	}
	return {
		kind: "unknown",
		message: err instanceof Error ? err.message : String(err),
	};
}

function isDestroyWorkspaceError(err: unknown): err is DestroyWorkspaceError {
	return (
		!!err &&
		typeof err === "object" &&
		"kind" in err &&
		typeof (err as { kind: unknown }).kind === "string"
	);
}
