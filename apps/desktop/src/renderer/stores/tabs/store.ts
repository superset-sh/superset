import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import { electronStorage } from "../../lib/electron-storage";
import { handleDragTabToTab } from "./drag-logic";
import {
	getActiveTab,
	getLastActiveTabId,
	getTabsByWorkspace,
	handleSetActiveTab,
} from "./helpers/active-tab";
import {
	handleAddChildTabToGroup,
	handleRemoveChildTabFromGroup,
	handleUngroupTab,
	handleUngroupTabs,
	handleUpdateTabGroupLayout,
} from "./helpers/group-operations";
import {
	handleSplitTabHorizontal,
	handleSplitTabVertical,
} from "./helpers/split-operations";
import {
	handleAddTab,
	handleMarkTabAsUsed,
	handleRemoveTab,
	handleRenameTab,
} from "./helpers/tab-crud";
import {
	handleReorderTabById,
	handleReorderTabs,
} from "./helpers/tab-ordering";
import { type TabsStore, TabType } from "./types";
import { killTerminalForTab } from "./utils/terminal-cleanup";

export const useTabsStore = create<TabsStore>()(
	devtools(
		persist(
			(set, get) => ({
				tabs: [],
				activeTabIds: {},
				tabHistoryStacks: {},

				addTab: (workspaceId, type = TabType.Single, options) => {
					let tabId = "";
					set((state) => {
						const result = handleAddTab(state, workspaceId, type, options);
						tabId = result.tabId;
						return result.newState;
					});
					return tabId;
				},

				removeTab: (id) => {
					const state = get();
					const result = handleRemoveTab(state, id);
					if (result === null) {
						const tabToRemove = state.tabs.find((tab) => tab.id === id);
						if (tabToRemove?.parentId) {
							get().removeChildTabFromGroup(tabToRemove.parentId, id);
						}
						return;
					}
					killTerminalForTab(id);
					set(() => result);
				},

				renameTab: (id, newTitle) => {
					set((state) => handleRenameTab(state, id, newTitle));
				},

				setActiveTab: (workspaceId, tabId) => {
					set((state) => handleSetActiveTab(state, workspaceId, tabId));
				},

				reorderTabs: (workspaceId, startIndex, endIndex) => {
					set((state) =>
						handleReorderTabs(state, workspaceId, startIndex, endIndex),
					);
				},

				reorderTabById: (tabId, targetIndex) => {
					set((state) => handleReorderTabById(state, tabId, targetIndex));
				},

				markTabAsUsed: (id) => {
					set((state) => handleMarkTabAsUsed(state, id));
				},

				updateTabGroupLayout: (id, layout) => {
					set((state) => handleUpdateTabGroupLayout(state, id, layout));
				},

				addChildTabToGroup: (groupId, childTabId) => {
					set((state) => handleAddChildTabToGroup(state, groupId, childTabId));
				},

				removeChildTabFromGroup: (groupId, childTabId) => {
					killTerminalForTab(childTabId);
					set((state) =>
						handleRemoveChildTabFromGroup(state, groupId, childTabId),
					);
				},

				dragTabToTab: (draggedTabId, targetTabId) => {
					set((state) => handleDragTabToTab(draggedTabId, targetTabId, state));
				},

				ungroupTab: (tabId, targetIndex) => {
					set((state) => handleUngroupTab(state, tabId, targetIndex));
				},

				ungroupTabs: (groupId) => {
					set((state) => handleUngroupTabs(state, groupId));
				},

				getTabsByWorkspace: (workspaceId) => {
					return getTabsByWorkspace(get(), workspaceId);
				},

				getActiveTab: (workspaceId) => {
					return getActiveTab(get(), workspaceId);
				},

				getLastActiveTabId: (workspaceId) => {
					return getLastActiveTabId(get(), workspaceId);
				},
				splitTabVertical: (workspaceId, sourceTabId, path) => {
					set((state) =>
						handleSplitTabVertical(state, workspaceId, sourceTabId, path),
					);
				},

				splitTabHorizontal: (workspaceId, sourceTabId, path) => {
					set((state) =>
						handleSplitTabHorizontal(state, workspaceId, sourceTabId, path),
					);
				},

				setNeedsAttention: (tabId, needsAttention) => {
					set((state) => ({
						...state,
						tabs: state.tabs.map((tab) =>
							tab.id === tabId ? { ...tab, needsAttention } : tab,
						),
					}));
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
