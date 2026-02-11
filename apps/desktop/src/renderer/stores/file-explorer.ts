import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

export type SortBy = "name" | "type" | "modified";
export type SortDirection = "asc" | "desc";

interface FileExplorerState {
	expandedFolders: Record<string, string[]>;
	selectedItems: Record<string, string[]>;
	searchTerm: Record<string, string>;
	showHiddenFiles: Record<string, boolean>;
	sortBy: SortBy;
	sortDirection: SortDirection;
	toggleFolder: (worktreePath: string, folderId: string) => void;
	setExpandedFolders: (worktreePath: string, folderIds: string[]) => void;
	expandFolder: (worktreePath: string, folderId: string) => void;
	collapseFolder: (worktreePath: string, folderId: string) => void;
	collapseAll: (worktreePath: string) => void;
	setSelectedItems: (worktreePath: string, items: string[]) => void;
	addSelectedItem: (worktreePath: string, itemId: string) => void;
	removeSelectedItem: (worktreePath: string, itemId: string) => void;
	clearSelection: (worktreePath: string) => void;
	setSearchTerm: (worktreePath: string, term: string) => void;
	toggleHiddenFiles: (projectId: string) => void;
	setSortBy: (sortBy: SortBy) => void;
	setSortDirection: (direction: SortDirection) => void;
}

export const useFileExplorerStore = create<FileExplorerState>()(
	devtools(
		persist(
			(set, get) => ({
				expandedFolders: {},
				selectedItems: {},
				searchTerm: {},
				showHiddenFiles: {},
				sortBy: "name",
				sortDirection: "asc",

				toggleFolder: (worktreePath, folderId) => {
					const current = get().expandedFolders[worktreePath] || [];
					const isExpanded = current.includes(folderId);
					set({
						expandedFolders: {
							...get().expandedFolders,
							[worktreePath]: isExpanded
								? current.filter((id) => id !== folderId)
								: [...current, folderId],
						},
					});
				},

				setExpandedFolders: (worktreePath, folderIds) => {
					set({
						expandedFolders: {
							...get().expandedFolders,
							[worktreePath]: folderIds,
						},
					});
				},

				expandFolder: (worktreePath, folderId) => {
					const current = get().expandedFolders[worktreePath] || [];
					if (!current.includes(folderId)) {
						set({
							expandedFolders: {
								...get().expandedFolders,
								[worktreePath]: [...current, folderId],
							},
						});
					}
				},

				collapseFolder: (worktreePath, folderId) => {
					const current = get().expandedFolders[worktreePath] || [];
					set({
						expandedFolders: {
							...get().expandedFolders,
							[worktreePath]: current.filter((id) => id !== folderId),
						},
					});
				},

				collapseAll: (worktreePath) => {
					set({
						expandedFolders: {
							...get().expandedFolders,
							[worktreePath]: [],
						},
					});
				},

				setSelectedItems: (worktreePath, items) => {
					set({
						selectedItems: {
							...get().selectedItems,
							[worktreePath]: items,
						},
					});
				},

				addSelectedItem: (worktreePath, itemId) => {
					const current = get().selectedItems[worktreePath] || [];
					if (!current.includes(itemId)) {
						set({
							selectedItems: {
								...get().selectedItems,
								[worktreePath]: [...current, itemId],
							},
						});
					}
				},

				removeSelectedItem: (worktreePath, itemId) => {
					const current = get().selectedItems[worktreePath] || [];
					set({
						selectedItems: {
							...get().selectedItems,
							[worktreePath]: current.filter((id) => id !== itemId),
						},
					});
				},

				clearSelection: (worktreePath) => {
					set({
						selectedItems: {
							...get().selectedItems,
							[worktreePath]: [],
						},
					});
				},

				setSearchTerm: (worktreePath, term) => {
					set({
						searchTerm: {
							...get().searchTerm,
							[worktreePath]: term,
						},
					});
				},

				toggleHiddenFiles: (projectId) => {
					const current = get().showHiddenFiles[projectId] ?? false;
					set({
						showHiddenFiles: {
							...get().showHiddenFiles,
							[projectId]: !current,
						},
					});
				},

				setSortBy: (sortBy) => {
					set({ sortBy });
				},

				setSortDirection: (direction) => {
					set({ sortDirection: direction });
				},
			}),
			{
				name: "file-explorer-store",
				partialize: (state) => ({
					showHiddenFiles: state.showHiddenFiles,
					sortBy: state.sortBy,
					sortDirection: state.sortDirection,
					expandedFolders: state.expandedFolders,
				}),
			},
		),
		{ name: "FileExplorerStore" },
	),
);
