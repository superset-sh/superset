export interface AdoptableTerminalSession {
	terminalId: string;
	createdAt?: number;
}

export interface AdoptableChatSession {
	id: string;
	createdAt?: number;
}

export type AutoAdoptLaunch =
	| { kind: "terminal"; id: string }
	| { kind: "chat"; id: string };

interface TerminalPaneLike {
	kind: string;
	data: unknown;
}

interface WorkspaceTabLike {
	panes: Record<string, TerminalPaneLike>;
}

interface ResolveAutoAdoptLaunchesArgs {
	terminalSessions: readonly AdoptableTerminalSession[];
	chatSessions: readonly AdoptableChatSession[];
	attachedTerminalIds: Iterable<string>;
	attachedChatSessionIds: Iterable<string>;
	/** Terminals the user deliberately backgrounded — never re-adopted. */
	markedTerminalIds: Iterable<string>;
}

/**
 * Collect the running host sessions — terminal *and* chat — that have no pane
 * in the workspace layout, so they can be surfaced as foreground panes on open
 * instead of being stranded (chat sessions never even appear in the
 * background-terminals dropdown). Launches are ordered oldest→newest so the
 * resulting tabs read chronologically.
 */
export function resolveAutoAdoptLaunches({
	terminalSessions,
	chatSessions,
	attachedTerminalIds,
	attachedChatSessionIds,
	markedTerminalIds,
}: ResolveAutoAdoptLaunchesArgs): AutoAdoptLaunch[] {
	const attachedTerminals = new Set(attachedTerminalIds);
	const markedTerminals = new Set(markedTerminalIds);
	const attachedChats = new Set(attachedChatSessionIds);

	const terminalLaunches = terminalSessions
		.filter(
			(session) =>
				!attachedTerminals.has(session.terminalId) &&
				!markedTerminals.has(session.terminalId),
		)
		.map((session) => ({
			kind: "terminal" as const,
			id: session.terminalId,
			createdAt: session.createdAt ?? 0,
		}));

	const chatLaunches = chatSessions
		.filter((session) => !attachedChats.has(session.id))
		.map((session) => ({
			kind: "chat" as const,
			id: session.id,
			createdAt: session.createdAt ?? 0,
		}));

	return [...terminalLaunches, ...chatLaunches]
		.sort((a, b) => a.createdAt - b.createdAt)
		.map(({ kind, id }) => ({ kind, id }));
}

function getSessionIdFromPaneData(data: unknown): string | null {
	if (!data || typeof data !== "object") return null;
	const sessionId = (data as { sessionId?: unknown }).sessionId;
	return typeof sessionId === "string" && sessionId.length > 0
		? sessionId
		: null;
}

/**
 * Session ids of chat panes already present in the layout — the chat analogue
 * of `getAttachedTerminalIdsKey`.
 */
export function getAttachedChatSessionIds(
	tabs: readonly WorkspaceTabLike[],
): string[] {
	const ids = new Set<string>();
	for (const tab of tabs) {
		for (const pane of Object.values(tab.panes)) {
			if (pane.kind !== "chat") continue;
			const sessionId = getSessionIdFromPaneData(pane.data);
			if (sessionId) ids.add(sessionId);
		}
	}
	return [...ids];
}
