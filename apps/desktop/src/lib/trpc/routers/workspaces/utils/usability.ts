import { existsSync } from "node:fs";
import { TRPCError } from "@trpc/server";
import { workspaceInitManager } from "main/lib/workspace-init-manager";
import type { WorkspaceInitProgress } from "shared/types/workspace-init";

export type WorkspaceUsabilityReason =
	| "initializing"
	| "failed"
	| "path_missing"
	| "not_found";

export interface WorkspaceUsabilityCheck {
	usable: boolean;
	reason?: WorkspaceUsabilityReason;
	progress?: WorkspaceInitProgress;
}

/**
 * Check if a workspace is usable for operations requiring the worktree path.
 * Returns detailed status for UI to display appropriate state.
 *
 * A workspace is NOT usable if:
 * - It is currently initializing (git operations in progress)
 * - Its initialization failed (needs retry or delete)
 * - The worktree path doesn't exist on disk
 */
export function checkWorkspaceUsability(
	workspaceId: string,
	worktreePath: string | null | undefined,
): WorkspaceUsabilityCheck {
	if (workspaceInitManager.isInitializing(workspaceId)) {
		return {
			usable: false,
			reason: "initializing",
			progress: workspaceInitManager.getProgress(workspaceId),
		};
	}

	if (workspaceInitManager.hasFailed(workspaceId)) {
		return {
			usable: false,
			reason: "failed",
			progress: workspaceInitManager.getProgress(workspaceId),
		};
	}

	if (!worktreePath) {
		return { usable: false, reason: "path_missing" };
	}

	if (!existsSync(worktreePath)) {
		return { usable: false, reason: "path_missing" };
	}

	return { usable: true };
}

/**
 * Throws TRPCError if workspace is not usable.
 * Use this as a guard in tRPC procedures that require the worktree to exist.
 *
 * The error includes a `cause` object with details that the frontend can use
 * to display appropriate UI (e.g., progress view for initializing, error for failed).
 */
export function assertWorkspaceUsable(
	workspaceId: string,
	worktreePath: string | null | undefined,
): void {
	const check = checkWorkspaceUsability(workspaceId, worktreePath);

	if (!check.usable) {
		switch (check.reason) {
			case "initializing":
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "Workspace is still initializing",
					cause: { reason: "initializing", progress: check.progress },
				});
			case "failed":
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "Workspace initialization failed",
					cause: { reason: "failed", progress: check.progress },
				});
			case "path_missing":
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Workspace path does not exist",
					cause: { reason: "path_missing" },
				});
			default:
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Workspace is not usable",
				});
		}
	}
}

/**
 * Check if a workspace usability error indicates the workspace is initializing.
 * Useful for frontend to determine whether to show progress UI.
 */
export function isInitializingError(error: unknown): boolean {
	if (error instanceof TRPCError) {
		const cause = error.cause as { reason?: string } | undefined;
		return cause?.reason === "initializing";
	}
	return false;
}

/**
 * Check if a workspace usability error indicates the workspace failed to initialize.
 * Useful for frontend to determine whether to show error UI with retry option.
 */
export function isFailedError(error: unknown): boolean {
	if (error instanceof TRPCError) {
		const cause = error.cause as { reason?: string } | undefined;
		return cause?.reason === "failed";
	}
	return false;
}
