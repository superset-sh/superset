import { create } from "zustand";

interface DragTabState {
	draggingTabId: string | null;
	draggingSourcePanelId: string | null;
}

interface DragTabActions {
	setDragging: (tabId: string, panelId: string) => void;
	clearDragging: () => void;
}

/**
 * Tracks an in-flight tab drag so panel drop overlays know when to mount and
 * pane content (terminals/webviews) can disable pointer events.
 */
export const useDragTabStore = create<DragTabState & DragTabActions>((set) => ({
	draggingTabId: null,
	draggingSourcePanelId: null,
	setDragging: (tabId, panelId) =>
		set({ draggingTabId: tabId, draggingSourcePanelId: panelId }),
	clearDragging: () =>
		set({ draggingTabId: null, draggingSourcePanelId: null }),
}));
