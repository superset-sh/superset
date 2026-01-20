import { create } from "zustand";

interface DraggingPaneState {
	draggingPaneId: string | null;
	draggingTabId: string | null;
	setDraggingPane: (paneId: string | null, tabId: string | null) => void;
}

export const useDraggingPaneStore = create<DraggingPaneState>((set) => ({
	draggingPaneId: null,
	draggingTabId: null,
	setDraggingPane: (paneId, tabId) =>
		set({ draggingPaneId: paneId, draggingTabId: tabId }),
}));
