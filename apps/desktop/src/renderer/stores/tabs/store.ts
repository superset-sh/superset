import type { MosaicNode } from "react-mosaic-component";
import { updateTree } from "react-mosaic-component";
import { getFileOpenMode } from "renderer/hooks/useFileOpenMode";
import { trpcTabsStorage } from "renderer/lib/trpc-storage";
import { acknowledgedStatus } from "shared/tabs-types";
import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import { movePaneToNewTab, movePaneToTab } from "./actions/move-pane";
import type {
	AddFileViewerPaneOptions,
	AddTabWithMultiplePanesOptions,
	TabsState,
	TabsStore,
} from "./types";
import {
	buildMultiPaneLayout,
	type CreatePaneOptions,
	createBrowserPane,
	createBrowserTabWithPane,
	createChatMastraTabWithPane,
	createChatTabWithPane,
	createDevToolsPane,
	createFileViewerPane,
	createPane,
	createTabWithPane,
	extractPaneIdsFromLayout,
	generateId,
	generateTabName,
	getAdjacentPaneId,
	getFirstPaneId,
	getPaneIdsForTab,
	isLastPaneInTab,
	removePaneFromLayout,
	resolveActiveTabIdForWorkspace,
	resolveFileViewerMode,
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

const deriveTabName = (
	panes: Record<string, { tabId: string; name: string }>,
	tabId: string,
): string => {
	const tabPanes = Object.values(panes).filter((p) => p.tabId === tabId);
	if (tabPanes.length === 1) return tabPanes[0].name;
	return `Multiple panes (${tabPanes.length})`;
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
				closedTabsStack: [],

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

				addChatTab: (workspaceId: string) => {
					const state = get();

					const { tab, pane } = createChatTabWithPane(workspaceId);

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

				addChatMastraTab: (workspaceId: string) => {
					const state = get();

					const { tab, pane } = createChatMastraTabWithPane(workspaceId);

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

				addTabWithMultiplePanes: (
					workspaceId: string,
					options: AddTabWithMultiplePanesOptions,
				) => {
					const state = get();
					const tabId = generateId("tab");
					const panes: ReturnType<typeof createPane>[] = options.commands.map(
						(_command) =>
							createPane(tabId, "terminal", {
								initialCwd: options.initialCwd,
							}),
					);

					const paneIds = panes.map((p) => p.id);
					const layout = buildMultiPaneLayout(paneIds);
					const workspaceTabs = state.tabs.filter(
						(t) => t.workspaceId === workspaceId,
					);

					const tab = {
						id: tabId,
						name: generateTabName(workspaceTabs),
						workspaceId,
						layout,
						createdAt: Date.now(),
					};

					const panesRecord: Record<string, (typeof panes)[number]> = {};
					for (const pane of panes) {
						panesRecord[pane.id] = pane;
					}

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
						panes: { ...state.panes, ...panesRecord },
						activeTabIds: {
							...state.activeTabIds,
							[workspaceId]: tab.id,
						},
						focusedPaneIds: {
							...state.focusedPaneIds,
							[tab.id]: paneIds[0],
						},
						tabHistoryStacks: {
							...state.tabHistoryStacks,
							[workspaceId]: newHistoryStack,
						},
					});

					return { tabId: tab.id, paneIds };
				},

				removeTab: (tabId) => {
					const state = get();
					const tabToRemove = state.tabs.find((t) => t.id === tabId);
					if (!tabToRemove) return;

					const paneIds = getPaneIdsForTab(state.panes, tabId);

					// Snapshot the tab + panes for "reopen closed tab"
					const closedPanes = paneIds
						.map((id) => state.panes[id])
						.filter(Boolean);
					const closedEntry = {
						tab: tabToRemove,
						panes: closedPanes,
						closedAt: Date.now(),
					};
					const closedTabsStack = [closedEntry, ...state.closedTabsStack].slice(
						0,
						20,
					);

					for (const paneId of paneIds) {
						// Only kill terminal sessions for terminal panes (avoids unnecessary IPC for file-viewers)
						const pane = state.panes[paneId];
						if (pane?.type === "terminal") {
							killTerminalForPane(paneId);
						}
					}

					const newPanes = { ...state.panes };
					for (const paneId of paneIds) {
						delete newPanes[paneId];
					}

					const newTabs = state.tabs.filter((t) => t.id !== tabId);

					const workspaceId = tabToRemove.workspaceId;
					const newActiveTabIds = { ...state.activeTabIds };
					const newHistoryStack = (
						state.tabHistoryStacks[workspaceId] || []
					).filter((id) => id !== tabId);

					if (state.activeTabIds[workspaceId] === tabId) {
						newActiveTabIds[workspaceId] = findNextTab(state, tabId);
					}

					const newFocusedPaneIds = { ...state.focusedPaneIds };
					delete newFocusedPaneIds[tabId];

					set({
						tabs: newTabs,
						panes: newPanes,
						activeTabIds: newActiveTabIds,
						focusedPaneIds: newFocusedPaneIds,
						closedTabsStack,
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
					set((state) => {
						const tab = state.tabs.find((t) => t.id === tabId);
						if (!tab || tab.name === title) return state;
						return {
							tabs: state.tabs.map((t) =>
								t.id === tabId ? { ...t, name: title } : t,
							),
						};
					});
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

					// Clear attention status for panes in the selected tab
					const tabPaneIds = extractPaneIdsFromLayout(tab.layout);
					const newPanes = { ...state.panes };
					let hasChanges = false;
					for (const paneId of tabPaneIds) {
						const resolved = acknowledgedStatus(newPanes[paneId]?.status);
						if (resolved !== (newPanes[paneId]?.status ?? "idle")) {
							newPanes[paneId] = { ...newPanes[paneId], status: resolved };
							hasChanges = true;
						}
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
						...(hasChanges ? { panes: newPanes } : {}),
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

					const newPaneIds = new Set(extractPaneIdsFromLayout(layout));
					const oldPaneIds = new Set(extractPaneIdsFromLayout(tab.layout));

					const removedPaneIds = Array.from(oldPaneIds).filter(
						(id) => !newPaneIds.has(id),
					);

					const newPanes = { ...state.panes };
					for (const paneId of removedPaneIds) {
						const pane = state.panes[paneId];
						// Only delete panes that actually belong to this tab
						// During drag operations, Mosaic may temporarily include foreign panes
						// in layouts - we must not delete those when they're "removed"
						if (pane && pane.tabId === tabId) {
							if (pane.type === "terminal") {
								killTerminalForPane(paneId);
							}
							delete newPanes[paneId];
						}
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
				addPane: (tabId, options?: CreatePaneOptions) => {
					const state = get();
					const tab = state.tabs.find((t) => t.id === tabId);
					if (!tab) return "";

					const newPane = createPane(tabId, "terminal", options);

					const newLayout: MosaicNode<string> = {
						direction: "row",
						first: tab.layout,
						second: newPane.id,
						splitPercentage: 50,
					};

					const newPanes = { ...state.panes, [newPane.id]: newPane };
					const tabName = deriveTabName(newPanes, tabId);

					set({
						tabs: state.tabs.map((t) =>
							t.id === tabId ? { ...t, layout: newLayout, name: tabName } : t,
						),
						panes: newPanes,
						focusedPaneIds: {
							...state.focusedPaneIds,
							[tabId]: newPane.id,
						},
					});

					return newPane.id;
				},

				addPanesToTab: (
					tabId: string,
					options: AddTabWithMultiplePanesOptions,
				) => {
					const state = get();
					const tab = state.tabs.find((t) => t.id === tabId);
					if (!tab) return [];

					const panes: ReturnType<typeof createPane>[] = options.commands.map(
						(_command) =>
							createPane(tabId, "terminal", {
								initialCwd: options.initialCwd,
							}),
					);

					const paneIds = panes.map((p) => p.id);
					const existingPaneIds = extractPaneIdsFromLayout(tab.layout);
					const allPaneIds = [...existingPaneIds, ...paneIds];
					const newLayout = buildMultiPaneLayout(allPaneIds);

					const panesRecord: Record<string, (typeof panes)[number]> = {
						...state.panes,
					};
					for (const pane of panes) {
						panesRecord[pane.id] = pane;
					}

					const tabName = deriveTabName(panesRecord, tabId);

					set({
						tabs: state.tabs.map((t) =>
							t.id === tabId ? { ...t, layout: newLayout, name: tabName } : t,
						),
						panes: panesRecord,
						focusedPaneIds: {
							...state.focusedPaneIds,
							[tabId]: paneIds[0],
						},
					});

					return paneIds;
				},

				addFileViewerPane: (
					workspaceId: string,
					options: AddFileViewerPaneOptions,
				) => {
					if (options.openInNewTab === undefined) {
						options = {
							...options,
							openInNewTab: getFileOpenMode() === "new-tab",
						};
					}

					const state = get();
					const resolvedActiveTabId = resolveActiveTabIdForWorkspace({
						workspaceId,
						tabs: state.tabs,
						activeTabIds: state.activeTabIds,
						tabHistoryStacks: state.tabHistoryStacks,
					});
					const activeTab = resolvedActiveTabId
						? state.tabs.find((t) => t.id === resolvedActiveTabId)
						: null;

					// If no active tab, create a new one (this shouldn't normally happen)
					if (!activeTab) {
						const { tabId, paneId } = get().addTab(workspaceId);
						// Update the pane to be a file-viewer (must use set() to get fresh state after addTab)
						const fileViewerPane = createFileViewerPane(tabId, options);
						set((s) => ({
							panes: {
								...s.panes,
								[paneId]: {
									...fileViewerPane,
									id: paneId, // Keep the original ID
								},
							},
						}));
						return paneId;
					}

					const tabPaneIds = extractPaneIdsFromLayout(activeTab.layout);

					// First, check if the file is already open in a pinned pane - if so, just focus it
					const existingPinnedPane = tabPaneIds
						.map((id) => state.panes[id])
						.find(
							(p) =>
								p?.type === "file-viewer" &&
								p.fileViewer?.isPinned &&
								p.fileViewer.filePath === options.filePath &&
								p.fileViewer.diffCategory === options.diffCategory &&
								p.fileViewer.commitHash === options.commitHash,
						);

					if (existingPinnedPane) {
						// File is already open in a pinned pane, just focus it
						set({
							focusedPaneIds: {
								...state.focusedPaneIds,
								[activeTab.id]: existingPinnedPane.id,
							},
						});
						return existingPinnedPane.id;
					}

					// Look for an existing unpinned (preview) file-viewer pane in the active tab
					const fileViewerPanes = tabPaneIds
						.map((id) => state.panes[id])
						.filter(
							(p) =>
								p?.type === "file-viewer" &&
								p.fileViewer &&
								!p.fileViewer.isPinned,
						);

					// If we found an unpinned (preview) file-viewer pane, reuse it
					if (fileViewerPanes.length > 0) {
						const paneToReuse = fileViewerPanes[0];
						const existingFileViewer = paneToReuse.fileViewer;
						if (!existingFileViewer) {
							// Should not happen due to filter above, but satisfy type checker
							return "";
						}

						// If clicking the same file that's already in preview, just focus it
						const isSameFile =
							existingFileViewer.filePath === options.filePath &&
							existingFileViewer.diffCategory === options.diffCategory &&
							existingFileViewer.commitHash === options.commitHash;

						if (isSameFile) {
							if (
								options.viewMode &&
								existingFileViewer.viewMode !== options.viewMode
							) {
								set({
									panes: {
										...state.panes,
										[paneToReuse.id]: {
											...paneToReuse,
											fileViewer: {
												...existingFileViewer,
												viewMode: options.viewMode,
											},
										},
									},
									focusedPaneIds: {
										...state.focusedPaneIds,
										[activeTab.id]: paneToReuse.id,
									},
								});
								return paneToReuse.id;
							}
							set({
								focusedPaneIds: {
									...state.focusedPaneIds,
									[activeTab.id]: paneToReuse.id,
								},
							});
							return paneToReuse.id;
						}

						// Different file - replace the preview pane content
						const fileName =
							options.filePath.split("/").pop() || options.filePath;

						const viewMode = resolveFileViewerMode({
							filePath: options.filePath,
							diffCategory: options.diffCategory,
							viewMode: options.viewMode,
							fileStatus: options.fileStatus,
						});

						set({
							panes: {
								...state.panes,
								[paneToReuse.id]: {
									...paneToReuse,
									name: fileName,
									fileViewer: {
										filePath: options.filePath,
										viewMode,
										isPinned: options.isPinned ?? false,
										diffLayout: "inline",
										diffCategory: options.diffCategory,
										commitHash: options.commitHash,
										oldPath: options.oldPath,
										initialLine: options.line,
										initialColumn: options.column,
									},
								},
							},
							focusedPaneIds: {
								...state.focusedPaneIds,
								[activeTab.id]: paneToReuse.id,
							},
						});

						return paneToReuse.id;
					}

					// No reusable pane found, create a new one
					if (options.openInNewTab) {
						const workspaceId = activeTab.workspaceId;
						const newTabId = generateId("tab");
						const newPane = createFileViewerPane(newTabId, options);

						const newTab = {
							id: newTabId,
							workspaceId,
							name: newPane.name,
							layout: newPane.id as MosaicNode<string>,
							createdAt: Date.now(),
						};

						const currentActiveId = state.activeTabIds[workspaceId];
						const historyStack = state.tabHistoryStacks[workspaceId] || [];
						const newHistoryStack = currentActiveId
							? [
									currentActiveId,
									...historyStack.filter((id) => id !== currentActiveId),
								]
							: historyStack;

						set({
							tabs: [...state.tabs, newTab],
							panes: { ...state.panes, [newPane.id]: newPane },
							activeTabIds: {
								...state.activeTabIds,
								[workspaceId]: newTab.id,
							},
							focusedPaneIds: {
								...state.focusedPaneIds,
								[newTab.id]: newPane.id,
							},
							tabHistoryStacks: {
								...state.tabHistoryStacks,
								[workspaceId]: newHistoryStack,
							},
						});

						return newPane.id;
					}

					const newPane = createFileViewerPane(activeTab.id, options);

					const newLayout: MosaicNode<string> = {
						direction: "row",
						first: activeTab.layout,
						second: newPane.id,
						splitPercentage: 50,
					};

					const newPanes = { ...state.panes, [newPane.id]: newPane };
					const tabName = deriveTabName(newPanes, activeTab.id);

					set({
						tabs: state.tabs.map((t) =>
							t.id === activeTab.id
								? { ...t, layout: newLayout, name: tabName }
								: t,
						),
						panes: newPanes,
						focusedPaneIds: {
							...state.focusedPaneIds,
							[activeTab.id]: newPane.id,
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

					// Collect this pane + any devtools panes targeting it
					const paneIdsToRemove = [paneId];
					for (const [id, p] of Object.entries(state.panes)) {
						if (p.type === "devtools" && p.devtools?.targetPaneId === paneId) {
							paneIdsToRemove.push(id);
						}
					}

					// If removing all these panes leaves the tab empty, remove the tab
					const remainingPanes = Object.entries(state.panes).filter(
						([id, p]) => p.tabId === tab.id && !paneIdsToRemove.includes(id),
					);
					if (remainingPanes.length === 0) {
						get().removeTab(tab.id);
						return;
					}

					// Must get adjacent pane BEFORE removing from layout
					const adjacentPaneId = getAdjacentPaneId(tab.layout, paneId);

					// Kill terminal sessions for terminal panes
					for (const id of paneIdsToRemove) {
						if (state.panes[id]?.type === "terminal") {
							killTerminalForPane(id);
						}
					}

					// Remove all panes from layout
					let newLayout = tab.layout;
					for (const id of paneIdsToRemove) {
						const result = removePaneFromLayout(newLayout, id);
						if (!result) {
							get().removeTab(tab.id);
							return;
						}
						newLayout = result;
					}

					const newPanes = { ...state.panes };
					for (const id of paneIdsToRemove) {
						delete newPanes[id];
					}

					let newFocusedPaneIds = state.focusedPaneIds;
					if (paneIdsToRemove.includes(state.focusedPaneIds[tab.id])) {
						newFocusedPaneIds = {
							...state.focusedPaneIds,
							[tab.id]: adjacentPaneId ?? getFirstPaneId(newLayout),
						};
					}

					const tabName = deriveTabName(newPanes, tab.id);

					set({
						tabs: state.tabs.map((t) =>
							t.id === tab.id ? { ...t, layout: newLayout, name: tabName } : t,
						),
						panes: newPanes,
						focusedPaneIds: newFocusedPaneIds,
					});
				},

				setFocusedPane: (tabId, paneId) => {
					const state = get();
					const pane = state.panes[paneId];
					if (!pane || pane.tabId !== tabId) return;

					set({
						panes: {
							...state.panes,
							[paneId]: { ...pane, status: acknowledgedStatus(pane.status) },
						},
						focusedPaneIds: {
							...state.focusedPaneIds,
							[tabId]: paneId,
						},
					});
				},

				markPaneAsUsed: (paneId) => {
					set((state) => {
						const pane = state.panes[paneId];
						if (!pane || pane.isNew === false) return state;
						return {
							panes: {
								...state.panes,
								[paneId]: { ...pane, isNew: false },
							},
						};
					});
				},

				setPaneStatus: (paneId, status) => {
					const state = get();
					const pane = state.panes[paneId];
					if (!pane || pane.status === status) return;

					set({
						panes: {
							...state.panes,
							[paneId]: { ...pane, status },
						},
					});
				},

				setPaneName: (paneId, name) => {
					const state = get();
					const pane = state.panes[paneId];
					if (!pane || pane.name === name) return;

					const newPanes = {
						...state.panes,
						[paneId]: { ...pane, name },
					};
					const tabName = deriveTabName(newPanes, pane.tabId);

					set({
						panes: newPanes,
						tabs: state.tabs.map((t) =>
							t.id === pane.tabId ? { ...t, name: tabName } : t,
						),
					});
				},

				clearWorkspaceAttentionStatus: (workspaceId) => {
					const state = get();
					const workspaceTabs = state.tabs.filter(
						(t) => t.workspaceId === workspaceId,
					);
					const workspacePaneIds = workspaceTabs.flatMap((t) =>
						extractPaneIdsFromLayout(t.layout),
					);

					if (workspacePaneIds.length === 0) {
						return;
					}

					const newPanes = { ...state.panes };
					let hasChanges = false;
					for (const paneId of workspacePaneIds) {
						const resolved = acknowledgedStatus(newPanes[paneId]?.status);
						if (resolved !== (newPanes[paneId]?.status ?? "idle")) {
							newPanes[paneId] = { ...newPanes[paneId], status: resolved };
							hasChanges = true;
						}
					}

					if (hasChanges) {
						set({ panes: newPanes });
					}
				},

				resetWorkspaceStatus: (workspaceId) => {
					const state = get();
					const workspaceTabs = state.tabs.filter(
						(t) => t.workspaceId === workspaceId,
					);
					const workspacePaneIds = workspaceTabs.flatMap((t) =>
						extractPaneIdsFromLayout(t.layout),
					);

					if (workspacePaneIds.length === 0) {
						return;
					}

					const newPanes = { ...state.panes };
					let hasChanges = false;
					for (const paneId of workspacePaneIds) {
						if (
							newPanes[paneId]?.status &&
							newPanes[paneId].status !== "idle"
						) {
							newPanes[paneId] = { ...newPanes[paneId], status: "idle" };
							hasChanges = true;
						}
					}

					if (hasChanges) {
						set({ panes: newPanes });
					}
				},

				updatePaneCwd: (paneId, cwd, confirmed) => {
					set((state) => {
						const pane = state.panes[paneId];
						if (!pane) return state;
						if (pane.cwd === cwd && pane.cwdConfirmed === confirmed) {
							return state;
						}
						return {
							panes: {
								...state.panes,
								[paneId]: {
									...pane,
									cwd,
									cwdConfirmed: confirmed,
								},
							},
						};
					});
				},

				clearPaneInitialData: (paneId) => {
					set((state) => {
						const pane = state.panes[paneId];
						if (!pane) return state;
						if (pane.initialCwd === undefined) {
							return state;
						}
						return {
							panes: {
								...state.panes,
								[paneId]: {
									...pane,
									initialCwd: undefined,
								},
							},
						};
					});
				},

				pinPane: (paneId) => {
					set((state) => {
						const pane = state.panes[paneId];
						if (!pane?.fileViewer) return state;
						if (pane.fileViewer.isPinned) return state;
						return {
							panes: {
								...state.panes,
								[paneId]: {
									...pane,
									fileViewer: {
										...pane.fileViewer,
										isPinned: true,
									},
								},
							},
						};
					});
				},

				// Split operations
				splitPaneVertical: (tabId, sourcePaneId, path, options) => {
					const state = get();
					const tab = state.tabs.find((t) => t.id === tabId);
					if (!tab) return;

					const sourcePane = state.panes[sourcePaneId];
					if (!sourcePane || sourcePane.tabId !== tabId) return;

					// Always create a new terminal when splitting
					const newPane = createPane(tabId, "terminal", options);

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

					const newPanes = { ...state.panes, [newPane.id]: newPane };
					const tabName = deriveTabName(newPanes, tabId);

					set({
						tabs: state.tabs.map((t) =>
							t.id === tabId ? { ...t, layout: newLayout, name: tabName } : t,
						),
						panes: newPanes,
						focusedPaneIds: {
							...state.focusedPaneIds,
							[tabId]: newPane.id,
						},
					});
				},

				splitPaneHorizontal: (tabId, sourcePaneId, path, options) => {
					const state = get();
					const tab = state.tabs.find((t) => t.id === tabId);
					if (!tab) return;

					const sourcePane = state.panes[sourcePaneId];
					if (!sourcePane || sourcePane.tabId !== tabId) return;

					// Always create a new terminal when splitting
					const newPane = createPane(tabId, "terminal", options);

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

					const newPanes = { ...state.panes, [newPane.id]: newPane };
					const tabName = deriveTabName(newPanes, tabId);

					set({
						tabs: state.tabs.map((t) =>
							t.id === tabId ? { ...t, layout: newLayout, name: tabName } : t,
						),
						panes: newPanes,
						focusedPaneIds: {
							...state.focusedPaneIds,
							[tabId]: newPane.id,
						},
					});
				},

				splitPaneAuto: (tabId, sourcePaneId, dimensions, path, options) => {
					if (dimensions.width >= dimensions.height) {
						get().splitPaneVertical(tabId, sourcePaneId, path, options);
					} else {
						get().splitPaneHorizontal(tabId, sourcePaneId, path, options);
					}
				},

				movePaneToTab: (paneId, targetTabId) => {
					const state = get();
					const pane = state.panes[paneId];
					const result = movePaneToTab(state, paneId, targetTabId);
					if (!result) return;

					// Re-derive tab names for affected tabs
					const sourceTabId = pane?.tabId;
					result.tabs = result.tabs.map((t) => {
						if (t.id === targetTabId || t.id === sourceTabId) {
							return { ...t, name: deriveTabName(result.panes, t.id) };
						}
						return t;
					});

					set(result);
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

					// Re-derive tab names for affected tabs
					moveResult.result.tabs = moveResult.result.tabs.map((t) => {
						if (t.id === moveResult.newTabId || t.id === sourceTab.id) {
							return {
								...t,
								name: deriveTabName(moveResult.result.panes, t.id),
							};
						}
						return t;
					});

					set(moveResult.result);
					return moveResult.newTabId;
				},

				// Browser operations
				addBrowserTab: (workspaceId: string, url?: string) => {
					const state = get();

					const { tab, pane } = createBrowserTabWithPane(
						workspaceId,
						state.tabs,
						url,
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

				openInBrowserPane: (workspaceId: string, url: string) => {
					const state = get();

					// Find an existing browser pane in this workspace
					const workspaceTabIds = new Set(
						state.tabs
							.filter((t) => t.workspaceId === workspaceId)
							.map((t) => t.id),
					);
					const existingPane = Object.values(state.panes).find(
						(p) =>
							p.type === "webview" && p.browser && workspaceTabIds.has(p.tabId),
					);

					if (existingPane?.browser) {
						// Navigate existing pane and make its tab active
						const { history: prevHistory, historyIndex } = existingPane.browser;
						const history = prevHistory.slice(0, historyIndex + 1);
						history.push({
							url,
							title: "",
							timestamp: Date.now(),
						});
						if (history.length > 100) {
							history.splice(0, history.length - 100);
						}

						const currentActiveId = state.activeTabIds[workspaceId];
						const historyStack = state.tabHistoryStacks[workspaceId] || [];
						const newHistoryStack = currentActiveId
							? [
									currentActiveId,
									...historyStack.filter((id) => id !== currentActiveId),
								]
							: historyStack;

						const newPanes = {
							...state.panes,
							[existingPane.id]: {
								...existingPane,
								name: "Browser",
								browser: {
									...existingPane.browser,
									currentUrl: url,
									history,
									historyIndex: history.length - 1,
								},
							},
						};
						const tabName = deriveTabName(newPanes, existingPane.tabId);

						set({
							panes: newPanes,
							tabs: state.tabs.map((t) =>
								t.id === existingPane.tabId ? { ...t, name: tabName } : t,
							),
							activeTabIds: {
								...state.activeTabIds,
								[workspaceId]: existingPane.tabId,
							},
							focusedPaneIds: {
								...state.focusedPaneIds,
								[existingPane.tabId]: existingPane.id,
							},
							tabHistoryStacks: {
								...state.tabHistoryStacks,
								[workspaceId]: newHistoryStack,
							},
						});
					} else {
						// No existing browser pane — add one to the active tab
						const resolvedActiveTabId = resolveActiveTabIdForWorkspace({
							workspaceId,
							tabs: state.tabs,
							activeTabIds: state.activeTabIds,
							tabHistoryStacks: state.tabHistoryStacks,
						});
						const activeTab = resolvedActiveTabId
							? state.tabs.find((t) => t.id === resolvedActiveTabId)
							: null;

						if (!activeTab) {
							get().addBrowserTab(workspaceId, url);
							return;
						}

						const newPane = createBrowserPane(activeTab.id, {
							url,
						});
						const newLayout: MosaicNode<string> = {
							direction: "row",
							first: activeTab.layout,
							second: newPane.id,
							splitPercentage: 50,
						};
						const newPanes = {
							...state.panes,
							[newPane.id]: newPane,
						};
						const tabName = deriveTabName(newPanes, activeTab.id);

						set({
							tabs: state.tabs.map((t) =>
								t.id === activeTab.id
									? {
											...t,
											layout: newLayout,
											name: tabName,
										}
									: t,
							),
							panes: newPanes,
							focusedPaneIds: {
								...state.focusedPaneIds,
								[activeTab.id]: newPane.id,
							},
						});
					}
				},

				updateBrowserUrl: (
					paneId: string,
					url: string,
					title: string,
					faviconUrl?: string,
				) => {
					const state = get();
					const pane = state.panes[paneId];
					if (!pane?.browser) return;

					const { history: prevHistory, historyIndex } = pane.browser;
					const currentEntry = prevHistory[historyIndex];

					// If the URL matches the current entry, just update the title/favicon
					if (currentEntry && currentEntry.url === url) {
						const titleChanged = currentEntry.title !== title;
						const faviconChanged =
							faviconUrl !== undefined &&
							currentEntry.faviconUrl !== faviconUrl;
						if (!titleChanged && !faviconChanged) return;
						const history = [...prevHistory];
						history[historyIndex] = {
							...currentEntry,
							title,
							...(faviconUrl !== undefined ? { faviconUrl } : {}),
						};
						const newPanes = {
							...state.panes,
							[paneId]: {
								...pane,
								name: title || "Browser",
								browser: { ...pane.browser, history },
							},
						};
						const tabName = deriveTabName(newPanes, pane.tabId);
						set({
							panes: newPanes,
							tabs: state.tabs.map((t) =>
								t.id === pane.tabId ? { ...t, name: tabName } : t,
							),
						});
						return;
					}

					// Truncate forward entries when navigating from a non-end position
					const history = prevHistory.slice(0, historyIndex + 1);
					history.push({
						url,
						title,
						timestamp: Date.now(),
						...(faviconUrl ? { faviconUrl } : {}),
					});
					if (history.length > 100) {
						history.splice(0, history.length - 100);
					}

					const newPanes = {
						...state.panes,
						[paneId]: {
							...pane,
							name: title || "Browser",
							browser: {
								...pane.browser,
								currentUrl: url,
								history,
								historyIndex: history.length - 1,
							},
						},
					};
					const tabName = deriveTabName(newPanes, pane.tabId);
					set({
						panes: newPanes,
						tabs: state.tabs.map((t) =>
							t.id === pane.tabId ? { ...t, name: tabName } : t,
						),
					});
				},

				navigateBrowserHistory: (
					paneId: string,
					direction: "back" | "forward",
				): string | null => {
					const state = get();
					const pane = state.panes[paneId];
					if (!pane?.browser) return null;

					const { history, historyIndex } = pane.browser;
					const newIndex =
						direction === "back" ? historyIndex - 1 : historyIndex + 1;

					if (newIndex < 0 || newIndex >= history.length) return null;

					const entry = history[newIndex];
					const newPanes = {
						...state.panes,
						[paneId]: {
							...pane,
							name: entry.title || "Browser",
							browser: {
								...pane.browser,
								currentUrl: entry.url,
								historyIndex: newIndex,
							},
						},
					};
					const tabName = deriveTabName(newPanes, pane.tabId);
					set({
						panes: newPanes,
						tabs: state.tabs.map((t) =>
							t.id === pane.tabId ? { ...t, name: tabName } : t,
						),
					});

					return entry.url;
				},

				updateBrowserLoading: (paneId: string, isLoading: boolean) => {
					const state = get();
					const pane = state.panes[paneId];
					if (!pane?.browser || pane.browser.isLoading === isLoading) return;

					set({
						panes: {
							...state.panes,
							[paneId]: {
								...pane,
								browser: {
									...pane.browser,
									isLoading,
								},
							},
						},
					});
				},

				setBrowserError: (paneId, error) => {
					const state = get();
					const pane = state.panes[paneId];
					if (!pane?.browser) return;

					set({
						panes: {
							...state.panes,
							[paneId]: {
								...pane,
								browser: {
									...pane.browser,
									error,
								},
							},
						},
					});
				},

				setBrowserViewport: (paneId, viewport) => {
					const state = get();
					const pane = state.panes[paneId];
					if (!pane?.browser) return;

					set({
						panes: {
							...state.panes,
							[paneId]: {
								...pane,
								browser: {
									...pane.browser,
									viewport,
								},
							},
						},
					});
				},

				openDevToolsPane: (tabId, browserPaneId, path) => {
					const state = get();
					const tab = state.tabs.find((t) => t.id === tabId);
					if (!tab) return null;

					const sourcePane = state.panes[browserPaneId];
					if (!sourcePane || sourcePane.tabId !== tabId) return null;

					const newPane = createDevToolsPane(tabId, browserPaneId);

					let newLayout: MosaicNode<string>;
					if (path && path.length > 0) {
						newLayout = updateTree(tab.layout, [
							{
								path,
								spec: {
									$set: {
										direction: "row",
										first: browserPaneId,
										second: newPane.id,
										splitPercentage: 50,
									},
								},
							},
						]);
					} else {
						newLayout = {
							direction: "row",
							first: tab.layout,
							second: newPane.id,
							splitPercentage: 50,
						};
					}

					const newPanes = { ...state.panes, [newPane.id]: newPane };

					set({
						tabs: state.tabs.map((t) =>
							t.id === tabId ? { ...t, layout: newLayout } : t,
						),
						panes: newPanes,
						focusedPaneIds: {
							...state.focusedPaneIds,
							[tabId]: browserPaneId,
						},
					});

					return newPane.id;
				},

				// Reopen operations
				reopenClosedTab: (workspaceId: string): boolean => {
					const state = get();
					// Find the most recently closed tab for this workspace
					const idx = state.closedTabsStack.findIndex(
						(entry) => entry.tab.workspaceId === workspaceId,
					);
					if (idx === -1) return false;

					const entry = state.closedTabsStack[idx];
					const newStack = [
						...state.closedTabsStack.slice(0, idx),
						...state.closedTabsStack.slice(idx + 1),
					];

					// Restore the tab with a new ID to avoid collisions
					const newTabId = generateId("tab");
					const restoredTab = {
						...entry.tab,
						id: newTabId,
					};

					// Restore panes with updated tabId references
					const idMap = new Map<string, string>();
					const restoredPanes: Record<string, (typeof entry.panes)[number]> =
						{};
					for (const pane of entry.panes) {
						const newPaneId = generateId("pane");
						idMap.set(pane.id, newPaneId);
						restoredPanes[newPaneId] = {
							...pane,
							id: newPaneId,
							tabId: newTabId,
							status: "idle",
						};
					}

					// Remap layout leaf IDs
					const remapLayout = (
						node: MosaicNode<string>,
					): MosaicNode<string> => {
						if (typeof node === "string") {
							return idMap.get(node) ?? node;
						}
						return {
							...node,
							first: remapLayout(node.first),
							second: remapLayout(node.second),
						};
					};
					restoredTab.layout = remapLayout(restoredTab.layout);

					const currentActiveId = state.activeTabIds[workspaceId];
					const historyStack = state.tabHistoryStacks[workspaceId] || [];
					const newHistoryStack = currentActiveId
						? [
								currentActiveId,
								...historyStack.filter((id) => id !== currentActiveId),
							]
						: historyStack;

					const firstPaneId = getFirstPaneId(restoredTab.layout);

					set({
						tabs: [...state.tabs, restoredTab],
						panes: { ...state.panes, ...restoredPanes },
						activeTabIds: {
							...state.activeTabIds,
							[workspaceId]: newTabId,
						},
						focusedPaneIds: {
							...state.focusedPaneIds,
							[newTabId]: firstPaneId,
						},
						closedTabsStack: newStack,
						tabHistoryStacks: {
							...state.tabHistoryStacks,
							[workspaceId]: newHistoryStack,
						},
					});

					return true;
				},

				// Chat operations
				switchChatSession: (paneId, sessionId) => {
					const state = get();
					const pane = state.panes[paneId];
					if (!pane?.chat) return;

					set({
						panes: {
							...state.panes,
							[paneId]: {
								...pane,
								chat: { sessionId },
							},
						},
					});
				},

				switchChatMastraSession: (paneId, sessionId) => {
					const state = get();
					const pane = state.panes[paneId];
					if (!pane?.chatMastra) return;

					set({
						panes: {
							...state.panes,
							[paneId]: {
								...pane,
								chatMastra: { sessionId },
							},
						},
					});
				},

				// Query helpers
				getTabsByWorkspace: (workspaceId) => {
					return get().tabs.filter((t) => t.workspaceId === workspaceId);
				},

				getActiveTab: (workspaceId) => {
					const state = get();
					const activeTabId = resolveActiveTabIdForWorkspace({
						workspaceId,
						tabs: state.tabs,
						activeTabIds: state.activeTabIds,
						tabHistoryStacks: state.tabHistoryStacks,
					});
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
				version: 5,
				storage: trpcTabsStorage,
				migrate: (persistedState, version) => {
					const state = persistedState as TabsState;
					if (version < 2 && state.panes) {
						// Migrate needsAttention → status
						for (const pane of Object.values(state.panes)) {
							// biome-ignore lint/suspicious/noExplicitAny: migration from old schema
							const legacyPane = pane as any;
							if (legacyPane.needsAttention === true) {
								pane.status = "review";
							}
							delete legacyPane.needsAttention;
						}
					}
					if (version < 3 && state.panes) {
						// Migrate isLocked → isPinned
						for (const pane of Object.values(state.panes)) {
							if (pane.fileViewer) {
								// biome-ignore lint/suspicious/noExplicitAny: migration from old schema
								const legacyFileViewer = pane.fileViewer as any;
								// Default old panes to pinned (they were explicitly opened)
								pane.fileViewer.isPinned = legacyFileViewer.isLocked ?? true;
								delete legacyFileViewer.isLocked;
							}
						}
					}
					if (version < 5 && state.panes) {
						for (const pane of Object.values(state.panes)) {
							if (pane.chat) {
								pane.chat.sessionId = null;
							}
						}
					}
					return state;
				},
				merge: (persistedState, currentState) => {
					const persisted = persistedState as TabsState;
					// Clear stale transient statuses on startup:
					// - "working": Agent can't be working if app just restarted
					// - "permission": Permission dialog is gone after restart
					// Note: "review" is intentionally preserved so users see missed completions
					if (persisted.panes) {
						for (const pane of Object.values(persisted.panes)) {
							if (pane.status === "working" || pane.status === "permission") {
								pane.status = "idle";
							}
						}
					}

					const mergedState = { ...currentState, ...persisted };

					// Sanitize persisted tab pointers to be workspace-scoped.
					// This prevents cross-workspace rendering when state is stale/corrupt.
					const tabIds = new Set(mergedState.tabs.map((t) => t.id));
					const workspaceTabIdSets = new Map<string, Set<string>>();
					for (const tab of mergedState.tabs) {
						let setForWorkspace = workspaceTabIdSets.get(tab.workspaceId);
						if (!setForWorkspace) {
							setForWorkspace = new Set();
							workspaceTabIdSets.set(tab.workspaceId, setForWorkspace);
						}
						setForWorkspace.add(tab.id);
					}

					const workspaceIds = new Set<string>([
						...Object.keys(mergedState.activeTabIds),
						...Object.keys(mergedState.tabHistoryStacks),
					]);
					for (const tab of mergedState.tabs) {
						workspaceIds.add(tab.workspaceId);
					}

					const nextActiveTabIds = { ...mergedState.activeTabIds };
					const nextHistoryStacks = { ...mergedState.tabHistoryStacks };

					for (const workspaceId of workspaceIds) {
						nextActiveTabIds[workspaceId] = resolveActiveTabIdForWorkspace({
							workspaceId,
							tabs: mergedState.tabs,
							activeTabIds: mergedState.activeTabIds,
							tabHistoryStacks: mergedState.tabHistoryStacks,
						});

						const workspaceTabIds = workspaceTabIdSets.get(workspaceId);
						const history = nextHistoryStacks[workspaceId] ?? [];
						if (workspaceTabIds && Array.isArray(history)) {
							nextHistoryStacks[workspaceId] = history.filter((id) =>
								workspaceTabIds.has(id),
							);
						}
					}

					const nextFocusedPaneIds = { ...mergedState.focusedPaneIds };
					for (const [tabId, paneId] of Object.entries(nextFocusedPaneIds)) {
						if (!tabIds.has(tabId)) {
							delete nextFocusedPaneIds[tabId];
							continue;
						}
						const pane = mergedState.panes[paneId];
						if (!pane || pane.tabId !== tabId) {
							delete nextFocusedPaneIds[tabId];
						}
					}

					return {
						...mergedState,
						activeTabIds: nextActiveTabIds,
						tabHistoryStacks: nextHistoryStacks,
						focusedPaneIds: nextFocusedPaneIds,
					};
				},
			},
		),
		{ name: "TabsStore" },
	),
);
