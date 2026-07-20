import type { WorkspaceStore } from "@superset/panes";
import { workspaceTrpc } from "@superset/workspace-client";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useEffect, useMemo, useRef } from "react";
import { logStressEvent } from "renderer/lib/performance/stress-instrumentation";
import { getTerminalBackgroundMarkerIdsKey } from "renderer/lib/terminal/terminal-background-intents";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { StoreApi } from "zustand/vanilla";
import {
	getAttachedTerminalIdsKey,
	parseAttachedTerminalIdsKey,
} from "../../components/BackgroundTerminalsButton/BackgroundTerminalsButton.utils";
import type { PaneViewerData } from "../../types";
import { focusOrAddChatPane } from "../../utils/focusChatPane";
import { focusOrAddTerminalPane } from "../../utils/focusTerminalPane";
import {
	getAttachedChatSessionIds,
	resolveAutoAdoptLaunches,
} from "./resolveAutoAdoptLaunches";

interface UseAutoAdoptBackgroundSessionsArgs {
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	workspaceId: string;
	isLayoutReady: boolean;
}

function toTimestamp(value: unknown): number {
	if (typeof value === "number") return value;
	if (value instanceof Date) return value.getTime();
	if (typeof value === "string") {
		const parsed = new Date(value).getTime();
		return Number.isNaN(parsed) ? 0 : parsed;
	}
	return 0;
}

/**
 * When a workspace is created or opened, running agent sessions that have no
 * pane get their panes created automatically instead of being stranded —
 * terminal sessions behind the background-terminals dropdown, and chat
 * (`superset`) sessions with no surface at all. This bridges the gap for
 * workspaces launched outside the desktop create flow (e.g. `superset
 * workspaces create --agent … --prompt …` from the CLI), which never writes a
 * pane layout of its own.
 *
 * One pass per workspace open, gated on pane-layout hydration and session
 * readiness (adopting earlier would duplicate panes the persisted layout
 * already has, or get clobbered by it). Deliberately backgrounded terminal
 * sessions (marker set) are skipped and never re-adopted mid-session.
 */
export function useAutoAdoptBackgroundSessions({
	store,
	workspaceId,
	isLayoutReady,
}: UseAutoAdoptBackgroundSessionsArgs): void {
	const adoptedForWorkspaceIdRef = useRef<string | null>(null);
	const collections = useCollections();
	const sessionsQuery = workspaceTrpc.terminal.listSessions.useQuery(
		{ workspaceId },
		{ enabled: isLayoutReady, refetchOnWindowFocus: false },
	);
	const sessions = sessionsQuery.data?.sessions;
	// While a refetch is in flight, data may be a stale cached list from a
	// previous open — don't let the one-shot pass latch on it.
	const isFetchingSessions = sessionsQuery.isFetching;

	const { data: chatSessionRows, isReady: chatSessionsReady } = useLiveQuery(
		(q) =>
			q
				.from({ chatSessions: collections.chatSessions })
				.where(({ chatSessions }) =>
					eq(chatSessions.v2WorkspaceId, workspaceId),
				),
		[collections, workspaceId],
	);
	const chatSessions = useMemo(
		() =>
			(chatSessionRows ?? []).map((row) => ({
				id: row.id,
				createdAt: toTimestamp(row.createdAt),
			})),
		[chatSessionRows],
	);

	useEffect(() => {
		if (!isLayoutReady || !sessions || isFetchingSessions) return;
		// Adoption is a one-shot write, so wait for strict readiness of both
		// session sources before deciding what to fold in.
		if (!chatSessionsReady) return;
		if (adoptedForWorkspaceIdRef.current === workspaceId) return;
		adoptedForWorkspaceIdRef.current = workspaceId;

		const state = store.getState();
		const launches = resolveAutoAdoptLaunches({
			terminalSessions: sessions,
			chatSessions,
			attachedTerminalIds: parseAttachedTerminalIdsKey(
				getAttachedTerminalIdsKey(state.tabs),
			),
			attachedChatSessionIds: getAttachedChatSessionIds(state.tabs),
			markedTerminalIds: parseAttachedTerminalIdsKey(
				getTerminalBackgroundMarkerIdsKey(workspaceId),
			),
		});
		if (launches.length === 0) return;

		// Restore the previously active tab so adoption never steals focus from
		// an existing layout; an empty workspace has none, so the freshly folded
		// agent pane becomes foreground.
		const restoreActiveTabId = state.tabs.length > 0 ? state.activeTabId : null;
		for (const launch of launches) {
			if (launch.kind === "terminal") {
				focusOrAddTerminalPane(store, launch.id);
			} else {
				focusOrAddChatPane(store, launch.id);
			}
		}
		if (restoreActiveTabId) {
			store.getState().setActiveTab(restoreActiveTabId);
		}
		logStressEvent("background-terminals.auto-adopt", {
			count: launches.length,
			workspaceId,
		});
	}, [
		isLayoutReady,
		isFetchingSessions,
		sessions,
		chatSessions,
		chatSessionsReady,
		store,
		workspaceId,
	]);
}
