export interface WorkspaceSessionEntry {
	sessionId: string;
	paneId: string;
	pid: number;
	title: string | null;
}

export type WorkspaceSessionMap = Map<string, WorkspaceSessionEntry[]>;

interface V2ResourceSessionPayload {
	terminalId: unknown;
	workspaceId: unknown;
	pid: unknown;
	title: unknown;
}

function toPositiveInteger(value: unknown): number | null {
	if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
		return null;
	}
	return value;
}

export function normalizeOptionalTitle(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const title = value.trim();
	return title.length > 0 ? title : null;
}

export function parseV2ResourceSessions(payload: unknown): WorkspaceSessionMap {
	const workspaceSessionMap: WorkspaceSessionMap = new Map();
	const rawSessions =
		payload &&
		typeof payload === "object" &&
		Array.isArray((payload as { sessions?: unknown }).sessions)
			? (payload as { sessions: unknown[] }).sessions
			: [];

	for (const rawSession of rawSessions) {
		if (!rawSession || typeof rawSession !== "object") continue;
		const session = rawSession as V2ResourceSessionPayload;
		if (typeof session.terminalId !== "string" || !session.terminalId) {
			continue;
		}
		if (typeof session.workspaceId !== "string" || !session.workspaceId) {
			continue;
		}
		const pid = toPositiveInteger(session.pid);
		if (pid === null) continue;

		let entries = workspaceSessionMap.get(session.workspaceId);
		if (!entries) {
			entries = [];
			workspaceSessionMap.set(session.workspaceId, entries);
		}
		entries.push({
			sessionId: session.terminalId,
			paneId: session.terminalId,
			pid,
			title: normalizeOptionalTitle(session.title),
		});
	}

	return workspaceSessionMap;
}
