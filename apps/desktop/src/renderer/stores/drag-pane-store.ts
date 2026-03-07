import { create } from "zustand";

interface DragPaneState {
	draggingPaneId: string | null;
	draggingSourceTabId: string | null;
	isResizing: boolean;
}

interface DragPaneActions {
	setDragging: (paneId: string, tabId: string) => void;
	clearDragging: () => void;
	setResizing: (value: boolean) => void;
}

export const useDragPaneStore = create<DragPaneState & DragPaneActions>(
	(set) => ({
		draggingPaneId: null,
		draggingSourceTabId: null,
		isResizing: false,
		setDragging: (paneId, tabId) =>
			set({ draggingPaneId: paneId, draggingSourceTabId: tabId }),
		clearDragging: () =>
			set({ draggingPaneId: null, draggingSourceTabId: null }),
		setResizing: (value) => set({ isResizing: value }),
	}),
);
