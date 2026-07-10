export type TerminalAgentStatus = "working" | "permission" | "idle";

export interface ChatSessionLike {
	id: string;
	title: string | null;
	createdAt: Date | null;
	updatedAt: Date | null;
}

export interface TerminalRowLike {
	terminalId: string;
	agentId: string;
	label: string;
	status: TerminalAgentStatus;
	sortKey: number;
}

export type SessionRowData =
	| { kind: "chat"; id: string; title: string; ts: number }
	| {
			kind: "terminal";
			id: string;
			agentId: string;
			label: string;
			status: TerminalAgentStatus;
			ts: number;
	  };

export function toMs(
	value: Date | null | undefined,
	fallback: Date | null | undefined,
): number {
	const d = value ?? fallback;
	return d ? d.getTime() : 0;
}

/**
 * One session list per workspace: live terminal sessions first (read-only
 * presence — an agent is running there right now), then chat sessions,
 * each block newest first.
 */
export function buildSessionRows({
	chatSessions,
	terminalRows,
}: {
	chatSessions: ChatSessionLike[];
	terminalRows: TerminalRowLike[];
}): SessionRowData[] {
	const byTsDesc = (a: SessionRowData, b: SessionRowData) => b.ts - a.ts;
	return [
		...terminalRows
			.map<SessionRowData>((terminal) => ({
				kind: "terminal",
				id: terminal.terminalId,
				agentId: terminal.agentId,
				label: terminal.label,
				status: terminal.status,
				ts: terminal.sortKey,
			}))
			.sort(byTsDesc),
		...chatSessions
			.map<SessionRowData>((session) => ({
				kind: "chat",
				id: session.id,
				title: session.title ?? "Untitled chat",
				ts: toMs(session.updatedAt, session.createdAt),
			}))
			.sort(byTsDesc),
	];
}
