import type {
	KillRequest,
	ListSessionsResponse,
	ShutdownRequest,
} from "main/lib/terminal-host/types";

type V1Session = ListSessionsResponse["sessions"][number];

/** No call here may spawn a v1 daemon. */
export interface V1DaemonClient {
	listSessionsIfRunning(): Promise<ListSessionsResponse | null>;
	killIfRunning(request: KillRequest): Promise<boolean>;
	shutdownIfRunning(request: ShutdownRequest): Promise<{ wasRunning: boolean }>;
}

/**
 * Stops the live v1 sessions `shouldStop` picks. The daemon shuts down only
 * once no live session is left, so unmigrated work keeps running.
 */
export async function stopV1Sessions(
	client: V1DaemonClient,
	shouldStop: (session: V1Session) => boolean,
): Promise<{ stoppedPaneIds: string[] }> {
	const stoppedPaneIds: string[] = [];
	const response = await client.listSessionsIfRunning();
	if (!response) return { stoppedPaneIds };

	const alive = response.sessions.filter((session) => session.isAlive);
	const kept = alive.filter((session) => !shouldStop(session));
	for (const session of alive) {
		if (!shouldStop(session)) continue;
		if (!(await client.killIfRunning({ sessionId: session.sessionId }))) {
			return { stoppedPaneIds };
		}
		stoppedPaneIds.push(session.paneId);
	}
	if (kept.length === 0) {
		await client.shutdownIfRunning({ killSessions: true });
	}
	return { stoppedPaneIds };
}
