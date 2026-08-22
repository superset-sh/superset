import type {
	DeleteInProgressCause,
	TeardownFailureCause,
} from "@superset/host-service";
import { TRPCClientError } from "@trpc/client";
import { useCallback } from "react";
import { useCloudWorkspaces } from "renderer/hooks/useCloudWorkspaces";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import {
	useWorkspaceHostTarget,
	type WorkspaceHostTarget,
} from "../useWorkspaceHostUrl";

export interface DestroyWorkspaceInput {
	deleteBranch?: boolean;
	/** Git-destructive consent only (skips the dirty-worktree preflight).
	 * Does NOT skip the teardown script. */
	force?: boolean;
	/** Consent to abandon the teardown script — only the teardown-failed
	 * retry sets this. */
	skipTeardown?: boolean;
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

export interface DestroyWorkspaceHostTarget {
	workspaceId: string;
	hostUrl: string | null;
	hostStatus: WorkspaceHostTarget["status"];
}

export async function destroyWorkspaceAtHost(
	{ workspaceId, hostUrl, hostStatus }: DestroyWorkspaceHostTarget,
	input: DestroyWorkspaceInput = {},
): Promise<DestroyWorkspaceSuccess> {
	const client = getReadyClient(hostUrl, hostStatus);
	try {
		return await client.workspaceCleanup.destroy.mutate({
			workspaceId,
			deleteBranch: input.deleteBranch ?? false,
			force: input.force ?? false,
			skipTeardown: input.skipTeardown ?? false,
		});
	} catch (error) {
		throw normalizeDestroyWorkspaceError(error);
	}
}

export async function inspectWorkspaceAtHost({
	workspaceId,
	hostUrl,
	hostStatus,
}: DestroyWorkspaceHostTarget): Promise<DestroyWorkspacePreview> {
	const client = getReadyClient(hostUrl, hostStatus);
	try {
		return await client.workspaceCleanup.inspect.query({ workspaceId });
	} catch (error) {
		throw normalizeDestroyWorkspaceError(error);
	}
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
	const { activeHostUrl } = useLocalHostService();

	// Reduce the (object-identity-unstable) hostTarget down to two scalars so
	// memoized callbacks below don't churn on every collection notification.
	// useLiveQuery returns a new array each tick, which would otherwise rebuild
	// `inspect`/`destroy` and re-fire effects that depend on them.
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

	// The cloud row decides this, not whether we currently hold an address for
	// it: a workspace still provisioning, or one whose sandbox stopped
	// answering, is no less a cloud workspace — and deleting it anywhere but at
	// the API would leave the sandbox running.
	const { workspaces: cloudWorkspaces } = useCloudWorkspaces();
	const isSandbox = cloudWorkspaces.some((row) => row.id === workspaceId);
	const utils = cloudTrpc.useUtils();

	const destroy = useCallback(
		async (
			input: DestroyWorkspaceInput = {},
		): Promise<DestroyWorkspaceSuccess> => {
			// Destroying a cloud workspace at its host would delete the row
			// inside a sandbox that then keeps running — and billing — with the
			// cloud row still listing it. The sandbox is the thing to destroy,
			// and only the API can do that.
			if (isSandbox) {
				await apiTrpcClient.cloudWorkspace.delete.mutate({ id: workspaceId });
				await utils.cloudWorkspace.list.invalidate();
				return {
					success: true,
					// The whole machine goes away, so there is no worktree or branch
					// left behind to report on.
					worktreeRemoved: true,
					branchDeleted: false,
					cloudDeleted: true,
					warnings: [],
				};
			}
			return destroyWorkspaceAtHost(
				{ workspaceId, hostUrl, hostStatus },
				input,
			);
		},
		[hostUrl, hostStatus, isSandbox, utils, workspaceId],
	);

	const inspect = useCallback(async (): Promise<DestroyWorkspacePreview> => {
		// A sandbox's own answer here is always "no". Its checkout *is* the repo,
		// so `worktreePath === repoPath` and the row is `type='main'` — both
		// signals host-service uses to refuse deleting a main workspace, which
		// is right for a machine someone owns and wrong for a cloud workspace,
		// where deleting is how you dispose of the sandbox. The uncommitted-work
		// warning is host-side too, so it is lost with it; the dialog's copy
		// carries the consequence instead.
		if (isSandbox) {
			return {
				canDelete: true,
				reason: null,
				hasChanges: false,
				hasUnpushedCommits: false,
			};
		}
		return inspectWorkspaceAtHost({ workspaceId, hostUrl, hostStatus });
	}, [hostUrl, hostStatus, isSandbox, workspaceId]);

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

export function normalizeDestroyWorkspaceError(
	err: unknown,
): DestroyWorkspaceError {
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
