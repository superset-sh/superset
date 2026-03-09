import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

export type SearchDialogMode = "quickOpen" | "keywordSearch";
export type SearchScope = "workspace" | "global";

interface SearchDialogModeState {
	includePattern: string;
	excludePattern: string;
	filtersOpen: boolean;
	scope?: SearchScope;
}

interface SearchDialogState {
	byMode: Record<SearchDialogMode, SearchDialogModeState>;
	setIncludePattern: (mode: SearchDialogMode, value: string) => void;
	setExcludePattern: (mode: SearchDialogMode, value: string) => void;
	setFiltersOpen: (mode: SearchDialogMode, open: boolean) => void;
	setScope: (mode: SearchDialogMode, scope: SearchScope) => void;
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

				setScope: (mode, scope) => {
					set((state) => ({
						byMode: {
							...state.byMode,
							[mode]: {
								...state.byMode[mode],
								scope,
							},
						},
					}));
				},
			}),
			{
				name: "search-dialog-store",
				version: 1,
				migrate: (persisted, version) => {
					if (version === 0) {
						const state = persisted as Record<string, unknown>;
						const byMode = state.byMode as
							| Record<string, Record<string, unknown>>
							| undefined;
						if (byMode) {
							for (const mode of Object.values(byMode)) {
								if (mode.scope === undefined) {
									mode.scope = "workspace";
								}
							}
						}
					}
					return persisted as SearchDialogState;
				},
			},
		),
		{ name: "SearchDialogStore" },
	),
);
