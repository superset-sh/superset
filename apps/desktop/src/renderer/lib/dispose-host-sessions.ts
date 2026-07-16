import type { electronTrpc } from "renderer/lib/electron-trpc";
import { setHostServiceSecret } from "renderer/lib/host-service-auth";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

type ElectronTrpcUtils = ReturnType<typeof electronTrpc.useUtils>;

/**
 * Build a host-service client for every running local host-service (one per
 * org). Disposal is broadcast to all of them because the electron delete path
 * doesn't know which org owns the workspace; each host no-ops for workspaces it
 * doesn't own, so this is safe and covers non-active-org workspaces too.
 */
async function localHostClients(utils: ElectronTrpcUtils) {
	const connections = await utils.hostServiceCoordinator.getConnections
		.fetch(undefined, { staleTime: 0 })
		.catch(() => []);
	return (connections ?? []).map(({ port, secret }) => {
		const url = `http://127.0.0.1:${port}`;
		setHostServiceSecret(url, secret);
		return getHostServiceClientByUrl(url);
	});
}

/**
 * The electron delete/close/deleteWorktree paths only kill the main-process
 * daemon's terminals, so a workspace's host-service sessions (backgrounded,
 * renderer-detached ones included) would leak. Best-effort: tell every local
 * host-service to dispose them. Never throws — it must not block the mutation.
 */
export async function disposeHostSessionsForWorkspace(
	utils: ElectronTrpcUtils,
	workspaceId: string,
): Promise<void> {
	for (const client of await localHostClients(utils)) {
		client.terminal.disposeWorkspaceSessions
			.mutate({ workspaceId })
			.catch((error) => {
				console.warn("Failed to dispose host sessions for workspace", {
					workspaceId,
					error,
				});
			});
	}
}

/**
 * Same as {@link disposeHostSessionsForWorkspace} but keyed by worktree path —
 * used when deleting a closed worktree, which no longer has a workspace id.
 */
export async function disposeHostSessionsForWorktreePath(
	utils: ElectronTrpcUtils,
	worktreePath: string,
): Promise<void> {
	for (const client of await localHostClients(utils)) {
		client.terminal.disposeWorktreeSessions
			.mutate({ worktreePath })
			.catch((error) => {
				console.warn("Failed to dispose host sessions for worktree", {
					worktreePath,
					error,
				});
			});
	}
}
