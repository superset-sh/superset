import type { V1PaneAgentSession } from "./schemas";

interface PanesLike {
	panes?: Record<string, unknown> | null;
}

/** Keeps sessions whose pane is in any tabs record, shared or per window. */
export function pruneV1AgentSessions(
	sessions: Record<string, V1PaneAgentSession>,
	tabsStates: PanesLike[],
): Record<string, V1PaneAgentSession> {
	return Object.fromEntries(
		Object.entries(sessions).filter(([paneId]) =>
			tabsStates.some((state) => state.panes?.[paneId] !== undefined),
		),
	);
}
