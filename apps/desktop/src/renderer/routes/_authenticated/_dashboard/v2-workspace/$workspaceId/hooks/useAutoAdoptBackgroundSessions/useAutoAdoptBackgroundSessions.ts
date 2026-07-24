import type { WorkspaceStore } from "@superset/panes";
import { workspaceTrpc } from "@superset/workspace-client";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useEffect } from "react";
import { logStressEvent } from "renderer/lib/performance/stress-instrumentation";
import { getTerminalBackgroundMarkerIdsKey } from "renderer/lib/terminal/terminal-background-intents";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { StoreApi } from "zustand/vanilla";
import {
	getAttachedTerminalIdsKey,
	getBackgroundTerminalSessions,
	parseAttachedTerminalIdsKey,
} from "../../components/BackgroundTerminalsButton/BackgroundTerminalsButton.utils";
import type { PaneViewerData } from "../../types";
import { focusOrAddChatPane } from "../../utils/focusChatPane";
import { focusOrAddTerminalPane } from "../../utils/focusTerminalPane";

interface UseAutoAdoptBackgroundSessionsArgs {
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	workspaceId: string;
	isLayoutReady: boolean;
}

/**
 * When a workspace is opened, running terminal daemon sessions that have no
 * pane get their panes created automatically instead of sitting behind the
 * background-terminals dropdown — this is the only surface for sessions
 * launched outside the desktop (e.g. `superset workspaces create --agent …`
 * from the CLI, which writes no pane layout of its own).
 *
 * Gated on pane-layout hydration so the attached-pane check runs against the
 * real layout, not an empty store. The adoption itself is idempotent —
 * already-attached panes are filtered out and re-adoption just focuses the
 * existing pane — so it reruns freely as the session list settles. That's
 * what lets a session that lands slightly after open (a CLI race, a poll
 * refresh) still get a pane, instead of being stranded by a one-shot pass
 * that fired on a premature or empty list. Deliberately backgrounded sessions
 * (marker set) are always skipped.
 */
export function useAutoAdoptBackgroundSessions({
	store,
	workspaceId,
	isLayoutReady,
}: UseAutoAdoptBackgroundSessionsArgs): void {
	const collections = useCollections();
	const workspaceQuery = workspaceTrpc.workspace.get.useQuery(
		{ id: workspaceId },
		{ enabled: isLayoutReady },
	);
	const sessionsQuery = workspaceTrpc.terminal.listSessions.useQuery(
		{ workspaceId },
		{ enabled: isLayoutReady, refetchOnWindowFocus: false },
	);
	const sessions = sessionsQuery.data?.sessions;
	// Don't act on a cached list still being refetched — it may name a session
	// killed while the workspace was closed, which would adopt a ghost pane.
	const isFetchingSessions = sessionsQuery.isFetching;
	const { data: chatSessions = [], isReady: chatSessionsReady } = useLiveQuery(
		(q) =>
			q
				.from({ chatSessions: collections.chatSessions })
				.where(({ chatSessions }) =>
					eq(chatSessions.v2WorkspaceId, workspaceId),
				)
				.select(({ chatSessions }) => ({ id: chatSessions.id })),
		[collections, workspaceId],
	);

	useEffect(() => {
		if (!isLayoutReady || !sessions || isFetchingSessions) return;

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
		for (const session of [...toAdopt].reverse()) {
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

	useEffect(() => {
		if (
			workspaceQuery.data?.type !== "subworkspace" ||
			!isLayoutReady ||
			!chatSessionsReady
		) {
			return;
		}
		const state = store.getState();
		const attachedSessionIds = new Set<string>();
		for (const tab of state.tabs) {
			for (const pane of Object.values(tab.panes)) {
				if (pane.kind !== "chat") continue;
				const sessionId = (pane.data as { sessionId?: string | null })
					.sessionId;
				if (sessionId) attachedSessionIds.add(sessionId);
			}
		}
		const toAdopt = chatSessions.filter(
			(session) => !attachedSessionIds.has(session.id),
		);
		if (toAdopt.length === 0) return;

		const restoreActiveTabId = state.tabs.length > 0 ? state.activeTabId : null;
		for (const session of [...toAdopt].reverse()) {
			focusOrAddChatPane(store, session.id);
		}
		if (restoreActiveTabId) {
			store.getState().setActiveTab(restoreActiveTabId);
		}
	}, [
		chatSessions,
		chatSessionsReady,
		isLayoutReady,
		store,
		workspaceQuery.data?.type,
	]);
}
