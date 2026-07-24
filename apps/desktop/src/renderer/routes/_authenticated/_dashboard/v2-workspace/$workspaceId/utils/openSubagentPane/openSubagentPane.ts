import {
	getSpatialNeighborPaneId,
	type WorkspaceState,
	type WorkspaceStore,
} from "@superset/panes";
import type { StoreApi } from "zustand/vanilla";
import type { PaneViewerData, SubagentPaneData } from "../../types";

interface SubagentPaneLocation {
	tabId: string;
	paneId: string;
}

export type OpenSubagentPaneResult = "focused" | "opened-right" | "stacked";

function isSubagentPaneData(data: unknown): data is SubagentPaneData {
	if (typeof data !== "object" || data === null) return false;
	const record = data as Record<string, unknown>;
	return (
		typeof record.parentSessionId === "string" &&
		typeof record.parentPaneId === "string" &&
		typeof record.toolCallId === "string"
	);
}

function matchesParentColumn(
	data: SubagentPaneData,
	parentPaneId: string,
	parentSessionId: string,
): boolean {
	return (
		data.parentPaneId === parentPaneId &&
		data.parentSessionId === parentSessionId
	);
}

export function findSubagentPaneLocation(
	state: WorkspaceState<PaneViewerData>,
	toolCallId: string,
): SubagentPaneLocation | null {
	for (const tab of state.tabs) {
		for (const pane of Object.values(tab.panes)) {
			if (pane.kind !== "subagent") continue;
			if (!isSubagentPaneData(pane.data)) continue;
			if (pane.data.toolCallId !== toolCallId) continue;
			return { tabId: tab.id, paneId: pane.id };
		}
	}
	return null;
}

function findBottommostSubagentInColumn(
	state: WorkspaceState<PaneViewerData>,
	tabId: string,
	startPaneId: string,
	parentPaneId: string,
	parentSessionId: string,
): string {
	const tab = state.tabs.find((candidate) => candidate.id === tabId);
	if (!tab?.layout) return startPaneId;

	let current = startPaneId;
	while (true) {
		const downId = getSpatialNeighborPaneId(tab.layout, current, "down");
		if (!downId) return current;
		const downPane = tab.panes[downId];
		if (downPane?.kind !== "subagent" || !isSubagentPaneData(downPane.data)) {
			return current;
		}
		if (!matchesParentColumn(downPane.data, parentPaneId, parentSessionId)) {
			return current;
		}
		current = downId;
	}
}

function findRightSubagentColumnRoot(
	state: WorkspaceState<PaneViewerData>,
	tabId: string,
	parentPaneId: string,
	parentSessionId: string,
): string | null {
	const tab = state.tabs.find((candidate) => candidate.id === tabId);
	if (!tab?.layout) return null;

	const rightId = getSpatialNeighborPaneId(tab.layout, parentPaneId, "right");
	if (!rightId) return null;

	const rightPane = tab.panes[rightId];
	if (rightPane?.kind !== "subagent" || !isSubagentPaneData(rightPane.data)) {
		return null;
	}
	if (!matchesParentColumn(rightPane.data, parentPaneId, parentSessionId)) {
		return null;
	}
	return rightId;
}

export function openSubagentPane(
	store: StoreApi<WorkspaceStore<PaneViewerData>>,
	input: {
		tabId: string;
		parentPaneId: string;
		parentSessionId: string;
		toolCallId: string;
		task?: string;
		agentType?: string;
	},
): OpenSubagentPaneResult {
	const state = store.getState();
	const existing = findSubagentPaneLocation(state, input.toolCallId);
	if (existing) {
		state.setActiveTab(existing.tabId);
		state.setActivePane(existing);
		return "focused";
	}

	const newPane = {
		kind: "subagent" as const,
		titleOverride:
			input.agentType?.trim() ||
			(input.task?.trim() ? input.task.trim().slice(0, 40) : "Subagent"),
		data: {
			parentSessionId: input.parentSessionId,
			parentPaneId: input.parentPaneId,
			toolCallId: input.toolCallId,
			task: input.task,
			agentType: input.agentType,
		} satisfies SubagentPaneData,
	};

	const columnRoot = findRightSubagentColumnRoot(
		state,
		input.tabId,
		input.parentPaneId,
		input.parentSessionId,
	);

	if (columnRoot) {
		const leaf = findBottommostSubagentInColumn(
			state,
			input.tabId,
			columnRoot,
			input.parentPaneId,
			input.parentSessionId,
		);
		store.getState().splitPane({
			tabId: input.tabId,
			paneId: leaf,
			position: "bottom",
			newPane,
			selectNewPane: false,
		});
		return "stacked";
	}

	store.getState().splitPane({
		tabId: input.tabId,
		paneId: input.parentPaneId,
		position: "right",
		newPane,
		selectNewPane: false,
	});
	return "opened-right";
}
