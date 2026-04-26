import type { WorkspaceStore } from "@superset/panes";
import { useEffect, useRef } from "react";
import type { StoreApi } from "zustand/vanilla";
import type {
	ChatPaneData,
	PaneViewerData,
	TerminalPaneData,
} from "../../types";

interface UseConsumeAutomationRunLinkArgs {
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
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
	terminalId,
	chatSessionId,
	focusRequestId,
}: UseConsumeAutomationRunLinkArgs): void {
	const consumedRef = useRef<Set<string>>(new Set());

	useEffect(() => {
		if (!terminalId) return;
		const key = getAutomationRunLinkConsumeKey({
			type: "terminal",
			id: terminalId,
			focusRequestId,
		});
		if (consumedRef.current.has(key)) return;
		consumedRef.current.add(key);
		focusOrAddTerminalPane(store, terminalId);
	}, [store, terminalId, focusRequestId]);

	useEffect(() => {
		if (!chatSessionId) return;
		const key = getAutomationRunLinkConsumeKey({
			type: "chat",
			id: chatSessionId,
			focusRequestId,
		});
		if (consumedRef.current.has(key)) return;
		consumedRef.current.add(key);
		focusOrAddChatPane(store, chatSessionId);
	}, [store, chatSessionId, focusRequestId]);
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

function focusOrAddTerminalPane(
	store: StoreApi<WorkspaceStore<PaneViewerData>>,
	terminalId: string,
): void {
	const state = store.getState();
	for (const tab of state.tabs) {
		for (const pane of Object.values(tab.panes)) {
			if (pane.kind !== "terminal") continue;
			const data = pane.data as TerminalPaneData;
			if (data.terminalId === terminalId) {
				state.setActiveTab(tab.id);
				state.setActivePane({ tabId: tab.id, paneId: pane.id });
				return;
			}
		}
	}
	state.addTab({
		panes: [
			{
				kind: "terminal",
				data: { terminalId } as PaneViewerData,
			},
		],
	});
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
