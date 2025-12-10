import type { MosaicNode } from "react-mosaic-component";
import { updateTree } from "react-mosaic-component";
import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import { trpcTabsStorage } from "../../lib/trpc-storage";
import { movePaneToNewTab, movePaneToTab } from "./actions/move-pane";
import type { TabsState, TabsStore } from "./types";
import {
	type CreatePaneOptions,
	createPane,
	createTabWithPane,
	extractPaneIdsFromLayout,
	getFirstPaneId,
	getPaneIdsForTab,
	isLastPaneInTab,
	removePaneFromLayout,
} from "./utils";
import { killTerminalForPane } from "./utils/terminal-cleanup";

/**
 * Finds the next best tab to activate when closing a tab.
 * Priority order:
 * 1. Most recently used tab from history stack
 * 2. Next/previous tab by position
 * 3. Any remaining tab in the workspace
 */
const findNextTab = (state: TabsState, tabIdToClose: string): string | null => {
	const tabToClose = state.tabs.find((t) => t.id === tabIdToClose);
	if (!tabToClose) return null;

	const workspaceId = tabToClose.workspaceId;
	const workspaceTabs = state.tabs.filter(
		(t) => t.workspaceId === workspaceId && t.id !== tabIdToClose,
	);

	if (workspaceTabs.length === 0) return null;

	// Try history first
	const historyStack = state.tabHistoryStacks[workspaceId] || [];
	for (const historyTabId of historyStack) {
		if (historyTabId === tabIdToClose) continue;
		if (workspaceTabs.some((t) => t.id === historyTabId)) {
			return historyTabId;
		}
	}

	// Try position-based (next, then previous)
	const allWorkspaceTabs = state.tabs.filter(
		(t) => t.workspaceId === workspaceId,
	);
	const currentIndex = allWorkspaceTabs.findIndex((t) => t.id === tabIdToClose);

	if (currentIndex !== -1) {
		const nextIndex = currentIndex + 1;
		const prevIndex = currentIndex - 1;

		if (
			nextIndex < allWorkspaceTabs.length &&
			allWorkspaceTabs[nextIndex].id !== tabIdToClose
		) {
			return allWorkspaceTabs[nextIndex].id;
		}
		if (prevIndex >= 0 && allWorkspaceTabs[prevIndex].id !== tabIdToClose) {
			return allWorkspaceTabs[prevIndex].id;
		}
	}

	// Fallback to first available
	return workspaceTabs[0]?.id || null;
};

export const useTabsStore = create<TabsStore>()(
	devtools(
		persist(
			(set, get) => ({
				tabs: [],
				panes: {},
				activeTabIds: {},
				focusedPaneIds: {},
				tabHistoryStacks: {},

				// Tab operations
				addTab: (workspaceId, options?: CreatePaneOptions) => {
					const state = get();
					const { tab, pane } = createTabWithPane(
						workspaceId,
						state.tabs,
						options,
					);

					const currentActiveId = state.activeTabIds[workspaceId];
					const historyStack = state.tabHistoryStacks[workspaceId] || [];
					const newHistoryStack = currentActiveId
						? [
								currentActiveId,
								...historyStack.filter((id) => id !== currentActiveId),
							]
						: historyStack;

					set({
						tabs: [...state.tabs, tab],
						panes: { ...state.panes, [pane.id]: pane },
						activeTabIds: {
							...state.activeTabIds,
							[workspaceId]: tab.id,
						},
						focusedPaneIds: {
							...state.focusedPaneIds,
							[tab.id]: pane.id,
						},
						tabHistoryStacks: {
							...state.tabHistoryStacks,
							[workspaceId]: newHistoryStack,
						},
					});

					return { tabId: tab.id, paneId: pane.id };
				},

				removeTab: (tabId) => {
					const state = get();
					const tabToRemove = state.tabs.find((t) => t.id === tabId);
					if (!tabToRemove) return;

					// Kill all terminals for panes in this tab
					const paneIds = getPaneIdsForTab(state.panes, tabId);
					for (const paneId of paneIds) {
						killTerminalForPane(paneId);
					}

					// Remove all panes belonging to this tab
					const newPanes = { ...state.panes };
					for (const paneId of paneIds) {
						delete newPanes[paneId];
					}

					// Remove tab
					const newTabs = state.tabs.filter((t) => t.id !== tabId);

					// Update active tab if needed
					const workspaceId = tabToRemove.workspaceId;
					const newActiveTabIds = { ...state.activeTabIds };
					const newHistoryStack = (
						state.tabHistoryStacks[workspaceId] || []
					).filter((id) => id !== tabId);

					if (state.activeTabIds[workspaceId] === tabId) {
						newActiveTabIds[workspaceId] = findNextTab(state, tabId);
					}

					// Clean up focused pane tracking
					const newFocusedPaneIds = { ...state.focusedPaneIds };
					delete newFocusedPaneIds[tabId];

					set({
						tabs: newTabs,
						panes: newPanes,
						activeTabIds: newActiveTabIds,
						focusedPaneIds: newFocusedPaneIds,
						tabHistoryStacks: {
							...state.tabHistoryStacks,
							[workspaceId]: newHistoryStack,
						},
					});
				},

				renameTab: (tabId, newName) => {
					set((state) => ({
						tabs: state.tabs.map((t) =>
							t.id === tabId ? { ...t, userTitle: newName } : t,
						),
					}));
				},

				setTabAutoTitle: (tabId, title) => {
					set((state) => ({
						tabs: state.tabs.map((t) =>
							t.id === tabId ? { ...t, name: title } : t,
						),
					}));
				},

				setActiveTab: (workspaceId, tabId) => {
					const state = get();
					const tab = state.tabs.find((t) => t.id === tabId);
					if (!tab || tab.workspaceId !== workspaceId) {
						return;
					}

					const currentActiveId = state.activeTabIds[workspaceId];
					const historyStack = state.tabHistoryStacks[workspaceId] || [];

					let newHistoryStack = historyStack.filter((id) => id !== tabId);
					if (currentActiveId && currentActiveId !== tabId) {
						newHistoryStack = [
							currentActiveId,
							...newHistoryStack.filter((id) => id !== currentActiveId),
						];
					}

					// Clear needsAttention for the focused pane in the tab being activated
					const focusedPaneId = state.focusedPaneIds[tabId];
					const newPanes = { ...state.panes };
					if (focusedPaneId && newPanes[focusedPaneId]?.needsAttention) {
						newPanes[focusedPaneId] = {
							...newPanes[focusedPaneId],
							needsAttention: false,
						};
					}

					set({
						activeTabIds: {
							...state.activeTabIds,
							[workspaceId]: tabId,
						},
						tabHistoryStacks: {
							...state.tabHistoryStacks,
							[workspaceId]: newHistoryStack,
						},
						panes: newPanes,
					});
				},

				reorderTabs: (workspaceId, startIndex, endIndex) => {
					const state = get();
					const workspaceTabs = state.tabs.filter(
						(t) => t.workspaceId === workspaceId,
					);
					const otherTabs = state.tabs.filter(
						(t) => t.workspaceId !== workspaceId,
					);

					// Prevent corrupting state by splicing undefined elements
					if (
						startIndex < 0 ||
						startIndex >= workspaceTabs.length ||
						!Number.isInteger(startIndex)
					) {
						return;
					}

					// Prevent out-of-bounds writes that would insert undefined elements
					const clampedEndIndex = Math.max(
						0,
						Math.min(endIndex, workspaceTabs.length),
					);

					// Avoid mutating original state array to prevent side effects elsewhere
					const reorderedTabs = [...workspaceTabs];
					const [removed] = reorderedTabs.splice(startIndex, 1);
					reorderedTabs.splice(clampedEndIndex, 0, removed);

					set({ tabs: [...otherTabs, ...reorderedTabs] });
				},

				reorderTabById: (tabId, targetIndex) => {
					const state = get();
					const tabToMove = state.tabs.find((t) => t.id === tabId);
					if (!tabToMove) return;

					const workspaceId = tabToMove.workspaceId;
					const workspaceTabs = state.tabs.filter(
						(t) => t.workspaceId === workspaceId,
					);
					const otherTabs = state.tabs.filter(
						(t) => t.workspaceId !== workspaceId,
					);

					const currentIndex = workspaceTabs.findIndex((t) => t.id === tabId);
					if (currentIndex === -1) return;

					workspaceTabs.splice(currentIndex, 1);
					workspaceTabs.splice(targetIndex, 0, tabToMove);

					set({ tabs: [...otherTabs, ...workspaceTabs] });
				},

				updateTabLayout: (tabId, layout) => {
					const state = get();
					const tab = state.tabs.find((t) => t.id === tabId);
					if (!tab) return;

					// Get panes that should exist based on the new layout
					const newPaneIds = new Set(extractPaneIdsFromLayout(layout));
					const oldPaneIds = new Set(extractPaneIdsFromLayout(tab.layout));

					// Find removed panes and clean them up
					const removedPaneIds = Array.from(oldPaneIds).filter(
						(id) => !newPaneIds.has(id),
					);

					const newPanes = { ...state.panes };
					for (const paneId of removedPaneIds) {
						killTerminalForPane(paneId);
						delete newPanes[paneId];
					}

					// Update focused pane if it was removed
					let newFocusedPaneIds = state.focusedPaneIds;
					const currentFocusedPaneId = state.focusedPaneIds[tabId];
					if (
						currentFocusedPaneId &&
						removedPaneIds.includes(currentFocusedPaneId)
					) {
						newFocusedPaneIds = {
							...state.focusedPaneIds,
							[tabId]: getFirstPaneId(layout),
						};
					}

					set({
						tabs: state.tabs.map((t) =>
							t.id === tabId ? { ...t, layout } : t,
						),
						panes: newPanes,
						focusedPaneIds: newFocusedPaneIds,
					});
				},

				// Pane operations
				addPane: (tabId) => {
					const state = get();
					const tab = state.tabs.find((t) => t.id === tabId);
					if (!tab) return "";

					const newPane = createPane(tabId);

					// Add pane to layout (append to the right)
					const newLayout: MosaicNode<string> = {
						direction: "row",
						first: tab.layout,
						second: newPane.id,
						splitPercentage: 50,
					};

					set({
						tabs: state.tabs.map((t) =>
							t.id === tabId ? { ...t, layout: newLayout } : t,
						),
						panes: { ...state.panes, [newPane.id]: newPane },
						focusedPaneIds: {
							...state.focusedPaneIds,
							[tabId]: newPane.id,
						},
					});

					return newPane.id;
				},

				removePane: (paneId) => {
					const state = get();
					const pane = state.panes[paneId];
					if (!pane) return;

					const tab = state.tabs.find((t) => t.id === pane.tabId);
					if (!tab) return;

					// If this is the last pane, remove the entire tab
					if (isLastPaneInTab(state.panes, tab.id)) {
						get().removeTab(tab.id);
						return;
					}

					// Kill the terminal
					killTerminalForPane(paneId);

					// Remove pane from layout
					const newLayout = removePaneFromLayout(tab.layout, paneId);
					if (!newLayout) {
						// This shouldn't happen since we checked isLastPaneInTab
						get().removeTab(tab.id);
						return;
					}

					// Remove pane from panes map
					const newPanes = { ...state.panes };
					delete newPanes[paneId];

					// Update focused pane if needed
					let newFocusedPaneIds = state.focusedPaneIds;
					if (state.focusedPaneIds[tab.id] === paneId) {
						newFocusedPaneIds = {
							...state.focusedPaneIds,
							[tab.id]: getFirstPaneId(newLayout),
						};
					}

					set({
						tabs: state.tabs.map((t) =>
							t.id === tab.id ? { ...t, layout: newLayout } : t,
						),
						panes: newPanes,
						focusedPaneIds: newFocusedPaneIds,
					});
				},

				setFocusedPane: (tabId, paneId) => {
					const state = get();
					const pane = state.panes[paneId];
					if (!pane || pane.tabId !== tabId) return;

					// Clear needsAttention for the pane being focused
					const newPanes = pane.needsAttention
						? {
								...state.panes,
								[paneId]: { ...pane, needsAttention: false },
							}
						: state.panes;

					set({
						focusedPaneIds: {
							...state.focusedPaneIds,
							[tabId]: paneId,
						},
						panes: newPanes,
					});
				},

				markPaneAsUsed: (paneId) => {
					set((state) => ({
						panes: {
							...state.panes,
							[paneId]: state.panes[paneId]
								? { ...state.panes[paneId], isNew: false }
								: state.panes[paneId],
						},
					}));
				},

				setNeedsAttention: (paneId, needsAttention) => {
					set((state) => ({
						panes: {
							...state.panes,
							[paneId]: state.panes[paneId]
								? { ...state.panes[paneId], needsAttention }
								: state.panes[paneId],
						},
					}));
				},

				clearPaneInitialData: (paneId) => {
					set((state) => ({
						panes: {
							...state.panes,
							[paneId]: state.panes[paneId]
								? {
										...state.panes[paneId],
										initialCommands: undefined,
										initialCwd: undefined,
									}
								: state.panes[paneId],
						},
					}));
				},

				// Split operations
				splitPaneVertical: (tabId, sourcePaneId, path) => {
					const state = get();
					const tab = state.tabs.find((t) => t.id === tabId);
					if (!tab) return;

					const sourcePane = state.panes[sourcePaneId];
					if (!sourcePane || sourcePane.tabId !== tabId) return;

					const newPane = createPane(tabId);

					let newLayout: MosaicNode<string>;
					if (path && path.length > 0) {
						// Split at a specific path in the layout
						newLayout = updateTree(tab.layout, [
							{
								path,
								spec: {
									$set: {
										direction: "row",
										first: sourcePaneId,
										second: newPane.id,
										splitPercentage: 50,
									},
								},
							},
						]);
					} else {
						// Split the pane directly
						newLayout = {
							direction: "row",
							first: tab.layout,
							second: newPane.id,
							splitPercentage: 50,
						};
					}

					set({
						tabs: state.tabs.map((t) =>
							t.id === tabId ? { ...t, layout: newLayout } : t,
						),
						panes: { ...state.panes, [newPane.id]: newPane },
						focusedPaneIds: {
							...state.focusedPaneIds,
							[tabId]: newPane.id,
						},
					});
				},

				splitPaneHorizontal: (tabId, sourcePaneId, path) => {
					const state = get();
					const tab = state.tabs.find((t) => t.id === tabId);
					if (!tab) return;

					const sourcePane = state.panes[sourcePaneId];
					if (!sourcePane || sourcePane.tabId !== tabId) return;

					const newPane = createPane(tabId);

					let newLayout: MosaicNode<string>;
					if (path && path.length > 0) {
						// Split at a specific path in the layout
						newLayout = updateTree(tab.layout, [
							{
								path,
								spec: {
									$set: {
										direction: "column",
										first: sourcePaneId,
										second: newPane.id,
										splitPercentage: 50,
									},
								},
							},
						]);
					} else {
						// Split the pane directly
						newLayout = {
							direction: "column",
							first: tab.layout,
							second: newPane.id,
							splitPercentage: 50,
						};
					}

					set({
						tabs: state.tabs.map((t) =>
							t.id === tabId ? { ...t, layout: newLayout } : t,
						),
						panes: { ...state.panes, [newPane.id]: newPane },
						focusedPaneIds: {
							...state.focusedPaneIds,
							[tabId]: newPane.id,
						},
					});
				},

				splitPaneAuto: (tabId, sourcePaneId, dimensions, path) => {
					if (dimensions.width >= dimensions.height) {
						get().splitPaneVertical(tabId, sourcePaneId, path);
					} else {
						get().splitPaneHorizontal(tabId, sourcePaneId, path);
					}
				},

				movePaneToTab: (paneId, targetTabId) => {
					const result = movePaneToTab(get(), paneId, targetTabId);
					if (result) set(result);
				},

				movePaneToNewTab: (paneId) => {
					const state = get();
					const pane = state.panes[paneId];
					if (!pane) return "";

					const sourceTab = state.tabs.find((t) => t.id === pane.tabId);
					if (!sourceTab) return "";

					// Already in its own tab
					if (isLastPaneInTab(state.panes, sourceTab.id)) return sourceTab.id;

					const moveResult = movePaneToNewTab(state, paneId);
					if (!moveResult) return "";

					set(moveResult.result);
					return moveResult.newTabId;
				},

				// Query helpers
				getTabsByWorkspace: (workspaceId) => {
					return get().tabs.filter((t) => t.workspaceId === workspaceId);
				},

				getActiveTab: (workspaceId) => {
					const state = get();
					const activeTabId = state.activeTabIds[workspaceId];
					if (!activeTabId) return null;
					return state.tabs.find((t) => t.id === activeTabId) || null;
				},

				getPanesForTab: (tabId) => {
					const state = get();
					return Object.values(state.panes).filter((p) => p.tabId === tabId);
				},

				getFocusedPane: (tabId) => {
					const state = get();
					const focusedPaneId = state.focusedPaneIds[tabId];
					if (!focusedPaneId) return null;
					return state.panes[focusedPaneId] || null;
				},
			}),
			{
				name: "tabs-storage",
				storage: trpcTabsStorage,
			},
		),
		{ name: "TabsStore" },
	),
);
