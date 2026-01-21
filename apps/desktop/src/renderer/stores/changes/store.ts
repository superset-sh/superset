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
	selectedFiles: Record<string, SelectedFileState | null>;
	viewMode: DiffViewMode;
	fileListViewMode: FileListViewMode;
	expandedSections: Record<ChangeCategory, boolean>;
	baseBranch: string | null;
	showRenderedMarkdown: Record<string, boolean>;
	hideUnchangedRegions: boolean;

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
	toggleRenderedMarkdown: (worktreePath: string) => void;
	getShowRenderedMarkdown: (worktreePath: string) => boolean;
	toggleHideUnchangedRegions: () => void;
	reset: (worktreePath: string) => void;
}

const initialState = {
	selectedFiles: {} as Record<string, SelectedFileState | null>,
	viewMode: "side-by-side" as DiffViewMode,
	fileListViewMode: "grouped" as FileListViewMode,
	expandedSections: {
		"against-base": true,
		committed: true,
		staged: true,
		unstaged: true,
	},
	baseBranch: null,
	showRenderedMarkdown: {} as Record<string, boolean>,
	hideUnchangedRegions: false,
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
										category: category ?? "against-base",
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

				toggleRenderedMarkdown: (worktreePath) => {
					const { showRenderedMarkdown } = get();
					set({
						showRenderedMarkdown: {
							...showRenderedMarkdown,
							[worktreePath]: !showRenderedMarkdown[worktreePath],
						},
					});
				},

				getShowRenderedMarkdown: (worktreePath) => {
					return get().showRenderedMarkdown[worktreePath] ?? false;
				},

				toggleHideUnchangedRegions: () => {
					set({ hideUnchangedRegions: !get().hideUnchangedRegions });
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
					showRenderedMarkdown: state.showRenderedMarkdown,
					hideUnchangedRegions: state.hideUnchangedRegions,
				}),
			},
		),
		{ name: "ChangesStore" },
	),
);
