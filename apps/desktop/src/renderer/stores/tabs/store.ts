import type { MosaicNode } from "react-mosaic-component";
import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { handleDragTabToTab } from "./drag-logic";
import { type Tab, TabType } from "./types";
import { createNewTab } from "./utils";

interface TabsState {
	// All tabs across all workspaces
	tabs: Tab[];
	// Active tab ID per workspace
	activeTabIds: Record<string, string | null>;
	// Tab history stack per workspace (ordered set - most recent first, no duplicates)
	tabHistoryStacks: Record<string, string[]>;

	// Tab management
	addTab: (workspaceId: string, type?: TabType) => void;
	removeTab: (id: string) => void;
	setActiveTab: (workspaceId: string, tabId: string) => void;
	reorderTabs: (
		workspaceId: string,
		startIndex: number,
		endIndex: number,
	) => void;
	markTabAsUsed: (id: string) => void;

	// Tab group specific actions
	updateTabGroupLayout: (id: string, layout: MosaicNode<string>) => void;
	addChildTabToGroup: (groupId: string, childTabId: string) => void;
	removeChildTabFromGroup: (groupId: string, childTabId: string) => void;

	// Drag and drop actions
	dragTabToTab: (draggedTabId: string, targetTabId: string) => void;

	// Helper to get tabs for a specific workspace
	getTabsByWorkspace: (workspaceId: string) => Tab[];
	getActiveTab: (workspaceId: string) => Tab | null;
	getLastActiveTabId: (workspaceId: string) => string | null;
}

// Create initial test tabs
const createInitialTabs = (): Tab[] => {
	const workspaceId = "workspace-1";

	// Create a single tab
	const singleTab: Tab = {
		id: "tab-single-1",
		title: "Welcome Tab",
		workspaceId,
		type: TabType.Single,
		isNew: false,
	};

	// Create child tabs for the group
	const childTab1: Tab = {
		id: "tab-child-1",
		title: "Left Pane",
		workspaceId,
		type: TabType.Single,
		isNew: false,
		parentId: "tab-group-1",
	};

	const childTab2: Tab = {
		id: "tab-child-2",
		title: "Right Pane",
		workspaceId,
		type: TabType.Single,
		isNew: false,
		parentId: "tab-group-1",
	};

	// Create a group tab with two child tabs
	const groupTab: Tab = {
		id: "tab-group-1",
		title: "Split View Example",
		workspaceId,
		type: TabType.Group,
		isNew: false,
		layout: {
			direction: "row",
			first: "tab-child-1",
			second: "tab-child-2",
			splitPercentage: 50,
		},
		childTabIds: ["tab-child-1", "tab-child-2"],
	};

	// Create another single tab
	const singleTab2: Tab = {
		id: "tab-single-2",
		title: "Another Tab",
		workspaceId,
		type: TabType.Single,
		isNew: false,
	};

	return [singleTab, childTab1, childTab2, groupTab, singleTab2];
};

export const useTabsStore = create<TabsState>()(
	devtools(
		(set, get) => ({
			tabs: createInitialTabs(),
			activeTabIds: { "workspace-1": "tab-single-1" },
			tabHistoryStacks: { "workspace-1": [] },

			addTab: (workspaceId, type = TabType.Single) => {
				const newTab = createNewTab(workspaceId, type);
				set((state) => {
					// Push current active tab to history before switching
					const currentActiveId = state.activeTabIds[workspaceId];
					const historyStack = state.tabHistoryStacks[workspaceId] || [];
					const newHistoryStack = currentActiveId
						? [
								currentActiveId,
								...historyStack.filter((id) => id !== currentActiveId),
							]
						: historyStack;

					return {
						tabs: [...state.tabs, newTab],
						activeTabIds: {
							...state.activeTabIds,
							[workspaceId]: newTab.id,
						},
						tabHistoryStacks: {
							...state.tabHistoryStacks,
							[workspaceId]: newHistoryStack,
						},
					};
				});
			},

			removeTab: (id) => {
				set((state) => {
					const tabToRemove = state.tabs.find((tab) => tab.id === id);
					if (!tabToRemove) return state;

					const workspaceId = tabToRemove.workspaceId;
					const workspaceTabs = state.tabs.filter(
						(tab) => tab.workspaceId === workspaceId && tab.id !== id,
					);
					const tabs = state.tabs.filter((tab) => tab.id !== id);

					// Remove from history stack
					const historyStack = state.tabHistoryStacks[workspaceId] || [];
					const newHistoryStack = historyStack.filter((tabId) => tabId !== id);

					// If removing active tab, use history stack to determine next tab
					const newActiveTabIds = { ...state.activeTabIds };
					if (state.activeTabIds[workspaceId] === id) {
						if (workspaceTabs.length > 0) {
							// Try to activate most recent tab from history
							const nextTabFromHistory = newHistoryStack.find((tabId) =>
								workspaceTabs.some((tab) => tab.id === tabId),
							);
							if (nextTabFromHistory) {
								newActiveTabIds[workspaceId] = nextTabFromHistory;
							} else {
								// Fallback to positional logic
								const closedIndex = state.tabs
									.filter((tab) => tab.workspaceId === workspaceId)
									.findIndex((tab) => tab.id === id);
								const nextTab =
									workspaceTabs[closedIndex] || workspaceTabs[closedIndex - 1];
								newActiveTabIds[workspaceId] = nextTab.id;
							}
						} else {
							newActiveTabIds[workspaceId] = null;
						}
					}

					return {
						tabs,
						activeTabIds: newActiveTabIds,
						tabHistoryStacks: {
							...state.tabHistoryStacks,
							[workspaceId]: newHistoryStack,
						},
					};
				});
			},

			setActiveTab: (workspaceId, tabId) => {
				set((state) => {
					// Push current active tab to history before switching
					const currentActiveId = state.activeTabIds[workspaceId];
					const historyStack = state.tabHistoryStacks[workspaceId] || [];

					// Create new history stack: remove tabId if exists, then add current to front
					let newHistoryStack = historyStack.filter((id) => id !== tabId);
					if (currentActiveId && currentActiveId !== tabId) {
						newHistoryStack = [
							currentActiveId,
							...newHistoryStack.filter((id) => id !== currentActiveId),
						];
					}

					return {
						activeTabIds: {
							...state.activeTabIds,
							[workspaceId]: tabId,
						},
						tabHistoryStacks: {
							...state.tabHistoryStacks,
							[workspaceId]: newHistoryStack,
						},
					};
				});
			},

			reorderTabs: (workspaceId, startIndex, endIndex) => {
				set((state) => {
					const workspaceTabs = state.tabs.filter(
						(tab) => tab.workspaceId === workspaceId,
					);
					const otherTabs = state.tabs.filter(
						(tab) => tab.workspaceId !== workspaceId,
					);

					const [removed] = workspaceTabs.splice(startIndex, 1);
					workspaceTabs.splice(endIndex, 0, removed);

					return { tabs: [...otherTabs, ...workspaceTabs] };
				});
			},

			markTabAsUsed: (id) => {
				set((state) => ({
					tabs: state.tabs.map((tab) =>
						tab.id === id ? { ...tab, isNew: false } : tab,
					),
				}));
			},

			updateTabGroupLayout: (id, layout) => {
				set((state) => ({
					tabs: state.tabs.map((tab) =>
						tab.id === id && tab.type === TabType.Group
							? { ...tab, layout }
							: tab,
					),
				}));
			},

			addPaneToTabGroup: (id, paneId, title) => {
				set((state) => ({
					tabs: state.tabs.map((tab) =>
						tab.id === id && tab.type === TabType.Group
							? {
									...tab,
									panes: {
										...tab.panes,
										[paneId]: { title },
									},
								}
							: tab,
					),
				}));
			},

			removePaneFromTabGroup: (id, paneId) => {
				set((state) => ({
					tabs: state.tabs.map((tab) => {
						if (tab.id === id && tab.type === TabType.Group) {
							const { [paneId]: _removed, ...remainingPanes } = tab.panes;
							return {
								...tab,
								panes: remainingPanes,
							};
						}
						return tab;
					}),
				}));
			},

			dragTabToTab: (draggedTabId, targetTabId) => {
				set((state) => handleDragTabToTab(draggedTabId, targetTabId, state));
			},

			getTabsByWorkspace: (workspaceId) => {
				return get().tabs.filter((tab) => tab.workspaceId === workspaceId);
			},

			getActiveTab: (workspaceId) => {
				const activeTabId = get().activeTabIds[workspaceId];
				if (!activeTabId) return null;
				return get().tabs.find((tab) => tab.id === activeTabId) || null;
			},

			getLastActiveTabId: (workspaceId) => {
				const historyStack = get().tabHistoryStacks[workspaceId] || [];
				return historyStack[0] || null;
			},
		}),
		{ name: "TabsStore" },
	),
);

// Selector hooks
export const useTabs = () => useTabsStore((state) => state.tabs);
export const useActiveTabIds = () =>
	useTabsStore((state) => state.activeTabIds);

// Action hooks
export const useAddTab = () => useTabsStore((state) => state.addTab);
export const useRemoveTab = () => useTabsStore((state) => state.removeTab);
export const useSetActiveTab = () =>
	useTabsStore((state) => state.setActiveTab);
export const useReorderTabs = () => useTabsStore((state) => state.reorderTabs);
export const useMarkTabAsUsed = () =>
	useTabsStore((state) => state.markTabAsUsed);
