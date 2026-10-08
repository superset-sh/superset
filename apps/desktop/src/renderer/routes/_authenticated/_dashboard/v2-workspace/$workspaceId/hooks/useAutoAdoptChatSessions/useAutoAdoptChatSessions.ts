import { presetForAcpHarness } from "@superset/chat/core";
import type { WorkspaceStore } from "@superset/panes";
import { useWorkspaceClient } from "@superset/workspace-client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { useWorkspaceEvent } from "renderer/hooks/host-service/useWorkspaceEvent";
import { useAcpChatEnabled } from "renderer/hooks/useAcpChatEnabled";
import type { StoreApi } from "zustand/vanilla";
import type { ChatPaneData, PaneViewerData } from "../../types";
import { isChatSessionClosed } from "../../utils/closedChatSessions";
import { useChatWiring } from "../usePaneRegistry/components/ChatSession/hooks/useSessionClient";

interface UseAutoAdoptChatSessionsArgs {
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	linkedStores: readonly StoreApi<WorkspaceStore<PaneViewerData>>[];
	workspaceId: string;
	isLayoutReady: boolean;
}

export function useAutoAdoptChatSessions({
	store,
	linkedStores,
	workspaceId,
	isLayoutReady,
}: UseAutoAdoptChatSessionsArgs): void {
	const enabled = useAcpChatEnabled() === "enabled" && isLayoutReady;
	const { hostUrl } = useWorkspaceClient();
	const { transport } = useChatWiring();
	const queryClient = useQueryClient();
	const queryKey = useMemo(
		() => ["chat-v3", hostUrl, "listSessions", workspaceId],
		[hostUrl, workspaceId],
	);
	const sessionsQuery = useQuery({
		queryKey,
		queryFn: () => transport.listSessions({ workspaceId }),
		enabled,
		refetchOnWindowFocus: false,
	});
	const sessions = sessionsQuery.data;
	const isFetchingSessions = sessionsQuery.isFetching;

	useWorkspaceEvent(
		"chat:sessions-changed",
		workspaceId,
		() => {
			void queryClient.invalidateQueries({ queryKey });
		},
		enabled,
	);

	useEffect(() => {
		if (!enabled || !sessions || isFetchingSessions) return;

		const attached = new Set<string>();
		for (const tab of [store, ...linkedStores].flatMap(
			(paneStore) => paneStore.getState().tabs,
		)) {
			for (const pane of Object.values(tab.panes)) {
				if (pane.kind !== "terminal" && pane.kind !== "chat-v3") continue;
				const data = pane.data as Partial<ChatPaneData>;
				if (data.terminalId) attached.add(data.terminalId);
				if (data.sessionId) attached.add(data.sessionId);
			}
		}

		const toAdopt = sessions
			.filter(
				(session) =>
					session.live &&
					!isChatSessionClosed(session.sessionId) &&
					!attached.has(session.sessionId) &&
					!(session.terminalId && attached.has(session.terminalId)) &&
					presetForAcpHarness(session.harness),
			)
			.sort((a, b) => a.updatedAt - b.updatedAt);
		if (toAdopt.length === 0) return;

		const state = store.getState();
		const restoreActiveTabId = state.tabs.length > 0 ? state.activeTabId : null;
		for (const session of toAdopt) {
			const presetId = presetForAcpHarness(session.harness);
			if (!presetId) continue;
			store.getState().addTab({
				panes: [
					{
						kind: "chat-v3",
						data: {
							terminalId: session.terminalId ?? session.sessionId,
							sessionId: session.sessionId,
							agent: {
								id: presetId,
								...(session.harnessSessionId
									? { sessionId: session.harnessSessionId }
									: {}),
							},
							...(session.title ? { chatTitle: session.title } : {}),
						} satisfies ChatPaneData,
					},
				],
			});
		}
		if (restoreActiveTabId) {
			store.getState().setActiveTab(restoreActiveTabId);
		}
	}, [enabled, isFetchingSessions, sessions, store, linkedStores]);
}
