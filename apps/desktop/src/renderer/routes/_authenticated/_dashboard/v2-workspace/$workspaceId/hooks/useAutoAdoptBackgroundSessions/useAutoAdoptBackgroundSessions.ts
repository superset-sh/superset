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
 * Runs exactly one adoption pass per workspace open, after the persisted pane
 * layout has hydrated (adopting earlier would double-create panes the layout
 * already has, or get clobbered by hydration). Sessions the user deliberately
 * backgrounded (marker set) are skipped, and the one-shot guard means a
 * session backgrounded after the pass is never re-adopted.
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
	// While a (re)fetch is in flight, `data` may be a cached list from a
	// previous open — wait for it so the one-shot pass doesn't latch on stale
	// sessions. If the refetch errors, isFetching clears and the cached list is
	// still used as a fallback.
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

		// Adopt oldest→newest so tabs read chronologically, then restore focus so
		// adoption never steals the active tab from an already-open workspace.
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
