export interface ChatSessionLike {
	id: string;
	title: string | null;
	createdAt: Date | null;
	updatedAt: Date | null;
}

export interface SessionRowData {
	id: string;
	title: string;
	ts: number;
}

function toMs(
	value: Date | null | undefined,
	fallback: Date | null | undefined,
): number {
	const d = value ?? fallback;
	return d ? d.getTime() : 0;
}

export function buildSessionRows(
	chatSessions: ChatSessionLike[],
): SessionRowData[] {
	return chatSessions
		.map<SessionRowData>((session) => ({
			id: session.id,
			title: session.title ?? "Untitled chat",
			ts: toMs(session.updatedAt, session.createdAt),
		}))
		.sort((a, b) => b.ts - a.ts);
}
