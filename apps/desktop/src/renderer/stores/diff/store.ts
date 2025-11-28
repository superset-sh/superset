import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { DiffStore } from "./types";

const initialState = {
	mode: "unstaged" as const,
	commitRange: null,
	scrollToFilePath: null,
	expandedFolders: new Set<string>(),
};

export const useDiffStore = create<DiffStore>()(
	devtools(
		(set) => ({
			...initialState,

			setMode: (mode) =>
				set(
					{
						mode,
						scrollToFilePath: null,
					},
					false,
					"setMode",
				),

			setCommitRange: (commitRange) =>
				set(
					{
						commitRange,
						scrollToFilePath: null,
					},
					false,
					"setCommitRange",
				),

			scrollToFile: (scrollToFilePath) =>
				set({ scrollToFilePath }, false, "scrollToFile"),

			clearScrollTarget: () =>
				set({ scrollToFilePath: null }, false, "clearScrollTarget"),

			toggleFolder: (path) =>
				set(
					(state) => {
						const newFolders = new Set(state.expandedFolders);
						if (newFolders.has(path)) {
							newFolders.delete(path);
						} else {
							newFolders.add(path);
						}
						return { expandedFolders: newFolders };
					},
					false,
					"toggleFolder",
				),

			expandAllFolders: (paths) =>
				set(
					{ expandedFolders: new Set(paths) },
					false,
					"expandAllFolders",
				),

			collapseAllFolders: () =>
				set(
					{ expandedFolders: new Set<string>() },
					false,
					"collapseAllFolders",
				),

			reset: () => set(initialState, false, "reset"),
		}),
		{ name: "DiffStore" },
	),
);
