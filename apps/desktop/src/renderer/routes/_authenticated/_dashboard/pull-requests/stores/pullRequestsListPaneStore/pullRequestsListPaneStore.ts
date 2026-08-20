import { create } from "zustand";

interface PullRequestsListPaneState {
	isCollapsed: boolean;
	toggle: () => void;
}

/** Whether the list column is hidden while a PR's detail pane is open —
 *  session-only UI state, not persisted. */
export const usePullRequestsListPaneStore = create<PullRequestsListPaneState>(
	(set) => ({
		isCollapsed: false,
		toggle: () => set((state) => ({ isCollapsed: !state.isCollapsed })),
	}),
);
