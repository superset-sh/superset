import type { MosaicNode } from "react-mosaic-component";
import { updateTree } from "react-mosaic-component";
import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import { trpcTabsStorage } from "../../lib/trpc-storage";
import { movePaneToNewTab, movePaneToTab } from "./actions/move-pane";
import type {
	AddFileViewerPaneOptions,
	AddPlanViewerPaneOptions,
	TabsState,
	TabsStore,
} from "./types";
import {
	type CreatePaneOptions,
	createFileViewerPane,
	createPane,
	createPlanViewerPane,
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

					const paneIds = getPaneIdsForTab(state.panes, tabId);
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

					const newPaneIds = new Set(extractPaneIdsFromLayout(layout));
					const oldPaneIds = new Set(extractPaneIdsFromLayout(tab.layout));

					const removedPaneIds = Array.from(oldPaneIds).filter(
						(id) => !newPaneIds.has(id),
					);

					const newPanes = { ...state.panes };
					for (const paneId of removedPaneIds) {
						// P2: Only kill terminal for actual terminal panes (avoid unnecessary IPC)
						if (state.panes[paneId]?.type === "terminal") {
							killTerminalForPane(paneId);
						}
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

				addFileViewerPane: (
					workspaceId: string,
					options: AddFileViewerPaneOptions,
				) => {
					const state = get();
					const activeTabId = state.activeTabIds[workspaceId];
					const activeTab = state.tabs.find((t) => t.id === activeTabId);

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

					// Look for an existing unlocked file-viewer pane in the active tab
					const tabPaneIds = extractPaneIdsFromLayout(activeTab.layout);
					const fileViewerPanes = tabPaneIds
						.map((id) => state.panes[id])
						.filter(
							(p) =>
								p?.type === "file-viewer" &&
								p.fileViewer &&
								!p.fileViewer.isLocked,
						);

					// If we found an unlocked file-viewer pane, reuse it
					if (fileViewerPanes.length > 0) {
						const paneToReuse = fileViewerPanes[0];
						const fileName =
							options.filePath.split("/").pop() || options.filePath;

						// Determine default view mode
						let viewMode: "raw" | "rendered" | "diff" = "raw";
						if (options.diffCategory) {
							viewMode = "diff";
						} else if (
							options.filePath.endsWith(".md") ||
							options.filePath.endsWith(".markdown") ||
							options.filePath.endsWith(".mdx")
						) {
							viewMode = "rendered";
						}

						set({
							panes: {
								...state.panes,
								[paneToReuse.id]: {
									...paneToReuse,
									name: fileName,
									fileViewer: {
										filePath: options.filePath,
										viewMode,
										isLocked: false,
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
					const newPane = createFileViewerPane(activeTab.id, options);

					const newLayout: MosaicNode<string> = {
						direction: "row",
						first: activeTab.layout,
						second: newPane.id,
						splitPercentage: 50,
					};

					set({
						tabs: state.tabs.map((t) =>
							t.id === activeTab.id ? { ...t, layout: newLayout } : t,
						),
						panes: { ...state.panes, [newPane.id]: newPane },
						focusedPaneIds: {
							...state.focusedPaneIds,
							[activeTab.id]: newPane.id,
						},
					});

					return newPane.id;
				},

				addPlanViewerPane: (
					workspaceId: string,
					options: AddPlanViewerPaneOptions,
				) => {
					const state = get();
					const activeTabId = state.activeTabIds[workspaceId];
					const activeTab = state.tabs.find((t) => t.id === activeTabId);

					// If no active tab, create a new one first
					if (!activeTab) {
						const { tabId, paneId } = get().addTab(workspaceId);
						// Replace the pane with a plan-viewer pane
						const planPane = createPlanViewerPane(tabId, options);
						set((s) => ({
							panes: {
								...s.panes,
								[paneId]: {
									...planPane,
									id: paneId, // Keep the original ID
								},
							},
						}));
						return paneId;
					}

					// Look for an existing unlocked plan-viewer pane to reuse
					const tabPaneIds = extractPaneIdsFromLayout(activeTab.layout);
					const planViewerPanes = tabPaneIds
						.map((id) => state.panes[id])
						.filter(
							(p) =>
								p?.type === "plan-viewer" &&
								p.planViewer &&
								!p.planViewer.isLocked,
						);

					// If we found an unlocked plan-viewer pane, reuse it
					if (planViewerPanes.length > 0) {
						const paneToReuse = planViewerPanes[0];
						const newPlanPane = createPlanViewerPane(activeTab.id, options);

						set({
							panes: {
								...state.panes,
								[paneToReuse.id]: {
									...newPlanPane,
									id: paneToReuse.id, // Keep the original ID
								},
							},
							// Do NOT update focusedPaneIds - don't steal focus
						});

						return paneToReuse.id;
					}

					// No reusable pane found, create a new one (without focus change!)
					const newPane = createPlanViewerPane(activeTab.id, options);

					const newLayout: MosaicNode<string> = {
						direction: "row",
						first: activeTab.layout,
						second: newPane.id,
						splitPercentage: 50,
					};

					set({
						tabs: state.tabs.map((t) =>
							t.id === activeTab.id ? { ...t, layout: newLayout } : t,
						),
						panes: { ...state.panes, [newPane.id]: newPane },
						// NOTE: Do NOT update focusedPaneIds - pane appears without stealing focus
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

					// Only kill terminal sessions for terminal panes (avoids unnecessary IPC for file-viewers)
					if (pane.type === "terminal") {
						killTerminalForPane(paneId);
					}

					const newLayout = removePaneFromLayout(tab.layout, paneId);
					if (!newLayout) {
						// This shouldn't happen since we checked isLastPaneInTab
						get().removeTab(tab.id);
						return;
					}

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

				clearWorkspaceAttention: (workspaceId) => {
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
						if (newPanes[paneId]?.needsAttention) {
							newPanes[paneId] = { ...newPanes[paneId], needsAttention: false };
							hasChanges = true;
						}
					}

					if (hasChanges) {
						set({ panes: newPanes });
					}
				},

				updatePaneCwd: (paneId, cwd, confirmed) => {
					set((state) => ({
						panes: {
							...state.panes,
							[paneId]: state.panes[paneId]
								? { ...state.panes[paneId], cwd, cwdConfirmed: confirmed }
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

					// Clone file-viewer panes instead of creating a terminal
					const newPane =
						sourcePane.type === "file-viewer" && sourcePane.fileViewer
							? createFileViewerPane(tabId, {
									filePath: sourcePane.fileViewer.filePath,
									viewMode: sourcePane.fileViewer.viewMode,
									isLocked: true, // Lock the cloned pane
									diffLayout: sourcePane.fileViewer.diffLayout,
									diffCategory: sourcePane.fileViewer.diffCategory,
									commitHash: sourcePane.fileViewer.commitHash,
									oldPath: sourcePane.fileViewer.oldPath,
								})
							: createPane(tabId);

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

					// Clone file-viewer panes instead of creating a terminal
					const newPane =
						sourcePane.type === "file-viewer" && sourcePane.fileViewer
							? createFileViewerPane(tabId, {
									filePath: sourcePane.fileViewer.filePath,
									viewMode: sourcePane.fileViewer.viewMode,
									isLocked: true, // Lock the cloned pane
									diffLayout: sourcePane.fileViewer.diffLayout,
									diffCategory: sourcePane.fileViewer.diffCategory,
									commitHash: sourcePane.fileViewer.commitHash,
									oldPath: sourcePane.fileViewer.oldPath,
								})
							: createPane(tabId);

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
				partialize: (state) => {
					// Find all plan-viewer pane IDs
					const planPaneIds = new Set(
						Object.entries(state.panes)
							.filter(([, pane]) => pane.type === "plan-viewer")
							.map(([id]) => id),
					);

					// Filter panes - exclude plan-viewer panes
					const filteredPanes = Object.fromEntries(
						Object.entries(state.panes).filter(
							([, pane]) => pane.type !== "plan-viewer",
						),
					);

					// Filter layouts to remove dangling plan-viewer references
					const filterLayout = (
						layout: MosaicNode<string>,
					): MosaicNode<string> | null => {
						if (typeof layout === "string") {
							return planPaneIds.has(layout) ? null : layout;
						}
						const newFirst = filterLayout(layout.first);
						const newSecond = filterLayout(layout.second);
						if (!newFirst && !newSecond) return null;
						if (!newFirst) return newSecond;
						if (!newSecond) return newFirst;
						return { ...layout, first: newFirst, second: newSecond };
					};

					const filteredTabs = state.tabs.map((tab) => ({
						...tab,
						layout: filterLayout(tab.layout) || tab.layout,
					}));

					// Filter focusedPaneIds to remove plan-viewer references
					const filteredFocusedPaneIds = Object.fromEntries(
						Object.entries(state.focusedPaneIds).filter(
							([, paneId]) => !planPaneIds.has(paneId),
						),
					);

					return {
						...state,
						tabs: filteredTabs,
						panes: filteredPanes,
						focusedPaneIds: filteredFocusedPaneIds,
					};
				},
			},
		),
		{ name: "TabsStore" },
	),
);
