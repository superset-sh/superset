import type { DragItem } from "renderer/screens/main/components/WorkspaceSidebar/types";
import { create } from "zustand";

interface ActiveDragItemState {
	activeDragItem: DragItem | null;
	setActiveDragItem: (item: DragItem) => void;
	clearActiveDragItem: () => void;
}

export const useActiveDragItemStore = create<ActiveDragItemState>((set) => ({
	activeDragItem: null,
	setActiveDragItem: (item) => set({ activeDragItem: item }),
	clearActiveDragItem: () => set({ activeDragItem: null }),
}));

/** Synchronous read for native event handlers (outside React lifecycle) */
export function getActiveDragItem(): DragItem | null {
	return useActiveDragItemStore.getState().activeDragItem;
}
