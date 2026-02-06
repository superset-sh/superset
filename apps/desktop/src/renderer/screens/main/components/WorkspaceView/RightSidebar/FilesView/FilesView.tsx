import {
	asyncDataLoaderFeature,
	expandAllFeature,
	type ItemInstance,
	selectionFeature,
} from "@headless-tree/core";
import { useTree } from "@headless-tree/react";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LuFile, LuFolder } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useFileExplorerStore } from "renderer/stores/file-explorer";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { DirectoryEntry } from "shared/file-tree-types";
import { DeleteConfirmDialog } from "./components/DeleteConfirmDialog";
import { FileSearchResultItem } from "./components/FileSearchResultItem";
import { FileTreeItem } from "./components/FileTreeItem";
import { FileTreeToolbar } from "./components/FileTreeToolbar";
import { NewItemInput } from "./components/NewItemInput";
import { RenameInput } from "./components/RenameInput";
import { ROW_HEIGHT, TREE_INDENT } from "./constants";
import { useFileSearch } from "./hooks/useFileSearch";
import { useFileTreeActions } from "./hooks/useFileTreeActions";
import type { NewItemMode } from "./types";

export function FilesView() {
	const { workspaceId } = useParams({ strict: false });
	const { data: workspace } = electronTrpc.workspaces.get.useQuery(
		{ id: workspaceId ?? "" },
		{ enabled: !!workspaceId },
	);
	const worktreePath = workspace?.worktreePath;

	const [searchTerm, setSearchTerm] = useState("");
	const projectId = workspace?.project?.id;
	const showHiddenFiles = useFileExplorerStore((s) =>
		projectId ? (s.showHiddenFiles[projectId] ?? false) : false,
	);
	const toggleHiddenFiles = useFileExplorerStore((s) => s.toggleHiddenFiles);

	// Refs avoid stale closure in dataLoader callbacks
	const worktreePathRef = useRef(worktreePath);
	worktreePathRef.current = worktreePath;
	const showHiddenFilesRef = useRef(showHiddenFiles);
	showHiddenFilesRef.current = showHiddenFiles;

	const trpcUtils = electronTrpc.useUtils();

	const tree = useTree<DirectoryEntry>({
		rootItemId: "root",
		getItemName: (item: ItemInstance<DirectoryEntry>) =>
			item.getItemData()?.name ?? "",
		isItemFolder: (item: ItemInstance<DirectoryEntry>) =>
			item.getItemData()?.isDirectory ?? false,
		dataLoader: {
			getItem: async (itemId: string): Promise<DirectoryEntry> => {
				if (itemId === "root") {
					return {
						id: "root",
						name: "root",
						path: worktreePathRef.current ?? "",
						relativePath: "",
						isDirectory: true,
					};
				}
				const parts = itemId.split(":::");
				return {
					id: itemId,
					name: parts[1] ?? itemId,
					path: parts[0] ?? itemId,
					relativePath: parts[2] ?? "",
					isDirectory: parts[3] === "true",
				};
			},
			getChildren: async (itemId: string): Promise<string[]> => {
				const currentPath = worktreePathRef.current;
				if (!currentPath) return [];

				const dirPath =
					itemId === "root" ? currentPath : itemId.split(":::")[0];
				if (!dirPath) return [];

				try {
					const entries = await trpcUtils.filesystem.readDirectory.fetch({
						dirPath,
						rootPath: currentPath,
						includeHidden: showHiddenFilesRef.current,
					});
					return entries.map(
						(e) =>
							`${e.path}:::${e.name}:::${e.relativePath}:::${e.isDirectory}`,
					);
				} catch (error) {
					console.error("[FilesView] Failed to load children:", error);
					return [];
				}
			},
		},
		features: [asyncDataLoaderFeature, selectionFeature, expandAllFeature],
	});

	const prevWorktreePathRef = useRef(worktreePath);
	useEffect(() => {
		if (
			worktreePath &&
			prevWorktreePathRef.current !== worktreePath &&
			prevWorktreePathRef.current !== undefined
		) {
			tree.getItemInstance("root")?.invalidateChildrenIds();
		}
		prevWorktreePathRef.current = worktreePath;
	}, [worktreePath, tree]);

	const { createFile, createDirectory, rename, deleteItems, isDeleting } =
		useFileTreeActions({
			worktreePath,
			onRefresh: async (parentPath: string) => {
				const isRoot = parentPath === worktreePath;
				const itemId = isRoot
					? "root"
					: tree
							.getItems()
							.find(
								(item: ItemInstance<DirectoryEntry>) =>
									item.getItemData()?.path === parentPath,
							)
							?.getId();
				if (itemId) {
					await tree.getItemInstance(itemId)?.invalidateChildrenIds();
				}
			},
		});

	const {
		searchResults,
		isFetching: isSearchFetching,
		hasQuery: isSearching,
	} = useFileSearch({
		worktreePath,
		searchTerm,
		includeHidden: showHiddenFiles,
	});

	const addFileViewerPane = useTabsStore((s) => s.addFileViewerPane);
	const openFileInEditorMutation =
		electronTrpc.external.openFileInEditor.useMutation();

	const [newItemMode, setNewItemMode] = useState<NewItemMode>(null);
	const [newItemParentPath, setNewItemParentPath] = useState<string>("");
	const [renameEntry, setRenameEntry] = useState<DirectoryEntry | null>(null);
	const [deleteEntry, setDeleteEntry] = useState<DirectoryEntry | null>(null);
	const [showDeleteDialog, setShowDeleteDialog] = useState(false);

	const handleFileActivate = useCallback(
		(entry: DirectoryEntry) => {
			if (!workspaceId || !worktreePath || entry.isDirectory) return;
			addFileViewerPane(workspaceId, {
				filePath: entry.relativePath,
			});
		},
		[workspaceId, worktreePath, addFileViewerPane],
	);

	const handleOpenInEditor = useCallback(
		(entry: DirectoryEntry) => {
			if (!worktreePath) return;
			openFileInEditorMutation.mutate({ path: entry.path, cwd: worktreePath });
		},
		[worktreePath, openFileInEditorMutation],
	);

	const handleNewFile = useCallback(
		async (parentPath: string) => {
			if (parentPath !== worktreePath) {
				const item = tree
					.getItems()
					.find(
						(i: ItemInstance<DirectoryEntry>) =>
							i.getItemData()?.path === parentPath,
					);
				if (item && !item.isExpanded()) {
					await item.expand();
				}
			}
			setNewItemMode("file");
			setNewItemParentPath(parentPath);
		},
		[worktreePath, tree],
	);

	const handleNewFolder = useCallback(
		async (parentPath: string) => {
			if (parentPath !== worktreePath) {
				const item = tree
					.getItems()
					.find(
						(i: ItemInstance<DirectoryEntry>) =>
							i.getItemData()?.path === parentPath,
					);
				if (item && !item.isExpanded()) {
					await item.expand();
				}
			}
			setNewItemMode("folder");
			setNewItemParentPath(parentPath);
		},
		[worktreePath, tree],
	);

	const handleNewItemSubmit = useCallback(
		(name: string) => {
			if (newItemMode === "file") {
				createFile(newItemParentPath, name);
			} else if (newItemMode === "folder") {
				createDirectory(newItemParentPath, name);
			}
			setNewItemMode(null);
			setNewItemParentPath("");
		},
		[newItemMode, newItemParentPath, createFile, createDirectory],
	);

	const handleNewItemCancel = useCallback(() => {
		setNewItemMode(null);
		setNewItemParentPath("");
	}, []);

	const handleDeleteRequest = useCallback((entry: DirectoryEntry) => {
		setDeleteEntry(entry);
		setShowDeleteDialog(true);
	}, []);

	const handleDeleteConfirm = useCallback(() => {
		if (deleteEntry) {
			deleteItems([deleteEntry.path]);
		}
		setShowDeleteDialog(false);
		setDeleteEntry(null);
	}, [deleteEntry, deleteItems]);

	const handleRename = useCallback((entry: DirectoryEntry) => {
		setRenameEntry(entry);
	}, []);

	const handleRenameSubmit = useCallback(
		(newName: string) => {
			if (renameEntry) {
				rename(renameEntry.path, newName);
			}
			setRenameEntry(null);
		},
		[renameEntry, rename],
	);

	const handleRenameCancel = useCallback(() => {
		setRenameEntry(null);
	}, []);

	const handleCollapseAll = useCallback(() => {
		tree.collapseAll();
	}, [tree]);

	const handleRefresh = useCallback(() => {
		// Invalidate root explicitly (getItems() may not include it)
		tree.getItemInstance("root")?.invalidateChildrenIds();
		// Also invalidate all expanded directories so new files in nested folders appear
		for (const item of tree.getItems()) {
			if (item.getItemData()?.isDirectory) {
				item.invalidateChildrenIds();
			}
		}
	}, [tree]);

	const handleToggleHiddenFiles = useCallback(() => {
		if (!projectId) return;
		// Update ref synchronously so invalidation uses correct value
		showHiddenFilesRef.current = !showHiddenFilesRef.current;
		toggleHiddenFiles(projectId);
		// invalidateChildrenIds doesn't cascade, so invalidate every directory
		tree.getItemInstance("root")?.invalidateChildrenIds();
		for (const item of tree.getItems()) {
			if (item.getItemData()?.isDirectory) {
				item.invalidateChildrenIds();
			}
		}
	}, [tree, projectId, toggleHiddenFiles]);

	const searchResultEntries = useMemo(() => {
		return searchResults.map((result) => ({
			id: result.id,
			name: result.name,
			path: result.path,
			relativePath: result.relativePath,
			isDirectory: result.isDirectory,
		}));
	}, [searchResults]);

	if (!worktreePath) {
		return (
			<div className="flex-1 flex items-center justify-center text-muted-foreground text-sm p-4">
				No workspace selected
			</div>
		);
	}

	return (
		<div className="flex flex-col flex-1 min-h-0">
			<FileTreeToolbar
				searchTerm={searchTerm}
				onSearchChange={setSearchTerm}
				onNewFile={() => handleNewFile(worktreePath)}
				onNewFolder={() => handleNewFolder(worktreePath)}
				onCollapseAll={handleCollapseAll}
				onRefresh={handleRefresh}
				showHiddenFiles={showHiddenFiles}
				onToggleHiddenFiles={handleToggleHiddenFiles}
			/>

			<div className="flex-1 min-h-0 overflow-hidden">
				<ContextMenu>
					<ContextMenuTrigger asChild className="h-full">
						<div className="h-full overflow-auto">
							{newItemMode && newItemParentPath === worktreePath && (
								<NewItemInput
									mode={newItemMode}
									parentPath={newItemParentPath}
									onSubmit={handleNewItemSubmit}
									onCancel={handleNewItemCancel}
								/>
							)}

							{isSearching ? (
								searchResultEntries.length > 0 ? (
									<div className="flex flex-col">
										{searchResultEntries.map((entry) =>
											renameEntry?.path === entry.path ? (
												<RenameInput
													key={entry.id}
													entry={entry}
													onSubmit={handleRenameSubmit}
													onCancel={handleRenameCancel}
												/>
											) : (
												<FileSearchResultItem
													key={entry.id}
													entry={entry}
													worktreePath={worktreePath}
													onActivate={handleFileActivate}
													onOpenInEditor={handleOpenInEditor}
													onNewFile={handleNewFile}
													onNewFolder={handleNewFolder}
													onRename={handleRename}
													onDelete={handleDeleteRequest}
												/>
											),
										)}
									</div>
								) : (
									<div className="flex-1 flex items-center justify-center text-muted-foreground text-sm p-4">
										{isSearchFetching
											? "Searching files..."
											: "No matching files"}
									</div>
								)
							) : (
								<div {...tree.getContainerProps()} className="outline-none">
									{tree.getItems().map((item: ItemInstance<DirectoryEntry>) => {
										const data = item.getItemData();
										if (!data || item.getId() === "root") return null;
										const showNewItemInput =
											newItemMode &&
											data.isDirectory &&
											data.path === newItemParentPath;
										const isRenaming = renameEntry?.path === data.path;
										return (
											<div key={item.getId()}>
												{isRenaming ? (
													<RenameInput
														entry={data}
														onSubmit={handleRenameSubmit}
														onCancel={handleRenameCancel}
														level={item.getItemMeta().level}
													/>
												) : (
													<FileTreeItem
														item={item}
														entry={data}
														rowHeight={ROW_HEIGHT}
														indent={TREE_INDENT}
														worktreePath={worktreePath}
														onActivate={handleFileActivate}
														onOpenInEditor={handleOpenInEditor}
														onNewFile={handleNewFile}
														onNewFolder={handleNewFolder}
														onRename={handleRename}
														onDelete={handleDeleteRequest}
													/>
												)}
												{showNewItemInput && (
													<NewItemInput
														mode={newItemMode}
														parentPath={newItemParentPath}
														onSubmit={handleNewItemSubmit}
														onCancel={handleNewItemCancel}
														level={item.getItemMeta().level + 1}
													/>
												)}
											</div>
										);
									})}
								</div>
							)}
						</div>
					</ContextMenuTrigger>
					<ContextMenuContent className="w-48">
						<ContextMenuItem onClick={() => handleNewFile(worktreePath)}>
							<LuFile className="mr-2 size-4" />
							New File
						</ContextMenuItem>
						<ContextMenuItem onClick={() => handleNewFolder(worktreePath)}>
							<LuFolder className="mr-2 size-4" />
							New Folder
						</ContextMenuItem>
					</ContextMenuContent>
				</ContextMenu>
			</div>

			<DeleteConfirmDialog
				entry={deleteEntry}
				open={showDeleteDialog}
				onOpenChange={setShowDeleteDialog}
				onConfirm={handleDeleteConfirm}
				isDeleting={isDeleting}
			/>
		</div>
	);
}
