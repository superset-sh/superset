import type { WorkspaceStore } from "@superset/panes";
import { workspaceTrpc } from "@superset/workspace-client";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useEffect, useRef } from "react";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { StoreApi } from "zustand/vanilla";
import type { ChatPaneData, PaneViewerData } from "../../types";
import { focusOrAddTerminalPane } from "../../utils/focusTerminalPane";

interface UseConsumeAutomationRunLinkArgs {
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	workspaceId: string;
	terminalId: string | undefined;
	chatSessionId: string | undefined;
	focusRequestId: string | undefined;
}

/**
 * When the workspace is opened via a deep link from an automation run
 * (`?terminalId=...` or `?chatSessionId=...`), ensure the corresponding pane
 * is present and focused. The underlying session already exists on the
 * host-service from the dispatcher — we just re-adopt it in the pane store.
 */
export function useConsumeAutomationRunLink({
	store,
	workspaceId,
	terminalId,
	chatSessionId,
	focusRequestId,
}: UseConsumeAutomationRunLinkArgs): void {
	const consumedRef = useRef<Set<string>>(new Set());
	const collections = useCollections();
	const terminalSessionsQuery = workspaceTrpc.terminal.listSessions.useQuery(
		{ workspaceId },
		{
			enabled: terminalId != null,
			refetchOnWindowFocus: false,
		},
	);
	const { data: chatSessionRows, isReady: chatSessionsReady } = useLiveQuery(
		(q) =>
			q
				.from({ chatSessions: collections.chatSessions })
				.where(({ chatSessions }) => eq(chatSessions.id, chatSessionId ?? "")),
		[collections, chatSessionId],
	);
	const chatSession = chatSessionRows?.[0] ?? null;

	useEffect(() => {
		if (!terminalId) return;
		if (!terminalSessionsQuery.isSuccess) return;
		const key = getAutomationRunLinkConsumeKey({
			type: "terminal",
			id: terminalId,
			focusRequestId,
		});
		if (consumedRef.current.has(key)) return;
		consumedRef.current.add(key);
		if (
			!terminalSessionBelongsToWorkspace({
				sessions: terminalSessionsQuery.data.sessions,
				terminalId,
				workspaceId,
			})
		) {
			console.warn(
				"[automation-run-link] Ignoring terminal link for another workspace",
				{ terminalId, workspaceId },
			);
			return;
		}
		focusOrAddTerminalPane(store, terminalId);
	}, [
		store,
		terminalId,
		focusRequestId,
		terminalSessionsQuery.isSuccess,
		terminalSessionsQuery.data,
		workspaceId,
	]);

	useEffect(() => {
		if (!chatSessionId) return;
		if (!chatSessionsReady) return;
		if (!chatSession) return;
		const key = getAutomationRunLinkConsumeKey({
			type: "chat",
			id: chatSessionId,
			focusRequestId,
		});
		if (consumedRef.current.has(key)) return;
		consumedRef.current.add(key);
		if (!chatSessionBelongsToWorkspace({ chatSession, workspaceId })) {
			console.warn(
				"[automation-run-link] Ignoring chat link for another workspace",
				{ chatSessionId, workspaceId },
			);
			return;
		}
		focusOrAddChatPane(store, chatSessionId);
	}, [
		store,
		chatSessionId,
		focusRequestId,
		chatSession,
		chatSessionsReady,
		workspaceId,
	]);
}

export function getAutomationRunLinkConsumeKey({
	type,
	id,
	focusRequestId,
}: {
	type: "terminal" | "chat";
	id: string;
	focusRequestId: string | undefined;
}): string {
	return focusRequestId
		? `${type}:${id}:focus:${focusRequestId}`
		: `${type}:${id}`;
}

export function terminalSessionBelongsToWorkspace({
	sessions,
	terminalId,
	workspaceId,
}: {
	sessions: Array<{ terminalId: string; workspaceId: string }>;
	terminalId: string;
	workspaceId: string;
}): boolean {
	return sessions.some(
		(session) =>
			session.terminalId === terminalId && session.workspaceId === workspaceId,
	);
}

export function chatSessionBelongsToWorkspace({
	chatSession,
	workspaceId,
}: {
	chatSession: { v2WorkspaceId: string | null } | null;
	workspaceId: string;
}): boolean {
	return chatSession?.v2WorkspaceId === workspaceId;
}

function focusOrAddChatPane(
	store: StoreApi<WorkspaceStore<PaneViewerData>>,
	sessionId: string,
): void {
	const state = store.getState();
	for (const tab of state.tabs) {
		for (const pane of Object.values(tab.panes)) {
			if (pane.kind !== "chat") continue;
			const data = pane.data as ChatPaneData;
			if (data.sessionId === sessionId) {
				state.setActiveTab(tab.id);
				state.setActivePane({ tabId: tab.id, paneId: pane.id });
				return;
			}
		}
	}
	state.addTab({
		panes: [
			{
				kind: "chat",
				data: { sessionId } as PaneViewerData,
			},
		],
	});
}
