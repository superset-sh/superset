import type { WorkspaceInitProgress } from "shared/types/workspace-init";

/**
 * Machine-readable causes attached to workspace lifecycle TRPCErrors.
 * Serialized to the renderer via the errorFormatter in lib/trpc.
 */
export type WorkspaceErrorCause =
	| { kind: "WORKSPACE_NOT_FOUND"; workspaceId: string }
	| { kind: "WORKSPACE_INITIALIZING"; progress?: WorkspaceInitProgress }
	| { kind: "WORKSPACE_INIT_FAILED"; progress?: WorkspaceInitProgress }
	| { kind: "WORKTREE_MISSING"; worktreePath?: string };

const WORKSPACE_CAUSE_KINDS = new Set([
	"WORKSPACE_NOT_FOUND",
	"WORKSPACE_INITIALIZING",
	"WORKSPACE_INIT_FAILED",
	"WORKTREE_MISSING",
]);

export function isWorkspaceErrorCause(
	value: unknown,
): value is WorkspaceErrorCause {
	return (
		!!value &&
		typeof value === "object" &&
		typeof (value as { kind?: unknown }).kind === "string" &&
		WORKSPACE_CAUSE_KINDS.has((value as { kind: string }).kind)
	);
}
