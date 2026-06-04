import {
	retargetAbsolutePath,
	toRelativeWorkspacePath,
} from "shared/absolute-paths";
import type {
	ChangeCategory,
	ChangedFile,
	DiffViewMode,
} from "shared/changes-types";
import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import {
	DEFAULT_CHANGE_SECTION_ORDER,
	normalizeChangeSectionOrder,
} from "./section-order";

type FileListViewMode = "grouped" | "tree";
type ChangesSidebarTab = "diffs" | "review";

interface SelectedFileState {
	absolutePath: string;
	file: ChangedFile;
	category: ChangeCategory;
	commitHash: string | null;
}

interface ChangesState {
	selectedFiles: Record<string, SelectedFileState | null>;
	activeTab: ChangesSidebarTab;
	viewMode: DiffViewMode;
	fileListViewMode: FileListViewMode;
	expandedSections: Record<ChangeCategory, boolean>;
	sectionOrder: ChangeCategory[];
	showRenderedMarkdown: Record<string, boolean>;
	hideUnchangedRegions: boolean;
	focusMode: boolean;

	selectFile: (
		workspaceId: string,
		absolutePath: string | null,
		file: ChangedFile | null,
		category?: ChangeCategory,
		commitHash?: string | null,
	) => void;
	retargetSelectedFile: (
		workspaceId: string,
		oldAbsolutePath: string,
		newAbsolutePath: string,
		worktreePath: string,
		isDirectory: boolean,
	) => void;
	getSelectedFile: (workspaceId: string) => SelectedFileState | null;
	setActiveTab: (tab: ChangesSidebarTab) => void;
	setViewMode: (mode: DiffViewMode) => void;
	setFileListViewMode: (mode: FileListViewMode) => void;
	toggleSection: (section: ChangeCategory) => void;
	setSectionExpanded: (section: ChangeCategory, expanded: boolean) => void;
	moveSection: (fromSection: ChangeCategory, toSection: ChangeCategory) => void;
	toggleRenderedMarkdown: (worktreePath: string) => void;
	getShowRenderedMarkdown: (worktreePath: string) => boolean;
	toggleHideUnchangedRegions: () => void;
	toggleFocusMode: () => void;
	reset: (workspaceId: string) => void;
}

const initialState = {
	selectedFiles: {} as Record<string, SelectedFileState | null>,
	activeTab: "diffs" as ChangesSidebarTab,
	viewMode: "side-by-side" as DiffViewMode,
	fileListViewMode: "grouped" as FileListViewMode,
	expandedSections: {
		"against-base": true,
		committed: true,
		staged: true,
		unstaged: true,
	},
	sectionOrder: [...DEFAULT_CHANGE_SECTION_ORDER],
	showRenderedMarkdown: {} as Record<string, boolean>,
	hideUnchangedRegions: false,
	focusMode: false,
};

export const useChangesStore = create<ChangesState>()(
	devtools(
		persist(
			(set, get) => ({
				...initialState,

				selectFile: (workspaceId, absolutePath, file, category, commitHash) => {
					const { selectedFiles } = get();
					set({
						selectedFiles: {
							...selectedFiles,
							[workspaceId]:
								file && absolutePath
									? {
											absolutePath,
											file,
											category: category ?? "against-base",
											commitHash: commitHash ?? null,
										}
									: null,
						},
					});
				},

				retargetSelectedFile: (
					workspaceId,
					oldAbsolutePath,
					newAbsolutePath,
					worktreePath,
					isDirectory,
				) => {
					const currentSelection = get().selectedFiles[workspaceId];
					if (!currentSelection) {
						return;
					}

					const nextAbsolutePath = retargetAbsolutePath(
						currentSelection.absolutePath,
						oldAbsolutePath,
						newAbsolutePath,
						isDirectory,
					);

					if (!nextAbsolutePath) {
						return;
					}

					set({
						selectedFiles: {
							...get().selectedFiles,
							[workspaceId]: {
								...currentSelection,
								absolutePath: nextAbsolutePath,
								file: {
									...currentSelection.file,
									path: toRelativeWorkspacePath(worktreePath, nextAbsolutePath),
								},
							},
						},
					});
				},

				getSelectedFile: (workspaceId) => {
					return get().selectedFiles[workspaceId] ?? null;
				},

				setActiveTab: (activeTab) => {
					set({ activeTab });
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

				moveSection: (fromSection, toSection) => {
					if (fromSection === toSection) return;

					const nextSectionOrder = normalizeChangeSectionOrder(
						get().sectionOrder,
					);
					const fromIndex = nextSectionOrder.indexOf(fromSection);
					const toIndex = nextSectionOrder.indexOf(toSection);

					if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
						return;
					}

					const reordered = [...nextSectionOrder];
					const [moved] = reordered.splice(fromIndex, 1);
					reordered.splice(toIndex, 0, moved);
					set({ sectionOrder: reordered });
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

				toggleFocusMode: () => {
					set({ focusMode: !get().focusMode });
				},

				reset: (workspaceId) => {
					const { selectedFiles } = get();
					set({
						selectedFiles: {
							...selectedFiles,
							[workspaceId]: null,
						},
					});
				},
			}),
			{
				name: "changes-store",
				version: 5,
				migrate: (persisted, version) => {
					const state = persisted as Record<string, unknown>;
					if (version < 2) {
						delete state.baseBranch;
					}
					if (version < 3) {
						state.sectionOrder = [...DEFAULT_CHANGE_SECTION_ORDER];
					}
					if (version < 4) {
						state.selectedFiles = {};
					}
					if (version < 5) {
						state.activeTab = "diffs";
					}
					state.sectionOrder = normalizeChangeSectionOrder(
						state.sectionOrder as ChangeCategory[] | undefined,
					);
					return state as unknown as ChangesState;
				},
				partialize: (state) => ({
					selectedFiles: state.selectedFiles,
					activeTab: state.activeTab,
					viewMode: state.viewMode,
					fileListViewMode: state.fileListViewMode,
					expandedSections: state.expandedSections,
					sectionOrder: state.sectionOrder,
					showRenderedMarkdown: state.showRenderedMarkdown,
					hideUnchangedRegions: state.hideUnchangedRegions,
					focusMode: state.focusMode,
				}),
			},
		),
		{ name: "ChangesStore" },
	),
);
