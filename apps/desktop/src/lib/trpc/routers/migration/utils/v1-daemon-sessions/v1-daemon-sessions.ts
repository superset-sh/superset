import type {
	KillRequest,
	ListSessionsResponse,
} from "main/lib/terminal-host/types";

/** No call here may spawn a v1 daemon. */
export interface V1DaemonClient {
	listSessionsIfRunning(): Promise<ListSessionsResponse | null>;
	killIfRunning(request: KillRequest): Promise<boolean>;
	isDaemonProcessGone(): boolean;
}

/** A stale socket left by a crashed daemon makes the probe throw. */
async function listSessionsIfRunning(
	client: V1DaemonClient,
): Promise<ListSessionsResponse | null> {
	try {
		return await client.listSessionsIfRunning();
	} catch (error) {
		if (client.isDaemonProcessGone()) return null;
		throw error;
	}
}

export interface LiveV1Session {
	paneId: string;
	workspaceId: string;
	isAlive: boolean;
	pid: number | null;
}

export async function listLiveV1Sessions(
	client: V1DaemonClient,
): Promise<LiveV1Session[]> {
	const response = await listSessionsIfRunning(client);
	if (!response) return [];
	return response.sessions
		.filter((session) => session.isAlive)
		.map((session) => ({
			paneId: session.paneId,
			workspaceId: session.workspaceId,
			isAlive: session.isAlive,
			pid: session.pid,
		}));
}

export async function stopV1Sessions(
	client: V1DaemonClient,
	paneIds: string[],
): Promise<{ stoppedPaneIds: string[]; failedPaneIds: string[] }> {
	const result = {
		stoppedPaneIds: [] as string[],
		failedPaneIds: [] as string[],
	};
	if (paneIds.length === 0) return result;
	const response = await listSessionsIfRunning(client);
	if (!response) return result;

	const wanted = new Set(paneIds);
	for (const session of response.sessions) {
		if (!session.isAlive || !wanted.has(session.paneId)) continue;
		try {
			if (!(await client.killIfRunning({ sessionId: session.sessionId }))) {
				return result;
			}
			result.stoppedPaneIds.push(session.paneId);
		} catch (error) {
			console.warn("[v1-daemon-sessions] kill failed", {
				paneId: session.paneId,
				error,
			});
			result.failedPaneIds.push(session.paneId);
		}
	}
	return result;
}
