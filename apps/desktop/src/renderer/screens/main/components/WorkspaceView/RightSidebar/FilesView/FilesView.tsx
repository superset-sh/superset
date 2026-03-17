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
import { useWorkspaceFileEvents } from "renderer/screens/main/components/WorkspaceView/hooks/useWorkspaceFileEvents";
import { useTabsStore } from "renderer/stores/tabs/store";
import { retargetAbsolutePath } from "shared/absolute-paths";
import type {
	DirectoryEntry,
	FileSystemChangeEvent,
} from "shared/file-tree-types";
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

interface PendingTreeRefresh {
	fullRefresh: boolean;
	directoryPaths: Set<string>;
	invalidateSearch: boolean;
	expandedPathsToRestore: Set<string>;
}

interface FileTreeController {
	getItems(): ItemInstance<DirectoryEntry>[];
	getItemInstance(
		itemId: string,
	): ItemInstance<DirectoryEntry> | null | undefined;
}

function getPathSegmentSeparator(absolutePath: string): string {
	return absolutePath.includes("\\") ? "\\" : "/";
}

function getParentPath(absolutePath: string): string {
	const trimmedPath = absolutePath.replace(/[\\/]+$/, "");
	const lastSeparatorIndex = Math.max(
		trimmedPath.lastIndexOf("/"),
		trimmedPath.lastIndexOf("\\"),
	);

	if (lastSeparatorIndex <= 0) {
		return trimmedPath;
	}

	// Preserve Windows drive roots like `C:\`.
	if (/^[A-Za-z]:$/.test(trimmedPath.slice(0, lastSeparatorIndex))) {
		return `${trimmedPath.slice(0, lastSeparatorIndex)}\\`;
	}

	return trimmedPath.slice(0, lastSeparatorIndex);
}

function deleteCachedEntryPath(
	cache: Map<string, DirectoryEntry>,
	absolutePath: string,
): void {
	const segmentSeparator = getPathSegmentSeparator(absolutePath);
	for (const cachedPath of cache.keys()) {
		if (
			cachedPath === absolutePath ||
			cachedPath.startsWith(`${absolutePath}${segmentSeparator}`)
		) {
			cache.delete(cachedPath);
		}
	}
}

function getExpandedRenameTargets(
	tree: FileTreeController,
	oldAbsolutePath: string,
	newAbsolutePath: string,
	isDirectory: boolean,
): string[] {
	if (!isDirectory) {
		return [];
	}

	return tree
		.getItems()
		.filter(
			(item: ItemInstance<DirectoryEntry>) =>
				item.getItemData()?.isDirectory && item.isExpanded(),
		)
		.map((item: ItemInstance<DirectoryEntry>) => item.getItemData()?.path ?? "")
		.filter((path) => path.length > 0)
		.map((path) =>
			retargetAbsolutePath(path, oldAbsolutePath, newAbsolutePath, true),
		)
		.filter((path): path is string => Boolean(path));
}

async function restoreExpandedDirectories(
	tree: FileTreeController,
	paths: Iterable<string>,
): Promise<void> {
	const orderedPaths = Array.from(new Set(paths)).sort(
		(left, right) => left.split(/[/\\]/).length - right.split(/[/\\]/).length,
	);

	for (const path of orderedPaths) {
		for (let attempt = 0; attempt < 5; attempt += 1) {
			const item = tree.getItemInstance(path);
			if (item) {
				if (!item.isExpanded()) {
					await item.expand();
				}
				break;
			}

			await new Promise((resolve) => setTimeout(resolve, 25));
		}
	}
}

export function FilesView() {
	const { workspaceId } = useParams({ strict: false });
	const { data: workspace } = electronTrpc.workspaces.get.useQuery(
		{ id: workspaceId ?? "" },
		{ enabled: !!workspaceId },
	);
	const worktreePath = workspace?.worktreePath;

	const [searchTerm, setSearchTerm] = useState("");
	const projectId = workspace?.project?.id;

	// Refs avoid stale closure in dataLoader callbacks
	const worktreePathRef = useRef(worktreePath);
	worktreePathRef.current = worktreePath;
	const entryCacheRef = useRef(new Map<string, DirectoryEntry>());
	const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const pendingRefreshRef = useRef<PendingTreeRefresh>({
		fullRefresh: false,
		directoryPaths: new Set<string>(),
		invalidateSearch: false,
		expandedPathsToRestore: new Set<string>(),
	});

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

				const cachedEntry = entryCacheRef.current.get(itemId);
				if (cachedEntry) {
					return cachedEntry;
				}

				const currentPath = worktreePathRef.current;
				const name = itemId.split(/[/\\]/).pop() ?? itemId;
				const relativePath =
					currentPath && itemId.startsWith(currentPath)
						? itemId.slice(currentPath.length).replace(/^[/\\]/, "")
						: itemId;

				return {
					id: itemId,
					name,
					path: itemId,
					relativePath,
					isDirectory: false,
				};
			},
			getChildren: async (itemId: string): Promise<string[]> => {
				const currentPath = worktreePathRef.current;
				if (!currentPath) return [];

				const dirPath = itemId === "root" ? currentPath : itemId;
				if (!dirPath) return [];

				try {
					const entries = await trpcUtils.filesystem.readDirectory.fetch({
						workspaceId: workspaceId ?? "",
						absolutePath: dirPath,
					});
					for (const entry of entries) {
						entryCacheRef.current.set(entry.path, entry);
					}
					return entries.map((entry) => entry.path);
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
			entryCacheRef.current.clear();
			tree.getItemInstance("root")?.invalidateChildrenIds();
		}
		prevWorktreePathRef.current = worktreePath;
	}, [worktreePath, tree]);

	const refreshVisibleDirectories = useCallback(() => {
		entryCacheRef.current.clear();
		tree.getItemInstance("root")?.invalidateChildrenIds();
		for (const item of tree.getItems()) {
			if (item.getItemData()?.isDirectory) {
				item.invalidateChildrenIds();
			}
		}
		void trpcUtils.filesystem.searchFiles.invalidate();
	}, [tree, trpcUtils]);

	const invalidateDirectoryByPath = useCallback(
		(directoryPath: string) => {
			const currentRoot = worktreePathRef.current;
			if (!currentRoot) {
				return;
			}

			if (directoryPath === currentRoot) {
				tree.getItemInstance("root")?.invalidateChildrenIds();
				return;
			}

			const directoryItem = tree
				.getItems()
				.find(
					(item: ItemInstance<DirectoryEntry>) =>
						item.getItemData()?.isDirectory &&
						item.getItemData()?.path === directoryPath,
				);
			directoryItem?.invalidateChildrenIds();
		},
		[tree],
	);

	const scheduleRefresh = useCallback(
		(event?: FileSystemChangeEvent) => {
			const currentRoot = worktreePathRef.current;
			if (event) {
				pendingRefreshRef.current.invalidateSearch = true;

				if (event.type === "overflow" || !currentRoot) {
					pendingRefreshRef.current.fullRefresh = true;
				} else if (
					event.type === "rename" &&
					event.absolutePath &&
					event.oldAbsolutePath
				) {
					deleteCachedEntryPath(entryCacheRef.current, event.oldAbsolutePath);
					deleteCachedEntryPath(entryCacheRef.current, event.absolutePath);

					pendingRefreshRef.current.directoryPaths.add(
						getParentPath(event.oldAbsolutePath),
					);
					pendingRefreshRef.current.directoryPaths.add(
						getParentPath(event.absolutePath),
					);

					for (const expandedPath of getExpandedRenameTargets(
						tree,
						event.oldAbsolutePath,
						event.absolutePath,
						Boolean(event.isDirectory),
					)) {
						pendingRefreshRef.current.expandedPathsToRestore.add(expandedPath);
					}
				} else if (event.absolutePath) {
					deleteCachedEntryPath(entryCacheRef.current, event.absolutePath);

					if (event.type !== "update" || event.isDirectory) {
						const parentPath =
							event.absolutePath === currentRoot
								? currentRoot
								: getParentPath(event.absolutePath);
						pendingRefreshRef.current.directoryPaths.add(parentPath);
					}
				}
			}

			if (refreshTimerRef.current) {
				clearTimeout(refreshTimerRef.current);
			}
			refreshTimerRef.current = setTimeout(() => {
				refreshTimerRef.current = null;
				const pending = pendingRefreshRef.current;
				pendingRefreshRef.current = {
					fullRefresh: false,
					directoryPaths: new Set<string>(),
					invalidateSearch: false,
					expandedPathsToRestore: new Set<string>(),
				};

				if (pending.fullRefresh) {
					refreshVisibleDirectories();
					return;
				}

				for (const directoryPath of pending.directoryPaths) {
					invalidateDirectoryByPath(directoryPath);
				}

				if (pending.invalidateSearch) {
					void trpcUtils.filesystem.searchFiles.invalidate();
				}

				void restoreExpandedDirectories(tree, pending.expandedPathsToRestore);
			}, 75);
		},
		[invalidateDirectoryByPath, refreshVisibleDirectories, tree, trpcUtils],
	);

	useEffect(() => {
		return () => {
			if (refreshTimerRef.current) {
				clearTimeout(refreshTimerRef.current);
			}
		};
	}, []);

	useWorkspaceFileEvents(
		workspaceId ?? "",
		(event) => {
			scheduleRefresh(event);
		},
		Boolean(workspaceId && worktreePath),
	);

	const { createFile, createDirectory, rename, deleteItems, isDeleting } =
		useFileTreeActions({
			workspaceId,
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
		workspaceId,
		searchTerm,
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
				filePath: entry.path,
			});
		},
		[workspaceId, worktreePath, addFileViewerPane],
	);

	const handleOpenInEditor = useCallback(
		(entry: DirectoryEntry) => {
			if (!worktreePath) return;
			openFileInEditorMutation.mutate({
				path: entry.path,
				cwd: worktreePath,
				projectId,
			});
		},
		[worktreePath, projectId, openFileInEditorMutation],
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
		refreshVisibleDirectories();
	}, [refreshVisibleDirectories]);

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
													projectId={projectId}
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
														projectId={projectId}
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
