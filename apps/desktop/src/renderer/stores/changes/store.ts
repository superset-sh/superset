import type {
	ChangeCategory,
	ChangedFile,
	DiffViewMode,
} from "shared/changes-types";
import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

type FileListViewMode = "grouped" | "tree";

interface SelectedFileState {
	file: ChangedFile;
	category: ChangeCategory;
	commitHash: string | null;
}

interface ChangesState {
	selectedFiles: Record<string, SelectedFileState | null>; // worktreePath → selection
	viewMode: DiffViewMode;
	fileListViewMode: FileListViewMode;
	expandedSections: Record<ChangeCategory, boolean>;
	baseBranch: string | null;

	// Actions
	selectFile: (
		worktreePath: string,
		file: ChangedFile | null,
		category?: ChangeCategory,
		commitHash?: string | null,
	) => void;
	getSelectedFile: (worktreePath: string) => SelectedFileState | null;
	setViewMode: (mode: DiffViewMode) => void;
	setFileListViewMode: (mode: FileListViewMode) => void;
	toggleSection: (section: ChangeCategory) => void;
	setSectionExpanded: (section: ChangeCategory, expanded: boolean) => void;
	setBaseBranch: (branch: string | null) => void;
	reset: (worktreePath: string) => void;
}

const initialState = {
	selectedFiles: {} as Record<string, SelectedFileState | null>,
	viewMode: "side-by-side" as DiffViewMode,
	fileListViewMode: "grouped" as FileListViewMode,
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

				selectFile: (worktreePath, file, category, commitHash) => {
					const { selectedFiles } = get();
					set({
						selectedFiles: {
							...selectedFiles,
							[worktreePath]: file
								? {
										file,
										category: category ?? "against-main",
										commitHash: commitHash ?? null,
									}
								: null,
						},
					});
				},

				getSelectedFile: (worktreePath) => {
					return get().selectedFiles[worktreePath] ?? null;
				},

				setViewMode: (mode) => {
					set({ viewMode: mode });
				},

				setFileListViewMode: (mode) => {
					set({ fileListViewMode: mode });
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

				reset: (worktreePath) => {
					const { selectedFiles } = get();
					set({
						selectedFiles: {
							...selectedFiles,
							[worktreePath]: null,
						},
					});
				},
			}),
			{
				name: "changes-store",
				partialize: (state) => ({
					selectedFiles: state.selectedFiles,
					viewMode: state.viewMode,
					fileListViewMode: state.fileListViewMode,
					expandedSections: state.expandedSections,
					baseBranch: state.baseBranch,
				}),
			},
		),
		{ name: "ChangesStore" },
	),
);
