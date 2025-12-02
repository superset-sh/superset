import type { MosaicBranch, MosaicNode } from "react-mosaic-component";

/**
 * Pane types that can be displayed within a window
 */
export type PaneType = "terminal";

/**
 * A Pane represents a single terminal or content area within a Window.
 * Panes always belong to a Window and are referenced by ID in the Window's layout.
 */
export interface Pane {
	id: string;
	windowId: string;
	type: PaneType;
	name: string;
	isNew?: boolean;
	needsAttention?: boolean;
}

/**
 * A Window is a container that holds one or more Panes in a Mosaic layout.
 * Windows are displayed in the sidebar and always have at least one Pane.
 */
export interface Window {
	id: string;
	name: string;
	workspaceId: string;
	layout: MosaicNode<string>; // Always defined, leaves are paneIds
	createdAt: number;
}

/**
 * State for the windows/panes store
 */
export interface WindowsState {
	windows: Window[];
	panes: Record<string, Pane>;
	activeWindowIds: Record<string, string | null>; // workspaceId → windowId
	focusedPaneIds: Record<string, string>; // windowId → paneId (last focused pane in each window)
	windowHistoryStacks: Record<string, string[]>; // workspaceId → windowId[] (MRU history)
}

/**
 * Actions available on the windows store
 */
export interface WindowsStore extends WindowsState {
	// Window operations
	addWindow: (workspaceId: string) => { windowId: string; paneId: string };
	removeWindow: (windowId: string) => void;
	renameWindow: (windowId: string, newName: string) => void;
	setActiveWindow: (workspaceId: string, windowId: string) => void;
	reorderWindows: (
		workspaceId: string,
		startIndex: number,
		endIndex: number,
	) => void;
	reorderWindowById: (windowId: string, targetIndex: number) => void;
	updateWindowLayout: (windowId: string, layout: MosaicNode<string>) => void;

	// Pane operations
	addPane: (windowId: string) => string;
	removePane: (paneId: string) => void;
	setFocusedPane: (windowId: string, paneId: string) => void;
	markPaneAsUsed: (paneId: string) => void;
	setNeedsAttention: (paneId: string, needsAttention: boolean) => void;

	// Split operations
	splitPaneVertical: (
		windowId: string,
		sourcePaneId: string,
		path?: MosaicBranch[],
	) => void;
	splitPaneHorizontal: (
		windowId: string,
		sourcePaneId: string,
		path?: MosaicBranch[],
	) => void;

	// Query helpers
	getWindowsByWorkspace: (workspaceId: string) => Window[];
	getActiveWindow: (workspaceId: string) => Window | null;
	getPanesForWindow: (windowId: string) => Pane[];
	getFocusedPane: (windowId: string) => Pane | null;
}
