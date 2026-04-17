import type { TeardownFailureCause } from "@superset/host-service";
import { TRPCClientError } from "@trpc/client";
import { useCallback } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useWorkspaceHostUrl } from "../useWorkspaceHostUrl";

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

export type DestroyWorkspaceError =
	| { kind: "conflict"; message: string }
	| { kind: "teardown-failed"; cause: TeardownFailureCause }
	| { kind: "unknown"; message: string };

export interface UseDestroyWorkspace {
	destroy: (input?: DestroyWorkspaceInput) => Promise<DestroyWorkspaceSuccess>;
}

/**
 * Calls `workspaceCleanup.destroy` on the workspace's owning host-service.
 * Translates TRPC errors into a typed discriminated union so callers can
 * prompt for `force: true` on conflict or teardown failure.
 *
 * Throws a DestroyWorkspaceError (not a TRPCClientError) for easier handling.
 */
export function useDestroyWorkspace(workspaceId: string): UseDestroyWorkspace {
	const hostUrl = useWorkspaceHostUrl(workspaceId);

	const destroy = useCallback(
		async (
			input: DestroyWorkspaceInput = {},
		): Promise<DestroyWorkspaceSuccess> => {
			if (!hostUrl) {
				throw {
					kind: "unknown",
					message: "Host unavailable",
				} satisfies DestroyWorkspaceError;
			}

			const client = getHostServiceClientByUrl(hostUrl);
			try {
				const result = await client.workspaceCleanup.destroy.mutate({
					workspaceId,
					deleteBranch: input.deleteBranch ?? false,
					force: input.force ?? false,
				});
				return result;
			} catch (err) {
				throw normalizeError(err);
			}
		},
		[hostUrl, workspaceId],
	);

	return { destroy };
}

function normalizeError(err: unknown): DestroyWorkspaceError {
	if (err instanceof TRPCClientError) {
		const code = err.data?.code as string | undefined;
		const teardownFailure = (
			err.data as { teardownFailure?: TeardownFailureCause }
		)?.teardownFailure;

		if (teardownFailure) {
			return { kind: "teardown-failed", cause: teardownFailure };
		}
		if (code === "CONFLICT") {
			return { kind: "conflict", message: err.message };
		}
		return { kind: "unknown", message: err.message };
	}
	return {
		kind: "unknown",
		message: err instanceof Error ? err.message : String(err),
	};
}
