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

export interface DestroyWorkspacePreview {
	canDelete: boolean;
	reason: string | null;
	hasChanges: boolean;
	hasUnpushedCommits: boolean;
}

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

	const destroy = useCallback(
		async (
			input: DestroyWorkspaceInput = {},
		): Promise<DestroyWorkspaceSuccess> => {
			const client = getReadyClient(hostTarget);
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
		[hostTarget, workspaceId],
	);

	const inspect = useCallback(async (): Promise<DestroyWorkspacePreview> => {
		const client = getReadyClient(hostTarget);
		try {
			return await client.workspaceCleanup.inspect.query({ workspaceId });
		} catch (err) {
			throw normalizeError(err);
		}
	}, [hostTarget, workspaceId]);

	return { hostTarget, destroy, inspect };
}

function getReadyClient(hostTarget: WorkspaceHostTarget) {
	if (hostTarget.status !== "ready") {
		throw {
			kind: "host-unavailable",
			reason: hostTarget.status,
		} satisfies DestroyWorkspaceError;
	}
	return getHostServiceClientByUrl(hostTarget.url);
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
