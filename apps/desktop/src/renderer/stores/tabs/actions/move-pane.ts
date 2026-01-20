import type { MosaicNode } from "react-mosaic-component";
import type { Pane, Tab, TabsState } from "../types";
import {
	addPaneToLayout,
	extractPaneIdsFromLayout,
	generateId,
	generateTabName,
	getFirstPaneId,
	isLastPaneInTab,
	removePaneFromLayout,
	updateHistoryStack,
} from "../utils";

interface MovePaneResult {
	tabs: Tab[];
	panes: Record<string, Pane>;
	activeTabIds: Record<string, string | null>;
	focusedPaneIds: Record<string, string>;
	tabHistoryStacks: Record<string, string[]>;
}

export function movePaneToTab(
	state: TabsState,
	paneId: string,
	targetTabId: string,
): MovePaneResult | null {
	const pane = state.panes[paneId];
	if (!pane) return null;

	const sourceTab = state.tabs.find((t) => t.id === pane.tabId);
	const targetTab = state.tabs.find((t) => t.id === targetTabId);
	if (
		!sourceTab ||
		!targetTab ||
		sourceTab.id === targetTabId ||
		sourceTab.workspaceId !== targetTab.workspaceId
	)
		return null;

	// Defense in depth: Check for duplicate pane in target tab
	const targetPaneIds = extractPaneIdsFromLayout(targetTab.layout);
	if (targetPaneIds.includes(paneId)) {
		console.warn("[move-pane] Attempted to add duplicate pane:", paneId);
		return null;
	}

	const isLastPane = isLastPaneInTab(state.panes, sourceTab.id);
	const newSourceLayout = removePaneFromLayout(sourceTab.layout, paneId);
	const newTargetLayout = addPaneToLayout(targetTab.layout, paneId);
	const workspaceId = sourceTab.workspaceId;

	const newTabs = isLastPane
		? state.tabs
				.filter((t) => t.id !== sourceTab.id)
				.map((t) =>
					t.id === targetTabId ? { ...t, layout: newTargetLayout } : t,
				)
		: state.tabs.map((t) => {
				if (t.id === sourceTab.id && newSourceLayout)
					return { ...t, layout: newSourceLayout };
				if (t.id === targetTabId) return { ...t, layout: newTargetLayout };
				return t;
			});

	const newFocusedPaneIds = { ...state.focusedPaneIds };
	if (isLastPane) {
		delete newFocusedPaneIds[sourceTab.id];
	} else if (state.focusedPaneIds[sourceTab.id] === paneId && newSourceLayout) {
		newFocusedPaneIds[sourceTab.id] = getFirstPaneId(newSourceLayout);
	}
	newFocusedPaneIds[targetTabId] = paneId;

	return {
		tabs: newTabs,
		panes: {
			...state.panes,
			[paneId]: { ...pane, tabId: targetTabId },
		},
		activeTabIds: { ...state.activeTabIds, [workspaceId]: targetTabId },
		focusedPaneIds: newFocusedPaneIds,
		tabHistoryStacks: {
			...state.tabHistoryStacks,
			[workspaceId]: updateHistoryStack(
				state.tabHistoryStacks[workspaceId] || [],
				state.activeTabIds[workspaceId] ?? null,
				targetTabId,
				isLastPane ? sourceTab.id : undefined,
			),
		},
	};
}

export function movePaneToNewTab(
	state: TabsState,
	paneId: string,
): { result: MovePaneResult; newTabId: string } | null {
	const pane = state.panes[paneId];
	if (!pane) return null;

	const sourceTab = state.tabs.find((t) => t.id === pane.tabId);
	if (!sourceTab) return null;

	// Already in its own tab
	if (isLastPaneInTab(state.panes, sourceTab.id)) {
		return null;
	}

	const workspaceId = sourceTab.workspaceId;
	const newSourceLayout = removePaneFromLayout(sourceTab.layout, paneId);
	const newTabId = generateId("tab");
	const workspaceTabs = state.tabs.filter((t) => t.workspaceId === workspaceId);

	const newTab: Tab = {
		id: newTabId,
		name: generateTabName(workspaceTabs),
		workspaceId,
		layout: paneId as MosaicNode<string>,
		createdAt: Date.now(),
	};

	const newTabs = state.tabs.map((t) =>
		t.id === sourceTab.id && newSourceLayout
			? { ...t, layout: newSourceLayout }
			: t,
	);
	newTabs.push(newTab);

	const newFocusedPaneIds = { ...state.focusedPaneIds };
	if (state.focusedPaneIds[sourceTab.id] === paneId && newSourceLayout) {
		newFocusedPaneIds[sourceTab.id] = getFirstPaneId(newSourceLayout);
	}
	newFocusedPaneIds[newTabId] = paneId;

	return {
		result: {
			tabs: newTabs,
			panes: { ...state.panes, [paneId]: { ...pane, tabId: newTabId } },
			activeTabIds: { ...state.activeTabIds, [workspaceId]: newTabId },
			focusedPaneIds: newFocusedPaneIds,
			tabHistoryStacks: {
				...state.tabHistoryStacks,
				[workspaceId]: updateHistoryStack(
					state.tabHistoryStacks[workspaceId] || [],
					state.activeTabIds[workspaceId] ?? null,
					newTabId,
				),
			},
		},
		newTabId,
	};
}
