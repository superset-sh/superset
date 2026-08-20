import { create } from "zustand";
import { persist } from "zustand/middleware";

interface PullRequestsSplitViewState {
	isListCollapsed: boolean;
	toggleListCollapsed: () => void;
}

export const usePullRequestsSplitViewStore =
	create<PullRequestsSplitViewState>()(
		persist(
			(set) => ({
				isListCollapsed: false,
				toggleListCollapsed: () =>
					set((state) => ({ isListCollapsed: !state.isListCollapsed })),
			}),
			{ name: "pull-requests-split-view-state", version: 1 },
		),
	);
