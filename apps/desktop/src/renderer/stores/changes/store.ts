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
	selectedFiles: Record<string, SelectedFileState>;
	activeTab: ChangesSidebarTab;
	viewMode: DiffViewMode;
	fileListViewMode: FileListViewMode;
	expandedSections: Record<ChangeCategory, boolean>;
	sectionOrder: ChangeCategory[];
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
	toggleHideUnchangedRegions: () => void;
	toggleFocusMode: () => void;
	reset: (workspaceId: string) => void;
}

const initialState = {
	selectedFiles: {} as Record<string, SelectedFileState>,
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
					// Deselect deletes the key — a persisted null entry per workspace
					// ever touched is how this map grew unbounded.
					if (!file || !absolutePath) {
						if (!(workspaceId in selectedFiles)) return;
						const { [workspaceId]: _removed, ...rest } = selectedFiles;
						set({ selectedFiles: rest });
						return;
					}
					set({
						selectedFiles: {
							...selectedFiles,
							[workspaceId]: {
								absolutePath,
								file,
								category: category ?? "against-base",
								commitHash: commitHash ?? null,
							},
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

				toggleHideUnchangedRegions: () => {
					set({ hideUnchangedRegions: !get().hideUnchangedRegions });
				},

				toggleFocusMode: () => {
					set({ focusMode: !get().focusMode });
				},

				reset: (workspaceId) => {
					const { selectedFiles } = get();
					if (!(workspaceId in selectedFiles)) return;
					const { [workspaceId]: _removed, ...rest } = selectedFiles;
					set({ selectedFiles: rest });
				},
			}),
			{
				name: "changes-store",
				version: 6,
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
					if (version < 6) {
						// Deselect used to persist null entries; drop the accumulated
						// tombstones and the unread showRenderedMarkdown map.
						delete state.showRenderedMarkdown;
						state.selectedFiles = Object.fromEntries(
							Object.entries(
								(state.selectedFiles ?? {}) as Record<string, unknown>,
							).filter(([, value]) => value !== null),
						);
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
					hideUnchangedRegions: state.hideUnchangedRegions,
					focusMode: state.focusMode,
				}),
			},
		),
		{ name: "ChangesStore" },
	),
);
