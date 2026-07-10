export const BACKGROUND_TERMINAL_ATTACHMENT_DEBOUNCE_MS = 250;
export const BACKGROUND_TERMINAL_COUNT_REFETCH_INTERVAL_MS = 10_000;
export const BACKGROUND_TERMINAL_LIST_REFETCH_INTERVAL_MS = 2_000;

interface TerminalPaneLike {
	kind: string;
	data: unknown;
}

interface WorkspaceTabLike {
	panes: Record<string, TerminalPaneLike>;
}

export interface BackgroundTerminalSessionLike {
	terminalId: string;
	createdAt?: number;
}

function getTerminalIdFromPaneData(data: unknown): string | null {
	if (!data || typeof data !== "object") return null;
	const terminalId = (data as { terminalId?: unknown }).terminalId;
	return typeof terminalId === "string" && terminalId.length > 0
		? terminalId
		: null;
}

export function getAttachedTerminalIdsKey(
	tabs: readonly WorkspaceTabLike[],
): string {
	const ids = new Set<string>();
	for (const tab of tabs) {
		for (const pane of Object.values(tab.panes)) {
			if (pane.kind !== "terminal") continue;
			const terminalId = getTerminalIdFromPaneData(pane.data);
			if (terminalId) ids.add(terminalId);
		}
	}
	return JSON.stringify([...ids].sort());
}

export function parseAttachedTerminalIdsKey(key: string): string[] {
	try {
		const parsed = JSON.parse(key);
		return Array.isArray(parsed)
			? parsed.filter((value): value is string => typeof value === "string")
			: [];
	} catch {
		return [];
	}
}

export function getBackgroundTerminalSessions<
	T extends BackgroundTerminalSessionLike,
>(sessions: readonly T[], attachedTerminalIds: Iterable<string>): T[] {
	const attached = new Set(attachedTerminalIds);
	return sessions
		.filter((session) => !attached.has(session.terminalId))
		.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

export function getUnattachedTerminalIds(
	terminalIds: Iterable<string>,
	attachedTerminalIds: Iterable<string>,
): string[] {
	const attached = new Set(attachedTerminalIds);
	return [...new Set(terminalIds)]
		.filter((terminalId) => !attached.has(terminalId))
		.sort();
}

export function getBackgroundTerminalCountRefetchInterval(
	isOpen: boolean,
): number | false {
	return isOpen ? false : BACKGROUND_TERMINAL_COUNT_REFETCH_INTERVAL_MS;
}

export function getBackgroundTerminalListRefetchInterval(
	isOpen: boolean,
): number | false {
	return isOpen ? BACKGROUND_TERMINAL_LIST_REFETCH_INTERVAL_MS : false;
}
