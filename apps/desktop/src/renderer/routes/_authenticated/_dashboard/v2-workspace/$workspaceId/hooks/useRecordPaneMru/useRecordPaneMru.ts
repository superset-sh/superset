import {
	type PaneRegistry,
	resolveTabTitle,
	type WorkspaceStore,
} from "@superset/panes";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useEffect, useMemo, useRef } from "react";
import { useTerminalAgentBindings } from "renderer/hooks/host-service/useTerminalAgentBindings";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { entryKey, usePaneMruStore } from "renderer/stores/pane-mru";
import type { StoreApi } from "zustand";
import type { PaneViewerData, TerminalPaneData } from "../../types";
import { resolvePaneAgentId } from "./resolvePaneAgentId";
import { resolvePaneLabel } from "./resolvePaneLabel";

/**
 * Feeds the global most-recently-used (MRU) pane list while this workspace is
 * mounted.
 *
 * Every time the focused pane changes, the pane moves to the front of the
 * list that the Ctrl+Tab switcher reads. Only the currently-routed workspace
 * records — other workspaces contribute entries recorded while they were
 * themselves mounted, which is why the entry carries its own label and
 * workspace name rather than resolving them on read.
 */
export function useRecordPaneMru({
	store,
	workspaceId,
	workspaceName,
	paneRegistry,
}: {
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	workspaceId: string;
	workspaceName: string;
	paneRegistry: PaneRegistry<PaneViewerData>;
}) {
	const collections = useCollections();
	const recordFocus = usePaneMruStore((state) => state.recordFocus);

	// Which agent (if any) the host-service tracker has detected in each
	// terminal, so a row can show the real Claude/Codex logo rather than a
	// generic glyph.
	const agentBindings = useTerminalAgentBindings(workspaceId);

	// Project and workspace names are NOT recorded here. Both are readable for
	// every workspace from the dashboard, so the overlay resolves them live
	// (see useLiveEntryNames) — recording them would just freeze a name that a
	// later rename could never reach.

	// Chat panes report a static "Chat" title; their real name is the chat
	// session's title, which lives in this collection.
	const { data: chatSessionRows = [] } = useLiveQuery(
		(query) =>
			query
				.from({ chatSessions: collections.chatSessions })
				.where(({ chatSessions }) =>
					eq(chatSessions.v2WorkspaceId, workspaceId),
				)
				.select(({ chatSessions }) => ({
					id: chatSessions.id,
					title: chatSessions.title,
				})),
		[collections.chatSessions, workspaceId],
	);

	const chatTitlesBySessionId = useMemo(() => {
		const map = new Map<string, string>();
		for (const row of chatSessionRows) {
			if (row.id && row.title) map.set(row.id, row.title);
		}
		return map;
	}, [chatSessionRows]);

	// Read the moving parts through a ref so the store subscription is set up
	// once per workspace instead of being torn down every time a chat session
	// is renamed.
	const latest = useRef({
		workspaceId,
		workspaceName,
		agentBindings,
		paneRegistry,
		chatTitlesBySessionId,
		recordFocus,
	});
	latest.current = {
		workspaceId,
		workspaceName,
		agentBindings,
		paneRegistry,
		chatTitlesBySessionId,
		recordFocus,
	};

	// `record` is stored so a second effect can re-run it when the data it
	// reads through `latest` changes. Without that, a chat title or agent
	// binding that resolves AFTER the pane was focused never reaches the
	// store: the subscriptions below only fire on pane-store and title-source
	// emissions, neither of which happen when those async values arrive.
	const recordRef = useRef<() => void>(() => {});

	useEffect(() => {
		const lastRecorded: {
			key: string;
			label: string;
			tabLabel: string;
			agentId: string | undefined;
		} = { key: "", label: "", tabLabel: "", agentId: undefined };

		// A pane's live title (a terminal's running command, say) is published
		// through its `titleSource`, NOT through the workspace store — so the
		// store never emits when it changes. Without following that source, a
		// terminal focused before its title arrives stays labelled "Terminal"
		// forever. Track a subscription to whichever pane is focused.
		let titleSubscription: { key: string; unsubscribe: () => void } | null =
			null;

		const clearTitleSubscription = () => {
			titleSubscription?.unsubscribe();
			titleSubscription = null;
		};

		const recordFocusedPane = () => {
			const {
				workspaceId: currentWorkspaceId,
				workspaceName: currentWorkspaceName,
				agentBindings: bindings,
				paneRegistry: registry,
				chatTitlesBySessionId: chatTitles,
				recordFocus: recordEntry,
			} = latest.current;

			const state = store.getState();
			const { activeTabId } = state;
			if (!activeTabId) return;

			const tab = state.tabs.find((candidate) => candidate.id === activeTabId);
			if (!tab) return;

			const paneId = tab.activePaneId;
			const pane = paneId ? tab.panes[paneId] : undefined;
			if (!pane) {
				clearTitleSubscription();
				return;
			}

			const paneKey = entryKey({
				workspaceId: currentWorkspaceId,
				paneId: pane.id,
			});
			if (titleSubscription?.key !== paneKey) {
				clearTitleSubscription();
				const titleSource = registry[pane.kind]?.titleSource?.(pane);
				if (titleSource) {
					titleSubscription = {
						key: paneKey,
						unsubscribe: titleSource.subscribe(() => recordFocusedPane()),
					};
				}
			}

			const label = resolvePaneLabel({
				pane,
				registry,
				chatTitlesBySessionId: chatTitles,
			});
			const tabLabel = resolveTabTitle(tab, state.tabs, registry);
			const terminalId =
				pane.kind === "terminal"
					? (pane.data as TerminalPaneData).terminalId
					: undefined;
			const agentId = resolvePaneAgentId({
				pane,
				// Falls back to the title when no lifecycle binding exists, so
				// pass the resolved label rather than the raw pane data.
				label: label || tabLabel,
				agentBindings: bindings,
			});
			const key = paneKey;

			// The store emits on every layout change — resizes, data updates,
			// unrelated tabs. Skip the ones that would not change the list.
			if (
				key === lastRecorded.key &&
				label === lastRecorded.label &&
				tabLabel === lastRecorded.tabLabel &&
				agentId === lastRecorded.agentId
			) {
				return;
			}
			lastRecorded.key = key;
			lastRecorded.label = label;
			lastRecorded.tabLabel = tabLabel;
			lastRecorded.agentId = agentId;

			recordEntry({
				workspaceId: currentWorkspaceId,
				tabId: tab.id,
				paneId: pane.id,
				kind: pane.kind,
				label,
				tabLabel,
				workspaceName: currentWorkspaceName,
				agentId,
				terminalId,
				lastFocusedAt: Date.now(),
			});
		};

		recordRef.current = recordFocusedPane;

		// Record whatever is already showing, so opening a workspace counts as
		// using it even if the user touches nothing.
		recordFocusedPane();
		const unsubscribeStore = store.subscribe(recordFocusedPane);
		return () => {
			unsubscribeStore();
			clearTitleSubscription();
		};
	}, [store]);

	// Re-record when late-arriving data changes what the entry should say: a
	// chat session title that loads after focus, an agent binding the tracker
	// resolves later, or a workspace rename. The `lastRecorded` guard inside
	// `record` makes this a no-op when nothing actually differs.
	useEffect(() => {
		recordRef.current();
	}, []);
}
