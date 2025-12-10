import type {
	ChangeCategory,
	ChangedFile,
	DiffViewMode,
} from "shared/changes-types";
import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

interface ChangesState {
	selectedCategory: ChangeCategory;
	selectedFile: ChangedFile | null;
	selectedCommitHash: string | null;
	viewMode: DiffViewMode;
	expandedSections: Record<ChangeCategory, boolean>;
	baseBranch: string | null;

	// Actions
	selectCategory: (category: ChangeCategory) => void;
	selectFile: (file: ChangedFile | null) => void;
	selectCommit: (hash: string | null) => void;
	setViewMode: (mode: DiffViewMode) => void;
	toggleSection: (section: ChangeCategory) => void;
	setSectionExpanded: (section: ChangeCategory, expanded: boolean) => void;
	setBaseBranch: (branch: string | null) => void;
	reset: () => void;
}

const initialState = {
	selectedCategory: "against-main" as ChangeCategory,
	selectedFile: null,
	selectedCommitHash: null,
	viewMode: "side-by-side" as DiffViewMode,
	expandedSections: {
		"against-main": true,
		committed: true,
		staged: true,
		unstaged: true,
	},
	baseBranch: null,
};

export const useChangesStore = create<ChangesState>()(
	devtools(
		persist(
			(set, get) => ({
				...initialState,

				selectCategory: (category) => {
					set({ selectedCategory: category });
				},

				selectFile: (file) => {
					set({ selectedFile: file });
				},

				selectCommit: (hash) => {
					set({ selectedCommitHash: hash });
				},

				setViewMode: (mode) => {
					set({ viewMode: mode });
				},

				toggleSection: (section) => {
					const { expandedSections } = get();
					set({
						expandedSections: {
							...expandedSections,
							[section]: !expandedSections[section],
						},
					});
				},

				setSectionExpanded: (section, expanded) => {
					const { expandedSections } = get();
					set({
						expandedSections: {
							...expandedSections,
							[section]: expanded,
						},
					});
				},

				setBaseBranch: (branch) => {
					set({ baseBranch: branch });
				},

				reset: () => {
					set({
						selectedFile: null,
						selectedCommitHash: null,
					});
				},
			}),
			{
				name: "changes-store",
				partialize: (state) => ({
					viewMode: state.viewMode,
					expandedSections: state.expandedSections,
					baseBranch: state.baseBranch,
				}),
			},
		),
		{ name: "ChangesStore" },
	),
);
