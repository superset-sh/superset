import { create } from "zustand";

export interface PaneFocusTarget {
	workspaceId: string;
	tabId: string;
	paneId: string;
}

interface PaneFocusIntentState {
	/** Bumped per request, so asking for the same pane twice still fires. */
	tick: number;
	target: PaneFocusTarget | null;
	request: (target: PaneFocusTarget) => void;
	clear: () => void;
}

/**
 * One-shot request to focus a pane, possibly in a workspace that is not
 * mounted yet. A workspace's pane store lives and dies with its route, so the
 * switcher leaves the target here and navigates; the target route applies it
 * on mount. Not persisted — a pending request is meaningless after a restart.
 */
export const usePaneFocusIntent = create<PaneFocusIntentState>((set) => ({
	tick: 0,
	target: null,
	request: (target) => set((state) => ({ tick: state.tick + 1, target })),
	clear: () => set({ target: null }),
}));
