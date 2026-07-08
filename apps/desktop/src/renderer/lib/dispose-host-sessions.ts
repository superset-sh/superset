import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

/**
 * The electron delete/close/deleteWorktree paths only kill the main-process
 * daemon's terminals, so a workspace's host-service sessions (backgrounded,
 * renderer-detached ones included) would leak. Best-effort: tell the local
 * host-service to dispose them. Never throws — it must not block the mutation.
 */
export function disposeHostSessionsForWorkspace(
	activeHostUrl: string | null,
	workspaceId: string,
): void {
	if (!activeHostUrl) return;
	getHostServiceClientByUrl(activeHostUrl)
		.terminal.disposeWorkspaceSessions.mutate({ workspaceId })
		.catch((error) => {
			console.warn("Failed to dispose host sessions for workspace", {
				workspaceId,
				error,
			});
		});
}

/**
 * Same as {@link disposeHostSessionsForWorkspace} but keyed by worktree path —
 * used when deleting a closed worktree, which no longer has a workspace id.
 */
export function disposeHostSessionsForWorktreePath(
	activeHostUrl: string | null,
	worktreePath: string,
): void {
	if (!activeHostUrl) return;
	getHostServiceClientByUrl(activeHostUrl)
		.terminal.disposeWorktreeSessions.mutate({ worktreePath })
		.catch((error) => {
			console.warn("Failed to dispose host sessions for worktree", {
				worktreePath,
				error,
			});
		});
}
