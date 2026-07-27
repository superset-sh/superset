import type { Session } from "@superset/host-service-sync/protocol";

export interface SessionRowData {
	id: string;
	title: string;
	ts: number;
	status: Session["runState"];
}

export function buildSessionRows(sessions: Session[]): SessionRowData[] {
	return sessions
		.map<SessionRowData>((session) => ({
			id: session.id,
			title: session.title ?? "New session",
			ts: session.lastActivityAt,
			status: session.runState,
		}))
		.sort((a, b) => b.ts - a.ts);
}
