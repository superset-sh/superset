import { create } from "zustand";

/**
 * Which lineage thread (keyed by its root workspace id) the pointer is over,
 * so every row in that thread can brighten its rails together — rows of one
 * thread are DOM siblings, not descendants, so CSS group-hover can't do it.
 */
interface LineageThreadHoverState {
	hoveredThreadRootId: string | null;
	setHoveredThreadRoot: (rootId: string | null) => void;
	clearHoveredThreadRoot: (rootId: string) => void;
}

export const useLineageThreadHover = create<LineageThreadHoverState>((set) => ({
	hoveredThreadRootId: null,
	setHoveredThreadRoot: (rootId) => set({ hoveredThreadRootId: rootId }),
	// Only the thread that set it clears it, so a leave racing a
	// neighbour's enter can't wipe the neighbour's highlight.
	clearHoveredThreadRoot: (rootId) =>
		set((state) =>
			state.hoveredThreadRootId === rootId
				? { hoveredThreadRootId: null }
				: state,
		),
}));
