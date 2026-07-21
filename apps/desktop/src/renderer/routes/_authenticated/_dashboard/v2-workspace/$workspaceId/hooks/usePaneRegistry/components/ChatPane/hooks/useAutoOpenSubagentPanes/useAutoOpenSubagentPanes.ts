import type { WorkspaceStore } from "@superset/panes";
import { useEffect, useRef } from "react";
import type { StoreApi } from "zustand/vanilla";
import type { PaneViewerData } from "../../../../../../types";
import { openSubagentPane } from "../../../../../../utils/openSubagentPane";
import type { UseChatDisplayReturn } from "../useWorkspaceChatDisplay";

type ChatActiveSubagents = NonNullable<UseChatDisplayReturn["activeSubagents"]>;

function asRecord(value: unknown): Record<string, unknown> | null {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return null;
	}
	return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function listSubagentEntries(
	activeSubagents: ChatActiveSubagents | undefined | null,
): Array<{
	toolCallId: string;
	task?: string;
	agentType?: string;
}> {
	if (!activeSubagents || typeof activeSubagents.entries !== "function") {
		return [];
	}

	const entries: Array<{
		toolCallId: string;
		task?: string;
		agentType?: string;
	}> = [];
	for (const [toolCallId, subagent] of activeSubagents.entries()) {
		if (typeof toolCallId !== "string" || toolCallId.length === 0) continue;
		const record = asRecord(subagent);
		entries.push({
			toolCallId,
			task: asString(record?.task),
			agentType: asString(record?.agentType) ?? asString(record?.displayName),
		});
	}
	return entries;
}

export function useAutoOpenSubagentPanes({
	store,
	tabId,
	parentPaneId,
	sessionId,
	activeSubagents,
}: {
	store: StoreApi<WorkspaceStore<PaneViewerData>> | null;
	tabId: string | null;
	parentPaneId: string | null;
	sessionId: string | null;
	activeSubagents: ChatActiveSubagents | undefined | null;
}) {
	const openedToolCallIdsRef = useRef(new Set<string>());

	useEffect(() => {
		openedToolCallIdsRef.current.clear();
	}, []);

	useEffect(() => {
		if (!store || !tabId || !parentPaneId || !sessionId) return;

		for (const entry of listSubagentEntries(activeSubagents)) {
			if (openedToolCallIdsRef.current.has(entry.toolCallId)) continue;
			openedToolCallIdsRef.current.add(entry.toolCallId);
			openSubagentPane(store, {
				tabId,
				parentPaneId,
				parentSessionId: sessionId,
				toolCallId: entry.toolCallId,
				task: entry.task,
				agentType: entry.agentType,
			});
		}
	}, [activeSubagents, parentPaneId, sessionId, store, tabId]);
}
