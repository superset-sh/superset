import type { SessionScopedState } from "@superset/session-protocol";

export interface SessionRowData {
	id: string;
	title: string;
	ts: number;
	status: SessionScopedState["status"];
}

export function buildSessionRows(
	sessions: SessionScopedState[],
): SessionRowData[] {
	return sessions
		.map<SessionRowData>((session) => ({
			id: session.sessionId,
			title: session.title ?? "New session",
			ts: session.updatedAt,
			status: session.status,
		}))
		.sort((a, b) => b.ts - a.ts);
}
