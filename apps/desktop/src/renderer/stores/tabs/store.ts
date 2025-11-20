import type { MosaicNode } from "react-mosaic-component";
import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import {
	cleanLayout,
	handleDragTabToTab,
	removeTabFromLayout,
} from "./drag-logic";
import { type Tab, TabType } from "./types";
import { createNewTab, getChildTabIds } from "./utils";
import { electronStorage } from "../../lib/electron-storage";

interface TabsState {
	tabs: Tab[];
	activeTabIds: Record<string, string | null>;
	tabHistoryStacks: Record<string, string[]>;

	addTab: (workspaceId: string, type?: TabType) => void;
	removeTab: (id: string) => void;
	renameTab: (id: string, newTitle: string) => void;
	setActiveTab: (workspaceId: string, tabId: string) => void;
	reorderTabs: (
		workspaceId: string,
		startIndex: number,
		endIndex: number,
	) => void;
	reorderTabById: (tabId: string, targetIndex: number) => void;
	markTabAsUsed: (id: string) => void;

	updateTabGroupLayout: (id: string, layout: MosaicNode<string>) => void;
	addChildTabToGroup: (groupId: string, childTabId: string) => void;
	removeChildTabFromGroup: (groupId: string, childTabId: string) => void;

	dragTabToTab: (draggedTabId: string, targetTabId: string) => void;
	ungroupTab: (tabId: string, targetIndex?: number) => void;
	ungroupTabs: (groupId: string) => void;

	getTabsByWorkspace: (workspaceId: string) => Tab[];
	getActiveTab: (workspaceId: string) => Tab | null;
	getLastActiveTabId: (workspaceId: string) => string | null;
}

const createInitialTabs = (): Tab[] => {
	const workspaceId = "workspace-1";

	const singleTab: Tab = {
		id: "tab-single-1",
		title: "Welcome Tab",
		workspaceId,
		type: TabType.Single,
		isNew: false,
	};

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
	};

	const singleTab2: Tab = {
		id: "tab-single-2",
		title: "Another Tab",
		workspaceId,
		type: TabType.Single,
		isNew: false,
	};

	return [singleTab, childTab1, childTab2, groupTab, singleTab2];
};

/**
 * Validates and cleans all group tabs to ensure layout only contains valid child IDs
 */
const validateGroupLayouts = (tabs: Tab[]): Tab[] => {
	return tabs.map((tab) => {
		if (tab.type !== TabType.Group) return tab;

		// Derive children from parentId
		const validTabIds = new Set(getChildTabIds(tabs, tab.id));
		const cleanedLayout = cleanLayout(tab.layout, validTabIds);

		// Only update if layout actually changed
		if (cleanedLayout !== tab.layout) {
			return {
				...tab,
				layout: cleanedLayout,
			};
		}

		return tab;
	});
};

/**
 * Handles the logic for when an empty group needs to be removed
 * Returns updated state with the group removed and active tab/history updated
 */
const handleEmptyGroupRemoval = (
	tabs: Tab[],
	activeTabIds: Record<string, string | null>,
	tabHistoryStacks: Record<string, string[]>,
	workspaceId: string,
	idsToRemove: string[],
	fallbackActiveTabId?: string,
) => {
	const remainingTabs = tabs.filter((tab) => !idsToRemove.includes(tab.id));
	const currentActiveId = activeTabIds[workspaceId];
	const historyStack = tabHistoryStacks[workspaceId] || [];

	const newActiveTabIds = { ...activeTabIds };
	const newHistoryStack = historyStack.filter(
		(id) => !idsToRemove.includes(id),
	);

	// Update active tab if needed
	if (idsToRemove.includes(currentActiveId || "")) {
		const workspaceTabs = remainingTabs.filter(
			(tab) => tab.workspaceId === workspaceId,
		);

		if (workspaceTabs.length > 0) {
			// Try to use fallback (e.g., the ungrouped tab), then history, then first available
			if (
				fallbackActiveTabId &&
				remainingTabs.some((t) => t.id === fallbackActiveTabId)
			) {
				newActiveTabIds[workspaceId] = fallbackActiveTabId;
			} else {
				const nextTabFromHistory = newHistoryStack.find((tabId) =>
					workspaceTabs.some((tab) => tab.id === tabId),
				);
				newActiveTabIds[workspaceId] =
					nextTabFromHistory || workspaceTabs[0].id;
			}
		} else {
			newActiveTabIds[workspaceId] = null;
		}
	}

	return {
		tabs: remainingTabs,
		activeTabIds: newActiveTabIds,
		tabHistoryStacks: {
			...tabHistoryStacks,
			[workspaceId]: newHistoryStack,
		},
	};
};

export const useTabsStore = create<TabsState>()(
	devtools(
		persist(
			(set, get) => ({
				tabs: [],
				activeTabIds: {},
				tabHistoryStacks: {},

			addTab: (workspaceId, type = TabType.Single) => {
				const newTab = createNewTab(workspaceId, type);
				set((state) => {
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
				const state = get();
				const tabToRemove = state.tabs.find((tab) => tab.id === id);
				if (!tabToRemove) return;

				// If this tab is a child of a group, delegate to removeChildTabFromGroup
				// which handles empty group cleanup
				if (tabToRemove.parentId) {
					get().removeChildTabFromGroup(tabToRemove.parentId, id);
					return;
				}

				// Otherwise, handle as a top-level tab
				set((state) => {
					const workspaceId = tabToRemove.workspaceId;
					const workspaceTabs = state.tabs.filter(
						(tab) => tab.workspaceId === workspaceId && tab.id !== id,
					);
					const tabs = state.tabs.filter((tab) => tab.id !== id);

					const historyStack = state.tabHistoryStacks[workspaceId] || [];
					const newHistoryStack = historyStack.filter((tabId) => tabId !== id);

					const newActiveTabIds = { ...state.activeTabIds };
					if (state.activeTabIds[workspaceId] === id) {
						if (workspaceTabs.length > 0) {
							const nextTabFromHistory = newHistoryStack.find((tabId) =>
								workspaceTabs.some((tab) => tab.id === tabId),
							);
							if (nextTabFromHistory) {
								newActiveTabIds[workspaceId] = nextTabFromHistory;
							} else {
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

			renameTab: (id, newTitle) => {
				set((state) => ({
					tabs: state.tabs.map((tab) =>
						tab.id === id ? { ...tab, title: newTitle } : tab,
					),
				}));
			},

			setActiveTab: (workspaceId, tabId) => {
				set((state) => {
					const currentActiveId = state.activeTabIds[workspaceId];
					const historyStack = state.tabHistoryStacks[workspaceId] || [];

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

			reorderTabById: (tabId, targetIndex) => {
				set((state) => {
					const tab = state.tabs.find((t) => t.id === tabId);
					if (!tab || tab.parentId) return state; // Only reorder top-level tabs

					const workspaceId = tab.workspaceId;
					const workspaceTabs = state.tabs.filter(
						(t) => t.workspaceId === workspaceId && !t.parentId,
					);
					const otherTabs = state.tabs.filter(
						(t) => t.workspaceId !== workspaceId || t.parentId,
					);

					const tabToMove = workspaceTabs.find((t) => t.id === tabId);
					if (!tabToMove) return state;

					const filteredTabs = workspaceTabs.filter((t) => t.id !== tabId);
					filteredTabs.splice(targetIndex, 0, tabToMove);

					return { tabs: [...otherTabs, ...filteredTabs] };
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

			addChildTabToGroup: (groupId, childTabId) => {
				set((state) => {
					const updatedTabs = state.tabs.map((tab) => {
						if (tab.id === childTabId) {
							return {
								...tab,
								parentId: groupId,
							};
						}
						return tab;
					});

					// Note: This doesn't update layout - caller is responsible for layout updates
					// This is typically used in conjunction with updateTabGroupLayout

					return {
						tabs: updatedTabs,
					};
				});
			},

			removeChildTabFromGroup: (groupId, childTabId) => {
				set((state) => {
					const group = state.tabs.find(
						(tab) => tab.id === groupId && tab.type === TabType.Group,
					);
					if (!group || group.type !== TabType.Group) return state;

					// Derive children from parentId
					const updatedChildTabIds = getChildTabIds(state.tabs, groupId).filter(
						(id: string) => id !== childTabId,
					);

					// If no children left, remove both the child and the group
					if (updatedChildTabIds.length === 0) {
						return handleEmptyGroupRemoval(
							state.tabs,
							state.activeTabIds,
							state.tabHistoryStacks,
							group.workspaceId,
							[groupId, childTabId],
						);
					}

					// Validate layouts after removing child tab
					const validatedTabs = validateGroupLayouts(
						state.tabs.filter((tab) => tab.id !== childTabId),
					);

					return {
						tabs: validatedTabs,
					};
				});
			},

			dragTabToTab: (draggedTabId, targetTabId) => {
				set((state) => handleDragTabToTab(draggedTabId, targetTabId, state));
			},

			ungroupTab: (tabId, targetIndex) => {
				set((state) => {
					const tab = state.tabs.find((t) => t.id === tabId);
					if (!tab || !tab.parentId) return state;

					const parentGroup = state.tabs.find(
						(t) => t.id === tab.parentId && t.type === TabType.Group,
					);
					if (!parentGroup || parentGroup.type !== TabType.Group) return state;

					// Remove parentId from the tab
					const updatedTab: Tab = {
						...tab,
						parentId: undefined,
					};

					// Remove tab from parent's layout
					const updatedLayout = removeTabFromLayout(
						parentGroup.layout,
						tabId,
					) as MosaicNode<string> | null;

					// Get remaining children
					const remainingChildren = state.tabs.filter(
						(t) => t.parentId === parentGroup.id && t.id !== tabId,
					);

					const updatedTabs = state.tabs.map((t) => {
						if (t.id === tabId) return updatedTab;
						if (t.id === parentGroup.id && t.type === TabType.Group) {
							return {
								...t,
								layout: updatedLayout,
							};
						}
						return t;
					});

					// If no children left, remove the group
					if (remainingChildren.length === 0) {
						const result = handleEmptyGroupRemoval(
							updatedTabs,
							state.activeTabIds,
							state.tabHistoryStacks,
							tab.workspaceId,
							[parentGroup.id],
							tabId, // Prefer the ungrouped tab as the new active tab
						);

						// Apply reordering if needed
						if (targetIndex !== undefined) {
							const workspaceTabs = result.tabs.filter(
								(t) => t.workspaceId === tab.workspaceId && !t.parentId,
							);
							const otherTabs = result.tabs.filter(
								(t) => t.workspaceId !== tab.workspaceId || t.parentId,
							);

							const tabToMove = workspaceTabs.find((t) => t.id === tabId);
							if (tabToMove) {
								const filteredTabs = workspaceTabs.filter(
									(t) => t.id !== tabId,
								);
								filteredTabs.splice(targetIndex, 0, tabToMove);
								result.tabs = [...otherTabs, ...filteredTabs];
							}
						}

						return result;
					}

					// Validate layouts after removing tab
					let validatedTabs = validateGroupLayouts(updatedTabs);

					// Reorder if targetIndex is provided
					if (targetIndex !== undefined) {
						const workspaceId = tab.workspaceId;
						const workspaceTabs = validatedTabs.filter(
							(t) => t.workspaceId === workspaceId && !t.parentId,
						);
						const otherTabs = validatedTabs.filter(
							(t) => t.workspaceId !== workspaceId || t.parentId,
						);

						const tabToMove = workspaceTabs.find((t) => t.id === tabId);
						if (tabToMove) {
							const filteredTabs = workspaceTabs.filter((t) => t.id !== tabId);
							filteredTabs.splice(targetIndex, 0, tabToMove);
							validatedTabs = [...otherTabs, ...filteredTabs];
						}
					}

					return {
						...state,
						tabs: validatedTabs,
					};
				});
			},

			ungroupTabs: (groupId) => {
				set((state) => {
					const group = state.tabs.find(
						(t) => t.id === groupId && t.type === TabType.Group,
					);
					if (!group || group.type !== TabType.Group) return state;

					// Get all child tabs
					const childTabIds = getChildTabIds(state.tabs, groupId);
					if (childTabIds.length === 0) return state;

					// Find the group's position in the workspace
					const workspaceId = group.workspaceId;
					const workspaceTabs = state.tabs.filter(
						(t) => t.workspaceId === workspaceId && !t.parentId,
					);
					const groupIndex = workspaceTabs.findIndex((t) => t.id === groupId);

					// Remove parentId from all child tabs
					const updatedTabs = state.tabs
						.map((tab) => {
							if (childTabIds.includes(tab.id)) {
								return {
									...tab,
									parentId: undefined,
								};
							}
							return tab;
						})
						// Remove the group tab itself
						.filter((tab) => tab.id !== groupId);

					// Reorder tabs to place ungrouped tabs where the group was
					const newWorkspaceTabs = updatedTabs.filter(
						(t) => t.workspaceId === workspaceId && !t.parentId,
					);
					const otherTabs = updatedTabs.filter(
						(t) => t.workspaceId !== workspaceId || t.parentId,
					);

					// Get the ungrouped child tabs
					const ungroupedTabs = newWorkspaceTabs.filter((t) =>
						childTabIds.includes(t.id),
					);
					// Get tabs that are not the ungrouped children
					const nonUngroupedTabs = newWorkspaceTabs.filter(
						(t) => !childTabIds.includes(t.id),
					);

					// Insert ungrouped tabs at the group's original position
					nonUngroupedTabs.splice(groupIndex, 0, ...ungroupedTabs);

					const finalTabs = [...otherTabs, ...nonUngroupedTabs];

					// Clean up active tab and history if the group was active
					const currentActiveId = state.activeTabIds[workspaceId];
					const historyStack = state.tabHistoryStacks[workspaceId] || [];
					const newHistoryStack = historyStack.filter((id) => id !== groupId);

					const newActiveTabIds = { ...state.activeTabIds };
					if (currentActiveId === groupId) {
						// Set the first ungrouped tab as active
						if (ungroupedTabs.length > 0) {
							newActiveTabIds[workspaceId] = ungroupedTabs[0].id;
						} else if (nonUngroupedTabs.length > 0) {
							newActiveTabIds[workspaceId] = nonUngroupedTabs[0].id;
						} else {
							newActiveTabIds[workspaceId] = null;
						}
					}

					return {
						tabs: finalTabs,
						activeTabIds: newActiveTabIds,
						tabHistoryStacks: {
							...state.tabHistoryStacks,
							[workspaceId]: newHistoryStack,
						},
					};
				});
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
			{
				name: "tabs-storage",
				storage: electronStorage,
			},
		),
		{ name: "TabsStore" },
	),
);

export const useTabs = () => useTabsStore((state) => state.tabs);
export const useActiveTabIds = () =>
	useTabsStore((state) => state.activeTabIds);

export const useAddTab = () => useTabsStore((state) => state.addTab);
export const useRemoveTab = () => useTabsStore((state) => state.removeTab);
export const useRenameTab = () => useTabsStore((state) => state.renameTab);
export const useSetActiveTab = () =>
	useTabsStore((state) => state.setActiveTab);
export const useReorderTabs = () => useTabsStore((state) => state.reorderTabs);
export const useReorderTabById = () =>
	useTabsStore((state) => state.reorderTabById);
export const useMarkTabAsUsed = () =>
	useTabsStore((state) => state.markTabAsUsed);
export const useUngroupTab = () => useTabsStore((state) => state.ungroupTab);
export const useUngroupTabs = () => useTabsStore((state) => state.ungroupTabs);
