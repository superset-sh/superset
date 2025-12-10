import type {
	ChangeCategory,
	ChangedFile,
	DiffViewMode,
} from "shared/changes-types";
import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

interface ChangesState {
	/** Currently selected category (against-main, committed, staged, unstaged) */
	selectedCategory: ChangeCategory;

	/** Selected file within the category */
	selectedFile: ChangedFile | null;

	/** For committed category: which commit is selected */
	selectedCommitHash: string | null;

	/** Diff view mode (side-by-side or inline) */
	viewMode: DiffViewMode;

	/** Which sections are expanded in the sidebar */
	expandedSections: Record<ChangeCategory, boolean>;

	/** Base branch for comparison (null means use auto-detected default) */
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
	baseBranch: null as string | null,
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
				// Only persist view preferences, not selection state
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
