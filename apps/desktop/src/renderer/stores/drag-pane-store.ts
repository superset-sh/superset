import { create } from "zustand";

interface DragPaneState {
	draggingPaneId: string | null;
	draggingSourceTabId: string | null;
}

interface DragPaneActions {
	setDragging: (paneId: string, tabId: string) => void;
	clearDragging: () => void;
}

export const useDragPaneStore = create<DragPaneState & DragPaneActions>(
	(set) => ({
		draggingPaneId: null,
		draggingSourceTabId: null,
		setDragging: (paneId, tabId) =>
			set({ draggingPaneId: paneId, draggingSourceTabId: tabId }),
		clearDragging: () =>
			set({ draggingPaneId: null, draggingSourceTabId: null }),
	}),
);
