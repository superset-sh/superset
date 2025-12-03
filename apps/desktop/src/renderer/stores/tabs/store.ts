import type { MosaicNode } from "react-mosaic-component";
import { updateTree } from "react-mosaic-component";
import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import { electronStorage } from "../../lib/electron-storage";
import type { WindowsState, WindowsStore } from "./types";
import {
	createPane,
	createWindowWithPane,
	extractPaneIdsFromLayout,
	getFirstPaneId,
	getPaneIdsForWindow,
	isLastPaneInWindow,
	removePaneFromLayout,
} from "./utils";
import { killTerminalForTab } from "./utils/terminal-cleanup";

/**
 * Finds the next best window to activate when closing a window.
 * Priority order:
 * 1. Most recently used window from history stack
 * 2. Next/previous window by position
 * 3. Any remaining window in the workspace
 */
const findNextWindow = (
	state: WindowsState,
	windowIdToClose: string,
): string | null => {
	const windowToClose = state.windows.find((w) => w.id === windowIdToClose);
	if (!windowToClose) return null;

	const workspaceId = windowToClose.workspaceId;
	const workspaceWindows = state.windows.filter(
		(w) => w.workspaceId === workspaceId && w.id !== windowIdToClose,
	);

	if (workspaceWindows.length === 0) return null;

	// Try history first
	const historyStack = state.windowHistoryStacks[workspaceId] || [];
	for (const historyWindowId of historyStack) {
		if (historyWindowId === windowIdToClose) continue;
		if (workspaceWindows.some((w) => w.id === historyWindowId)) {
			return historyWindowId;
		}
	}

	// Try position-based (next, then previous)
	const allWorkspaceWindows = state.windows.filter(
		(w) => w.workspaceId === workspaceId,
	);
	const currentIndex = allWorkspaceWindows.findIndex(
		(w) => w.id === windowIdToClose,
	);

	if (currentIndex !== -1) {
		const nextIndex = currentIndex + 1;
		const prevIndex = currentIndex - 1;

		if (
			nextIndex < allWorkspaceWindows.length &&
			allWorkspaceWindows[nextIndex].id !== windowIdToClose
		) {
			return allWorkspaceWindows[nextIndex].id;
		}
		if (
			prevIndex >= 0 &&
			allWorkspaceWindows[prevIndex].id !== windowIdToClose
		) {
			return allWorkspaceWindows[prevIndex].id;
		}
	}

	// Fallback to first available
	return workspaceWindows[0]?.id || null;
};

export const useWindowsStore = create<WindowsStore>()(
	devtools(
		persist(
			(set, get) => ({
				windows: [],
				panes: {},
				activeWindowIds: {},
				focusedPaneIds: {},
				windowHistoryStacks: {},

				// Window operations
				addWindow: (workspaceId) => {
					const state = get();
					const { window, pane } = createWindowWithPane(
						workspaceId,
						state.windows,
					);

					const currentActiveId = state.activeWindowIds[workspaceId];
					const historyStack = state.windowHistoryStacks[workspaceId] || [];
					const newHistoryStack = currentActiveId
						? [
								currentActiveId,
								...historyStack.filter((id) => id !== currentActiveId),
							]
						: historyStack;

					set({
						windows: [...state.windows, window],
						panes: { ...state.panes, [pane.id]: pane },
						activeWindowIds: {
							...state.activeWindowIds,
							[workspaceId]: window.id,
						},
						focusedPaneIds: {
							...state.focusedPaneIds,
							[window.id]: pane.id,
						},
						windowHistoryStacks: {
							...state.windowHistoryStacks,
							[workspaceId]: newHistoryStack,
						},
					});

					return { windowId: window.id, paneId: pane.id };
				},

				removeWindow: (windowId) => {
					const state = get();
					const windowToRemove = state.windows.find((w) => w.id === windowId);
					if (!windowToRemove) return;

					// Kill all terminals for panes in this window
					const paneIds = getPaneIdsForWindow(state.panes, windowId);
					for (const paneId of paneIds) {
						killTerminalForTab(paneId);
					}

					// Remove all panes belonging to this window
					const newPanes = { ...state.panes };
					for (const paneId of paneIds) {
						delete newPanes[paneId];
					}

					// Remove window
					const newWindows = state.windows.filter((w) => w.id !== windowId);

					// Update active window if needed
					const workspaceId = windowToRemove.workspaceId;
					const newActiveWindowIds = { ...state.activeWindowIds };
					const newHistoryStack = (
						state.windowHistoryStacks[workspaceId] || []
					).filter((id) => id !== windowId);

					if (state.activeWindowIds[workspaceId] === windowId) {
						newActiveWindowIds[workspaceId] = findNextWindow(state, windowId);
					}

					// Clean up focused pane tracking
					const newFocusedPaneIds = { ...state.focusedPaneIds };
					delete newFocusedPaneIds[windowId];

					set({
						windows: newWindows,
						panes: newPanes,
						activeWindowIds: newActiveWindowIds,
						focusedPaneIds: newFocusedPaneIds,
						windowHistoryStacks: {
							...state.windowHistoryStacks,
							[workspaceId]: newHistoryStack,
						},
					});
				},

				renameWindow: (windowId, newName) => {
					set((state) => ({
						windows: state.windows.map((w) =>
							w.id === windowId ? { ...w, name: newName } : w,
						),
					}));
				},

				setActiveWindow: (workspaceId, windowId) => {
					const state = get();
					const window = state.windows.find((w) => w.id === windowId);
					if (!window || window.workspaceId !== workspaceId) {
						return;
					}

					const currentActiveId = state.activeWindowIds[workspaceId];
					const historyStack = state.windowHistoryStacks[workspaceId] || [];

					let newHistoryStack = historyStack.filter((id) => id !== windowId);
					if (currentActiveId && currentActiveId !== windowId) {
						newHistoryStack = [
							currentActiveId,
							...newHistoryStack.filter((id) => id !== currentActiveId),
						];
					}

					// Clear needsAttention for the focused pane in the window being activated
					const focusedPaneId = state.focusedPaneIds[windowId];
					const newPanes = { ...state.panes };
					if (focusedPaneId && newPanes[focusedPaneId]?.needsAttention) {
						newPanes[focusedPaneId] = {
							...newPanes[focusedPaneId],
							needsAttention: false,
						};
					}

					set({
						activeWindowIds: {
							...state.activeWindowIds,
							[workspaceId]: windowId,
						},
						windowHistoryStacks: {
							...state.windowHistoryStacks,
							[workspaceId]: newHistoryStack,
						},
						panes: newPanes,
					});
				},

				reorderWindows: (workspaceId, startIndex, endIndex) => {
					const state = get();
					const workspaceWindows = state.windows.filter(
						(w) => w.workspaceId === workspaceId,
					);
					const otherWindows = state.windows.filter(
						(w) => w.workspaceId !== workspaceId,
					);

					const [removed] = workspaceWindows.splice(startIndex, 1);
					workspaceWindows.splice(endIndex, 0, removed);

					set({ windows: [...otherWindows, ...workspaceWindows] });
				},

				reorderWindowById: (windowId, targetIndex) => {
					const state = get();
					const windowToMove = state.windows.find((w) => w.id === windowId);
					if (!windowToMove) return;

					const workspaceId = windowToMove.workspaceId;
					const workspaceWindows = state.windows.filter(
						(w) => w.workspaceId === workspaceId,
					);
					const otherWindows = state.windows.filter(
						(w) => w.workspaceId !== workspaceId,
					);

					const currentIndex = workspaceWindows.findIndex(
						(w) => w.id === windowId,
					);
					if (currentIndex === -1) return;

					workspaceWindows.splice(currentIndex, 1);
					workspaceWindows.splice(targetIndex, 0, windowToMove);

					set({ windows: [...otherWindows, ...workspaceWindows] });
				},

				updateWindowLayout: (windowId, layout) => {
					const state = get();
					const window = state.windows.find((w) => w.id === windowId);
					if (!window) return;

					// Get panes that should exist based on the new layout
					const newPaneIds = new Set(extractPaneIdsFromLayout(layout));
					const oldPaneIds = new Set(extractPaneIdsFromLayout(window.layout));

					// Find removed panes and clean them up
					const removedPaneIds = Array.from(oldPaneIds).filter(
						(id) => !newPaneIds.has(id),
					);

					const newPanes = { ...state.panes };
					for (const paneId of removedPaneIds) {
						killTerminalForTab(paneId);
						delete newPanes[paneId];
					}

					// Update focused pane if it was removed
					let newFocusedPaneIds = state.focusedPaneIds;
					const currentFocusedPaneId = state.focusedPaneIds[windowId];
					if (
						currentFocusedPaneId &&
						removedPaneIds.includes(currentFocusedPaneId)
					) {
						newFocusedPaneIds = {
							...state.focusedPaneIds,
							[windowId]: getFirstPaneId(layout),
						};
					}

					set({
						windows: state.windows.map((w) =>
							w.id === windowId ? { ...w, layout } : w,
						),
						panes: newPanes,
						focusedPaneIds: newFocusedPaneIds,
					});
				},

				// Pane operations
				addPane: (windowId) => {
					const state = get();
					const window = state.windows.find((w) => w.id === windowId);
					if (!window) return "";

					const newPane = createPane(windowId);

					// Add pane to layout (append to the right)
					const newLayout: MosaicNode<string> = {
						direction: "row",
						first: window.layout,
						second: newPane.id,
						splitPercentage: 50,
					};

					set({
						windows: state.windows.map((w) =>
							w.id === windowId ? { ...w, layout: newLayout } : w,
						),
						panes: { ...state.panes, [newPane.id]: newPane },
						focusedPaneIds: {
							...state.focusedPaneIds,
							[windowId]: newPane.id,
						},
					});

					return newPane.id;
				},

				removePane: (paneId) => {
					const state = get();
					const pane = state.panes[paneId];
					if (!pane) return;

					const window = state.windows.find((w) => w.id === pane.windowId);
					if (!window) return;

					// If this is the last pane, remove the entire window
					if (isLastPaneInWindow(state.panes, window.id)) {
						get().removeWindow(window.id);
						return;
					}

					// Kill the terminal
					killTerminalForTab(paneId);

					// Remove pane from layout
					const newLayout = removePaneFromLayout(window.layout, paneId);
					if (!newLayout) {
						// This shouldn't happen since we checked isLastPaneInWindow
						get().removeWindow(window.id);
						return;
					}

					// Remove pane from panes map
					const newPanes = { ...state.panes };
					delete newPanes[paneId];

					// Update focused pane if needed
					let newFocusedPaneIds = state.focusedPaneIds;
					if (state.focusedPaneIds[window.id] === paneId) {
						newFocusedPaneIds = {
							...state.focusedPaneIds,
							[window.id]: getFirstPaneId(newLayout),
						};
					}

					set({
						windows: state.windows.map((w) =>
							w.id === window.id ? { ...w, layout: newLayout } : w,
						),
						panes: newPanes,
						focusedPaneIds: newFocusedPaneIds,
					});
				},

				setFocusedPane: (windowId, paneId) => {
					const state = get();
					const pane = state.panes[paneId];
					if (!pane || pane.windowId !== windowId) return;

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
							[windowId]: paneId,
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

				// Split operations
				splitPaneVertical: (windowId, sourcePaneId, path) => {
					const state = get();
					const window = state.windows.find((w) => w.id === windowId);
					if (!window) return;

					const sourcePane = state.panes[sourcePaneId];
					if (!sourcePane || sourcePane.windowId !== windowId) return;

					const newPane = createPane(windowId);

					let newLayout: MosaicNode<string>;
					if (path && path.length > 0) {
						// Split at a specific path in the layout
						newLayout = updateTree(window.layout, [
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
							first: window.layout,
							second: newPane.id,
							splitPercentage: 50,
						};
					}

					set({
						windows: state.windows.map((w) =>
							w.id === windowId ? { ...w, layout: newLayout } : w,
						),
						panes: { ...state.panes, [newPane.id]: newPane },
						focusedPaneIds: {
							...state.focusedPaneIds,
							[windowId]: newPane.id,
						},
					});
				},

				splitPaneHorizontal: (windowId, sourcePaneId, path) => {
					const state = get();
					const window = state.windows.find((w) => w.id === windowId);
					if (!window) return;

					const sourcePane = state.panes[sourcePaneId];
					if (!sourcePane || sourcePane.windowId !== windowId) return;

					const newPane = createPane(windowId);

					let newLayout: MosaicNode<string>;
					if (path && path.length > 0) {
						// Split at a specific path in the layout
						newLayout = updateTree(window.layout, [
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
							first: window.layout,
							second: newPane.id,
							splitPercentage: 50,
						};
					}

					set({
						windows: state.windows.map((w) =>
							w.id === windowId ? { ...w, layout: newLayout } : w,
						),
						panes: { ...state.panes, [newPane.id]: newPane },
						focusedPaneIds: {
							...state.focusedPaneIds,
							[windowId]: newPane.id,
						},
					});
				},

				// Query helpers
				getWindowsByWorkspace: (workspaceId) => {
					return get().windows.filter((w) => w.workspaceId === workspaceId);
				},

				getActiveWindow: (workspaceId) => {
					const state = get();
					const activeWindowId = state.activeWindowIds[workspaceId];
					if (!activeWindowId) return null;
					return state.windows.find((w) => w.id === activeWindowId) || null;
				},

				getPanesForWindow: (windowId) => {
					const state = get();
					return Object.values(state.panes).filter(
						(p) => p.windowId === windowId,
					);
				},

				getFocusedPane: (windowId) => {
					const state = get();
					const focusedPaneId = state.focusedPaneIds[windowId];
					if (!focusedPaneId) return null;
					return state.panes[focusedPaneId] || null;
				},
			}),
			{
				name: "windows-storage",
				storage: electronStorage,
			},
		),
		{ name: "WindowsStore" },
	),
);
