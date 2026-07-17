import type { WorkspaceStore } from "@superset/panes";
import { workspaceTrpc } from "@superset/workspace-client";
import { useEffect, useRef } from "react";
import { logStressEvent } from "renderer/lib/performance/stress-instrumentation";
import { getTerminalBackgroundMarkerIdsKey } from "renderer/lib/terminal/terminal-background-intents";
import type { StoreApi } from "zustand/vanilla";
import {
	getAttachedTerminalIdsKey,
	getBackgroundTerminalSessions,
	parseAttachedTerminalIdsKey,
} from "../../components/BackgroundTerminalsButton/BackgroundTerminalsButton.utils";
import type { PaneViewerData } from "../../types";
import { focusOrAddTerminalPane } from "../../utils/focusTerminalPane";

interface UseAutoAdoptBackgroundSessionsArgs {
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	workspaceId: string;
	isLayoutReady: boolean;
}

/**
 * When a workspace is created or opened, running terminal daemon sessions
 * that have no pane get their panes created automatically instead of sitting
 * behind the background-terminals dropdown.
 *
 * One pass per workspace open, gated on pane-layout hydration (adopting
 * earlier would duplicate panes the persisted layout already has, or get
 * clobbered by it). Deliberately backgrounded sessions (marker set) are
 * skipped and never re-adopted mid-session.
 */
export function useAutoAdoptBackgroundSessions({
	store,
	workspaceId,
	isLayoutReady,
}: UseAutoAdoptBackgroundSessionsArgs): void {
	const adoptedForWorkspaceIdRef = useRef<string | null>(null);
	const sessionsQuery = workspaceTrpc.terminal.listSessions.useQuery(
		{ workspaceId },
		{ enabled: isLayoutReady, refetchOnWindowFocus: false },
	);
	const sessions = sessionsQuery.data?.sessions;
	// While a refetch is in flight, data may be a stale cached list from a
	// previous open — don't let the one-shot pass latch on it.
	const isFetchingSessions = sessionsQuery.isFetching;

	useEffect(() => {
		if (!isLayoutReady || !sessions || isFetchingSessions) return;
		if (adoptedForWorkspaceIdRef.current === workspaceId) return;
		adoptedForWorkspaceIdRef.current = workspaceId;

		const state = store.getState();
		const marked = new Set(
			parseAttachedTerminalIdsKey(
				getTerminalBackgroundMarkerIdsKey(workspaceId),
			),
		);
		const toAdopt = getBackgroundTerminalSessions(
			sessions,
			parseAttachedTerminalIdsKey(getAttachedTerminalIdsKey(state.tabs)),
		).filter((session) => !marked.has(session.terminalId));
		if (toAdopt.length === 0) return;

		// Oldest→newest so tabs read chronologically; restore the active tab so
		// adoption never steals focus.
		const restoreActiveTabId = state.tabs.length > 0 ? state.activeTabId : null;
		for (const session of toAdopt.reverse()) {
			focusOrAddTerminalPane(store, session.terminalId);
		}
		if (restoreActiveTabId) {
			store.getState().setActiveTab(restoreActiveTabId);
		}
		logStressEvent("background-terminals.auto-adopt", {
			count: toAdopt.length,
			workspaceId,
		});
	}, [isLayoutReady, isFetchingSessions, sessions, store, workspaceId]);
}
