import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

export type SearchDialogMode = "quickOpen" | "keywordSearch";

interface SearchDialogModeState {
	includePattern: string;
	excludePattern: string;
	filtersOpen: boolean;
}

interface SearchDialogState {
	byMode: Record<SearchDialogMode, SearchDialogModeState>;
	setIncludePattern: (mode: SearchDialogMode, value: string) => void;
	setExcludePattern: (mode: SearchDialogMode, value: string) => void;
	setFiltersOpen: (mode: SearchDialogMode, open: boolean) => void;
}

const DEFAULT_MODE_STATE: SearchDialogModeState = {
	includePattern: "",
	excludePattern: "",
	filtersOpen: false,
};

export const useSearchDialogStore = create<SearchDialogState>()(
	devtools(
		persist(
			(set) => ({
				byMode: {
					quickOpen: { ...DEFAULT_MODE_STATE },
					keywordSearch: { ...DEFAULT_MODE_STATE },
				},

				setIncludePattern: (mode, value) => {
					set((state) => ({
						byMode: {
							...state.byMode,
							[mode]: {
								...state.byMode[mode],
								includePattern: value,
							},
						},
					}));
				},

				setExcludePattern: (mode, value) => {
					set((state) => ({
						byMode: {
							...state.byMode,
							[mode]: {
								...state.byMode[mode],
								excludePattern: value,
							},
						},
					}));
				},

				setFiltersOpen: (mode, open) => {
					set((state) => ({
						byMode: {
							...state.byMode,
							[mode]: {
								...state.byMode[mode],
								filtersOpen: open,
							},
						},
					}));
				},
			}),
			{
				name: "search-dialog-store",
			},
		),
		{ name: "SearchDialogStore" },
	),
);
