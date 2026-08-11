import { toast } from "@superset/ui/sonner";
import type { electronTrpc } from "renderer/lib/electron-trpc";
import { setHostServiceSecret } from "renderer/lib/host-service-auth";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

type ElectronTrpcUtils = ReturnType<typeof electronTrpc.useUtils>;

export interface DisposeHostSessionsResult {
	terminated: number;
	/** Kills a host attempted but could not confirm (stamped — its reaper retries). */
	failed: number;
	/** Hosts that errored before reporting counts — nothing stamped, nothing retrying. */
	unreachableHosts: number;
	/**
	 * The coordinator lookup itself failed, so we don't even know which hosts
	 * to ask — the dispose never happened and nothing was stamped.
	 */
	coordinatorUnavailable: boolean;
}

/**
 * Build a host-service client for every running local host-service (one per
 * org). Disposal is broadcast to all of them because the electron delete path
 * doesn't know which org owns the workspace; each host no-ops for workspaces it
 * doesn't own, so this is safe and covers non-active-org workspaces too.
 *
 * Returns null (not []) when the coordinator lookup FAILS — the caller must
 * distinguish "no hosts running" (safe: nothing to dispose) from "couldn't ask"
 * (a real failure that would otherwise masquerade as success).
 */
async function localHostClients(utils: ElectronTrpcUtils) {
	let connections: { port: number; secret: string }[];
	try {
		connections = await utils.hostServiceCoordinator.getConnections.fetch(
			undefined,
			{ staleTime: 0 },
		);
	} catch {
		return null;
	}
	return (connections ?? []).map(({ port, secret }) => {
		const url = `http://127.0.0.1:${port}`;
		setHostServiceSecret(url, secret);
		return getHostServiceClientByUrl(url);
	});
}

async function disposeViaHosts(
	utils: ElectronTrpcUtils,
	run: (
		client: ReturnType<typeof getHostServiceClientByUrl>,
	) => Promise<{ terminated: number; failed: number }>,
	logContext: Record<string, string>,
): Promise<DisposeHostSessionsResult> {
	const result: DisposeHostSessionsResult = {
		terminated: 0,
		failed: 0,
		unreachableHosts: 0,
		coordinatorUnavailable: false,
	};
	const clients = await localHostClients(utils);
	if (clients === null) {
		console.warn("Failed to enumerate host services for dispose", logContext);
		result.coordinatorUnavailable = true;
		return result;
	}
	const outcomes = await Promise.all(
		clients.map((client) =>
			run(client).catch((error) => {
				console.warn("Failed to dispose host sessions", {
					...logContext,
					error,
				});
				return null;
			}),
		),
	);
	for (const outcome of outcomes) {
		if (!outcome) {
			result.unreachableHosts += 1;
			continue;
		}
		result.terminated += outcome.terminated;
		result.failed += outcome.failed;
	}
	return result;
}

/**
 * The electron delete/close/deleteWorktree paths only kill the main-process
 * daemon's terminals, so a workspace's host-service sessions (backgrounded,
 * renderer-detached ones included) would leak. Tell every local host-service
 * to dispose them and report what happened — callers surface failures via
 * {@link toastDisposeFailures}. Never throws.
 */
export function disposeHostSessionsForWorkspace(
	utils: ElectronTrpcUtils,
	workspaceId: string,
): Promise<DisposeHostSessionsResult> {
	return disposeViaHosts(
		utils,
		(client) =>
			client.terminal.disposeWorkspaceSessions.mutate({ workspaceId }),
		{ workspaceId },
	);
}

/**
 * Same as {@link disposeHostSessionsForWorkspace} but keyed by worktree path —
 * used when deleting a closed worktree, which no longer has a workspace id.
 */
export function disposeHostSessionsForWorktreePath(
	utils: ElectronTrpcUtils,
	worktreePath: string,
): Promise<DisposeHostSessionsResult> {
	return disposeViaHosts(
		utils,
		(client) =>
			client.terminal.disposeWorktreeSessions.mutate({ worktreePath }),
		{ worktreePath },
	);
}

/**
 * Surface a failed dispose with a Retry action. Failed kills the host
 * confirmed are stamped (`disposeRequestedAt`) and its reaper retries them;
 * an unreachable host (or an unavailable coordinator) wrote no stamp, so the
 * renderer retry is the only recovery path there.
 */
export function toastDisposeFailures(
	result: DisposeHostSessionsResult,
	retry: () => Promise<DisposeHostSessionsResult>,
): void {
	const unreached =
		result.unreachableHosts > 0 || result.coordinatorUnavailable;
	if (result.failed === 0 && !unreached) return;

	const retryAction = {
		label: "Retry",
		onClick: () => {
			retry()
				.then((next) => toastDisposeFailures(next, retry))
				.catch((error) => {
					console.warn("Retry of host session dispose failed", { error });
				});
		},
	};

	// A no-stamp failure (couldn't reach a host, or couldn't even enumerate
	// them) is the more urgent line: those sessions have no background retry,
	// so lead with that even when confirmed failures also exist.
	if (unreached) {
		const alsoFailed =
			result.failed > 0
				? ` ${result.failed} more will be retried in the background.`
				: "";
		toast.error("Couldn't reach the host to close terminal sessions", {
			description: `Its terminal processes may keep running.${alsoFailed}`,
			action: retryAction,
		});
		return;
	}

	toast.error(
		`Failed to close ${result.failed} terminal session${result.failed === 1 ? "" : "s"}`,
		{
			description: "The host will keep retrying in the background.",
			action: retryAction,
		},
	);
}
