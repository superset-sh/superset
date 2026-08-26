import { create } from "zustand";
import { persist } from "zustand/middleware";

export const DEFAULT_PULL_REQUESTS_LIST_WIDTH = 420;
export const MIN_PULL_REQUESTS_LIST_WIDTH = 300;
export const MAX_PULL_REQUESTS_LIST_WIDTH = 720;

interface PullRequestsSplitViewState {
	/** Hides the list pane — the detail pane takes the full width. */
	isListCollapsed: boolean;
	/** Hides the detail pane — the list pane takes the full width. Mutually
	 *  exclusive with isListCollapsed: hiding one pane always reveals the
	 *  other, since hiding both would leave nothing on screen. */
	isDetailCollapsed: boolean;
	width: number;
	isResizing: boolean;
	toggleListCollapsed: () => void;
	toggleDetailCollapsed: () => void;
	/** Explicitly expands the detail pane, e.g. when selecting a pull
	 *  request — unlike toggleDetailCollapsed, this never re-collapses it. */
	expandDetail: () => void;
	setWidth: (width: number) => void;
	setIsResizing: (isResizing: boolean) => void;
}

export const usePullRequestsSplitViewStore =
	create<PullRequestsSplitViewState>()(
		persist(
			(set) => ({
				isListCollapsed: false,
				isDetailCollapsed: false,
				width: DEFAULT_PULL_REQUESTS_LIST_WIDTH,
				isResizing: false,
				toggleListCollapsed: () =>
					set((state) => {
						const isListCollapsed = !state.isListCollapsed;
						return {
							isListCollapsed,
							isDetailCollapsed: isListCollapsed
								? false
								: state.isDetailCollapsed,
						};
					}),
				toggleDetailCollapsed: () =>
					set((state) => {
						const isDetailCollapsed = !state.isDetailCollapsed;
						return {
							isDetailCollapsed,
							isListCollapsed: isDetailCollapsed
								? false
								: state.isListCollapsed,
						};
					}),
				expandDetail: () => set({ isDetailCollapsed: false }),
				setWidth: (width) =>
					set({
						width: Math.max(
							MIN_PULL_REQUESTS_LIST_WIDTH,
							Math.min(MAX_PULL_REQUESTS_LIST_WIDTH, width),
						),
					}),
				setIsResizing: (isResizing) => set({ isResizing }),
			}),
			{
				name: "pull-requests-split-view-state",
				version: 2,
				partialize: (state) => ({
					isListCollapsed: state.isListCollapsed,
					isDetailCollapsed: state.isDetailCollapsed,
					width: state.width,
					// isResizing intentionally excluded - ephemeral UI state
				}),
			},
		),
	);
